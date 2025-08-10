// lib/standings-calculator.ts
import { db } from '@/lib/db';

export interface TeamStanding {
  team_id: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
}

export interface BlockStanding {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  teams: TeamStanding[];
}

export interface MatchResult {
  match_id: number;
  match_block_id: number;
  team1_id: string | null;
  team2_id: string | null;
  team1_goals: number;
  team2_goals: number;
  winner_team_id: string | null;
  is_draw: boolean;
  is_walkover: boolean;
}

/**
 * 大会の順位表を取得する（team_rankingsから）
 */
export async function getTournamentStandings(tournamentId: number): Promise<BlockStanding[]> {
  try {
    // ブロック情報とteam_rankingsを取得
    const blocks = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          phase,
          display_round_name,
          block_name,
          team_rankings
        FROM t_match_blocks 
        WHERE tournament_id = ? 
        ORDER BY block_order, match_block_id
      `,
      args: [tournamentId]
    });

    if (!blocks.rows || blocks.rows.length === 0) {
      return [];
    }

    const standings: BlockStanding[] = [];

    // 各ブロックの順位表を取得
    for (const block of blocks.rows) {
      const teamRankings = block.team_rankings as string;
      let teams: TeamStanding[] = [];

      if (teamRankings) {
        try {
          teams = JSON.parse(teamRankings);
        } catch (parseError) {
          console.error(`ブロック ${block.match_block_id} のteam_rankingsのパースに失敗:`, parseError);
          teams = [];
        }
      }

      // team_rankingsが空の場合、参加チーム一覧を取得
      if (teams.length === 0) {
        const participatingTeams = await getParticipatingTeamsForBlock(
          block.match_block_id as number, 
          tournamentId
        );
        teams = participatingTeams;
      }

      standings.push({
        match_block_id: block.match_block_id as number,
        phase: block.phase as string,
        display_round_name: block.display_round_name as string,
        block_name: block.block_name as string,
        teams: teams
      });
    }

    return standings;
  } catch (error) {
    console.error('順位表取得エラー:', error);
    throw new Error('順位表の取得に失敗しました');
  }
}

/**
 * 試合結果確定時に順位表を計算・更新する
 */
export async function updateBlockRankingsOnMatchConfirm(matchBlockId: number, tournamentId: number): Promise<void> {
  try {
    // ブロックの順位を計算
    const blockStandings = await calculateBlockStandings(matchBlockId, tournamentId);
    
    // team_rankingsをJSON形式で更新
    await db.execute({
      sql: `
        UPDATE t_match_blocks 
        SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
        WHERE match_block_id = ?
      `,
      args: [JSON.stringify(blockStandings), matchBlockId]
    });

    console.log(`ブロック ${matchBlockId} の順位表を更新しました`);
  } catch (error) {
    console.error(`ブロック ${matchBlockId} の順位表更新エラー:`, error);
    throw new Error('順位表の更新に失敗しました');
  }
}

/**
 * 全ブロックの順位表を再計算・更新する（管理者用）
 */
export async function recalculateAllTournamentRankings(tournamentId: number): Promise<void> {
  try {
    // 全ブロック情報を取得
    const blocks = await db.execute({
      sql: `
        SELECT match_block_id
        FROM t_match_blocks 
        WHERE tournament_id = ?
      `,
      args: [tournamentId]
    });

    if (!blocks.rows || blocks.rows.length === 0) {
      return;
    }

    // 各ブロックの順位表を再計算
    for (const block of blocks.rows) {
      await updateBlockRankingsOnMatchConfirm(
        block.match_block_id as number, 
        tournamentId
      );
    }

    console.log(`大会 ${tournamentId} の全ブロック順位表を再計算しました`);
  } catch (error) {
    console.error(`大会 ${tournamentId} の順位表再計算エラー:`, error);
    throw new Error('順位表の再計算に失敗しました');
  }
}

/**
 * ブロックの参加チーム一覧を取得する（大会開始前用）
 */
async function getParticipatingTeamsForBlock(
  matchBlockId: number, 
  tournamentId: number
): Promise<TeamStanding[]> {
  try {
    // ブロック情報を取得
    const blockResult = await db.execute({
      sql: `SELECT block_name FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });

    if (!blockResult.rows || blockResult.rows.length === 0) {
      return [];
    }

    const blockName = blockResult.rows[0].block_name as string;

    // 該当ブロックの参加チーム一覧を取得
    const teamsResult = await db.execute({
      sql: `
        SELECT DISTINCT
          tt.team_id,
          t.team_name,
          t.team_omission
        FROM t_tournament_teams tt
        JOIN m_teams t ON tt.team_id = t.team_id
        WHERE tt.tournament_id = ? AND tt.assigned_block = ?
        ORDER BY t.team_name
      `,
      args: [tournamentId, blockName]
    });

    if (!teamsResult.rows || teamsResult.rows.length === 0) {
      return [];
    }

    // 空の順位データを作成
    return teamsResult.rows.map((team, index) => ({
      team_id: team.team_id as string,
      team_name: team.team_name as string,
      team_omission: team.team_omission as string || undefined,
      position: 0, // 大会開始前は順位なし
      points: 0,
      matches_played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0
    }));

  } catch (error) {
    console.error(`ブロック ${matchBlockId} の参加チーム取得エラー:`, error);
    return [];
  }
}

