import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
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

    // まず試合情報を取得して、確定済みかどうかを確認
    const matchResult = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.match_block_id,
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
      tournament_id: number;
      is_confirmed: number;
    };

    if (!match.is_confirmed) {
      return NextResponse.json({ error: 'この試合は確定されていません' }, { status: 400 });
    }

    // t_matches_finalから該当レコードを削除（確定解除）
    await db.execute(`
      DELETE FROM t_matches_final WHERE match_id = ?
    `, [matchId]);

    console.log(`✓ 試合${match.match_code}の確定を解除しました（ID: ${matchId}）`);

    // 順位表の再計算を実行
    try {
      // 対象ブロックの順位表を再計算
      const { recalculateAllTournamentRankings } = await import('@/lib/standings-calculator');
      await recalculateAllTournamentRankings(match.tournament_id);
      console.log(`✓ 大会${match.tournament_id}の順位表を再計算しました`);
    } catch (error) {
      console.error('順位表再計算エラー:', error);
      // 順位表の再計算に失敗しても、確定解除は成功として扱う
    }

    return NextResponse.json({
      success: true,
      message: `試合${match.match_code}の確定を解除しました`,
      data: {
        match_id: matchId,
        match_code: match.match_code,
        is_confirmed: false
      }
    });

  } catch (error) {
    console.error('試合確定解除エラー:', error);
    return NextResponse.json({
      error: '試合の確定解除中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}