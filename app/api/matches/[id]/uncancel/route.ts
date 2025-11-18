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

    // まず試合情報を取得して、中止済みかどうかを確認
    const matchResult = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.match_block_id,
        ml.match_status,
        ml.cancellation_type,
        mb.tournament_id,
        CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed_cancelled
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id AND mf.match_status = 'cancelled'
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
      match_status: string;
      cancellation_type: string | null;
      tournament_id: number;
      is_confirmed_cancelled: number;
    };

    if (match.match_status !== 'cancelled') {
      return NextResponse.json({ error: 'この試合は中止されていません' }, { status: 400 });
    }

    // 1. t_matches_liveのステータスを元に戻す（scheduledに戻す）
    await db.execute(`
      UPDATE t_matches_live 
      SET match_status = 'scheduled',
          cancellation_type = NULL,
          updated_at = datetime('now', '+9 hours')
      WHERE match_id = ?
    `, [matchId]);

    // 1.1. t_match_statusテーブルも元に戻す（存在する場合）
    await db.execute(`
      UPDATE t_match_status 
      SET match_status = 'scheduled',
          updated_at = datetime('now', '+9 hours')
      WHERE match_id = ?
    `, [matchId]);

    console.log(`✓ 試合${match.match_code}のステータスをscheduledに戻しました`);

    // 2. t_matches_finalから中止結果を削除（中止時に記録された結果を削除）
    if (match.is_confirmed_cancelled) {
      await db.execute(`
        DELETE FROM t_matches_final 
        WHERE match_id = ? AND match_status = 'cancelled'
      `, [matchId]);

      console.log(`✓ 試合${match.match_code}の中止結果をt_matches_finalから削除しました`);
    }

    // 3. 順位表の再計算（中止解除では実行しない）
    // 中止解除により試合が未確定状態に戻るだけなので、
    // 手動設定した順位を保持するため、順位表の再計算は行わない
    console.log(`ℹ 中止解除のため、順位表の再計算をスキップしました（手動設定順位を保持）`);

    // 将来的に、中止解除後に自動で順位計算が必要な場合は、
    // ここでupdateBlockRankingsOnMatchConfirmを呼び出すことができます

    return NextResponse.json({
      success: true,
      message: `試合${match.match_code}の中止を解除しました`,
      data: {
        match_id: matchId,
        match_code: match.match_code,
        previous_cancellation_type: match.cancellation_type,
        is_cancelled: false,
        new_status: 'scheduled'
      }
    });

  } catch (error) {
    console.error('試合中止解除エラー:', error);
    return NextResponse.json({
      error: '試合の中止解除処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}