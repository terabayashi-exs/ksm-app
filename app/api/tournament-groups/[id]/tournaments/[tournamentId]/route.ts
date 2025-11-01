import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// DELETE /api/tournament-groups/[id]/tournaments/[tournamentId] - グループから大会を削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tournamentId: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { id, tournamentId } = await params;
    const groupId = parseInt(id);
    const tournamentIdNum = parseInt(tournamentId);

    // グループ存在チェック
    const groupCheck = await db.execute(`
      SELECT group_id FROM m_tournament_groups WHERE group_id = ?
    `, [groupId]);

    if (groupCheck.rows.length === 0) {
      return NextResponse.json({ error: 'グループが見つかりません' }, { status: 404 });
    }

    // 大会存在チェック
    const tournamentCheck = await db.execute(`
      SELECT tournament_id, tournament_name FROM t_tournaments 
      WHERE tournament_id = ? AND group_id = ?
    `, [tournamentIdNum, groupId]);

    if (tournamentCheck.rows.length === 0) {
      return NextResponse.json({ 
        error: '指定された大会がグループに見つかりません' 
      }, { status: 404 });
    }

    // 大会をグループから削除（group_id と group_order をクリア）
    await db.execute(`
      UPDATE t_tournaments 
      SET group_id = NULL, group_order = NULL, category_name = NULL, updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ?
    `, [tournamentIdNum]);

    // 残りの大会の順序を詰める
    const remainingTournaments = await db.execute(`
      SELECT tournament_id FROM t_tournaments 
      WHERE group_id = ? 
      ORDER BY group_order, created_at
    `, [groupId]);

    for (let i = 0; i < remainingTournaments.rows.length; i++) {
      await db.execute(`
        UPDATE t_tournaments 
        SET group_order = ?, updated_at = datetime('now', '+9 hours')
        WHERE tournament_id = ?
      `, [i, remainingTournaments.rows[i].tournament_id]);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'グループから大会を削除しました' 
    });

  } catch (error) {
    console.error('グループから大会削除エラー:', error);
    return NextResponse.json({ 
      error: 'グループから大会の削除に失敗しました' 
    }, { status: 500 });
  }
}