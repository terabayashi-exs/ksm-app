// app/api/tournament-groups/incomplete/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    // 大会グループを取得し、それぞれに紐づく部門数をカウント
    const result = await db.execute(`
      SELECT
        g.group_id,
        g.group_name,
        g.event_description,
        g.organizer,
        g.venue_id,
        g.created_at,
        g.updated_at,
        COUNT(t.tournament_id) as tournament_count
      FROM t_tournament_groups g
      LEFT JOIN t_tournaments t ON g.group_id = t.group_id
      GROUP BY
        g.group_id,
        g.group_name,
        g.event_description,
        g.organizer,
        g.venue_id,
        g.created_at,
        g.updated_at
      HAVING COUNT(t.tournament_id) = 0
      ORDER BY g.created_at DESC
    `);

    const incompleteGroups = result.rows.map(row => ({
      group_id: Number(row.group_id),
      group_name: String(row.group_name),
      event_description: row.event_description ? String(row.event_description) : null,
      organizer: row.organizer ? String(row.organizer) : null,
      venue_id: row.venue_id ? Number(row.venue_id) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      tournament_count: Number(row.tournament_count)
    }));

    return NextResponse.json({
      success: true,
      data: incompleteGroups
    });

  } catch (error) {
    console.error('作成中の大会取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '作成中の大会データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
