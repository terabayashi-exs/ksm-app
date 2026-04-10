// app/api/tournaments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ArchiveVersionManager } from "@/lib/archive-version-manager";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateTournamentSchedule, ScheduleSettings } from "@/lib/schedule-calculator";
import { buildPhaseFormatMap, getPhaseFormatTypeFromJson } from "@/lib/tournament-phases";
import {
  generateDefaultRules,
  getLegacyDefaultRules,
  isLegacyTournament,
} from "@/lib/tournament-rules";
import type { TournamentStatus } from "@/lib/tournament-status";
import { MatchTemplate, Tournament } from "@/lib/types";
import { tournamentCreateSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    // リクエストボディの取得と検証
    const body = await request.json();
    const validationResult = tournamentCreateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "入力データが不正です",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const data = validationResult.data;

    // tournament_datesをJSONに変換
    const tournamentDatesJson = JSON.stringify(
      data.tournament_dates.reduce(
        (acc, td) => {
          acc[td.dayNumber.toString()] = td.date;
          return acc;
        },
        {} as Record<string, string>,
      ),
    );

    // 現在のアーカイブUIバージョンを取得
    const currentArchiveVersion = ArchiveVersionManager.getCurrentVersion();

    // フォーマット名を取得
    const formatResult = await db.execute(
      `
      SELECT format_name FROM m_tournament_formats WHERE format_id = ?
    `,
      [data.format_id],
    );
    const formatName = (formatResult.rows[0]?.format_name as string) || null;

    // 大会作成
    const result = await db.execute(
      `
      INSERT INTO t_tournaments (
        tournament_name,
        format_id,
        format_name,
        venue_id,
        team_count,
        court_count,
        tournament_dates,
        match_duration_minutes,
        break_duration_minutes,
        status,
        visibility,
        public_start_date,
        recruitment_start_date,
        recruitment_end_date,
        created_by,
        archive_ui_version,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `,
      [
        data.tournament_name,
        data.format_id,
        formatName,
        data.venue_id ?? null,
        data.team_count,
        data.court_count,
        tournamentDatesJson,
        data.match_duration_minutes,
        data.break_duration_minutes,
        data.is_public ? "open" : "preparing",
        data.public_start_date,
        data.recruitment_start_date,
        data.recruitment_end_date,
        session.user.id,
        currentArchiveVersion,
      ],
    );

    const tournamentId = result.lastInsertRowid;

    // テンプレートからマッチブロックとマッチを生成（スケジュール計算付き）
    try {
      const customSchedule =
        (
          body as {
            customSchedule?: Array<{
              match_number: number;
              start_time: string;
              court_number: number;
            }>;
          }
        ).customSchedule || [];
      const typedCustomSchedule = customSchedule as
        | Array<{
            match_number: number;
            start_time: string;
            court_number: number;
          }>
        | undefined;

      await generateMatchesFromTemplate(
        Number(tournamentId),
        data.format_id,
        data.tournament_dates,
        {
          courtCount: data.court_count,
          matchDurationMinutes: data.match_duration_minutes,
          breakDurationMinutes: data.break_duration_minutes,
          startTime: "09:00",
          tournamentDates: data.tournament_dates,
        },
        typedCustomSchedule,
      );

      // Match generation completed for tournament
    } catch (matchError) {
      console.error("マッチ生成エラー（大会作成は継続）:", matchError);
      // マッチ生成に失敗しても大会作成は成功とする
    }

    // 作成された大会の詳細を取得
    const tournamentResult = await db.execute(
      `
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.archive_ui_version,
        t.created_at,
        t.updated_at,
        v.venue_name,
        t.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
      WHERE t.tournament_id = ?
    `,
      [Number(tournamentId)],
    );

    const row = tournamentResult.rows[0];
    const tournament: Tournament = {
      tournament_id: Number(row.tournament_id),
      tournament_name: String(row.tournament_name),
      format_id: Number(row.format_id),
      venue_id: row.venue_id ? String(row.venue_id) : null,
      team_count: Number(row.team_count),
      court_count: Number(row.court_count),
      tournament_dates: row.tournament_dates as string,
      match_duration_minutes: Number(row.match_duration_minutes),
      break_duration_minutes: Number(row.break_duration_minutes),
      status: row.status as TournamentStatus,
      visibility: row.visibility === "open" ? 1 : 0,
      public_start_date: row.public_start_date as string,
      recruitment_start_date: row.recruitment_start_date as string,
      recruitment_end_date: row.recruitment_end_date as string,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      venue_name: row.venue_name as string,
      format_name: row.format_name as string,
    };

    return NextResponse.json({
      success: true,
      data: tournament,
      message: "大会が正常に作成されました",
    });
  } catch (error) {
    console.error("大会作成エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "大会の作成に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const isPublic = searchParams.get("public");
    const limit = searchParams.get("limit");

    let query = `
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.archive_ui_version,
        t.group_id,
        t.created_at,
        t.updated_at,
        v.venue_name,
        t.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
    `;

    const params: (string | number)[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push("t.status = ?");
      params.push(status);
    }

    if (isPublic !== null) {
      conditions.push("t.visibility = ?");
      params.push(isPublic === "true" ? "open" : "preparing");
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY t.created_at DESC";

    if (limit) {
      query += " LIMIT ?";
      params.push(parseInt(limit));
    }

    const result = await db.execute(query, params);
    const tournaments = result.rows.map((row) => ({
      tournament_id: Number(row.tournament_id),
      tournament_name: String(row.tournament_name),
      format_id: Number(row.format_id),
      venue_id: row.venue_id ? String(row.venue_id) : null,
      team_count: Number(row.team_count),
      court_count: Number(row.court_count),
      tournament_dates: row.tournament_dates as string,
      match_duration_minutes: Number(row.match_duration_minutes),
      break_duration_minutes: Number(row.break_duration_minutes),
      status: row.status as TournamentStatus,
      group_id: row.group_id ? Number(row.group_id) : null,
      visibility: row.visibility === "open" ? 1 : 0,
      public_start_date: row.public_start_date as string,
      recruitment_start_date: row.recruitment_start_date as string,
      recruitment_end_date: row.recruitment_end_date as string,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      venue_name: row.venue_name as string,
      format_name: row.format_name as string,
    })) as Tournament[];

    return NextResponse.json({
      success: true,
      data: tournaments,
    });
  } catch (error) {
    console.error("大会取得エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "大会データの取得に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// テンプレートからマッチブロックとマッチを生成する関数
async function generateMatchesFromTemplate(
  tournamentId: number,
  formatId: number,
  tournamentDates: Array<{ dayNumber: number; date: string }>,
  scheduleSettings?: ScheduleSettings,
  customSchedule?: Array<{
    match_number: number;
    start_time: string;
    court_number: number;
  }>,
) {
  try {
    // フォーマットIDに対応するテンプレートを取得
    const templatesResult = await db.execute(
      `
      SELECT
        template_id, format_id, match_number, match_code, match_type,
        phase, round_name, block_name, team1_source, team2_source,
        team1_display_name, team2_display_name, day_number,
        execution_priority, court_number, suggested_start_time,
        period_count, is_bye_match, created_at, updated_at
      FROM m_match_templates
      WHERE format_id = ?
      ORDER BY execution_priority ASC
    `,
      [formatId],
    );

    const templates = templatesResult.rows.map((row) => ({
      template_id: Number(row.template_id),
      format_id: Number(row.format_id),
      match_number: Number(row.match_number),
      match_code: String(row.match_code),
      match_type: String(row.match_type),
      phase: String(row.phase),
      round_name: row.round_name as string | undefined,
      block_name: row.block_name as string | undefined,
      team1_source: row.team1_source as string | undefined,
      team2_source: row.team2_source as string | undefined,
      team1_display_name: String(row.team1_display_name || ""),
      team2_display_name: String(row.team2_display_name || ""),
      day_number: Number(row.day_number),
      execution_priority: Number(row.execution_priority),
      court_number: row.court_number ? Number(row.court_number) : undefined,
      suggested_start_time: row.suggested_start_time as string | undefined,
      period_count: row.period_count ? Number(row.period_count) : undefined,
      is_bye_match: Number(row.is_bye_match || 0),
      created_at: String(row.created_at),
    }));
    if (templates.length === 0) {
      console.warn(`フォーマットID ${formatId} のテンプレートが見つかりません`);
      return;
    }

    // 日程マッピングを作成
    const dateMapping = tournamentDates.reduce(
      (acc, td) => {
        acc[td.dayNumber] = td.date;
        return acc;
      },
      {} as Record<number, string>,
    );

    // 大会のフェーズ構成を取得（動的フェーズ対応）
    const tournamentPhasesResult = await db.execute(
      `
      SELECT phases FROM t_tournaments WHERE tournament_id = ?
    `,
      [tournamentId],
    );
    const tournamentPhasesJson = (tournamentPhasesResult.rows[0]?.phases as string | null) ?? null;
    const phaseFormatMap = buildPhaseFormatMap(tournamentPhasesJson);

    // 順位管理単位としてのブロックを作成
    // リーグ形式のフェーズ: ブロック別（A, B, C, D など）
    // トーナメント形式のフェーズ: round_nameまたはblock_nameでグループ化
    const blockIdMapping = new Map<string, number>();
    let blockOrder = 0;

    // 全フェーズのブロックを動的に抽出・作成
    const phaseIds = [...new Set(templates.map((t) => t.phase))];

    for (const phaseId of phaseIds) {
      const formatType =
        phaseFormatMap.get(phaseId) || getPhaseFormatTypeFromJson(tournamentPhasesJson, phaseId);

      if (formatType === "league") {
        // リーグ形式: ブロック別に登録
        const leagueBlocks = new Set<string>();
        templates.forEach((template) => {
          if (template.phase === phaseId && template.block_name) {
            leagueBlocks.add(template.block_name);
          }
        });

        for (const blockName of Array.from(leagueBlocks).sort()) {
          const blockResult = await db.execute(
            `
            INSERT INTO t_match_blocks (
              tournament_id,
              phase,
              display_round_name,
              block_name,
              block_order
            ) VALUES (?, ?, ?, ?, ?)
          `,
            [tournamentId, phaseId, `${blockName}ブロック`, blockName, blockOrder++],
          );

          const blockId = Number(blockResult.lastInsertRowid);
          blockIdMapping.set(`${phaseId}_${blockName}`, blockId);
        }
      } else {
        // トーナメント形式: round_nameまたはblock_nameでグループ化
        const tournamentBlocks = new Map<string, string>(); // key: ユニークキー, value: 表示名
        templates.forEach((template) => {
          if (template.phase === phaseId) {
            const displayName = template.round_name || template.block_name || "トーナメント";
            const blockKey = template.block_name || displayName;
            tournamentBlocks.set(blockKey, displayName);
          }
        });

        for (const [blockKey, displayName] of Array.from(tournamentBlocks.entries()).sort()) {
          const tBlockResult = await db.execute(
            `
            INSERT INTO t_match_blocks (
              tournament_id,
              phase,
              display_round_name,
              block_name,
              block_order
            ) VALUES (?, ?, ?, ?, ?)
          `,
            [tournamentId, phaseId, displayName, blockKey, blockOrder++],
          );

          const tBlockId = Number(tBlockResult.lastInsertRowid);
          blockIdMapping.set(`${phaseId}_${blockKey}`, tBlockId);
        }
      }
    }

    // スケジュール情報の準備
    const scheduleMap = new Map<number, { courtNumber: number; startTime: string }>();

    if (customSchedule && customSchedule.length > 0) {
      // カスタムスケジュールが指定されている場合はそれを使用
      customSchedule.forEach((custom) => {
        scheduleMap.set(custom.match_number, {
          courtNumber: custom.court_number,
          startTime: custom.start_time,
        });
      });
      // Custom schedule applied to matches
    } else if (scheduleSettings) {
      // カスタムスケジュールがない場合は計算を実行
      try {
        const templateModels: MatchTemplate[] = templates.map((template) => ({
          template_id: template.template_id,
          format_id: template.format_id,
          match_number: template.match_number,
          match_code: template.match_code,
          match_type: template.match_type,
          phase: template.phase,
          round_name: template.round_name,
          block_name: template.block_name,
          team1_source: template.team1_source,
          team2_source: template.team2_source,
          team1_display_name: template.team1_display_name,
          team2_display_name: template.team2_display_name,
          day_number: template.day_number,
          execution_priority: template.execution_priority,
          court_number: template.court_number,
          suggested_start_time: template.suggested_start_time,
          period_count: template.period_count,
          is_bye_match: template.is_bye_match || 0,
          created_at: template.created_at,
        }));

        const schedule = calculateTournamentSchedule(templateModels, scheduleSettings);

        // スケジュール計算結果をマップに保存
        schedule.days.forEach((day) => {
          day.matches.forEach((match) => {
            scheduleMap.set(match.template.match_number, {
              courtNumber: match.courtNumber,
              startTime: match.startTime,
            });
          });
        });

        // Schedule calculation completed
      } catch (scheduleError) {
        console.error("スケジュール計算エラー:", scheduleError);
        // スケジュール計算に失敗してもマッチ作成は継続
      }
    }

    // マッチを作成
    for (const template of templates) {
      // 新しいブロック構造に合わせてブロックIDを取得（動的フェーズ対応）
      let blockId: number | undefined;
      const templateFormatType =
        phaseFormatMap.get(template.phase) ||
        getPhaseFormatTypeFromJson(tournamentPhasesJson, template.phase);

      if (templateFormatType === "league") {
        blockId = blockIdMapping.get(`${template.phase}_${template.block_name}`);
      } else {
        // トーナメント形式: block_nameを使ってブロックIDを取得
        const blockKey = template.block_name || template.round_name || "トーナメント";
        blockId = blockIdMapping.get(`${template.phase}_${blockKey}`);
      }

      if (!blockId) {
        console.error(`ブロックID が見つかりません: ${template.phase}_${template.block_name}`);
        continue;
      }

      // テンプレートの day_number に対応する実際の日付を取得
      const tournamentDate = dateMapping[template.day_number];
      if (!tournamentDate) {
        console.warn(`day_number ${template.day_number} に対応する日付が見つかりません`);
        continue;
      }

      // スケジュール計算結果からコート番号と開始時刻を取得
      const scheduleInfo = scheduleMap.get(template.match_number);
      const courtNumber = scheduleInfo?.courtNumber || null;
      const startTime = scheduleInfo?.startTime || null;

      // テンプレートのperiod_count設定を取得（未設定の場合は1）
      const periodCount =
        template.period_count && Number(template.period_count) > 0
          ? Number(template.period_count)
          : 1;

      const matchResult = await db.execute(
        `
        INSERT INTO t_matches_live (
          match_block_id,
          tournament_date,
          match_number,
          match_code,
          team1_id,
          team2_id,
          team1_tournament_team_id,
          team2_tournament_team_id,
          team1_display_name,
          team2_display_name,
          court_number,
          start_time,
          team1_scores,
          team2_scores,
          period_count,
          match_type,
          winner_team_id,
          winner_tournament_team_id,
          remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          blockId,
          tournamentDate,
          template.match_number,
          template.match_code,
          template.team1_source || null, // 初期状態では未確定
          template.team2_source || null, // 初期状態では未確定
          null, // team1_tournament_team_id - 組合せ確定時に設定
          null, // team2_tournament_team_id - 組合せ確定時に設定
          template.team1_display_name,
          template.team2_display_name,
          courtNumber, // スケジュール計算結果から設定
          startTime, // スケジュール計算結果から設定
          null, // team1_scores は初期状態でnull
          null, // team2_scores は初期状態でnull
          periodCount, // テンプレートから取得したperiod_count
          template.match_type || "通常", // テンプレートの試合種別
          null, // winner_team_id は結果確定時に設定
          null, // winner_tournament_team_id は結果確定時に設定
          null, // remarks
        ],
      );

      // BYE試合の場合、t_matches_finalにも自動登録
      if (template.is_bye_match === 1) {
        const matchId = Number(matchResult.lastInsertRowid);
        const now = new Date().toISOString().replace("T", " ").slice(0, 19);

        // BYE試合の勝者を特定（team1またはteam2のうち、設定されている方）
        const hasTeam1 = template.team1_display_name && template.team1_display_name.trim() !== "";
        const hasTeam2 = template.team2_display_name && template.team2_display_name.trim() !== "";

        // どちらか一方のみが設定されている場合のみBYE試合として処理
        if ((hasTeam1 && !hasTeam2) || (!hasTeam1 && hasTeam2)) {
          const winnerDisplayName = hasTeam1
            ? template.team1_display_name
            : template.team2_display_name;

          console.log(
            `[TOURNAMENT_CREATE] Auto-confirming BYE match ${template.match_code}: winner="${winnerDisplayName}"`,
          );

          await db.execute(
            `
            INSERT INTO t_matches_final (
              match_id,
              match_block_id,
              tournament_date,
              match_number,
              match_code,
              team1_tournament_team_id,
              team2_tournament_team_id,
              team1_display_name,
              team2_display_name,
              court_number,
              start_time,
              team1_scores,
              team2_scores,
              winner_tournament_team_id,
              is_draw,
              is_walkover,
              remarks,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            [
              matchId,
              blockId,
              tournamentDate,
              template.match_number,
              template.match_code,
              null, // team1_tournament_team_id
              null, // team2_tournament_team_id
              template.team1_display_name,
              template.team2_display_name,
              courtNumber,
              startTime,
              "0", // team1_scores（BYE試合なのでスコアなし）
              "0", // team2_scores（BYE試合なのでスコアなし）
              null, // winner_tournament_team_id（まだチームIDが確定していない）
              0, // is_draw（不戦勝なので引き分けではない）
              1, // is_walkover（不戦勝）
              "BYE試合（自動確定）",
              now,
              now,
            ],
          );

          console.log(
            `[TOURNAMENT_CREATE] BYE match ${template.match_code} auto-confirmed in t_matches_final`,
          );
        }
      }
    }

    // BYE試合の勝者を後続試合に反映
    console.log("[TOURNAMENT_CREATE] Processing BYE match winners propagation...");

    for (const template of templates) {
      if (template.is_bye_match === 1) {
        const hasTeam1 = template.team1_display_name && template.team1_display_name.trim() !== "";
        const hasTeam2 = template.team2_display_name && template.team2_display_name.trim() !== "";

        if ((hasTeam1 && !hasTeam2) || (!hasTeam1 && hasTeam2)) {
          const winnerDisplayName = hasTeam1
            ? template.team1_display_name
            : template.team2_display_name;
          const winnerPattern = `${template.match_code}_winner`;

          console.log(
            `[TOURNAMENT_CREATE] Propagating BYE match ${template.match_code} winner "${winnerDisplayName}" (pattern: ${winnerPattern})`,
          );

          // このBYE試合の勝者を参照している試合を更新
          const dependentMatches = templates.filter(
            (t) => t.team1_source === winnerPattern || t.team2_source === winnerPattern,
          );

          for (const depMatch of dependentMatches) {
            // 該当試合のmatch_idを取得
            const matchResult = await db.execute(
              `
              SELECT ml.match_id
              FROM t_matches_live ml
              INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
              WHERE mb.tournament_id = ? AND ml.match_code = ?
            `,
              [tournamentId, depMatch.match_code],
            );

            if (matchResult.rows.length > 0) {
              const matchId = matchResult.rows[0].match_id as number;

              // team1_sourceが一致する場合はteam1を更新
              if (depMatch.team1_source === winnerPattern) {
                await db.execute(
                  `
                  UPDATE t_matches_live
                  SET team1_display_name = ?, updated_at = datetime('now', '+9 hours')
                  WHERE match_id = ?
                `,
                  [winnerDisplayName, matchId],
                );

                console.log(
                  `[TOURNAMENT_CREATE] Updated ${depMatch.match_code} team1 to "${winnerDisplayName}"`,
                );
              }

              // team2_sourceが一致する場合はteam2を更新
              if (depMatch.team2_source === winnerPattern) {
                await db.execute(
                  `
                  UPDATE t_matches_live
                  SET team2_display_name = ?, updated_at = datetime('now', '+9 hours')
                  WHERE match_id = ?
                `,
                  [winnerDisplayName, matchId],
                );

                console.log(
                  `[TOURNAMENT_CREATE] Updated ${depMatch.match_code} team2 to "${winnerDisplayName}"`,
                );
              }
            }
          }
        }
      }
    }

    console.log("[TOURNAMENT_CREATE] BYE match winners propagation completed");

    // 試合結果QR用トークンを一括作成
    try {
      const { createTokensForTournament } = await import("@/lib/match-result-token");
      const tokensCreated = await createTokensForTournament(Number(tournamentId));
      console.log(`[TOURNAMENT_CREATE] ${tokensCreated}個の結果QRトークンを作成しました`);
    } catch (tokenError) {
      console.error("QRトークン作成エラー（試合作成は成功）:", tokenError);
    }

    // 大会ルールのデフォルト設定を作成（未作成のフェーズのみ）
    try {
      const sportResult = await db.execute(
        `
        SELECT sport_type_id FROM t_tournaments WHERE tournament_id = ?
      `,
        [tournamentId],
      );
      const sportTypeId = Number(sportResult.rows[0]?.sport_type_id || 1);
      const actualPhaseIds = Array.from(phaseFormatMap.keys());

      // 既存ルールを確認
      const existingRulesResult = await db.execute(
        `
        SELECT phase FROM t_tournament_rules WHERE tournament_id = ?
      `,
        [tournamentId],
      );
      const existingPhases = new Set(existingRulesResult.rows.map((r) => String(r.phase)));

      const missingPhases = actualPhaseIds.filter((p) => !existingPhases.has(p));

      if (missingPhases.length > 0) {
        let newRules;
        if (isLegacyTournament(tournamentId, sportTypeId)) {
          newRules = getLegacyDefaultRules(tournamentId, missingPhases);
        } else {
          newRules = generateDefaultRules(tournamentId, sportTypeId, missingPhases, phaseFormatMap);
        }

        const defaultPointSystem = JSON.stringify({ win: 3, draw: 1, loss: 0 });
        for (const rule of newRules) {
          await db.execute(
            `
            INSERT INTO t_tournament_rules (
              tournament_id, phase, use_extra_time, use_penalty,
              active_periods, notes, point_system,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
          `,
            [
              rule.tournament_id,
              rule.phase,
              rule.use_extra_time ? 1 : 0,
              rule.use_penalty ? 1 : 0,
              rule.active_periods,
              rule.notes || null,
              defaultPointSystem,
            ],
          );
        }
        console.log(`✅ ${missingPhases.length}件の大会ルールを設定: ${missingPhases.join(", ")}`);
      }
    } catch (ruleError) {
      console.error("大会ルール設定エラー:", ruleError);
    }
  } catch (error) {
    console.error("マッチ生成エラー:", error);
    throw error;
  }
}
