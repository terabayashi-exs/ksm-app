// lib/standings-calculator.ts
import { db } from '@/lib/db';
import { promoteTeamsToFinalTournament } from '@/lib/tournament-promotion';
import { createTournamentNotification } from '@/lib/notifications';
import { handleTemplateBasedPositions, hasManualRankings } from '@/lib/template-position-handler';

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
  remarks?: string | null;
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
    // ブロック情報とteam_rankingsを取得（予選・決勝順、予選は試合コード順）
    const blocks = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          phase,
          display_round_name,
          block_name,
          team_rankings,
          remarks
        FROM t_match_blocks 
        WHERE tournament_id = ? 
        ORDER BY 
          CASE phase 
            WHEN 'preliminary' THEN 1 
            WHEN 'final' THEN 2 
            ELSE 3 
          END,
          block_name
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

      // 決勝トーナメントの場合は専用の計算ロジック
      if (block.phase === 'final' && teams.length === 0) {
        teams = await calculateFinalTournamentStandings(tournamentId);
      }
      // 予選の場合で空の場合は参加チーム一覧を取得
      else if (teams.length === 0) {
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
        teams: teams,
        remarks: block.remarks as string | null
      });
    }

    return standings;
  } catch (error) {
    console.error('順位表取得エラー:', error);
    throw new Error('順位表の取得に失敗しました');
  }
}

/**
 * 決勝トーナメントの順位を計算してteam_rankingsに保存する
 */
