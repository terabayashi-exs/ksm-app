// app/api/tournament-groups/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// 個別大会取得（所属部門含む）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const groupId = parseInt(resolvedParams.id);

    // 大会基本情報取得
    const groupResult = await db.execute(`
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
        v.address as venue_address
      FROM t_tournament_groups tg
      LEFT JOIN m_venues v ON tg.venue_id = v.venue_id
      WHERE tg.group_id = ?
    `, [groupId]);

    if (groupResult.rows.length === 0) {
      return NextResponse.json(
        { error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const group = groupResult.rows[0];

    // 所属部門一覧取得
    const divisionsResult = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        f.format_name,
        COUNT(DISTINCT tt.team_id) as registered_teams
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id
      WHERE t.group_id = ?
      GROUP BY t.tournament_id
      ORDER BY t.created_at DESC
    `, [groupId]);

    return NextResponse.json({
      success: true,
      data: {
        ...group,
        divisions: divisionsResult.rows
      }
    });
  } catch (error) {
    console.error('大会取得エラー:', error);
    return NextResponse.json(
      { error: '大会の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 大会更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const groupId = parseInt(resolvedParams.id);

    const body = await request.json();
    const {
      group_name,
      organizer,
      venue_id,
      event_start_date,
      event_end_date,
      recruitment_start_date,
      recruitment_end_date,
      visibility,
      event_description
    } = body;

    // バリデーション
    if (!group_name) {
      return NextResponse.json(
        { error: '大会名は必須です' },
        { status: 400 }
      );
    }

    // 大会存在確認
    const existsResult = await db.execute(`
      SELECT group_id FROM t_tournament_groups WHERE group_id = ?
    `, [groupId]);

    if (existsResult.rows.length === 0) {
      return NextResponse.json(
        { error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    // 大会更新
    await db.execute(`
      UPDATE t_tournament_groups
      SET
        group_name = ?,
        organizer = ?,
        venue_id = ?,
        event_start_date = ?,
        event_end_date = ?,
        recruitment_start_date = ?,
        recruitment_end_date = ?,
        visibility = ?,
        event_description = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE group_id = ?
    `, [
      group_name,
      organizer || null,
      venue_id || null,
      event_start_date || null,
      event_end_date || null,
      recruitment_start_date || null,
      recruitment_end_date || null,
      visibility || 'open',
      event_description || null,
      groupId
    ]);

    // 更新後の大会を取得
    const updatedGroup = await db.execute(`
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
      data: updatedGroup.rows[0],
      message: '大会を更新しました'
    });
  } catch (error) {
    console.error('大会更新エラー:', error);
    return NextResponse.json(
      { error: '大会の更新に失敗しました' },
      { status: 500 }
    );
  }
}

// 大会削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const groupId = parseInt(resolvedParams.id);

    // 所属部門確認
    const divisionsResult = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournaments WHERE group_id = ?
    `, [groupId]);

    if (Number(divisionsResult.rows[0].count) > 0) {
      return NextResponse.json(
        { error: '所属部門が存在するため削除できません。先に部門を削除してください。' },
        { status: 400 }
      );
    }

    // 大会削除
    await db.execute(`
      DELETE FROM t_tournament_groups WHERE group_id = ?
    `, [groupId]);

    return NextResponse.json({
      success: true,
      message: '大会を削除しました'
    });
  } catch (error) {
    console.error('大会削除エラー:', error);
    return NextResponse.json(
      { error: '大会の削除に失敗しました' },
      { status: 500 }
    );
  }
}
