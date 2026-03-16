// app/api/admin/tournaments/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword') || '';
    const prefectureId = searchParams.get('prefecture_id') || '';
    const sportTypeId = searchParams.get('sport_type_id') || '';

    const userId = session.user.id;
    const isAdmin = userId === 'admin';

    const params: (string | number)[] = [];

    let query = `
      SELECT
        tg.group_id,
        tg.group_name,
        tg.organizer,
        tg.event_start_date,
        tg.event_end_date,
        t.tournament_id,
        t.tournament_name,
        t.format_name,
        t.sport_type_id,
        t.team_count,
        t.status,
        t.tournament_dates,
        t.is_archived,
        st.sport_name,
        st.sport_code,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id) as registered_teams
      FROM t_tournament_groups tg
      INNER JOIN t_tournaments t ON tg.group_id = t.group_id
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.is_archived = 0
    `;

    // 所有者フィルタリング（adminユーザー以外は自分が作成した大会のみ）
    if (!isAdmin) {
      const parsedUserId = Number(userId);
      if (!isNaN(parsedUserId) && parsedUserId > 0) {
        query += ` AND (tg.login_user_id = ? OR (tg.login_user_id IS NULL AND tg.admin_login_id = (
          SELECT a.admin_login_id FROM m_administrators a
          INNER JOIN m_login_users u ON a.email = u.email
          WHERE u.login_user_id = ? LIMIT 1
        )))`;
        params.push(parsedUserId, parsedUserId);
      } else {
        query += ` AND tg.admin_login_id = ?`;
        params.push(userId);
      }
    }

    // キーワード検索
    if (keyword) {
      query += ` AND (tg.group_name LIKE ? OR t.tournament_name LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    // 都道府県フィルタ（会場の都道府県で絞り込み）
    if (prefectureId) {
      query += ` AND t.venue_id IN (
        SELECT v.venue_id FROM m_venues v WHERE v.prefecture_id = ?
      )`;
      params.push(Number(prefectureId));
    }

    // 競技種別フィルタ
    if (sportTypeId) {
      query += ` AND t.sport_type_id = ?`;
      params.push(Number(sportTypeId));
    }

    query += ` ORDER BY tg.event_start_date DESC, tg.created_at DESC, t.tournament_id ASC`;

    const result = await db.execute(query, params);

    // グループ単位でまとめる
    const groupMap = new Map<number, {
      group_id: number;
      group_name: string;
      organizer: string | null;
      event_start_date: string | null;
      event_end_date: string | null;
      divisions: Array<{
        tournament_id: number;
        tournament_name: string;
        format_name: string | null;
        sport_type_id: number | null;
        sport_name: string | null;
        sport_code: string | null;
        team_count: number;
        registered_teams: number;
        status: string;
        tournament_dates: string | null;
      }>;
    }>();

    for (const row of result.rows) {
      const groupId = Number(row.group_id);
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          group_id: groupId,
          group_name: String(row.group_name),
          organizer: row.organizer ? String(row.organizer) : null,
          event_start_date: row.event_start_date ? String(row.event_start_date) : null,
          event_end_date: row.event_end_date ? String(row.event_end_date) : null,
          divisions: [],
        });
      }

      groupMap.get(groupId)!.divisions.push({
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        format_name: row.format_name ? String(row.format_name) : null,
        sport_type_id: row.sport_type_id ? Number(row.sport_type_id) : null,
        sport_name: row.sport_name ? String(row.sport_name) : null,
        sport_code: row.sport_code ? String(row.sport_code) : null,
        team_count: Number(row.team_count || 0),
        registered_teams: Number(row.registered_teams || 0),
        status: String(row.status || 'planning'),
        tournament_dates: row.tournament_dates ? String(row.tournament_dates) : null,
      });
    }

    return NextResponse.json({
      success: true,
      data: Array.from(groupMap.values()),
    });
  } catch (error) {
    console.error('[SEARCH] 部門検索エラー:', error);
    return NextResponse.json(
      { success: false, error: '検索に失敗しました' },
      { status: 500 }
    );
  }
}
