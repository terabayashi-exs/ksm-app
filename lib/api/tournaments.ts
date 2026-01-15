// lib/api/tournaments.ts
import { db } from "@/lib/db";
import type { Tournament } from "@/lib/types";
import { calculateTournamentStatus, type TournamentStatus } from "@/lib/tournament-status";

export async function getPublicTournaments(teamId?: string): Promise<Tournament[]> {
  try {
    const query = `
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.status,
        t.visibility,
        t.tournament_dates,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        t.created_by,
        t.group_id,
        t.group_order,
        v.venue_name,
        f.format_name,
        a.logo_blob_url,
        a.organization_name,
        g.group_name,
        g.event_description as group_description,
        NULL as group_color,
        0 as display_order,
        ${teamId ? 'CASE WHEN tt.team_id IS NOT NULL THEN 1 ELSE 0 END as is_joined' : '0 as is_joined'}
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN m_administrators a ON t.created_by = a.admin_login_id
      LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
      ${teamId ? 'LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id AND tt.team_id = ?' : ''}
      WHERE t.visibility = 'open'
        AND t.public_start_date <= date('now')
      ORDER BY t.group_order, t.created_at DESC
      LIMIT 10
    `;

    const result = await db.execute(query, teamId ? [teamId] : []);

    // 非同期でステータス計算を実行
    const tournaments = await Promise.all(result.rows.map(async (row) => {
      // tournament_datesからevent_start_dateとevent_end_dateを計算
      let eventStartDate = '';
      let eventEndDate = '';
      
      if (row.tournament_dates) {
        try {
          const dates = JSON.parse(row.tournament_dates as string);
          const dateValues = Object.values(dates) as string[];
          const sortedDates = dateValues.sort();
          eventStartDate = sortedDates[0] || '';
          eventEndDate = sortedDates[sortedDates.length - 1] || '';
        } catch (error) {
          console.error('Error parsing tournament_dates:', error);
        }
      }

      // 新しい非同期版ステータス計算を使用（大会開始日 OR 試合進行状況で判定）
      const calculatedStatus = await calculateTournamentStatus({
        status: (row.status as string) || 'planning',
        recruitment_start_date: row.recruitment_start_date as string | null,
        recruitment_end_date: row.recruitment_end_date as string | null,
        tournament_dates: (row.tournament_dates as string) || '{}'
      }, Number(row.tournament_id)); // tournamentIdを渡して試合進行状況もチェック

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        format_id: Number(row.format_id),
        venue_id: Number(row.venue_id),
        team_count: Number(row.team_count),
        court_count: Number(row.court_count),
        tournament_dates: row.tournament_dates as string,
        match_duration_minutes: Number(row.match_duration_minutes),
        break_duration_minutes: Number(row.break_duration_minutes),
        status: calculatedStatus as TournamentStatus,
        visibility: row.visibility === 'open' ? 1 : 0,
        public_start_date: row.public_start_date as string,
        recruitment_start_date: row.recruitment_start_date as string,
        recruitment_end_date: row.recruitment_end_date as string,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        created_by: row.created_by as string,
        venue_name: row.venue_name as string,
        format_name: row.format_name as string,
        // 管理者ロゴ情報
        logo_blob_url: row.logo_blob_url as string | null,
        organization_name: row.organization_name as string | null,
        // グループ情報
        group_id: row.group_id ? Number(row.group_id) : null,
        group_order: Number(row.group_order) || 0,
        category_name: row.tournament_name as string, // tournament_nameを部門名として使用
        group_name: row.group_name as string | null,
        group_description: row.group_description as string | null,
        group_color: row.group_color as string | null,
        group_display_order: Number(row.display_order) || 0,
        // 互換性のため
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
        // 参加状況
        is_joined: Boolean(row.is_joined)
      };
    }));

    return tournaments;
  } catch (error) {
    console.error("Failed to fetch public tournaments:", error);
    return [];
  }
}

export async function getTournamentStats() {
  try {
    // 全ての公開大会を取得してステータスを計算する（統計精度を向上）
    const tournamentsResult = await db.execute(`
      SELECT 
        tournament_id,
        status,
        recruitment_start_date,
        recruitment_end_date,
        tournament_dates
      FROM t_tournaments 
      WHERE visibility = 'open' AND public_start_date <= date('now')
    `);

    const tournaments = tournamentsResult.rows;
    let ongoingCount = 0;
    let completedCount = 0;

    // 各大会のステータスを動的に計算（試合進行状況を含む）
    let scheduledCount = 0; // 開催予定の大会数

    for (const tournament of tournaments) {
      const calculatedStatus = await calculateTournamentStatus({
        status: (tournament.status as string) || 'planning',
        recruitment_start_date: tournament.recruitment_start_date as string | null,
        recruitment_end_date: tournament.recruitment_end_date as string | null,
        tournament_dates: (tournament.tournament_dates as string) || '{}'
      }, Number(tournament.tournament_id));

      if (calculatedStatus === 'ongoing') {
        ongoingCount++;
      } else if (calculatedStatus === 'completed') {
        completedCount++;
      } else {
        // planning, recruiting, before_event のステータスは開催予定とカウント
        scheduledCount++;
      }
    }

    return {
      total: scheduledCount, // 開催予定の大会数に変更
      ongoing: ongoingCount,
      completed: completedCount
    };
  } catch (error) {
    console.error("Failed to fetch tournament stats:", error);
    return { total: 0, ongoing: 0, completed: 0 };
  }
}