// lib/api/tournaments.ts
import { db } from "@/lib/db";
import type { Tournament } from "@/lib/types";
import { calculateTournamentStatus } from "@/lib/tournament-status";

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
        t.win_points,
        t.draw_points,
        t.loss_points,
        t.walkover_winner_goals,
        t.walkover_loser_goals,
        t.status,
        t.visibility,
        t.tournament_dates,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name,
        ${teamId ? 'CASE WHEN tt.team_id IS NOT NULL THEN 1 ELSE 0 END as is_joined' : '0 as is_joined'}
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      ${teamId ? 'LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id AND tt.team_id = ?' : ''}
      WHERE t.visibility = 'open' 
        AND t.public_start_date <= date('now')
      ORDER BY t.created_at DESC
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
        win_points: Number(row.win_points),
        draw_points: Number(row.draw_points),
        loss_points: Number(row.loss_points),
        walkover_winner_goals: Number(row.walkover_winner_goals),
        walkover_loser_goals: Number(row.walkover_loser_goals),
        status: calculatedStatus as 'planning' | 'ongoing' | 'completed',
        visibility: row.visibility === 'open' ? 1 : 0,
        public_start_date: row.public_start_date as string,
        recruitment_start_date: row.recruitment_start_date as string,
        recruitment_end_date: row.recruitment_end_date as string,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        venue_name: row.venue_name as string,
        format_name: row.format_name as string,
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
      }
    }

    return {
      total: tournaments.length,
      ongoing: ongoingCount,
      completed: completedCount
    };
  } catch (error) {
    console.error("Failed to fetch tournament stats:", error);
    return { total: 0, ongoing: 0, completed: 0 };
  }
}