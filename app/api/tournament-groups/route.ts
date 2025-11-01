import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/tournament-groups - グループ一覧取得
export async function GET() {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    // グループ一覧を取得（表示順でソート）
    const groupsResult = await db.execute(`
      SELECT 
        g.group_id,
        g.group_name,
        g.group_description,
        g.group_color,
        g.display_order,
        g.created_at,
        g.updated_at,
        COUNT(t.tournament_id) as tournament_count,
        SUM(CASE WHEN t.status = 'ongoing' THEN 1 ELSE 0 END) as ongoing_count,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_count
      FROM m_tournament_groups g
      LEFT JOIN t_tournaments t ON g.group_id = t.group_id
      GROUP BY g.group_id
      ORDER BY g.display_order, g.created_at DESC
    `);

    return NextResponse.json({ 
      success: true, 
      data: groupsResult.rows 
    });

  } catch (error) {
    console.error('グループ一覧取得エラー:', error);
    return NextResponse.json({ 
      error: 'グループ一覧の取得に失敗しました' 
    }, { status: 500 });
  }
}

// POST /api/tournament-groups - グループ作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { group_name, group_description, group_color, display_order } = body;

    // 必須項目チェック
    if (!group_name) {
      return NextResponse.json({ error: 'グループ名は必須です' }, { status: 400 });
    }

    // グループ作成
    const result = await db.execute(`
      INSERT INTO m_tournament_groups 
      (group_name, group_description, group_color, display_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      group_name,
      group_description || null,
      group_color || '#3B82F6',
      display_order || 0
    ]);

    // 作成したグループの情報を取得
    if (!result.lastInsertRowid) {
      return NextResponse.json({ 
        error: 'グループの作成に失敗しました（ID取得エラー）' 
      }, { status: 500 });
    }

    const newGroupResult = await db.execute(`
      SELECT * FROM m_tournament_groups WHERE group_id = ?
    `, [result.lastInsertRowid]);

    return NextResponse.json({ 
      success: true, 
      data: newGroupResult.rows[0],
      message: 'グループを作成しました'
    });

  } catch (error) {
    console.error('グループ作成エラー:', error);
    return NextResponse.json({ 
      error: 'グループの作成に失敗しました' 
    }, { status: 500 });
  }
}