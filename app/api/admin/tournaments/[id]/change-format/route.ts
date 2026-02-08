// app/api/admin/tournaments/[id]/change-format/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 試合結果の入力状況をチェック
 */
async function checkMatchResultsExist(tournamentId: number): Promise<{
  hasResults: boolean;
  matchCount: number;
  completedCount: number;
  confirmedCount: number;
}> {
  // t_matches_live の試合数を取得
  const totalMatchesResult = await db.execute(`
    SELECT COUNT(*) as count
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
  `, [tournamentId]);

  const matchCount = Number(totalMatchesResult.rows[0]?.count || 0);

  // 完了済み試合数（match_status = 'completed' または 'ongoing'）
  const completedMatchesResult = await db.execute(`
    SELECT COUNT(*) as count
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
      AND ml.match_status IN ('completed', 'ongoing')
  `, [tournamentId]);

  const completedCount = Number(completedMatchesResult.rows[0]?.count || 0);

  // 確定済み試合数（t_matches_final に存在する試合）
  const confirmedMatchesResult = await db.execute(`
    SELECT COUNT(*) as count
    FROM t_matches_final mf
    WHERE mf.match_id IN (
      SELECT ml.match_id
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    )
  `, [tournamentId]);

  const confirmedCount = Number(confirmedMatchesResult.rows[0]?.count || 0);

  // いずれかの条件を満たす場合は結果が存在すると判定
  const hasResults = completedCount > 0 || confirmedCount > 0;

  return {
    hasResults,
    matchCount,
    completedCount,
    confirmedCount
  };
}

