// app/api/my/teams/[id]/tournaments/route.ts
// チームが参加できる大会一覧・参加済み大会一覧を返す
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

/** tournament_dates JSON文字列から最初の日付を取得 */
function getFirstDate(tournamentDates: unknown): string | null {
  if (!tournamentDates) return null;
  try {
    const parsed = typeof tournamentDates === 'string' ? JSON.parse(tournamentDates) : tournamentDates;
    const values = Object.values(parsed) as string[];
    return values.length > 0 ? values[0] : null;
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const { id: teamId } = await context.params;
  const loginUserId = session.user.loginUserId;

  // URLパラメータから検索条件を取得
  const url = new URL(_request.url);
  const keyword = url.searchParams.get('keyword') || '';
  const prefectureId = url.searchParams.get('prefectureId') || '';
  const sportTypeId = url.searchParams.get('sportTypeId') || '';

  // 担当者チェック
  const memberCheck = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, loginUserId]
  );
  if (memberCheck.rows.length === 0) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  // 参加済み大会（t_tournament_teams経由）
  const joinedRes = await db.execute(`
    SELECT
      t.tournament_id,
      t.tournament_name,
      t.tournament_dates,
      v.venue_name,
      p.prefecture_name,
      tt.tournament_team_id,
      tt.team_name AS tournament_team_name,
      tt.participation_status,
      tt.assigned_block,
      tt.block_position,
      tt.withdrawal_status,
      tt.withdrawal_requested_at
    FROM t_tournament_teams tt
    JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
    LEFT JOIN m_venues v ON t.venue_id = v.venue_id
    LEFT JOIN m_prefectures p ON v.prefecture_id = p.prefecture_id
    WHERE tt.team_id = ? AND t.is_archived = 0
    ORDER BY t.tournament_id DESC
  `, [teamId]);

  // 参加申込可能な大会（募集中の大会、複数チーム参加対応のため参加済みでも表示）
  // 同じマスターチームから2チーム目、3チーム目として参加できるようにするため、除外しない
  const excludeClause = '';

  // 検索条件の構築
  const searchConditions: string[] = [];
  const searchArgs: (string | number)[] = [];

  if (keyword) {
    searchConditions.push(`(tg.group_name LIKE ? OR t.tournament_name LIKE ?)`);
    searchArgs.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (prefectureId) {
    searchConditions.push(`v.prefecture_id = ?`);
    searchArgs.push(Number(prefectureId));
  }

  if (sportTypeId) {
    searchConditions.push(`t.sport_type_id = ?`);
    searchArgs.push(Number(sportTypeId));
  }

  const searchClause = searchConditions.length > 0
    ? `AND ${searchConditions.join(' AND ')}`
    : '';

  const availableRes = await db.execute({
    sql: `
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.tournament_dates,
        v.venue_name,
        p.prefecture_name,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.group_id,
        tg.group_name,
        tg.event_start_date,
        tg.event_end_date,
        t.group_order,
        t.format_id,
        t.sport_type_id,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'confirmed') AS confirmed_count,
        (
          SELECT COUNT(*)
          FROM t_match_status ms
          INNER JOIN t_matches_live ml ON ms.match_id = ml.match_id
          INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
          LEFT JOIN m_match_templates mt ON mt.format_id = t.format_id AND mt.match_code = ml.match_code AND mt.phase = mb.phase
          WHERE mb.tournament_id = t.tournament_id
            AND ms.match_status != 'scheduled'
            AND ml.team1_tournament_team_id IS NOT NULL
            AND ml.team2_tournament_team_id IS NOT NULL
            AND (mt.is_bye_match IS NULL OR mt.is_bye_match != 1)
        ) AS started_matches_count
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_prefectures p ON v.prefecture_id = p.prefecture_id
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
      WHERE t.is_archived = 0
        AND t.visibility = 'open'
        AND t.recruitment_start_date <= datetime('now', '+9 hours')
        AND t.recruitment_end_date >= datetime('now', '+9 hours')
        AND t.status IN ('recruiting', 'recruitment_closed')
        ${excludeClause}
        ${searchClause}
      ORDER BY t.group_id ASC, t.group_order ASC, t.tournament_id ASC
    `,
    args: searchArgs,
  });

  return NextResponse.json({
    success: true,
    data: {
      joined: joinedRes.rows.map(row => ({
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        event_start_date: getFirstDate(row.tournament_dates),
        venue_name: row.venue_name ? String(row.venue_name) : null,
        prefecture_name: row.prefecture_name ? String(row.prefecture_name) : null,
        tournament_team_id: Number(row.tournament_team_id),
        tournament_team_name: String(row.tournament_team_name),
        participation_status: String(row.participation_status),
        assigned_block: row.assigned_block ? String(row.assigned_block) : null,
        block_position: row.block_position != null ? Number(row.block_position) : null,
        withdrawal_status: row.withdrawal_status ? String(row.withdrawal_status) : 'active',
        withdrawal_requested_at: row.withdrawal_requested_at ? String(row.withdrawal_requested_at) : null,
      })),
      available: availableRes.rows
        .filter(row => Number(row.started_matches_count || 0) === 0) // 試合が開始されている部門を除外
        .map(row => ({
          tournament_id: Number(row.tournament_id),
          tournament_name: String(row.tournament_name),
          event_start_date: row.event_start_date ? String(row.event_start_date) : null,
          event_end_date: row.event_end_date ? String(row.event_end_date) : null,
          venue_name: row.venue_name ? String(row.venue_name) : null,
          prefecture_name: row.prefecture_name ? String(row.prefecture_name) : null,
          recruitment_end_date: row.recruitment_end_date ? String(row.recruitment_end_date) : null,
          confirmed_count: Number(row.confirmed_count) || 0,
          tournament_group_id: row.group_id ? Number(row.group_id) : null,
          group_name: row.group_name ? String(row.group_name) : null,
          group_order: row.group_order != null ? Number(row.group_order) : null,
          sport_type_id: row.sport_type_id ? Number(row.sport_type_id) : null,
        })),
    },
  });
}
