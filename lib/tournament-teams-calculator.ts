// lib/tournament-teams-calculator.ts
import { db } from '@/lib/db';

export interface TournamentPlayer {
  tournament_player_id: number;
  player_id: number;
  player_name: string;
  jersey_number?: number;
  player_status: string;
  registration_date: string;
  withdrawal_date?: string;
  remarks?: string;
}

export interface TournamentTeam {
  tournament_team_id: number;
  team_id: string;
  team_name: string;
  team_omission?: string;
  display_name: string; // 略称優先の表示名
  assigned_block?: string;
  block_position?: number;
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  players: TournamentPlayer[];
  player_count: number;
}

export interface TournamentTeamsData {
  tournament_id: number;
  tournament_name: string;
  teams: TournamentTeam[];
  total_teams: number;
  total_players: number;
}

/**
 * 大会の参加チーム情報を取得する
 */
export async function getTournamentTeams(tournamentId: number): Promise<TournamentTeamsData> {
  try {
    console.log('getTournamentTeams called with ID:', tournamentId);
    
    // 大会情報を取得
    const tournamentResult = await db.execute({
      sql: `SELECT tournament_name FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });

    console.log('Tournament query result:', tournamentResult.rows);

    if (!tournamentResult.rows || tournamentResult.rows.length === 0) {
      throw new Error('大会が見つかりません');
    }

    const tournamentName = tournamentResult.rows[0].tournament_name as string;
    console.log('Tournament name:', tournamentName);

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

    const teams: TournamentTeam[] = [];

    if (teamsResult.rows && teamsResult.rows.length > 0) {
      // 各チームの参加選手を取得
      for (const teamRow of teamsResult.rows) {
        const playersResult = await db.execute({
          sql: `
            SELECT
              tp.tournament_player_id,
              tp.player_id,
              tp.jersey_number,
              tp.player_status,
              tp.registration_date,
              tp.withdrawal_date,
              tp.remarks,
              p.player_name
            FROM t_tournament_players tp
            JOIN m_players p ON tp.player_id = p.player_id
            WHERE tp.tournament_id = ? AND tp.tournament_team_id = ?
            AND tp.player_status = 'active'
            ORDER BY tp.jersey_number, p.player_name
          `,
          args: [tournamentId, teamRow.tournament_team_id]
        });

        const players: TournamentPlayer[] = (playersResult.rows || []).map(row => ({
          tournament_player_id: row.tournament_player_id as number,
          player_id: row.player_id as number,
          player_name: row.player_name as string,
          jersey_number: row.jersey_number ? (row.jersey_number as number) : undefined,
          player_status: row.player_status as string,
          registration_date: row.registration_date as string,
          withdrawal_date: row.withdrawal_date ? (row.withdrawal_date as string) : undefined,
          remarks: row.remarks ? (row.remarks as string) : undefined,
        }));

        teams.push({
          tournament_team_id: teamRow.tournament_team_id as number,
          team_id: teamRow.team_id as string,
          team_name: teamRow.team_name as string,
          team_omission: teamRow.team_omission ? (teamRow.team_omission as string) : undefined,
          display_name: (teamRow.team_omission as string) || (teamRow.team_name as string),
          assigned_block: teamRow.assigned_block ? (teamRow.assigned_block as string) : undefined,
          block_position: teamRow.block_position ? (teamRow.block_position as number) : undefined,
          contact_person: teamRow.contact_person as string,
          contact_email: teamRow.contact_email as string,
          contact_phone: teamRow.contact_phone ? (teamRow.contact_phone as string) : undefined,
          players,
          player_count: players.length
        });
      }
    }

    const totalPlayers = teams.reduce((sum, team) => sum + team.player_count, 0);

    return {
      tournament_id: tournamentId,
      tournament_name: tournamentName,
      teams,
      total_teams: teams.length,
      total_players: totalPlayers
    };

  } catch (error) {
    console.error('参加チーム情報取得エラー:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      tournamentId
    });
    throw error instanceof Error ? error : new Error('参加チーム情報の取得に失敗しました');
  }
}

/**
 * 特定チームの選手一覧を取得する
 */
export async function getTeamPlayers(
  tournamentId: number,
  tournamentTeamId: number
): Promise<TournamentPlayer[]> {
  try {
    const playersResult = await db.execute({
      sql: `
        SELECT
          tp.tournament_player_id,
          tp.player_id,
          tp.jersey_number,
          tp.player_status,
          tp.registration_date,
          tp.withdrawal_date,
          tp.remarks,
          p.player_name
        FROM t_tournament_players tp
        JOIN m_players p ON tp.player_id = p.player_id
        WHERE tp.tournament_id = ? AND tp.tournament_team_id = ?
        ORDER BY tp.jersey_number, p.player_name
      `,
      args: [tournamentId, tournamentTeamId]
    });

    return (playersResult.rows || []).map(row => ({
      tournament_player_id: row.tournament_player_id as number,
      player_id: row.player_id as number,
      player_name: row.player_name as string,
      jersey_number: row.jersey_number ? (row.jersey_number as number) : undefined,
      player_status: row.player_status as string,
      registration_date: row.registration_date as string,
      withdrawal_date: row.withdrawal_date ? (row.withdrawal_date as string) : undefined,
      remarks: row.remarks ? (row.remarks as string) : undefined,
    }));

  } catch (error) {
    console.error(`大会参加チーム ${tournamentTeamId} の選手一覧取得エラー:`, error);
    throw new Error('選手一覧の取得に失敗しました');
  }
}

/**
 * ブロック別にチームをグループ化する
 */
export function groupTeamsByBlock(teams: TournamentTeam[]): Record<string, TournamentTeam[]> {
  const grouped: Record<string, TournamentTeam[]> = {};

  teams.forEach(team => {
    const blockName = team.assigned_block || '未分類';
    if (!grouped[blockName]) {
      grouped[blockName] = [];
    }
    grouped[blockName].push(team);
  });

  return grouped;
}

/**
 * チーム状態の取得
 */
export function getTeamStatus(team: TournamentTeam): {
  status: 'complete' | 'incomplete' | 'empty';
  statusText: string;
  statusColor: string;
} {
  if (team.player_count === 0) {
    return {
      status: 'empty',
      statusText: '選手未登録',
      statusColor: 'text-red-600 bg-red-50'
    };
  } else if (team.player_count < 5) {
    return {
      status: 'incomplete',
      statusText: `選手${team.player_count}名`,
      statusColor: 'text-yellow-600 bg-yellow-50'
    };
  } else {
    return {
      status: 'complete',
      statusText: `選手${team.player_count}名`,
      statusColor: 'text-green-600 bg-green-50'
    };
  }
}

/**
 * 選手ステータスの取得
 */
export function getPlayerStatus(player: TournamentPlayer): {
  statusText: string;
  statusColor: string;
} {
  switch (player.player_status) {
    case 'active':
      return {
        statusText: '出場',
        statusColor: 'text-green-600 bg-green-50'
      };
    case 'inactive':
      return {
        statusText: '不参加',
        statusColor: 'text-gray-600 bg-gray-50'
      };
    case 'withdrawn':
      return {
        statusText: '棄権',
        statusColor: 'text-red-600 bg-red-50'
      };
    default:
      return {
        statusText: player.player_status,
        statusColor: 'text-gray-600 bg-gray-50'
      };
  }
}