// lib/tournament-detail.ts
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';

/**
 * 大会詳細情報を取得する
 */
export async function getTournamentById(tournamentId: number): Promise<Tournament> {
  try {
    const result = await db.execute(`
      SELECT 
        t.*,
        v.venue_name,
        v.address,
        tf.format_name,
        tf.format_description
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats tf ON t.format_id = tf.format_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (!result.rows || result.rows.length === 0) {
      throw new Error('大会が見つかりません');
    }

    const row = result.rows[0];
    
    const tournament: Tournament = {
      tournament_id: row.tournament_id as number,
      tournament_name: row.tournament_name as string,
      format_id: row.format_id as number,
      venue_id: row.venue_id as number,
      team_count: row.team_count as number,
      status: row.status as "planning" | "ongoing" | "completed",
      court_count: row.court_count as number,
      tournament_dates: row.tournament_dates as string | undefined,
      match_duration_minutes: row.match_duration_minutes as number,
      break_duration_minutes: row.break_duration_minutes as number,
      win_points: row.win_points as number || 3,
      draw_points: row.draw_points as number || 1,
      loss_points: row.loss_points as number || 0,
      walkover_winner_goals: row.walkover_winner_goals as number || 3,
      walkover_loser_goals: row.walkover_loser_goals as number || 0,
      visibility: row.visibility as number,
      public_start_date: row.public_start_date ? String(row.public_start_date) : undefined,
      recruitment_start_date: row.recruitment_start_date ? String(row.recruitment_start_date) : undefined,
      recruitment_end_date: row.recruitment_end_date ? String(row.recruitment_end_date) : undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      
      // Optional joined fields
      venue_name: row.venue_name ? String(row.venue_name) : undefined,
      format_name: row.format_name ? String(row.format_name) : undefined,
      
      // 後方互換性のため
      is_public: Boolean(row.is_public || row.visibility),
      start_time: row.start_time ? String(row.start_time) : undefined,
    };

    return tournament;
    
  } catch (error) {
    console.error('getTournamentById error:', error);
    throw error;
  }
}