/**
 * フォーマット変更API（PUT）
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const tournamentId = parseInt(params.id);
    const body = await request.json();
    const { new_format_id, confirmation } = body;

    if (!new_format_id) {
      return NextResponse.json(
        { success: false, error: '新しいフォーマットIDが必要です' },
        { status: 400 }
      );
    }

    if (!confirmation) {
      return NextResponse.json(
        { success: false, error: '変更確認が必要です' },
        { status: 400 }
      );
    }

    // 現在の大会情報とフォーマットを取得
    const currentTournament = await db.execute(`
      SELECT
        t.tournament_id,
        t.format_id,
        t.tournament_name,
        t.status,
        t.tournament_dates,
        f.format_name as current_format_name
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (currentTournament.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const tournament = currentTournament.rows[0];
    const oldFormatId = tournament.format_id;

    // 同じフォーマットへの変更を防止
    if (oldFormatId === new_format_id) {
      return NextResponse.json(
        { success: false, error: '現在と同じフォーマットが指定されています' },
        { status: 400 }
      );
    }

    // === 🚨 重要: 試合結果の入力状況をチェック ===
    const matchStatus = await checkMatchResultsExist(tournamentId);

    if (matchStatus.hasResults) {
      return NextResponse.json(
        {
          success: false,
          error: '試合結果が既に入力されているため、フォーマット変更できません',
          details: {
            reason: 'MATCH_RESULTS_EXIST',
            message: '試合が開始され、結果が入力されている大会はフォーマット変更できません。',
            matchCount: matchStatus.matchCount,
            completedCount: matchStatus.completedCount,
            confirmedCount: matchStatus.confirmedCount,
            suggestion: '新しい大会を作成するか、全ての試合結果を削除してから再度お試しください。'
          }
        },
        { status: 403 }
      );
    }

    // 大会ステータスによる制限（進行中・完了済みは変更不可）
    if (tournament.status === 'ongoing' || tournament.status === 'completed') {
      return NextResponse.json(
        {
          success: false,
          error: `${tournament.status === 'ongoing' ? '進行中' : '完了済み'}の大会はフォーマット変更できません`,
          details: {
            reason: 'INVALID_TOURNAMENT_STATUS',
            current_status: tournament.status,
            message: '大会のステータスが「計画中」または「募集中」の場合のみフォーマット変更が可能です。'
          }
        },
        { status: 400 }
      );
    }

    // 新しいフォーマットの存在確認
    const newFormat = await db.execute(`
      SELECT format_id, format_name, target_team_count
      FROM m_tournament_formats
      WHERE format_id = ?
    `, [new_format_id]);

    if (newFormat.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '指定されたフォーマットが見つかりません' },
        { status: 404 }
      );
    }

    // 新しいフォーマットのday_number最大値を取得
    const newTemplates = await db.execute(`
      SELECT MAX(day_number) as max_day_number
      FROM m_match_templates
      WHERE format_id = ?
    `, [new_format_id]);

    const maxDayNumber = Number(newTemplates.rows[0]?.max_day_number || 1);

    // 大会の開催日程を自動調整
    const existingTournamentDates = JSON.parse(String(tournament.tournament_dates || '{}'));
    const providedDays = Object.keys(existingTournamentDates).map(Number).sort((a, b) => a - b);
    const maxProvidedDay = Math.max(...providedDays, 0);

    const adjustedTournamentDates: Record<string, string> = {};
    let datesAdjusted = false;
    let datesAdded = 0;
    let datesRemoved = 0;

    // 必要な日数分のみを保持（余分な日は削除）
    for (let i = 1; i <= maxDayNumber; i++) {
      if (existingTournamentDates[i.toString()]) {
        // 既存の日付をそのまま使用
        adjustedTournamentDates[i.toString()] = existingTournamentDates[i.toString()];
      } else {
        // 不足している日を追加
        const previousDate = adjustedTournamentDates[(i - 1).toString()] ||
                           existingTournamentDates[(i - 1).toString()] ||
                           new Date().toISOString().split('T')[0];
        const baseDate = new Date(previousDate);
        baseDate.setDate(baseDate.getDate() + 1);
        adjustedTournamentDates[i.toString()] = baseDate.toISOString().split('T')[0];
        datesAdjusted = true;
        datesAdded++;
      }
    }

    // 余分な日数を削除
    const removedDays: number[] = [];
    for (let i = maxDayNumber + 1; i <= maxProvidedDay; i++) {
      if (existingTournamentDates[i.toString()]) {
        removedDays.push(i);
        datesRemoved++;
        datesAdjusted = true;
      }
    }

    // 調整後の開催日程をデータベースに保存
    if (datesAdjusted) {
      await db.execute(`
        UPDATE t_tournaments SET
          tournament_dates = ?,
          updated_at = datetime('now', '+9 hours')
        WHERE tournament_id = ?
      `, [JSON.stringify(adjustedTournamentDates), tournamentId]);

      console.log(`   ✅ 開催日程を自動調整しました:`);
      console.log(`      追加: ${datesAdded}日, 削除: ${datesRemoved}日 (day ${removedDays.join(', ')})`);
      console.log(`      調整後: ${JSON.stringify(adjustedTournamentDates)}`);
    }

    console.log(`✅ Format change validation passed`);
    console.log(`   Tournament: ${tournament.tournament_name} (ID: ${tournamentId})`);
    console.log(`   Old Format: ${tournament.current_format_name} (ID: ${oldFormatId})`);
    console.log(`   New Format: ${newFormat.rows[0].format_name} (ID: ${new_format_id})`);
    console.log(`   Match Status: ${matchStatus.matchCount} total, ${matchStatus.completedCount} completed, ${matchStatus.confirmedCount} confirmed`);

    // === Step 1: 試合結果データを削除（存在する場合のみ） ===
    const matchIdsResult = await db.execute(`
      SELECT ml.match_id
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);

    const matchIds = matchIdsResult.rows.map(row => Number(row.match_id));
    let deletedFinalCount = 0;

    if (matchIds.length > 0) {
      // t_matches_finalから削除
      for (const matchId of matchIds) {
        const deleteResult = await db.execute(`
          DELETE FROM t_matches_final WHERE match_id = ?
        `, [matchId]);
        if (deleteResult.rowsAffected && deleteResult.rowsAffected > 0) {
          deletedFinalCount++;
        }
      }
      console.log(`   Deleted ${deletedFinalCount} records from t_matches_final`);
    }

    // === Step 2: 試合オーバーライド設定を削除（存在する場合） ===
    const deletedOverrides = await db.execute(`
      DELETE FROM t_tournament_match_overrides WHERE tournament_id = ?
    `, [tournamentId]);
    console.log(`   Deleted ${deletedOverrides.rowsAffected || 0} match overrides`);

    // === Step 3: ライブ試合データを削除 ===
    const deletedLiveMatches = await db.execute(`
      DELETE FROM t_matches_live
      WHERE match_block_id IN (
        SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
      )
    `, [tournamentId]);
    console.log(`   Deleted ${deletedLiveMatches.rowsAffected || 0} live matches`);

    // === Step 4: 試合ブロックを削除 ===
    const deletedBlocks = await db.execute(`
      DELETE FROM t_match_blocks WHERE tournament_id = ?
    `, [tournamentId]);
    console.log(`   Deleted ${deletedBlocks.rowsAffected || 0} match blocks`);

    // === Step 5: 参加チームの組合せ情報をリセット ===
    const resetTeams = await db.execute(`
      UPDATE t_tournament_teams SET
        assigned_block = NULL,
        block_position = NULL,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ?
    `, [tournamentId]);
    console.log(`   Reset ${resetTeams.rowsAffected || 0} team assignments`);

    // === Step 6: 大会フォーマットを更新 ===
    await db.execute(`
      UPDATE t_tournaments SET
        format_id = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ?
    `, [new_format_id, tournamentId]);
    console.log(`   Updated tournament format: ${oldFormatId} → ${new_format_id}`);

    // === Step 7: 新しいフォーマットで試合データを再構築 ===
    console.log(`   Recreating match data with new format...`);

    // 新しいフォーマットのテンプレートを取得
    const templates = await db.execute(`
      SELECT * FROM m_match_templates
      WHERE format_id = ?
      ORDER BY execution_priority, match_number
    `, [new_format_id]);

    console.log(`   Found ${templates.rows.length} match templates for format ${new_format_id}`);

    let createdBlocks = 0;
    let createdMatches = 0;

    // ブロック作成（予選・決勝共通処理）
    const blockMap = new Map<string, number>();
    const allBlockKeys = new Set<string>();

    // 全テンプレートからブロック情報を収集
    for (const template of templates.rows) {
      const blockKey = `${template.phase}_${template.block_name || 'default'}`;
      allBlockKeys.add(blockKey);
    }

    // 各ブロックを作成
    for (const blockKey of allBlockKeys) {
      const [phase, blockName] = blockKey.split('_');

      // block_orderの決定
      let blockOrder: number;
      if (phase === 'preliminary') {
        // 予選ブロック: A=1, B=2, C=3, ...
        blockOrder = blockName.charCodeAt(0) - 64;
      } else {
        // 決勝ブロック: 順番に100, 101, 102, ...
        blockOrder = 100 + Array.from(allBlockKeys).filter(k => k.startsWith('final_')).indexOf(blockKey);
      }

      const blockResult = await db.execute(`
        INSERT INTO t_match_blocks (
          tournament_id, block_name, phase, match_type, block_order
        ) VALUES (?, ?, ?, '通常', ?)
      `, [tournamentId, blockName, phase, blockOrder]);

      const blockId = Number(blockResult.lastInsertRowid);
      blockMap.set(blockKey, blockId);
      createdBlocks++;
      console.log(`   Created block: ${blockName} (Phase: ${phase}, ID: ${blockId})`);
    }

    // 大会日程を取得
    const tournamentDates = JSON.parse(String(tournament.tournament_dates || '{}'));
    const dayNumbers = Object.keys(tournamentDates).sort();
    const defaultStartTime = '09:00';

    // フォールバック用の開始日（tournament_datesが空の場合）
    const fallbackDate = dayNumbers.length > 0 ? tournamentDates[dayNumbers[0]] : String(new Date().toISOString().split('T')[0]);

    // 全試合の作成（予選・決勝共通処理）
    for (const template of templates.rows) {
      const blockKey = `${template.phase}_${template.block_name || 'default'}`;
      const blockId = blockMap.get(blockKey);
      if (!blockId) {
        console.error(`   Block not found for key: ${blockKey}`);
        continue;
      }

      const dayKey = template.day_number?.toString() || "1";
      const tournamentDate = tournamentDates[dayKey] || fallbackDate;

      // 開始時刻: テンプレートの suggested_start_time を使用、なければデフォルト
      const matchStartTime = template.suggested_start_time || defaultStartTime;

      await db.execute(`
        INSERT INTO t_matches_live (
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
          winner_tournament_team_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        blockId,
        tournamentDate,
        template.match_number,
        template.match_code,
        null, // team1_tournament_team_id - 組合せ確定時に設定
        null, // team2_tournament_team_id - 組合せ確定時に設定
        template.team1_display_name,
        template.team2_display_name,
        template.court_number,
        matchStartTime,
        '[0]', // team1_scores をJSON文字列で初期化
        '[0]', // team2_scores をJSON文字列で初期化
        null  // winner_tournament_team_id は結果確定時に設定
      ]);

      createdMatches++;
    }

    console.log(`   ✅ Recreated ${createdBlocks} blocks and ${createdMatches} matches`);

    // 成功メッセージの構築
    let successMessage = `フォーマット変更が完了しました。新しいフォーマットで${createdBlocks}ブロック、${createdMatches}試合が作成されました。`;

    if (datesAdjusted) {
      const adjustedDaysCount = Object.keys(adjustedTournamentDates).length;
      successMessage += `\n\n⚠️ フォーマット変更により開催日数が${adjustedDaysCount}日間に自動調整されました。`;

      if (datesAdded > 0) {
        successMessage += `\n  - ${datesAdded}日分の開催日を追加しました。`;
      }
      if (datesRemoved > 0) {
        successMessage += `\n  - 余分な開催日（day ${removedDays.join(', ')}）を削除しました。`;
      }

      successMessage += `\n\n部門編集画面で日程を確認・調整してください。`;
    }

    successMessage += '\n\n組合せ抽選画面からチームを配置してください。';

    return NextResponse.json({
      success: true,
      message: successMessage,
      data: {
        tournament_id: tournamentId,
        tournament_name: String(tournament.tournament_name),
        old_format_id: Number(oldFormatId),
        old_format_name: String(tournament.current_format_name),
        new_format_id: new_format_id,
        new_format_name: String(newFormat.rows[0].format_name),
        target_team_count: Number(newFormat.rows[0].target_team_count),
        dates_adjusted: datesAdjusted,
        adjusted_tournament_dates: datesAdjusted ? adjustedTournamentDates : undefined,
        deleted_data: {
          matches_final: deletedFinalCount,
          matches_live: Number(deletedLiveMatches.rowsAffected || 0),
          match_blocks: Number(deletedBlocks.rowsAffected || 0),
          match_overrides: Number(deletedOverrides.rowsAffected || 0),
          reset_teams: Number(resetTeams.rowsAffected || 0)
        },
        created_data: {
          match_blocks: createdBlocks,
          matches: createdMatches
        }
      }
    });

  } catch (error) {
    console.error('❌ Format change error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'フォーマット変更に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * フォーマット変更可否チェックAPI（GET）
 * フロントエンドで事前にチェックするために使用
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const tournamentId = parseInt(params.id);

    // 大会情報を取得
    const tournamentResult = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.status,
        t.format_id,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const tournament = tournamentResult.rows[0];

    // 試合結果の入力状況をチェック
    const matchStatus = await checkMatchResultsExist(tournamentId);

    // 変更可否の判定
    const canChange = !matchStatus.hasResults &&
                      tournament.status !== 'ongoing' &&
                      tournament.status !== 'completed';

    // 変更不可の理由を生成
    const reasons: string[] = [];
    if (matchStatus.hasResults) {
      reasons.push(`試合結果が既に入力されています（完了: ${matchStatus.completedCount}試合, 確定: ${matchStatus.confirmedCount}試合）`);
    }
    if (tournament.status === 'ongoing') {
      reasons.push('大会が進行中です');
    }
    if (tournament.status === 'completed') {
      reasons.push('大会が完了済みです');
    }

    return NextResponse.json({
      success: true,
      data: {
        tournament_id: tournamentId,
        tournament_name: String(tournament.tournament_name),
        current_format_id: Number(tournament.format_id),
        current_format_name: String(tournament.format_name),
        tournament_status: String(tournament.status),
        can_change: canChange,
        match_status: {
          total_matches: matchStatus.matchCount,
          completed_matches: matchStatus.completedCount,
          confirmed_matches: matchStatus.confirmedCount,
          has_results: matchStatus.hasResults
        },
        reasons: canChange ? [] : reasons
      }
    });

  } catch (error) {
    console.error('❌ Format change check error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'フォーマット変更可否チェックに失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
