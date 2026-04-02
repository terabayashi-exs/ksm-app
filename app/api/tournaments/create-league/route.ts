import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ArchiveVersionManager } from "@/lib/archive-version-manager";
import { generateDefaultRules, isLegacyTournament, getLegacyDefaultRules } from "@/lib/tournament-rules";
import { canAddDivision } from "@/lib/subscription/plan-checker";
import { checkTrialExpiredPermission } from "@/lib/subscription/subscription-service";
import { calculateTournamentStatusSync } from "@/lib/tournament-status";
import { buildPhaseFormatMap, buildPhaseNameMap, buildTemplatePhaseMapping } from "@/lib/tournament-phases";
import { getGrantedFormatIds, isFormatAccessible } from "@/lib/format-access";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json(
        { success: false, error: "管理者権限が必要です" },
        { status: 401 }
      );
    }

    const permissionCheck = await checkTrialExpiredPermission(
      session.user.id,
      'canCreateNew'
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, error: permissionCheck.reason, trialExpired: true },
        { status: 403 }
      );
    }

    const data = await request.json();
    const {
      group_id,
      tournament_name,
      sport_type_id,
      format_id,
      team_count,
      match_duration_minutes,
      break_duration_minutes,
      display_match_duration,
      is_public,
      public_start_date,
      recruitment_start_date,
      recruitment_end_date,
      show_players_public = false,
      venue_ids,
    } = data;

    if (!group_id || !tournament_name || !sport_type_id || !format_id || !team_count) {
      return NextResponse.json(
        { success: false, error: "必須項目が不足しています" },
        { status: 400 }
      );
    }

    // フォーマットアクセスチェック
    const formatVisibilityResult = await db.execute(
      `SELECT format_id, visibility FROM m_tournament_formats WHERE format_id = ?`,
      [format_id]
    );
    if (formatVisibilityResult.rows.length > 0) {
      const fmt = formatVisibilityResult.rows[0];
      const grantedIds = await getGrantedFormatIds(session.user.loginUserId);
      if (!isFormatAccessible(
        { format_id: Number(fmt.format_id), visibility: String(fmt.visibility || 'public') },
        session.user.isSuperadmin ?? false,
        grantedIds
      )) {
        return NextResponse.json(
          { success: false, error: "このフォーマットへのアクセス権がありません" },
          { status: 403 }
        );
      }
    }

    // 部門追加可否チェック
    const divisionCheckResult = await canAddDivision(session.user.id, Number(group_id));
    if (!divisionCheckResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "部門作成制限に達しています",
          reason: divisionCheckResult.reason,
          current: divisionCheckResult.current,
          limit: divisionCheckResult.limit
        },
        { status: 403 }
      );
    }

    const currentArchiveVersion = ArchiveVersionManager.getCurrentVersion();

    const calculatedStatus = calculateTournamentStatusSync({
      status: 'planning',
      tournament_dates: '{"1": ""}',
      recruitment_start_date,
      recruitment_end_date,
      public_start_date
    });

    // フォーマットからデフォルトのbreak_durationを取得
    const formatDefaults = await db.execute(
      `SELECT default_break_duration FROM m_tournament_formats WHERE format_id = ?`,
      [format_id]
    );
    const defaultBreakDuration = formatDefaults.rows.length > 0 && formatDefaults.rows[0].default_break_duration != null
      ? Number(formatDefaults.rows[0].default_break_duration)
      : 0;

    // リーグ戦部門を作成（venue_id=NULL, court_count=1, tournament_dates=空）
    const tournamentResult = await db.execute(`
      INSERT INTO t_tournaments (
        group_id,
        tournament_name,
        sport_type_id,
        format_id,
        venue_id,
        team_count,
        court_count,
        tournament_dates,
        match_duration_minutes,
        break_duration_minutes,
        display_match_duration,
        status,
        visibility,
        public_start_date,
        recruitment_start_date,
        recruitment_end_date,
        show_players_public,
        created_by,
        archive_ui_version,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      group_id,
      tournament_name,
      sport_type_id,
      format_id,
      venue_ids && Array.isArray(venue_ids) && venue_ids.length > 0 ? JSON.stringify(venue_ids) : null, // venue_id: JSON配列
      team_count,
      1,    // court_count: デフォルト
      '{"1": ""}', // tournament_dates: 後で日程・会場設定から更新
      match_duration_minutes,
      break_duration_minutes != null ? break_duration_minutes : defaultBreakDuration,
      display_match_duration?.trim() || null,
      calculatedStatus,
      is_public ? 'open' : 'preparing',
      public_start_date,
      recruitment_start_date,
      recruitment_end_date,
      show_players_public ? 1 : 0,
      session.user.id,
      currentArchiveVersion
    ]);

    const tournamentId = tournamentResult.lastInsertRowid;

    if (!tournamentId) {
      return NextResponse.json(
        { success: false, error: "部門作成に失敗しました" },
        { status: 500 }
      );
    }

    // フォーマット情報をコピー
    const formatResult = await db.execute(`
      SELECT format_id, format_name, phases
      FROM m_tournament_formats WHERE format_id = ?
    `, [format_id]);

    if (formatResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "選択されたフォーマットが見つかりません" },
        { status: 400 }
      );
    }

    const formatInfo = formatResult.rows[0];
    const formatPhases = formatInfo.phases as string | null;

    await db.execute(`
      UPDATE t_tournaments SET
        format_name = ?,
        phases = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ?
    `, [
      formatInfo.format_name,
      typeof formatPhases === 'string' ? formatPhases : JSON.stringify(formatPhases),
      tournamentId
    ]);

    // テンプレート取得
    const templatesResult = await db.execute(`
      SELECT
        template_id, match_number, match_code, match_type, phase, round_name, block_name,
        team1_source, team2_source, team1_display_name, team2_display_name,
        day_number, execution_priority, court_number, suggested_start_time,
        loser_position_start, loser_position_end, position_note, winner_position,
        is_bye_match, matchday, cycle
      FROM m_match_templates
      WHERE format_id = ?
      ORDER BY match_number
    `, [format_id]);

    if (templatesResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "選択されたフォーマットのテンプレートが見つかりません" },
        { status: 400 }
      );
    }

    // ブロック情報の作成とIDマップ
    const blockMap = new Map<string, number>();
    const uniqueBlocks = new Set<string>();
    const phaseFormats = buildPhaseFormatMap(formatPhases);
    const phaseNamesMap = buildPhaseNameMap(formatPhases);
    const templatePhases = templatesResult.rows.map(t => t.phase as string);
    const templatePhaseMapping = buildTemplatePhaseMapping(templatePhases, formatPhases);

    templatesResult.rows.forEach(template => {
      const actualPhase = templatePhaseMapping.get(template.phase as string) || template.phase as string;
      const blockKey = `${actualPhase}::${template.block_name || 'default'}`;
      uniqueBlocks.add(blockKey);
    });

    for (const blockKey of uniqueBlocks) {
      const separatorIndex = blockKey.indexOf('::');
      const phase = blockKey.substring(0, separatorIndex);
      const blockName = blockKey.substring(separatorIndex + 2);
      const formatType = phaseFormats.get(phase);

      if (formatType === 'tournament') {
        const unifiedBlockKey = `${phase}::unified`;
        if (!blockMap.has(unifiedBlockKey)) {
          const unifiedBlockName = `${phase}_unified`;
          const blockResult = await db.execute(`
            INSERT INTO t_match_blocks (
              tournament_id, phase, display_round_name, block_name, block_order,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, 0, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
          `, [tournamentId, phase, phaseNamesMap.get(phase) || phase, unifiedBlockName]);

          const unifiedBlockId = Number(blockResult.lastInsertRowid);
          blockMap.set(unifiedBlockKey, unifiedBlockId);

          Array.from(uniqueBlocks)
            .filter(key => key.startsWith(`${phase}::`))
            .forEach(key => { blockMap.set(key, unifiedBlockId); });
        }
      } else {
        const displayName = blockName === 'default' ? phase : blockName;
        const blockResult = await db.execute(`
          INSERT INTO t_match_blocks (
            tournament_id, phase, display_round_name, block_name, block_order,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
        `, [tournamentId, phase, phaseNamesMap.get(phase) || phase, displayName]);

        blockMap.set(blockKey, Number(blockResult.lastInsertRowid));
      }
    }

    // 試合作成（リーグ戦: 日付・時刻は未設定、matchday/cycleはテンプレートからコピー）
    let matchesCreated = 0;

    for (const template of templatesResult.rows) {
      const actualPhase = templatePhaseMapping.get(template.phase as string) || template.phase as string;
      const blockKey = `${actualPhase}::${template.block_name || 'default'}`;
      const matchBlockId = blockMap.get(blockKey);

      if (!matchBlockId) {
        console.error(`ブロックID が見つかりません: ${blockKey}`);
        continue;
      }

      await db.execute(`
        INSERT INTO t_matches_live (
          match_block_id, tournament_date, match_number, match_code,
          team1_tournament_team_id, team2_tournament_team_id,
          team1_display_name, team2_display_name,
          court_number, start_time,
          team1_scores, team2_scores, winner_tournament_team_id,
          phase, match_type, round_name, block_name,
          team1_source, team2_source,
          day_number, execution_priority, suggested_start_time,
          loser_position_start, loser_position_end, position_note, winner_position,
          is_bye_match, matchday, cycle
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        matchBlockId,
        '', // tournament_date: 後で節設定時に更新
        template.match_number,
        template.match_code,
        null, null, // team1/team2_tournament_team_id
        template.team1_display_name,
        template.team2_display_name,
        template.court_number || 1,
        null, // start_time: 後で設定
        '[0]', '[0]',
        null,
        actualPhase,
        template.match_type,
        template.round_name || null,
        template.block_name || null,
        template.team1_source || null,
        template.team2_source || null,
        template.day_number,
        template.execution_priority,
        template.suggested_start_time || null,
        template.loser_position_start || null,
        template.loser_position_end || null,
        template.position_note || null,
        template.winner_position || null,
        template.is_bye_match || 0,
        template.matchday || null,
        template.cycle || 1
      ]);

      matchesCreated++;
    }

    console.log(`✅ ${matchesCreated}個の試合を作成しました`);

    // 大会ルールのデフォルト設定を作成
    try {
      const actualPhaseIds = Array.from(phaseFormats.keys());
      let tournamentRules;

      if (isLegacyTournament(Number(tournamentId), sport_type_id)) {
        tournamentRules = getLegacyDefaultRules(Number(tournamentId), actualPhaseIds);
      } else {
        tournamentRules = generateDefaultRules(Number(tournamentId), sport_type_id, actualPhaseIds, phaseFormats);
      }

      const defaultPointSystem = JSON.stringify({ win: 3, draw: 1, loss: 0 });

      for (const rule of tournamentRules) {
        await db.execute(`
          INSERT INTO t_tournament_rules (
            tournament_id, phase, use_extra_time, use_penalty,
            active_periods, notes, point_system,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
        `, [
          rule.tournament_id,
          rule.phase,
          rule.use_extra_time ? 1 : 0,
          rule.use_penalty ? 1 : 0,
          rule.active_periods,
          rule.notes || null,
          defaultPointSystem
        ]);
      }
    } catch (ruleError) {
      console.error("大会ルール設定エラー:", ruleError);
    }

    // 作成された部門情報を取得
    const createdTournament = await db.execute(`
      SELECT t.*, v.venue_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    return NextResponse.json({
      success: true,
      tournament: createdTournament.rows[0],
      matches_created: matchesCreated,
      message: `リーグ戦部門「${tournament_name}」を作成しました。${matchesCreated}個の試合を生成しました。`
    });

  } catch (error) {
    console.error("リーグ戦部門作成エラー:", error);

    let errorMessage = "リーグ戦部門作成中にエラーが発生しました";
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    }

    return NextResponse.json(
      { success: false, error: errorMessage, details: error },
      { status: 500 }
    );
  }
}
