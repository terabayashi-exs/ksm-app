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

    // 試合ステータスを完了状態に戻す（確定解除後は編集可能にするため）
    await db.execute(`
      UPDATE t_match_status 
      SET match_status = 'completed', updated_at = datetime('now', '+9 hours')
      WHERE match_id = ?
    `, [matchId]);

    console.log(`✓ 試合${match.match_code}の確定を解除しました（ID: ${matchId}）`);

    // ブロックが未完了になった場合、順位情報をクリア
    try {
      const { clearBlockRankingsIfIncomplete } = await import('@/lib/standings-calculator');
      await clearBlockRankingsIfIncomplete(match.match_block_id);
      console.log(`✓ ブロック${match.match_block_id}の順位情報をチェックしました`);
    } catch (error) {
      console.error('順位情報クリアエラー:', error);
      // 順位情報のクリアに失敗しても、確定解除は成功として扱う
    }

    // 大会ステータスの更新チェック
    // 全試合が完了していない場合、大会ステータスをongoingに戻す
    try {
      // 大会のフォーマットIDを取得
      const tournamentFormatResult = await db.execute(`
        SELECT format_id FROM t_tournaments WHERE tournament_id = ?
      `, [match.tournament_id]);

      const formatId = tournamentFormatResult.rows[0]?.format_id as number;

      // 大会の全試合数を取得（BYE試合のみ除外、チーム割当の有無は関係なし）
      const totalMatchesResult = await db.execute(`
        SELECT COUNT(*) as total_matches
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
        WHERE mb.tournament_id = ?
          AND (mt.is_bye_match IS NULL OR mt.is_bye_match != 1)
      `, [formatId, match.tournament_id]);

      const totalMatches = totalMatchesResult.rows[0]?.total_matches as number || 0;

      // 完了済み試合数を取得（確定済み OR 中止、BYE試合を除外）（この試合の確定解除後の数）
      const completedMatchesResult = await db.execute(`
        SELECT COUNT(*) as completed_matches
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
        WHERE mb.tournament_id = ?
          AND (mt.is_bye_match IS NULL OR mt.is_bye_match != 1)
          AND (mf.match_id IS NOT NULL OR ml.match_status = 'cancelled')
      `, [formatId, match.tournament_id]);

      const completedMatches = completedMatchesResult.rows[0]?.completed_matches as number || 0;

      console.log(`[MATCH_UNCONFIRM] Tournament ${match.tournament_id}: ${completedMatches}/${totalMatches} matches completed (confirmed or cancelled)`);

      // 全試合が完了していない場合、大会ステータスをongoingに戻す
      if (completedMatches < totalMatches) {
        // 現在の大会ステータスを確認
        const tournamentResult = await db.execute(`
          SELECT status FROM t_tournaments WHERE tournament_id = ?
        `, [match.tournament_id]);
        
        if (tournamentResult.rows.length > 0 && tournamentResult.rows[0].status === 'completed') {
          await db.execute(`
            UPDATE t_tournaments 
            SET status = 'ongoing', updated_at = datetime('now', '+9 hours')
            WHERE tournament_id = ?
          `, [match.tournament_id]);
          
          console.log(`✓ 大会${match.tournament_id}のステータスをongoingに戻しました`);
        }
      }
    } catch (statusError) {
      console.error('大会ステータス更新エラー:', statusError);
      // ステータス更新エラーでも確定解除は成功として扱う
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