/**
 * 特定ブロックの順位表を計算する
 */
async function calculateBlockStandings(
  matchBlockId: number, 
  tournamentId: number
): Promise<TeamStanding[]> {
  try {
    // ブロック内のチーム一覧を取得（t_tournament_teamsから）
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

    if (!teamsResult.rows || teamsResult.rows.length === 0) {
      return [];
    }

    // 確定試合結果を取得（t_matches_finalから）
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
          is_walkover
        FROM t_matches_final
        WHERE match_block_id = ?
        AND (team1_id IS NOT NULL AND team2_id IS NOT NULL)
      `,
      args: [matchBlockId]
    });

    const matches: MatchResult[] = (matchesResult.rows || []).map(row => ({
      match_id: row.match_id as number,
      match_block_id: row.match_block_id as number,
      team1_id: row.team1_id as string | null,
      team2_id: row.team2_id as string | null,
      team1_goals: row.team1_goals as number,
      team2_goals: row.team2_goals as number,
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover)
    }));

    // 大会設定を取得（勝点計算用）
    const tournamentResult = await db.execute({
      sql: `SELECT win_points, draw_points FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });

    const winPoints = tournamentResult.rows?.[0]?.win_points as number || 3;
    const drawPoints = tournamentResult.rows?.[0]?.draw_points as number || 1;

    // 各チームの成績を計算
    const teamStandings: TeamStanding[] = teamsResult.rows.map(team => {
      const teamId = team.team_id as string;
      
      // チームが関わる試合を抽出
      const teamMatches = matches.filter(match => 
        match.team1_id === teamId || match.team2_id === teamId
      );

      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      let points = 0;

      // 各試合の結果を集計
      teamMatches.forEach(match => {
        const isTeam1 = match.team1_id === teamId;
        const teamGoals = isTeam1 ? match.team1_goals : match.team2_goals;
        const opponentGoals = isTeam1 ? match.team2_goals : match.team1_goals;

        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;

        if (match.is_draw) {
          draws++;
          points += drawPoints;
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += winPoints;
        } else {
          losses++;
          // 敗北時は0ポイント
        }
      });

      return {
        team_id: teamId,
        team_name: team.team_name as string,
        team_omission: team.team_omission as string || undefined,
        position: 0, // 後で設定
        points,
        matches_played: teamMatches.length,
        wins,
        draws,
        losses,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        goal_difference: goalsFor - goalsAgainst
      };
    });

    // 順位を決定（勝点 > 得失点差 > 総得点 > チーム名の順）
    teamStandings.sort((a, b) => {
      // 1. 勝点の多い順
      if (a.points !== b.points) {
        return b.points - a.points;
      }
      // 2. 得失点差の良い順
      if (a.goal_difference !== b.goal_difference) {
        return b.goal_difference - a.goal_difference;
      }
      // 3. 総得点の多い順
      if (a.goals_for !== b.goals_for) {
        return b.goals_for - a.goals_for;
      }
      // 4. チーム名の辞書順
      return a.team_name.localeCompare(b.team_name, 'ja');
    });

    // 順位を設定
    teamStandings.forEach((team, index) => {
      team.position = index + 1;
    });

    return teamStandings;
  } catch (error) {
    console.error(`ブロック ${matchBlockId} の順位表計算エラー:`, error);
    throw new Error('ブロック順位表の計算に失敗しました');
  }
}

/**
 * チーム間の直接対戦成績を計算する（将来の拡張用）
 */
export function calculateHeadToHead(
  teamAId: string, 
  teamBId: string, 
  matches: MatchResult[]
): {
  teamAWins: number;
  teamBWins: number;
  draws: number;
  teamAGoals: number;
  teamBGoals: number;
} {
  const headToHeadMatches = matches.filter(match => 
    (match.team1_id === teamAId && match.team2_id === teamBId) ||
    (match.team1_id === teamBId && match.team2_id === teamAId)
  );

  let teamAWins = 0;
  let teamBWins = 0;
  let draws = 0;
  let teamAGoals = 0;
  let teamBGoals = 0;

  headToHeadMatches.forEach(match => {
    if (match.team1_id === teamAId) {
      teamAGoals += match.team1_goals;
      teamBGoals += match.team2_goals;
      
      if (match.is_draw) {
        draws++;
      } else if (match.winner_team_id === teamAId) {
        teamAWins++;
      } else {
        teamBWins++;
      }
    } else {
      teamAGoals += match.team2_goals;
      teamBGoals += match.team1_goals;
      
      if (match.is_draw) {
        draws++;
      } else if (match.winner_team_id === teamAId) {
        teamAWins++;
      } else {
        teamBWins++;
      }
    }
  });

  return {
    teamAWins,
    teamBWins,
    draws,
    teamAGoals,
    teamBGoals
  };
}