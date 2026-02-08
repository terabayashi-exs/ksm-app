// MIGRATION NOTE: team_id → tournament_team_id 移行済み (2026-02-04)
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CancelRequest {
  cancellation_type: 'no_show_both' | 'no_show_team1' | 'no_show_team2' | 'no_count';
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const params = await context.params;
    const matchId = parseInt(params.id);
    if (isNaN(matchId)) {
      return NextResponse.json({ error: '無効な試合IDです' }, { status: 400 });
    }

    const body = await request.json() as CancelRequest;
    const { cancellation_type } = body;

    // cancellation_typeの妥当性チェック
    const validTypes = ['no_show_both', 'no_show_team1', 'no_show_team2', 'no_count'];
    if (!validTypes.includes(cancellation_type)) {
      return NextResponse.json({ error: '無効な中止種別です' }, { status: 400 });
    }

    // まず試合情報を取得
    // MIGRATION NOTE: team1_tournament_team_id, team2_tournament_team_id を追加取得
    const matchResult = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.match_block_id,
        ml.team1_tournament_team_id,
        ml.team2_tournament_team_id,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.match_status,
        mb.tournament_id,
        CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE ml.match_id = ?
    `, [matchId]);

    if (matchResult.rows.length === 0) {
      return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });
    }

    // MIGRATION NOTE: team1_tournament_team_id, team2_tournament_team_id を型定義に追加
    const match = matchResult.rows[0] as unknown as {
      match_id: number;
      match_code: string;
      match_block_id: number;
      team1_tournament_team_id: number | null;
      team2_tournament_team_id: number | null;
      team1_display_name: string;
      team2_display_name: string;
      match_status: string;
      tournament_id: number;
      is_confirmed: number;
    };

    if (match.match_status === 'cancelled') {
      return NextResponse.json({ error: 'この試合は既に中止されています' }, { status: 400 });
    }

    if (match.is_confirmed) {
      return NextResponse.json({ error: 'この試合は確定済みです。確定解除してから中止してください。' }, { status: 400 });
    }

    // 1. t_matches_liveのステータスを中止に更新
    await db.execute(`
      UPDATE t_matches_live 
      SET match_status = 'cancelled',
          cancellation_type = ?,
          updated_at = datetime('now', '+9 hours')
      WHERE match_id = ?
    `, [cancellation_type, matchId]);

    // 1.1. t_match_statusテーブルも中止に更新（存在する場合）
    await db.execute(`
      UPDATE t_match_status 
      SET match_status = 'cancelled',
          updated_at = datetime('now', '+9 hours')
      WHERE match_id = ?
    `, [matchId]);

    console.log(`✓ 試合${match.match_code}を中止しました（種別: ${cancellation_type}）`);

    // 2. t_matches_finalへの記録（中止種別に応じて）
    if (cancellation_type !== 'no_count') {
      // 大会の不戦勝設定を取得
      const { getTournamentWalkoverSettings } = await import('@/lib/tournament-rules');
      const walkoverSettings = await getTournamentWalkoverSettings(match.tournament_id);
      const walkoverWinnerGoals = walkoverSettings.winner_goals;
      const walkoverLoserGoals = walkoverSettings.loser_goals;

      // MIGRATION NOTE: tournament_team_id を calculateCancelResult に渡すように変更
      const cancelResult = calculateCancelResult(
        cancellation_type,
        match.team1_tournament_team_id,
        match.team2_tournament_team_id,
        walkoverWinnerGoals,
        walkoverLoserGoals
      );

      // MIGRATION NOTE: tournament_team_id フィールドをINSERT文に追加
      await db.execute(`
        INSERT INTO t_matches_final (
          match_id, match_block_id, tournament_date, match_number, match_code,
          team1_tournament_team_id, team2_tournament_team_id,
          team1_display_name, team2_display_name,
          court_number, start_time, team1_scores, team2_scores, period_count,
          winner_tournament_team_id, is_draw, is_walkover,
          match_status, result_status,
          cancellation_type, remarks, created_at, updated_at
        )
        SELECT
          match_id, match_block_id, tournament_date, match_number, match_code,
          team1_tournament_team_id, team2_tournament_team_id,
          team1_display_name, team2_display_name,
          court_number, start_time, ? as team1_scores, ? as team2_scores,
          period_count, ? as winner_tournament_team_id, ? as is_draw,
          1 as is_walkover, 'cancelled' as match_status, 'confirmed' as result_status,
          ? as cancellation_type,
          '試合中止' as remarks,
          datetime('now', '+9 hours') as created_at,
          datetime('now', '+9 hours') as updated_at
        FROM t_matches_live
        WHERE match_id = ?
      `, [
        cancelResult.team1_scores,
        cancelResult.team2_scores,
        cancelResult.winner_tournament_team_id,
        cancelResult.is_draw ? 1 : 0,
        cancellation_type,
        matchId
      ]);

      console.log(`✓ 試合${match.match_code}の中止結果をt_matches_finalに記録しました（不戦勝: ${walkoverWinnerGoals}点, 不戦敗: ${walkoverLoserGoals}点）`);
    }

    // 3. 順位表の再計算（不戦勝の場合は常に更新）
    if (cancellation_type !== 'no_count') {
      try {
        console.log(`✓ ブロック ${match.match_block_id} の順位表を再計算します`);
        const { updateBlockRankingsOnMatchConfirm } = await import('@/lib/standings-calculator');
        await updateBlockRankingsOnMatchConfirm(match.match_block_id, match.tournament_id);
        console.log(`✓ ブロック ${match.match_block_id} の順位表を再計算しました`);
      } catch (error) {
        console.error('順位表再計算エラー:', error);
        // 順位表の再計算に失敗しても、中止処理は成功として扱う
      }
    }

    // 4. 全試合が完了したかチェックして、大会を完了に変更
    try {
      const tournamentId = match.tournament_id;

      console.log(`[MATCH_CANCEL] Checking if tournament ${tournamentId} is complete...`);

      // 大会のフォーマットIDを取得
      const tournamentFormatResult = await db.execute(`
        SELECT format_id FROM t_tournaments WHERE tournament_id = ?
      `, [tournamentId]);

      const formatId = tournamentFormatResult.rows[0]?.format_id as number;

      // 大会の全試合数を取得（BYE試合のみ除外、チーム割当の有無は関係なし）
      const totalMatchesResult = await db.execute(`
        SELECT COUNT(*) as total_matches
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
        WHERE mb.tournament_id = ?
          AND (mt.is_bye_match IS NULL OR mt.is_bye_match != 1)
      `, [formatId, tournamentId]);

      const totalMatches = totalMatchesResult.rows[0]?.total_matches as number || 0;

      // 完了済み試合数を取得（確定済み OR 中止、BYE試合を除外）
      const completedMatchesResult = await db.execute(`
        SELECT COUNT(*) as completed_matches
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
        WHERE mb.tournament_id = ?
          AND (mt.is_bye_match IS NULL OR mt.is_bye_match != 1)
          AND (mf.match_id IS NOT NULL OR ml.match_status = 'cancelled')
      `, [formatId, tournamentId]);

      const completedMatches = completedMatchesResult.rows[0]?.completed_matches as number || 0;

      console.log(`[MATCH_CANCEL] Tournament ${tournamentId}: ${completedMatches}/${totalMatches} matches completed (confirmed or cancelled)`);

      // 全試合が完了している場合
      if (totalMatches > 0 && completedMatches >= totalMatches) {
        console.log(`[MATCH_CANCEL] All matches completed for tournament ${tournamentId}. Setting status to completed.`);

        await db.execute(`
          UPDATE t_tournaments
          SET status = 'completed', updated_at = datetime('now', '+9 hours')
          WHERE tournament_id = ?
        `, [tournamentId]);

        console.log(`[MATCH_CANCEL] ✅ Tournament ${tournamentId} status updated to completed`);
      }
    } catch (completionError) {
      console.error(`[MATCH_CANCEL] ❌ Failed to check tournament completion for tournament ID ${match.tournament_id}:`, completionError);
      // 大会完了チェックエラーでも中止処理は成功とする（ログのみ）
    }

    return NextResponse.json({
      success: true,
      message: `試合${match.match_code}を中止しました`,
      data: {
        match_id: matchId,
        match_code: match.match_code,
        cancellation_type: cancellation_type,
        is_cancelled: true,
        affects_standings: cancellation_type !== 'no_count'
      }
    });

  } catch (error) {
    console.error('試合中止エラー:', error);
    return NextResponse.json({
      error: '試合の中止処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}

// MIGRATION NOTE: tournament_team_id パラメータを追加
// 中止結果計算関数（大会設定の不戦勝得点を使用）
function calculateCancelResult(
  cancellation_type: string,
  team1TournamentTeamId: number | null,
  team2TournamentTeamId: number | null,
  walkoverWinnerGoals: number,
  walkoverLoserGoals: number
) {
  switch (cancellation_type) {
    case 'no_show_both':
      return {
        team1_scores: '0',      // TEXT型、カンマ区切り対応
        team2_scores: '0',
        winner_tournament_team_id: null,  // MIGRATION NOTE: 追加
        is_draw: true           // 0-0引き分け扱い（FIFA/JFA規定に準拠）
      };
    case 'no_show_team1':
      return {
        team1_scores: String(walkoverLoserGoals),   // 不参加チーム（不戦敗）
        team2_scores: String(walkoverWinnerGoals),  // 不戦勝チーム
        winner_tournament_team_id: team2TournamentTeamId,  // MIGRATION NOTE: 追加
        is_draw: false
      };
    case 'no_show_team2':
      return {
        team1_scores: String(walkoverWinnerGoals),  // 不戦勝チーム
        team2_scores: String(walkoverLoserGoals),   // 不参加チーム（不戦敗）
        winner_tournament_team_id: team1TournamentTeamId,  // MIGRATION NOTE: 追加
        is_draw: false
      };
    default:
      throw new Error(`未対応の中止種別: ${cancellation_type}`);
  }
}