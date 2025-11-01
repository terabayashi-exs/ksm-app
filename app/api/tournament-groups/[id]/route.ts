import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/tournament-groups/[id] - グループ詳細取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const groupId = parseInt(id);

    // グループ情報を取得
    const groupResult = await db.execute(`
      SELECT * FROM m_tournament_groups WHERE group_id = ?
    `, [groupId]);

    if (groupResult.rows.length === 0) {
      return NextResponse.json({ error: 'グループが見つかりません' }, { status: 404 });
    }

    // グループに属する大会を取得
    const tournamentsResult = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.category_name,
        t.group_order,
        t.status,
        t.team_count,
        t.tournament_dates,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.group_id = ?
      ORDER BY t.group_order, t.created_at
    `, [groupId]);

    return NextResponse.json({ 
      success: true, 
      data: {
        group: groupResult.rows[0],
        tournaments: tournamentsResult.rows
      }
    });

  } catch (error) {
    console.error('グループ詳細取得エラー:', error);
    return NextResponse.json({ 
      error: 'グループ詳細の取得に失敗しました' 
    }, { status: 500 });
  }
}

// PUT /api/tournament-groups/[id] - グループ更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const groupId = parseInt(id);
    const body = await request.json();
    const { group_name, group_description, group_color, display_order } = body;

    // グループの存在確認
    const checkResult = await db.execute(`
      SELECT group_id FROM m_tournament_groups WHERE group_id = ?
    `, [groupId]);

    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'グループが見つかりません' }, { status: 404 });
    }

    // グループ更新
    await db.execute(`
      UPDATE m_tournament_groups 
      SET 
        group_name = ?,
        group_description = ?,
        group_color = ?,
        display_order = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE group_id = ?
    `, [
      group_name,
      group_description || null,
      group_color || '#3B82F6',
      display_order || 0,
      groupId
    ]);

    // 更新後のデータを取得
    const updatedResult = await db.execute(`
      SELECT * FROM m_tournament_groups WHERE group_id = ?
    `, [groupId]);

    return NextResponse.json({ 
      success: true, 
      data: updatedResult.rows[0],
      message: 'グループを更新しました'
    });

  } catch (error) {
    console.error('グループ更新エラー:', error);
    return NextResponse.json({ 
      error: 'グループの更新に失敗しました' 
    }, { status: 500 });
  }
}

// DELETE /api/tournament-groups/[id] - グループ削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const groupId = parseInt(id);

    // グループに属する大会があるか確認
    const tournamentsCheck = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournaments WHERE group_id = ?
    `, [groupId]);

    const tournamentCount = tournamentsCheck.rows[0].count as number;
    
    if (tournamentCount > 0) {
      return NextResponse.json({ 
        error: `このグループには${tournamentCount}個の大会が登録されています。先に大会のグループを解除してください。` 
      }, { status: 400 });
    }

    // グループ削除
    const deleteResult = await db.execute(`
      DELETE FROM m_tournament_groups WHERE group_id = ?
    `, [groupId]);

    if (deleteResult.rowsAffected === 0) {
      return NextResponse.json({ error: 'グループが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'グループを削除しました'
    });

  } catch (error) {
    console.error('グループ削除エラー:', error);
    return NextResponse.json({ 
      error: 'グループの削除に失敗しました' 
    }, { status: 500 });
  }
}