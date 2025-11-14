// app/api/tournament-groups/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// 大会一覧取得
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    let query = `
      SELECT
        tg.group_id,
        tg.group_name,
        tg.organizer,
        tg.venue_id,
        tg.event_start_date,
        tg.event_end_date,
        tg.recruitment_start_date,
        tg.recruitment_end_date,
        tg.visibility,
        tg.event_description,
        tg.created_at,
        tg.updated_at,
        v.venue_name,
        COUNT(DISTINCT t.tournament_id) as division_count
      FROM t_tournament_groups tg
      LEFT JOIN m_venues v ON tg.venue_id = v.venue_id
      LEFT JOIN t_tournaments t ON tg.group_id = t.group_id
      WHERE 1=1
    `;

    if (!includeInactive) {
      query += ` AND tg.visibility = 'open'`;
    }

    query += `
      GROUP BY tg.group_id
      ORDER BY tg.event_start_date DESC, tg.created_at DESC
    `;

    const result = await db.execute(query);

    return NextResponse.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('大会一覧取得エラー:', error);
    return NextResponse.json(
      { error: '大会一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 大会作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      group_name,
      organizer,
      venue_id,
      event_start_date,
      event_end_date,
      recruitment_start_date,
      recruitment_end_date,
      visibility = 'open',
      event_description
    } = body;

    // バリデーション
    if (!group_name) {
      return NextResponse.json(
        { error: '大会名は必須です' },
        { status: 400 }
      );
    }

    // 大会作成
    const result = await db.execute(`
      INSERT INTO t_tournament_groups (
        group_name,
        organizer,
        venue_id,
        event_start_date,
        event_end_date,
        recruitment_start_date,
        recruitment_end_date,
        visibility,
        event_description,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      group_name,
      organizer || null,
      venue_id || null,
      event_start_date || null,
      event_end_date || null,
      recruitment_start_date || null,
      recruitment_end_date || null,
      visibility,
      event_description || null
    ]);

    const groupId = Number(result.lastInsertRowid);

    // 作成した大会を取得
    const createdGroup = await db.execute(`
      SELECT
        tg.group_id,
        tg.group_name,
        tg.organizer,
        tg.venue_id,
        tg.event_start_date,
        tg.event_end_date,
        tg.recruitment_start_date,
        tg.recruitment_end_date,
        tg.visibility,
        tg.event_description,
        tg.created_at,
        tg.updated_at,
        v.venue_name
      FROM t_tournament_groups tg
      LEFT JOIN m_venues v ON tg.venue_id = v.venue_id
      WHERE tg.group_id = ?
    `, [groupId]);

    return NextResponse.json({
      success: true,
      data: createdGroup.rows[0],
      message: '大会を作成しました'
    });
  } catch (error) {
    console.error('大会作成エラー:', error);
    return NextResponse.json(
      { error: '大会の作成に失敗しました' },
      { status: 500 }
    );
  }
}
