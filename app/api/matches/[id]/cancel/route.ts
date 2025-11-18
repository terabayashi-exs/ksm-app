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
    const matchResult = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.match_block_id,
        ml.team1_id,
        ml.team2_id,
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

    const match = matchResult.rows[0] as unknown as {
      match_id: number;
      match_code: string;
      match_block_id: number;
      team1_id: string | null;
      team2_id: string | null;
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
      const cancelResult = calculateCancelResult(cancellation_type, match.team1_id, match.team2_id);
      
      await db.execute(`
        INSERT INTO t_matches_final (
          match_id, match_block_id, tournament_date, match_number, match_code,
          team1_id, team2_id, team1_display_name, team2_display_name,
          court_number, start_time, team1_scores, team2_scores, period_count,
          winner_team_id, is_draw, is_walkover, match_status, result_status,
          cancellation_type, remarks, created_at, updated_at
        )
        SELECT 
          match_id, match_block_id, tournament_date, match_number, match_code,
          team1_id, team2_id, team1_display_name, team2_display_name,
          court_number, start_time, ? as team1_scores, ? as team2_scores, 
          period_count, ? as winner_team_id, ? as is_draw, 
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
        cancelResult.winner_team_id,
        cancelResult.is_draw ? 1 : 0,
        cancellation_type,
        matchId
      ]);

      console.log(`✓ 試合${match.match_code}の中止結果をt_matches_finalに記録しました`);
    }

    // 3. 順位表の再計算（最後の試合の場合のみ）
    try {
      // ブロック内の全試合数を取得
      const totalMatchesResult = await db.execute(`
        SELECT COUNT(*) as total_matches
        FROM t_matches_live
        WHERE match_block_id = ?
      `, [match.match_block_id]);

      const totalMatches = totalMatchesResult.rows[0]?.total_matches as number || 0;

      // 確定済み + 中止済み試合数を取得
      const completedMatchesResult = await db.execute(`
        SELECT COUNT(*) as completed_matches
        FROM t_matches_live ml
        WHERE ml.match_block_id = ?
          AND (
            EXISTS (SELECT 1 FROM t_matches_final mf WHERE mf.match_id = ml.match_id)
            OR ml.match_status = 'cancelled'
          )
      `, [match.match_block_id]);

      const completedMatches = completedMatchesResult.rows[0]?.completed_matches as number || 0;

      console.log(`ブロック ${match.match_block_id}: 全試合数=${totalMatches}, 完了試合数=${completedMatches}`);

      // 最後の試合の場合のみ順位表を再計算
      if (completedMatches >= totalMatches && totalMatches > 0) {
        console.log(`✓ ブロック ${match.match_block_id} の最後の試合のため、順位表を再計算します`);
        const { updateBlockRankingsOnMatchConfirm } = await import('@/lib/standings-calculator');
        await updateBlockRankingsOnMatchConfirm(match.match_block_id, match.tournament_id);
        console.log(`✓ ブロック ${match.match_block_id} の順位表を再計算しました`);
      } else {
        console.log(`ℹ ブロック ${match.match_block_id} の最後の試合ではないため、順位表の再計算をスキップしました`);
      }
    } catch (error) {
      console.error('順位表再計算エラー:', error);
      // 順位表の再計算に失敗しても、中止処理は成功として扱う
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

// 中止結果計算関数（正しいteam1_scores/team2_scoresを使用）
function calculateCancelResult(
  cancellation_type: string, 
  team1Id: string | null, 
  team2Id: string | null
) {
  switch (cancellation_type) {
    case 'no_show_both':
      return {
        team1_scores: '0',      // TEXT型、カンマ区切り対応
        team2_scores: '0',
        winner_team_id: null,   // 両者敗戦
        is_draw: false
      };
    case 'no_show_team1':
      return {
        team1_scores: '0',      // 不参加チームは0点
        team2_scores: '3',      // 不戦勝チームは3点
        winner_team_id: team2Id,
        is_draw: false
      };
    case 'no_show_team2':
      return {
        team1_scores: '3',      // 不戦勝チームは3点
        team2_scores: '0',      // 不参加チームは0点
        winner_team_id: team1Id,
        is_draw: false
      };
    default:
      throw new Error(`未対応の中止種別: ${cancellation_type}`);
  }
}