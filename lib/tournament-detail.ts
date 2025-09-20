// lib/tournament-detail.ts
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';

/**
 * アーカイブされた大会の詳細情報を取得する
 */
async function getArchivedTournamentById(tournamentId: number): Promise<Tournament> {
  try {
    const result = await db.execute(`
      SELECT tournament_data
      FROM t_archived_tournament_json
      WHERE tournament_id = ?
    `, [tournamentId]);

    if (!result.rows || result.rows.length === 0) {
      throw new Error('アーカイブされた大会が見つかりません');
    }

    const tournamentData = JSON.parse(result.rows[0].tournament_data as string);
    
    const tournament: Tournament = {
      tournament_id: Number(tournamentData.tournament_id),
      tournament_name: String(tournamentData.tournament_name),
      format_id: Number(tournamentData.format_id),
      venue_id: Number(tournamentData.venue_id),
      team_count: Number(tournamentData.team_count),
      status: tournamentData.status,
      court_count: Number(tournamentData.court_count),
      tournament_dates: tournamentData.tournament_dates,
      match_duration_minutes: Number(tournamentData.match_duration_minutes),
      break_duration_minutes: Number(tournamentData.break_duration_minutes),
      visibility: Number(tournamentData.visibility),
      public_start_date: tournamentData.public_start_date,
      recruitment_start_date: tournamentData.recruitment_start_date,
      recruitment_end_date: tournamentData.recruitment_end_date,
      created_at: String(tournamentData.created_at),
      updated_at: String(tournamentData.updated_at),
      
      // Optional joined fields
      venue_name: tournamentData.venue_name,
      format_name: tournamentData.format_name,
      
      // 後方互換性のため
      is_public: Boolean(tournamentData.is_public || tournamentData.visibility),
      start_time: tournamentData.start_time,
      
      // アーカイブ関連
      is_archived: true,
      archive_ui_version: tournamentData.archive_ui_version
    };

    return tournament;
    
  } catch (error) {
    console.error('getArchivedTournamentById error:', error);
    throw error;
  }
}

/**
 * 大会詳細情報を取得する（アーカイブ対応）
 */
export async function getTournamentById(tournamentId: number): Promise<Tournament> {
  try {
    // まず通常のテーブルから大会情報を取得
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
    
    // アーカイブされた大会かどうかをチェック
    if (row.is_archived) {
      console.log(`大会ID:${tournamentId} はアーカイブされています。アーカイブデータを使用します。`);
      return await getArchivedTournamentById(tournamentId);
    }

    // 通常の大会データを返す
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
      
      // アーカイブ関連
      is_archived: Boolean(row.is_archived),
      archive_ui_version: row.archive_ui_version ? String(row.archive_ui_version) : undefined
    };

    return tournament;
    
  } catch (error) {
    console.error('getTournamentById error:', error);
    throw error;
  }
}