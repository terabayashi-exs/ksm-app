// lib/tournament-teams-simple.ts
import { db } from '@/lib/db';

export interface SimpleTournamentTeam {
  tournament_team_id: number;
  team_id: string;
  team_name: string;
  team_omission?: string;
  display_name: string;
  assigned_block?: string;
  block_position?: number;
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  player_count: number;
}

export interface SimpleTournamentTeamsData {
  tournament_id: number;
  tournament_name: string;
  teams: SimpleTournamentTeam[];
  total_teams: number;
  total_players: number;
}

/**
 * 大会の参加チーム情報を簡単に取得する
 */
export async function getSimpleTournamentTeams(tournamentId: number): Promise<SimpleTournamentTeamsData> {
  try {
    console.log('getSimpleTournamentTeams called with ID:', tournamentId);
    
    // 大会情報を取得
    const tournamentResult = await db.execute({
      sql: 'SELECT tournament_name FROM t_tournaments WHERE tournament_id = ?',
      args: [tournamentId]
    });

    if (!tournamentResult.rows || tournamentResult.rows.length === 0) {
      throw new Error('大会が見つかりません');
    }

    const tournamentName = tournamentResult.rows[0].tournament_name as string;
    console.log('Tournament found:', tournamentName);

    // 参加チーム一覧を取得
    const teamsResult = await db.execute({
      sql: `
        SELECT 
          tt.tournament_team_id,
          tt.team_id,
          tt.assigned_block,
          tt.block_position,
          t.team_name,
          t.team_omission,
          t.contact_person,
          t.contact_email,
          t.contact_phone
        FROM t_tournament_teams tt
        JOIN m_teams t ON tt.team_id = t.team_id
        WHERE tt.tournament_id = ?
        ORDER BY tt.assigned_block, tt.block_position, t.team_name
      `,
      args: [tournamentId]
    });

    console.log('Teams found:', teamsResult.rows?.length || 0);

    const teams: SimpleTournamentTeam[] = [];
    let totalPlayers = 0;

    if (teamsResult.rows && teamsResult.rows.length > 0) {
      for (const teamRow of teamsResult.rows) {
        // 各チームの選手数を取得
        const playerCountResult = await db.execute({
          sql: `
            SELECT COUNT(*) as player_count
            FROM t_tournament_players tp
            WHERE tp.tournament_id = ? AND tp.team_id = ?
            AND tp.player_status = 'active'
          `,
          args: [tournamentId, teamRow.team_id]
        });

        const playerCount = (playerCountResult.rows?.[0]?.player_count as number) || 0;
        totalPlayers += playerCount;

        teams.push({
          tournament_team_id: teamRow.tournament_team_id as number,
          team_id: teamRow.team_id as string,
          team_name: teamRow.team_name as string,
          team_omission: teamRow.team_omission ? String(teamRow.team_omission) : undefined,
          display_name: (teamRow.team_omission ? String(teamRow.team_omission) : String(teamRow.team_name)),
          assigned_block: teamRow.assigned_block ? String(teamRow.assigned_block) : undefined,
          block_position: teamRow.block_position ? Number(teamRow.block_position) : undefined,
          contact_person: teamRow.contact_person as string,
          contact_email: teamRow.contact_email as string,
          contact_phone: teamRow.contact_phone ? String(teamRow.contact_phone) : undefined,
          player_count: playerCount
        });
      }
    }

    console.log('Result compiled:', { teams: teams.length, totalPlayers });

    return {
      tournament_id: tournamentId,
      tournament_name: tournamentName,
      teams,
      total_teams: teams.length,
      total_players: totalPlayers
    };

  } catch (error) {
    console.error('getSimpleTournamentTeams error:', error);
    throw error;
  }
}