export async function updateFinalTournamentRankings(tournamentId: number): Promise<void> {
  try {
    console.log(`[FINAL_RANKINGS] 決勝トーナメント順位更新開始: Tournament ${tournamentId}`);
    
    // 手動順位設定があるかチェック
    const hasManualSettings = await hasManualRankings(tournamentId);
    if (hasManualSettings) {
      console.log(`[FINAL_RANKINGS] 手動順位設定が存在するため、自動順位計算をスキップします`);
      return;
    }
    
    // 決勝トーナメントブロックを取得
    const finalBlockResult = await db.execute({
      sql: `
        SELECT match_block_id
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'final'
      `,
      args: [tournamentId]
    });

    if (finalBlockResult.rows.length === 0) {
      console.log(`[FINAL_RANKINGS] 決勝トーナメントブロックが見つかりません`);
      return;
    }

    const finalBlockId = finalBlockResult.rows[0].match_block_id as number;
    
    // テンプレートベースの順位計算も利用可能か確認
    const templateRankings = await calculateTemplateBasedRankings(tournamentId);
    let finalRankings: TeamStanding[] = [];
    
    if (templateRankings.length > 0) {
      console.log(`[FINAL_RANKINGS] テンプレートベース順位計算を使用`);
      finalRankings = templateRankings;
    } else {
      console.log(`[FINAL_RANKINGS] 従来の詳細順位計算を使用`);
      // 従来の計算方法を使用
      finalRankings = await calculateDetailedFinalTournamentStandings(tournamentId);
    }
    
    if (finalRankings.length > 0) {
      // team_rankingsに保存
      await db.execute({
        sql: `
          UPDATE t_match_blocks 
          SET team_rankings = ?, updated_at = datetime('now', '+9 hours')
          WHERE match_block_id = ?
        `,
        args: [JSON.stringify(finalRankings), finalBlockId]
      });
      
      console.log(`[FINAL_RANKINGS] 決勝トーナメント順位更新完了: ${finalRankings.length}チーム`);
      finalRankings.forEach(team => {
        console.log(`[FINAL_RANKINGS]   ${team.position}位: ${team.team_name} (${team.team_id})`);
      });
    } else {
      console.log(`[FINAL_RANKINGS] 計算できる順位がありません`);
    }
    
  } catch (error) {
    console.error(`[FINAL_RANKINGS] 決勝トーナメント順位更新エラー:`, error);
    // エラーでも処理は継続
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
    return teamsResult.rows.map((team) => ({
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

        // 勝敗とポイントの集計（PK選手権では延長戦により引き分けなし）
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

    // 順位を決定（新レギュレーション: 1.勝点 > 2.直接対決 > 3.抽選）
    teamStandings.sort((a, b) => {
      // 1. 勝点の多い順
      if (a.points !== b.points) {
        return b.points - a.points;
      }
      
      // 2. 直接対決の結果
      const headToHead = calculateHeadToHead(a.team_id, b.team_id, matches);
      
      // 直接対決の勝点を計算（PK選手権では延長戦により引き分けなし）
      let teamAHeadToHeadPoints = 0;
      let teamBHeadToHeadPoints = 0;
      
      teamAHeadToHeadPoints += headToHead.teamAWins * winPoints;
      teamAHeadToHeadPoints += headToHead.draws * drawPoints;
      
      teamBHeadToHeadPoints += headToHead.teamBWins * winPoints;
      teamBHeadToHeadPoints += headToHead.draws * drawPoints;
      
      if (teamAHeadToHeadPoints !== teamBHeadToHeadPoints) {
        return teamBHeadToHeadPoints - teamAHeadToHeadPoints;
      }
      
      // 3. 抽選（チーム名の辞書順で代用）
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
        
        // 新レギュレーション: 勝点が同じかつ直接対決も同じなら同着
        const isTied = currentTeam.points === previousTeam.points;
        
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
    // const displayRoundName = blockResult.rows[0].display_round_name as string;
    
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
    
    // 5. ブロック完了かつ確定したチームについてのみ進出処理を実行
    if (isBlockCompleted && (promotionStatus.canPromoteFirst || promotionStatus.canPromoteSecond)) {
      console.log(`[PROMOTION] ${blockName}ブロック: 全試合完了のため進出処理実行`);
      await promoteTeamsToFinalTournament(tournamentId);
    } else if (!isBlockCompleted) {
      console.log(`[PROMOTION] ${blockName}ブロック: 未完了のため進出処理をスキップ`);
    } else {
      console.log(`[PROMOTION] ${blockName}ブロック: 同着のため手動決定待ち`);
    }
    
  } catch (error) {
    console.error(`[PROMOTION] ブロック完了チェックエラー:`, error);
    throw error;
  }
}

/**
 * ブロック内の全試合が完了しているかチェック（中止試合も完了として扱う）
 */
async function checkIfBlockAllMatchesCompleted(matchBlockId: number): Promise<boolean> {
  try {
    const result = await db.execute({
      sql: `
        SELECT 
          COUNT(*) as total_matches,
          COUNT(CASE WHEN mf.match_id IS NOT NULL THEN 1 END) as confirmed_matches,
          COUNT(CASE WHEN ml.match_status = 'cancelled' THEN 1 END) as cancelled_matches,
          COUNT(CASE WHEN mf.match_id IS NOT NULL OR ml.match_status = 'cancelled' THEN 1 END) as completed_matches
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
        AND ml.team1_id IS NOT NULL 
        AND ml.team2_id IS NOT NULL
      `,
      args: [matchBlockId]
    });
    
    const row = result.rows[0];
    const totalMatches = row?.total_matches as number || 0;
    const confirmedMatches = row?.confirmed_matches as number || 0;
    const cancelledMatches = row?.cancelled_matches as number || 0;
    const completedMatches = row?.completed_matches as number || 0;
    
    console.log(`[PROMOTION] ブロック ${matchBlockId}: ${completedMatches}/${totalMatches} 試合完了 (確定:${confirmedMatches}, 中止:${cancelledMatches})`);
    
    // 詳細な試合状況をログ出力
    const detailResult = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.match_status,
          CASE WHEN mf.match_id IS NOT NULL THEN '確定済み' ELSE '未確定' END as final_status,
          ml.team1_display_name,
          ml.team2_display_name
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
        AND ml.team1_id IS NOT NULL 
        AND ml.team2_id IS NOT NULL
        ORDER BY ml.match_code
      `,
      args: [matchBlockId]
    });
    
    console.log(`[PROMOTION] ブロック ${matchBlockId} 試合詳細:`);
    detailResult.rows.forEach(match => {
      const status = match.match_status === 'cancelled' ? '中止' : 
                    match.final_status === '確定済み' ? '確定' : '未完了';
      console.log(`[PROMOTION]   ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name} [${status}]`);
    });
    
    const isCompleted = totalMatches > 0 && totalMatches === completedMatches;
    console.log(`[PROMOTION] ブロック ${matchBlockId} 完了判定: ${isCompleted ? '✅ 完了' : '❌ 未完了'}`);
    
    return isCompleted;
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

/**
 * トーナメント構造に基づいてチームの順位を決定する
 * 31チーム構成: 1位, 2位, 3位, 4位, 5位(4チーム), 9位(4チーム), 17位(8チーム), 25位(16チーム)
 */
function determineTournamentPosition(teamId: string, finalMatches: Array<{
  match_id: number;
  match_code: string;
  team1_id: string | null;
  team2_id: string | null;
  team1_display_name: string;
  team2_display_name: string;
  team1_scores: number | null;
  team2_scores: number | null;
  winner_team_id: string | null;
  is_draw: boolean;
  is_walkover: boolean;
  is_confirmed: boolean;
}>): number {
  // このチームが参加した全試合を取得
  const teamMatches = finalMatches.filter(m => 
    m.team1_id === teamId || m.team2_id === teamId
  );
  
  if (teamMatches.length === 0) return 25; // デフォルト（1回戦敗退相当）
  
  // 最後に敗退した試合を特定
  let lastLossMatch = null;
  for (const match of teamMatches) {
    if (match.is_confirmed && match.winner_team_id && match.winner_team_id !== teamId) {
      // このチームが負けた試合
      const matchNum = parseInt(match.match_code.replace('M', ''));
      if (!lastLossMatch || matchNum > parseInt(lastLossMatch.match_code.replace('M', ''))) {
        lastLossMatch = match;
      }
    }
  }
  
  // 敗退していない場合（まだ勝ち進んでいる、または結果未確定）
  if (!lastLossMatch) {
    // 最も進んだ試合を確認
    const maxMatchCode = Math.max(...teamMatches.map(m => {
      const match = m.match_code.match(/M(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }));
    
    // まだ試合結果が未確定の場合の推定順位
    if (maxMatchCode >= 36) return 1;  // 決勝戦参加 → 1位or2位
    if (maxMatchCode >= 35) return 3;  // 3位決定戦参加 → 3位or4位
    if (maxMatchCode >= 33) return 5;  // 準決勝参加 → ベスト4
    if (maxMatchCode >= 29) return 9;  // 準々決勝参加 → ベスト8
    if (maxMatchCode >= 25) return 17; // Round3参加 → ベスト16
    if (maxMatchCode >= 17) return 25; // Round2参加 → ベスト32
    return 25; // Round1のみ → ベスト32
  }
  
  // 敗退した試合に基づいて順位を決定
  const lastLossMatchNum = parseInt(lastLossMatch.match_code.replace('M', ''));
  
  if (lastLossMatchNum === 36) return 2;   // 決勝戦敗者 → 2位
  if (lastLossMatchNum === 35) return 4;   // 3位決定戦敗者 → 4位
  if (lastLossMatchNum >= 33 && lastLossMatchNum <= 34) return 5;  // 準決勝敗者 → 5位
  if (lastLossMatchNum >= 29 && lastLossMatchNum <= 32) return 9;  // 準々決勝敗者 → 9位
  if (lastLossMatchNum >= 25 && lastLossMatchNum <= 28) return 17; // Round3敗者 → 17位
  if (lastLossMatchNum >= 17 && lastLossMatchNum <= 24) return 25; // Round2敗者 → 25位
  if (lastLossMatchNum >= 1 && lastLossMatchNum <= 16) return 25;  // Round1敗者 → 25位
  
  return 25; // デフォルト
}

/**
 * 決勝トーナメントの順位表を計算する
 */
async function calculateFinalTournamentStandings(tournamentId: number): Promise<TeamStanding[]> {
  try {
    // 決勝トーナメントの試合情報を取得
    const finalMatchesResult = await db.execute({
      sql: `
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        WHERE mb.tournament_id = ? 
          AND mb.phase = 'final'
        ORDER BY ml.match_number, ml.match_code
      `,
      args: [tournamentId]
    });

    const finalMatches = finalMatchesResult.rows.map(row => ({
      match_id: row.match_id as number,
      match_code: row.match_code as string,
      team1_id: row.team1_id as string | null,
      team2_id: row.team2_id as string | null,
      team1_display_name: row.team1_display_name as string,
      team2_display_name: row.team2_display_name as string,
      team1_scores: row.team1_scores as number | null,
      team2_scores: row.team2_scores as number | null,
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      is_confirmed: Boolean(row.is_confirmed)
    }));

    // 各カテゴリの試合を分類
    const finalMatch = finalMatches.find(m => m.match_code === 'T8');
    const semiFinalMatches = finalMatches.filter(m => ['T5', 'T6'].includes(m.match_code));

    // 全参加チームIDを取得
    const teamSet = new Set<string>();
    finalMatches.forEach(match => {
      if (match.team1_id) teamSet.add(match.team1_id);
      if (match.team2_id) teamSet.add(match.team2_id);
    });

    const rankings: TeamStanding[] = [];
    const rankedTeamIds = new Set<string>();

    // 1位・2位（決勝戦）
    if (finalMatch?.is_confirmed && finalMatch.winner_team_id) {
      const winnerId = finalMatch.winner_team_id;
      const loserId = finalMatch.team1_id === winnerId ? finalMatch.team2_id : finalMatch.team1_id;

      rankings.push({
        team_id: winnerId,
        team_name: finalMatch.team1_id === winnerId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
        team_omission: undefined,
        position: 1,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0
      });
      rankedTeamIds.add(winnerId);

      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: finalMatch.team1_id === loserId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
          team_omission: undefined,
          position: 2,
          points: 0,
          matches_played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0
        });
        rankedTeamIds.add(loserId);
      }
    }

    // 3位・4位（3位決定戦）の処理は動的順位決定に委ねる（ダブル処理を避ける）
    // thirdPlaceMatch の結果は determineTournamentPosition 内で処理される
    
    if (false) { // この処理を無効化
      // 3位決定戦がない場合は準決勝敗者を3位同着（後方互換のため残す）
      // 3位決定戦がない場合は準決勝敗者を3位同着
      semiFinalMatches.forEach(match => {
        if (match.is_confirmed && match.winner_team_id) {
          const loserId = match.team1_id === match.winner_team_id ? match.team2_id : match.team1_id;
          if (loserId && !rankedTeamIds.has(loserId)) {
            rankings.push({
              team_id: loserId,
              team_name: match.team1_id === loserId ? match.team1_display_name : match.team2_display_name,
              team_omission: undefined,
              position: 3,
              points: 0,
              matches_played: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              goals_for: 0,
              goals_against: 0,
              goal_difference: 0
            });
            rankedTeamIds.add(loserId);
          }
        }
      });
    }

    // 準々決勝敗者の処理は動的順位決定に委ねる（ダブル処理を避ける）

    // 未確定のチームはトーナメント構造に基づいて順位を決定
    teamSet.forEach(teamId => {
      if (!rankedTeamIds.has(teamId)) {
        const teamMatch = finalMatches.find(m => 
          (m.team1_id === teamId || m.team2_id === teamId)
        );
        const displayName = teamMatch?.team1_id === teamId ? teamMatch.team1_display_name : teamMatch?.team2_display_name;
        
        // トーナメント構造に基づいて順位を動的に決定
        const dynamicPosition = determineTournamentPosition(teamId, finalMatches);
        
        rankings.push({
          team_id: teamId,
          team_name: displayName || '未確定',
          team_omission: undefined,
          position: dynamicPosition,
          points: 0,
          matches_played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0
        });
      }
    });

    return rankings.sort((a, b) => {
      // 同順位の場合はチーム名順
      if (a.position === b.position) return a.team_name.localeCompare(b.team_name, 'ja');
      return a.position - b.position;
    });
  } catch (error) {
    console.error('決勝トーナメント順位表計算エラー:', error);
    return [];
  }
}

/**
 * 決勝トーナメントの詳細順位を計算する（ラウンド別順位付け）
 */
async function calculateDetailedFinalTournamentStandings(tournamentId: number): Promise<TeamStanding[]> {
  try {
    console.log(`[DETAILED_FINAL_RANKINGS] 詳細順位計算開始: Tournament ${tournamentId}`);
    
    // 決勝トーナメントの試合情報を取得
    const finalMatchesResult = await db.execute({
      sql: `
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        WHERE mb.tournament_id = ? 
          AND mb.phase = 'final'
          AND ml.team1_id IS NOT NULL
        ORDER BY ml.match_code
      `,
      args: [tournamentId]
    });

    const finalMatches = finalMatchesResult.rows.map(row => ({
      match_id: row.match_id as number,
      match_code: row.match_code as string,
      team1_id: row.team1_id as string | null,
      team2_id: row.team2_id as string | null,
      team1_display_name: row.team1_display_name as string,
      team2_display_name: row.team2_display_name as string,
      team1_scores: row.team1_scores as number | null,
      team2_scores: row.team2_scores as number | null,
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      is_confirmed: Boolean(row.is_confirmed)
    }));

    console.log(`[DETAILED_FINAL_RANKINGS] 取得した決勝トーナメント試合: ${finalMatches.length}試合`);

    // 全参加チームを収集
    const allTeams = new Set<string>();
    finalMatches.forEach(match => {
      if (match.team1_id && !match.team1_id.includes('_winner') && !match.team1_id.includes('_loser')) {
        allTeams.add(match.team1_id);
      }
      if (match.team2_id && !match.team2_id.includes('_winner') && !match.team2_id.includes('_loser')) {
        allTeams.add(match.team2_id);
      }
    });

    console.log(`[DETAILED_FINAL_RANKINGS] 決勝トーナメント参加チーム数: ${allTeams.size}`);

    const rankings: TeamStanding[] = [];

    // 各チームの最終順位を決定
    allTeams.forEach(teamId => {
      const position = calculateDetailedTournamentPosition(teamId, finalMatches);
      const teamMatch = finalMatches.find(m => 
        m.team1_id === teamId || m.team2_id === teamId
      );
      const teamName = teamMatch?.team1_id === teamId 
        ? teamMatch.team1_display_name 
        : teamMatch?.team2_display_name || '未確定';

      rankings.push({
        team_id: teamId,
        team_name: teamName,
        team_omission: undefined,
        position,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0
      });
    });

    // 順位順でソート、同順位内はチーム名順
    const sortedRankings = rankings.sort((a, b) => {
      if (a.position === b.position) {
        return a.team_name.localeCompare(b.team_name, 'ja');
      }
      return a.position - b.position;
    });

    // ログ出力：順位分布
    const positionGroups = sortedRankings.reduce((acc, team) => {
      if (!acc[team.position]) acc[team.position] = [];
      acc[team.position].push(team.team_name);
      return acc;
    }, {} as Record<number, string[]>);

    Object.entries(positionGroups).forEach(([position, teams]) => {
      console.log(`[DETAILED_FINAL_RANKINGS] ${position}位: ${teams.join(', ')} (${teams.length}チーム)`);
    });

    return sortedRankings;

  } catch (error) {
    console.error('[DETAILED_FINAL_RANKINGS] 詳細順位計算エラー:', error);
    return [];
  }
}

/**
 * チームの詳細トーナメント順位を計算する（ラウンド別順位付け）
 */
function calculateDetailedTournamentPosition(
  teamId: string, 
  finalMatches: Array<{
    match_id: number;
    match_code: string;
    team1_id: string | null;
    team2_id: string | null;
    team1_display_name: string;
    team2_display_name: string;
    team1_scores: number | null;
    team2_scores: number | null;
    winner_team_id: string | null;
    is_draw: boolean;
    is_walkover: boolean;
    is_confirmed: boolean;
  }>
): number {
  // このチームが参加した試合を全て取得
  const teamMatches = finalMatches.filter(m => 
    m.team1_id === teamId || m.team2_id === teamId
  );

  if (teamMatches.length === 0) return 33; // デフォルト（最下位グループ）

  // 試合コードから数値を抽出して最大値（最も進んだ試合）を取得
  const maxMatchNum = Math.max(...teamMatches.map(m => {
    const matchNum = parseInt(m.match_code.replace('M', ''));
    return isNaN(matchNum) ? 0 : matchNum;
  }));

  // 最も進んだ試合での結果を確認
  const lastMatch = teamMatches.find(m => {
    const matchNum = parseInt(m.match_code.replace('M', ''));
    return matchNum === maxMatchNum;
  });

  // 勝ち進み中または未確定の場合の仮順位
  if (!lastMatch?.is_confirmed || !lastMatch?.winner_team_id) {
    if (maxMatchNum >= 36) return 1;      // 決勝戦参加 → 1位候補
    if (maxMatchNum >= 35) return 3;      // 3位決定戦参加 → 3位候補
    if (maxMatchNum >= 33) return 3;      // 準決勝参加 → 3位候補
    if (maxMatchNum >= 29) return 5;      // 準々決勝参加 → 5位候補
    if (maxMatchNum >= 21) return 9;      // ベスト16参加 → 9位候補
    if (maxMatchNum >= 5) return 17;      // ベスト32参加 → 17位候補
    return 33;                            // 削り戦のみ → 33位候補
  }

  // 確定済み試合での結果による順位判定
  if (lastMatch.winner_team_id === teamId) {
    // 勝ち進んでいる場合
    if (maxMatchNum === 36) return 1;     // 決勝戦勝利 → 1位
    if (maxMatchNum === 35) return 3;     // 3位決定戦勝利 → 3位
    
    // その他の勝利は次ラウンド進出のため仮順位
    if (maxMatchNum >= 33) return 3;      // 準決勝勝利 → 決勝or3位決定戦進出
    if (maxMatchNum >= 29) return 5;      // 準々決勝勝利 → 準決勝進出
    if (maxMatchNum >= 21) return 9;      // ベスト16勝利 → 準々決勝進出
    if (maxMatchNum >= 5) return 17;      // ベスト32勝利 → 上位ラウンド進出
    return 33;                            // 削り戦勝利 → ベスト32進出
  }

  // 敗退している場合の順位判定（36チーム構成対応）
  if (maxMatchNum === 36) return 2;                          // 決勝戦敗者 → 2位
  if (maxMatchNum === 35) return 4;                          // 3位決定戦敗者 → 4位
  if (maxMatchNum >= 33 && maxMatchNum <= 34) {
    // 準決勝敗者 → 3位決定戦進出済みなので、この段階での敗退はない
    // （3位決定戦の結果は上記で処理済み）
    return 5; // 念のため5位
  }
  if (maxMatchNum >= 29 && maxMatchNum <= 32) return 5;      // 準々決勝敗者 → 5位（4チーム）
  if (maxMatchNum >= 21 && maxMatchNum <= 28) return 9;      // ベスト16敗者 → 9位（8チーム）
  if (maxMatchNum >= 5 && maxMatchNum <= 20) return 17;      // ベスト32敗者 → 17位（16チーム）
  if (maxMatchNum >= 1 && maxMatchNum <= 4) return 33;       // 削り戦敗者 → 33位（4チーム）

  return 33; // デフォルト（最下位グループ）
}

/**
 * テンプレートベースの順位計算を実行する
 */
async function calculateTemplateBasedRankings(tournamentId: number): Promise<TeamStanding[]> {
  try {
    console.log(`[TEMPLATE_RANKINGS] テンプレートベース順位計算開始: Tournament ${tournamentId}`);
    
    // 決勝トーナメントブロックを取得
    const finalBlockResult = await db.execute({
      sql: `
        SELECT match_block_id, team_rankings
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'final'
        LIMIT 1
      `,
      args: [tournamentId]
    });

    if (finalBlockResult.rows.length === 0) {
      console.log(`[TEMPLATE_RANKINGS] 決勝トーナメントブロックが見つかりません`);
      return [];
    }

    const finalBlockId = finalBlockResult.rows[0].match_block_id as number;
    const existingRankings = finalBlockResult.rows[0].team_rankings as string | null;
    
    // 既存の順位設定があるかチェック
    if (existingRankings) {
      try {
        const rankings = JSON.parse(existingRankings);
        if (rankings.length > 0) {
          console.log(`[TEMPLATE_RANKINGS] 既存の順位設定を使用: ${rankings.length}チーム`);
          return rankings;
        }
      } catch {
        console.log(`[TEMPLATE_RANKINGS] 既存順位データのパースに失敗、新規計算を実行`);
      }
    }
    
    // 確定済みの決勝トーナメント試合を取得
    const finalMatchesResult = await db.execute({
      sql: `
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          mf.winner_team_id,
          mf.is_draw,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
          AND ml.team1_id IS NOT NULL
          AND ml.team2_id IS NOT NULL
          AND mf.match_id IS NOT NULL
        ORDER BY ml.match_code
      `,
      args: [finalBlockId]
    });

    console.log(`[TEMPLATE_RANKINGS] 確定済み決勝トーナメント試合: ${finalMatchesResult.rows.length}試合`);

    if (finalMatchesResult.rows.length === 0) {
      console.log(`[TEMPLATE_RANKINGS] 確定済み試合がないため、テンプレートベース計算をスキップ`);
      return [];
    }

    // 各確定済み試合でテンプレートベース順位設定を実行
    for (const match of finalMatchesResult.rows) {
      const matchId = match.match_id as number;
      const winnerId = match.winner_team_id as string | null;
      const loserId = match.team1_id === winnerId ? match.team2_id as string : match.team1_id as string;
      
      console.log(`[TEMPLATE_RANKINGS] 試合 ${match.match_code}: 勝者=${winnerId}, 敗者=${loserId}`);
      
      try {
        await handleTemplateBasedPositions(matchId, winnerId, loserId, tournamentId);
      } catch (templateError) {
        console.error(`[TEMPLATE_RANKINGS] テンプレート処理エラー (試合${matchId}):`, templateError);
        // エラーでも他の試合の処理は継続
      }
    }

    // 更新後の順位データを取得
    const updatedResult = await db.execute({
      sql: `SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?`,
      args: [finalBlockId]
    });
    
    if (updatedResult.rows[0]?.team_rankings) {
      try {
        const rankings = JSON.parse(updatedResult.rows[0].team_rankings as string);
        console.log(`[TEMPLATE_RANKINGS] テンプレートベース順位計算完了: ${rankings.length}チーム`);
        return rankings;
      } catch (error) {
        console.error(`[TEMPLATE_RANKINGS] 更新後順位データのパースに失敗:`, error);
      }
    }

    console.log(`[TEMPLATE_RANKINGS] テンプレートベース順位データなし`);
    return [];
    
  } catch (error) {
    console.error(`[TEMPLATE_RANKINGS] テンプレートベース順位計算エラー:`, error);
    return [];
  }
}