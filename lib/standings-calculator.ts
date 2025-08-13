// lib/standings-calculator.ts
import { db } from '@/lib/db';
import { checkAndPromoteBlockWinners, promoteTeamsToFinalTournament } from '@/lib/tournament-promotion';
import { createTournamentNotification } from '@/lib/notifications';

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
    console.log(`[STANDINGS] 順位表更新開始: Block ${matchBlockId}, Tournament ${tournamentId}`);
    
    // 確定済み試合数を事前確認
    const matchCountResult = await db.execute({
      sql: `SELECT COUNT(*) as count FROM t_matches_final WHERE match_block_id = ?`,
      args: [matchBlockId]
    });
    const confirmedMatches = matchCountResult.rows[0]?.count as number || 0;
    console.log(`[STANDINGS] 確定済み試合数: ${confirmedMatches}件`);
    
    // ブロックの順位を計算
    const blockStandings = await calculateBlockStandings(matchBlockId, tournamentId);
    console.log(`[STANDINGS] 計算完了: ${blockStandings.length}チームの順位を計算`);
    
    // 計算結果の詳細ログ
    blockStandings.forEach(team => {
      console.log(`[STANDINGS] ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
    });
    
    // team_rankingsをJSON形式で更新
    const updateResult = await db.execute({
      sql: `
        UPDATE t_match_blocks 
        SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
        WHERE match_block_id = ?
      `,
      args: [JSON.stringify(blockStandings), matchBlockId]
    });

    console.log(`[STANDINGS] DB更新完了: ${updateResult.rowsAffected}行が更新されました`);
    console.log(`[STANDINGS] ブロック ${matchBlockId} の順位表を更新しました`);
    
    // 更新確認
    const verifyResult = await db.execute({
      sql: `SELECT team_rankings, updated_at FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });
    
    if (verifyResult.rows[0]?.team_rankings) {
      const updatedAt = verifyResult.rows[0].updated_at;
      console.log(`[STANDINGS] 更新確認: データが正常に保存されています (更新時刻: ${updatedAt})`);
      
      // ブロック順位確定後の処理チェック
      try {
        await checkBlockCompletionAndPromote(tournamentId, matchBlockId, blockStandings);
      } catch (promotionError) {
        console.error(`[STANDINGS] 進出処理エラー:`, promotionError);
        // 進出処理エラーでも順位表更新は成功とする
      }
    } else {
      console.log(`[STANDINGS] 警告: データが保存されていない可能性があります`);
    }
    
  } catch (error) {
    console.error(`[STANDINGS] ブロック ${matchBlockId} の順位表更新エラー:`, error);
    console.error(`[STANDINGS] エラー詳細:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      matchBlockId,
      tournamentId
    });
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
          team1_scores as team1_goals,
          team2_scores as team2_goals,
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
      sql: `
        SELECT 
          win_points, 
          draw_points, 
          loss_points,
          walkover_winner_goals,
          walkover_loser_goals
        FROM t_tournaments 
        WHERE tournament_id = ?
      `,
      args: [tournamentId]
    });

    const winPoints = tournamentResult.rows?.[0]?.win_points as number || 3;
    const drawPoints = tournamentResult.rows?.[0]?.draw_points as number || 1;
    const lossPoints = tournamentResult.rows?.[0]?.loss_points as number || 0;
    const walkoverWinnerGoals = tournamentResult.rows?.[0]?.walkover_winner_goals as number || 3;
    const walkoverLoserGoals = tournamentResult.rows?.[0]?.walkover_loser_goals as number || 0;

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
        let teamGoals: number;
        let opponentGoals: number;

        // 不戦勝・不戦敗の場合は設定値を使用
        if (match.is_walkover) {
          if (match.winner_team_id === teamId) {
            // 不戦勝
            teamGoals = walkoverWinnerGoals;
            opponentGoals = walkoverLoserGoals;
          } else {
            // 不戦敗
            teamGoals = walkoverLoserGoals;
            opponentGoals = walkoverWinnerGoals;
          }
        } else {
          // 通常の試合
          teamGoals = isTeam1 ? Number(match.team1_goals) : Number(match.team2_goals);
          opponentGoals = isTeam1 ? Number(match.team2_goals) : Number(match.team1_goals);
        }

        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;

        // 勝敗とポイントの集計
        if (match.is_draw) {
          draws++;
          points += drawPoints;
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += winPoints;
        } else {
          losses++;
          points += lossPoints; // 敗北時のポイント（通常は0）
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
        goals_for: Number(goalsFor),
        goals_against: Number(goalsAgainst),
        goal_difference: Number(goalsFor) - Number(goalsAgainst)
      };
    });

    // 順位を決定（勝点 > 総得点 > 得失点差 > 直接対決 > 抽選の順）
    teamStandings.sort((a, b) => {
      // 1. 勝点の多い順
      if (a.points !== b.points) {
        return b.points - a.points;
      }
      
      // 2. 総得点の多い順
      if (a.goals_for !== b.goals_for) {
        return b.goals_for - a.goals_for;
      }
      
      // 3. 得失点差の良い順
      if (a.goal_difference !== b.goal_difference) {
        return b.goal_difference - a.goal_difference;
      }
      
      // 4. 直接対決の結果
      const headToHead = calculateHeadToHead(a.team_id, b.team_id, matches);
      
      // 直接対決の勝点を計算
      let teamAHeadToHeadPoints = 0;
      let teamBHeadToHeadPoints = 0;
      
      teamAHeadToHeadPoints += headToHead.teamAWins * winPoints;
      teamAHeadToHeadPoints += headToHead.draws * drawPoints;
      
      teamBHeadToHeadPoints += headToHead.teamBWins * winPoints;
      teamBHeadToHeadPoints += headToHead.draws * drawPoints;
      
      if (teamAHeadToHeadPoints !== teamBHeadToHeadPoints) {
        return teamBHeadToHeadPoints - teamAHeadToHeadPoints;
      }
      
      // 直接対決の得失点差
      const headToHeadGoalDiff = headToHead.teamAGoals - headToHead.teamBGoals;
      if (headToHeadGoalDiff !== 0) {
        return -headToHeadGoalDiff; // チームAが上位なら負の値
      }
      
      // 5. 抽選（チーム名の辞書順で代用）
      return a.team_name.localeCompare(b.team_name, 'ja');
    });

    // 同着対応の順位を設定
    let currentPosition = 1;
    for (let i = 0; i < teamStandings.length; i++) {
      if (i === 0) {
        // 1位は必ず1
        teamStandings[i].position = 1;
      } else {
        const currentTeam = teamStandings[i];
        const previousTeam = teamStandings[i - 1];
        
        // 勝点、総得点、得失点差が全て同じかつ直接対決も同じなら同着
        const isTied = currentTeam.points === previousTeam.points &&
                       currentTeam.goals_for === previousTeam.goals_for &&
                       currentTeam.goal_difference === previousTeam.goal_difference;
        
        if (isTied) {
          // 直接対決の結果を確認
          const headToHead = calculateHeadToHead(currentTeam.team_id, previousTeam.team_id, matches);
          
          // 直接対決も同じ（引き分けまたは対戦なし）なら同着
          const sameHeadToHead = headToHead.teamAWins === headToHead.teamBWins && 
                                headToHead.teamAGoals === headToHead.teamBGoals;
          
          if (sameHeadToHead) {
            // 同着なので前のチームと同じ順位
            teamStandings[i].position = previousTeam.position;
          } else {
            // 直接対決で順位が決まる場合は、これまでの同着も含めた実際の順位
            currentPosition = i + 1;
            teamStandings[i].position = currentPosition;
          }
        } else {
          // 順位が変わる場合は、これまでの同着も含めた実際の順位
          currentPosition = i + 1;
          teamStandings[i].position = currentPosition;
        }
      }
    }

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

/**
 * ブロック完了チェックと進出処理の実行
 */
export async function checkBlockCompletionAndPromote(
  tournamentId: number,
  completedBlockId: number,
  blockStandings: TeamStanding[]
): Promise<void> {
  try {
    console.log(`[PROMOTION] ブロック完了チェック開始: Block ${completedBlockId}`);
    
    // 1. ブロック情報を取得
    const blockResult = await db.execute({
      sql: `SELECT block_name, display_round_name FROM t_match_blocks WHERE match_block_id = ?`,
      args: [completedBlockId]
    });
    
    if (!blockResult.rows || blockResult.rows.length === 0) {
      console.log(`[PROMOTION] ブロック情報が見つかりません: ${completedBlockId}`);
      return;
    }
    
    const blockName = blockResult.rows[0].block_name as string;
    const displayRoundName = blockResult.rows[0].display_round_name as string;
    
    // 2. ブロック内の全試合が完了しているかチェック
    const isBlockCompleted = await checkIfBlockAllMatchesCompleted(completedBlockId);
    
    if (!isBlockCompleted) {
      console.log(`[PROMOTION] ${blockName}ブロック: まだ未完了の試合があります`);
      return;
    }
    
    console.log(`[PROMOTION] ${blockName}ブロック: 全試合完了を確認`);
    
    // 3. 上位2チームの自動決定可能性をチェック
    const promotionStatus = analyzePromotionEligibility(blockStandings);
    
    // 4. 同順位通知の作成・保存
    await createTieNotificationIfNeeded(tournamentId, completedBlockId, blockName, promotionStatus);
    
    // 5. 確定したチームについては即座に進出処理
    if (promotionStatus.canPromoteFirst || promotionStatus.canPromoteSecond) {
      console.log(`[PROMOTION] ${blockName}ブロック: 部分進出処理実行`);
      await promoteTeamsToFinalTournament(tournamentId);
    }
    
  } catch (error) {
    console.error(`[PROMOTION] ブロック完了チェックエラー:`, error);
    throw error;
  }
}

/**
 * ブロック内の全試合が完了しているかチェック
 */
async function checkIfBlockAllMatchesCompleted(matchBlockId: number): Promise<boolean> {
  try {
    const result = await db.execute({
      sql: `
        SELECT 
          COUNT(*) as total_matches,
          COUNT(mf.match_id) as completed_matches
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
        AND ml.team1_id IS NOT NULL 
        AND ml.team2_id IS NOT NULL
      `,
      args: [matchBlockId]
    });
    
    const totalMatches = result.rows[0]?.total_matches as number || 0;
    const completedMatches = result.rows[0]?.completed_matches as number || 0;
    
    console.log(`[PROMOTION] ブロック ${matchBlockId}: ${completedMatches}/${totalMatches} 試合完了`);
    
    return totalMatches > 0 && totalMatches === completedMatches;
  } catch (error) {
    console.error(`ブロック完了チェックエラー:`, error);
    return false;
  }
}

/**
 * 上位2チームの進出可能性を分析
 */
function analyzePromotionEligibility(standings: TeamStanding[]): {
  canPromoteFirst: boolean;
  canPromoteSecond: boolean;
  firstPlaceTeams: TeamStanding[];
  secondPlaceTeams: TeamStanding[];
  tieMessage: string | null;
} {
  const sortedStandings = standings.sort((a, b) => a.position - b.position);
  
  const firstPlaceTeams = sortedStandings.filter(team => team.position === 1);
  const secondPlaceTeams = sortedStandings.filter(team => team.position === 2);
  
  const canPromoteFirst = firstPlaceTeams.length === 1;
  const canPromoteSecond = secondPlaceTeams.length === 1;
  
  let tieMessage: string | null = null;
  
  if (firstPlaceTeams.length > 1) {
    const teamNames = firstPlaceTeams.map(t => t.team_name).join('、');
    tieMessage = `1位同着: ${teamNames} (${firstPlaceTeams.length}チーム)`;
  } else if (secondPlaceTeams.length > 1) {
    const teamNames = secondPlaceTeams.map(t => t.team_name).join('、');
    tieMessage = `2位同着: ${teamNames} (${secondPlaceTeams.length}チーム)`;
  } else if (secondPlaceTeams.length === 0) {
    tieMessage = '2位チームが存在しません';
  }
  
  return {
    canPromoteFirst,
    canPromoteSecond,
    firstPlaceTeams,
    secondPlaceTeams,
    tieMessage
  };
}

/**
 * 同順位通知が必要な場合に作成
 */
async function createTieNotificationIfNeeded(
  tournamentId: number,
  blockId: number,
  blockName: string,
  promotionStatus: {
    canPromoteFirst: boolean;
    canPromoteSecond: boolean;
    firstPlaceTeams: TeamStanding[];
    secondPlaceTeams: TeamStanding[];
    tieMessage: string | null;
  }
): Promise<void> {
  try {
    // 同順位が発生している場合のみ通知作成
    if (!promotionStatus.tieMessage) {
      console.log(`[PROMOTION] ${blockName}ブロック: 同順位なし、通知不要`);
      return;
    }
    
    const title = `${blockName}ブロック 手動順位決定が必要`;
    const message = `${blockName}ブロックで${promotionStatus.tieMessage}が発生しました。決勝トーナメント進出チームを決定するため、手動で順位を設定してください。`;
    
    // 通知に含めるメタデータ
    const metadata = {
      block_id: blockId,
      block_name: blockName,
      tie_type: promotionStatus.firstPlaceTeams.length > 1 ? 'first_place' : 'second_place',
      tied_teams: promotionStatus.firstPlaceTeams.length > 1 
        ? promotionStatus.firstPlaceTeams.map(t => ({ team_id: t.team_id, team_name: t.team_name }))
        : promotionStatus.secondPlaceTeams.map(t => ({ team_id: t.team_id, team_name: t.team_name })),
      requires_manual_ranking: true
    };
    
    await createTournamentNotification(
      tournamentId,
      'manual_ranking_needed',
      title,
      message,
      'warning',
      metadata
    );
    
    console.log(`[PROMOTION] ${blockName}ブロック: 同順位通知を作成`);
    
  } catch (error) {
    console.error(`[PROMOTION] 同順位通知作成エラー:`, error);
    // エラーでも処理は続行
  }
}