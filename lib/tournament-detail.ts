// lib/tournament-detail.ts
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';
import type { TournamentStatus } from '@/lib/tournament-status';

/**
 * アーカイブされた大会の詳細情報を取得する
 */
async function getArchivedTournamentById(tournamentId: number): Promise<Tournament> {
  try {
    console.log(`🔍 アーカイブされた大会データを検索: tournament_id=${tournamentId}`);
    
    const result = await db.execute(`
      SELECT tournament_data
      FROM t_archived_tournament_json
      WHERE tournament_id = ?
    `, [tournamentId]);

    console.log(`📊 検索結果: ${result.rows ? result.rows.length : 0} 件`);

    if (!result.rows || result.rows.length === 0) {
      console.error(`❌ アーカイブデータが見つからない: tournament_id=${tournamentId}`);
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
 * アーカイブフラグに関係なく大会の生データを取得する（アーカイブ処理用）
 */
export async function getRawTournamentById(tournamentId: number): Promise<Tournament | null> {
  try {
    // アーカイブフラグに関係なく通常のテーブルから大会情報を取得
    const result = await db.execute(`
      SELECT 
        t.*,
        v.venue_name,
        v.address
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    
    // アーカイブフラグに関係なく常に生データを返す
    const tournament: Tournament = {
      tournament_id: row.tournament_id as number,
      tournament_name: row.tournament_name as string,
      format_id: row.format_id as number,
      venue_id: row.venue_id as number,
      team_count: row.team_count as number,
      status: row.status as TournamentStatus,
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
      venue_name: row.venue_name as string | undefined,
      format_name: row.format_name as string | undefined,
      
      // 後方互換性のため
      is_public: Boolean(row.is_public || row.visibility),
      start_time: row.start_time as string | undefined,
      
      // アーカイブ関連
      is_archived: Boolean(row.is_archived),
      archive_ui_version: row.archive_ui_version as string | undefined
    };

    return tournament;
  } catch (error) {
    console.error('getRawTournamentById error:', error);
    return null;
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
        v.address
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
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
      status: row.status as TournamentStatus,
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
      archive_ui_version: row.archive_ui_version ? String(row.archive_ui_version) : undefined,

      // フェーズ構成
      phases: row.phases ? (typeof row.phases === 'string' ? JSON.parse(row.phases as string) : row.phases) : undefined,
    };

    return tournament;

  } catch (error) {
    console.error('getTournamentById error:', error);
    throw error;
  }
}

/**
 * 大会グループ情報と所属部門一覧を含む大会詳細を取得する
 */
export async function getTournamentWithGroupInfo(tournamentId: number) {
  try {
    // 大会基本情報を取得
    const tournament = await getTournamentById(tournamentId);

    // アーカイブされた大会の場合はグループ情報なしで返す
    if (tournament.is_archived) {
      return {
        tournament,
        group: null,
        sibling_divisions: []
      };
    }

    // 大会グループ情報を取得
    const groupResult = await db.execute(`
      SELECT
        tg.group_id,
        tg.group_name,
        tg.organizer,
        tg.venue_id,
        tg.event_start_date,
        tg.event_end_date
      FROM t_tournaments t
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    const groupRow = groupResult.rows[0];
    const group = groupRow.group_id ? {
      group_id: Number(groupRow.group_id),
      group_name: String(groupRow.group_name),
      organizer: groupRow.organizer as string | null,
      venue_id: groupRow.venue_id ? Number(groupRow.venue_id) : null,
      event_start_date: groupRow.event_start_date as string | null,
      event_end_date: groupRow.event_end_date as string | null,
    } : null;

    // 同じグループに所属する他の部門を取得
    let sibling_divisions: Array<{ tournament_id: number; tournament_name: string }> = [];
    if (group) {
      const divisionsResult = await db.execute(`
        SELECT
          t.tournament_id,
          t.tournament_name,
          t.visibility,
          t.public_start_date
        FROM t_tournaments t
        WHERE t.group_id = ?
          AND t.tournament_id != ?
          AND t.visibility = 'open'
          AND t.public_start_date <= date('now')
        ORDER BY t.created_at ASC
      `, [group.group_id, tournamentId]);

      sibling_divisions = divisionsResult.rows.map(row => ({
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name)
      }));
    }

    return {
      tournament,
      group,
      sibling_divisions
    };

  } catch (error) {
    console.error('getTournamentWithGroupInfo error:', error);
    throw error;
  }
}