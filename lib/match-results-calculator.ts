// lib/match-results-calculator.ts
import { db } from '@/lib/db';

export interface MatchResult {
  match_id: number;
  match_block_id: number;
  team1_id: string;
  team2_id: string;
  team1_goals: number;
  team2_goals: number;
  winner_team_id: string | null;
  is_draw: boolean;
  is_walkover: boolean;
  match_code: string;
}

export interface TeamInfo {
  team_id: string;
  team_name: string;
  team_omission?: string;
  display_name: string; // 略称優先の表示名
}

export interface BlockResults {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  teams: TeamInfo[];
  matches: MatchResult[];
  match_matrix: MatchMatrix;
}

export interface MatchMatrix {
  [teamId: string]: {
    [opponentId: string]: {
      result: 'win' | 'loss' | 'draw' | null;
      score: string; // "2〇1" や "1●2" の形式
      match_code: string;
    };
  };
}

/**
 * 大会の戦績表データを取得する
 */
export async function getTournamentResults(tournamentId: number): Promise<BlockResults[]> {
  try {
    // ブロック情報を取得
    const blocks = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          phase,
          display_round_name,
          block_name
        FROM t_match_blocks 
        WHERE tournament_id = ? 
        ORDER BY block_order, match_block_id
      `,
      args: [tournamentId]
    });

    if (!blocks.rows || blocks.rows.length === 0) {
      return [];
    }

    const results: BlockResults[] = [];

    // 各ブロックの戦績データを取得
    for (const block of blocks.rows) {
      const blockResult = await getBlockResults(
        block.match_block_id as number,
        tournamentId
      );

      results.push({
        match_block_id: block.match_block_id as number,
        phase: block.phase as string,
        display_round_name: block.display_round_name as string,
        block_name: block.block_name as string,
        teams: blockResult.teams,
        matches: blockResult.matches,
        match_matrix: blockResult.match_matrix
      });
    }

    return results;
  } catch (error) {
    console.error('戦績表取得エラー:', error);
    throw new Error('戦績表の取得に失敗しました');
  }
}

/**
 * 特定ブロックの戦績データを取得する
 */
async function getBlockResults(
  matchBlockId: number,
  tournamentId: number
): Promise<{
  teams: TeamInfo[];
  matches: MatchResult[];
  match_matrix: MatchMatrix;
}> {
  try {
    // ブロック内のチーム一覧を取得
    const teamsResult = await db.execute({
      sql: `
        SELECT DISTINCT
          tt.team_id,
          t.team_name,
          t.team_omission
        FROM t_tournament_teams tt
        JOIN m_teams t ON tt.team_id = t.team_id
        WHERE tt.tournament_id = ?
        AND tt.assigned_block = (
          SELECT block_name 
          FROM t_match_blocks 
          WHERE match_block_id = ?
        )
        ORDER BY t.team_name
      `,
      args: [tournamentId, matchBlockId]
    });

    const teams: TeamInfo[] = (teamsResult.rows || []).map(row => ({
      team_id: row.team_id as string,
      team_name: row.team_name as string,
      team_omission: row.team_omission as string || undefined,
      display_name: (row.team_omission as string) || (row.team_name as string)
    }));

    // 確定試合結果を取得
    const matchesResult = await db.execute({
      sql: `
        SELECT 
          match_id,
          match_block_id,
          team1_id,
          team2_id,
          team1_goals,
          team2_goals,
          winner_team_id,
          is_draw,
          is_walkover,
          match_code
        FROM t_matches_final
        WHERE match_block_id = ?
        AND team1_id IS NOT NULL 
        AND team2_id IS NOT NULL
        ORDER BY match_code
      `,
      args: [matchBlockId]
    });

    const matches: MatchResult[] = (matchesResult.rows || []).map(row => ({
      match_id: row.match_id as number,
      match_block_id: row.match_block_id as number,
      team1_id: row.team1_id as string,
      team2_id: row.team2_id as string,
      team1_goals: row.team1_goals as number,
      team2_goals: row.team2_goals as number,
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      match_code: row.match_code as string
    }));

    // 星取表マトリックスを作成
    const match_matrix = createMatchMatrix(teams, matches);

    return {
      teams,
      matches,
      match_matrix
    };
  } catch (error) {
    console.error(`ブロック ${matchBlockId} の戦績データ取得エラー:`, error);
    throw new Error('ブロック戦績データの取得に失敗しました');
  }
}

/**
 * 星取表マトリックスを作成する
 */
function createMatchMatrix(teams: TeamInfo[], matches: MatchResult[]): MatchMatrix {
  const matrix: MatchMatrix = {};

  // 初期化：全チーム同士の組み合わせをnullで初期化
  teams.forEach(team => {
    matrix[team.team_id] = {};
    teams.forEach(opponent => {
      if (team.team_id !== opponent.team_id) {
        matrix[team.team_id][opponent.team_id] = {
          result: null,
          score: '-',
          match_code: ''
        };
      }
    });
  });

  // 試合結果を反映
  matches.forEach(match => {
    const team1Id = match.team1_id;
    const team2Id = match.team2_id;
    const team1Goals = match.team1_goals;
    const team2Goals = match.team2_goals;

    if (match.is_walkover) {
      // 不戦勝の場合
      const winnerId = match.winner_team_id;
      const loserId = winnerId === team1Id ? team2Id : team1Id;
      
      matrix[winnerId][loserId] = {
        result: 'win',
        score: '不戦勝',
        match_code: match.match_code
      };
      
      matrix[loserId][winnerId] = {
        result: 'loss',
        score: '不戦敗',
        match_code: match.match_code
      };
    } else if (match.is_draw) {
      // 引き分けの場合
      matrix[team1Id][team2Id] = {
        result: 'draw',
        score: `${team1Goals}△${team2Goals}`,
        match_code: match.match_code
      };
      
      matrix[team2Id][team1Id] = {
        result: 'draw',
        score: `${team2Goals}△${team1Goals}`,
        match_code: match.match_code
      };
    } else {
      // 勝敗が決まった場合
      const winnerId = match.winner_team_id;
      const loserId = winnerId === team1Id ? team2Id : team1Id;
      const winnerGoals = winnerId === team1Id ? team1Goals : team2Goals;
      const loserGoals = winnerId === team1Id ? team2Goals : team1Goals;

      matrix[winnerId][loserId] = {
        result: 'win',
        score: `${winnerGoals}〇${loserGoals}`,
        match_code: match.match_code
      };
      
      matrix[loserId][winnerId] = {
        result: 'loss',
        score: `${loserGoals}●${winnerGoals}`,
        match_code: match.match_code
      };
    }
  });

  return matrix;
}

/**
 * チーム名の表示名を取得（略称優先）
 */
export function getDisplayName(team: TeamInfo): string {
  return team.team_omission || team.team_name;
}

/**
 * 結果の色を取得
 */
export function getResultColor(result: 'win' | 'loss' | 'draw' | null): string {
  switch (result) {
    case 'win':
      return 'text-green-600 bg-green-50';
    case 'loss':
      return 'text-red-600 bg-red-50';
    case 'draw':
      return 'text-blue-600 bg-blue-50';
    default:
      return 'text-gray-400 bg-gray-50';
  }
}