// lib/tournament-promotion.ts
import { db } from '@/lib/db';

export interface BlockRanking {
  team_id: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
}

/**
 * ブロック順位確定後に決勝トーナメントに上位チームを進出させる
 * 部分進出に対応：全ブロック完了を待たずに確定したブロックから即座に進出
 */
export async function promoteTeamsToFinalTournament(tournamentId: number): Promise<void> {
  try {
    console.log(`[PROMOTION] 決勝トーナメント進出処理開始: Tournament ${tournamentId}`);
    
    // 各ブロックの順位表を取得（順位が確定したもののみ）
    const blockRankings = await getAllBlockRankings(tournamentId);
    
    if (blockRankings.length === 0) {
      console.log(`[PROMOTION] 順位表が見つかりません`);
      return;
    }
    
    // 確定したブロックから上位チームを取得（部分進出対応）
    const promotions = extractTopTeamsPartial(blockRankings);
    console.log(`[PROMOTION] 進出チーム（部分進出対応）:`, JSON.stringify(promotions, null, 2));
    
    // 決勝トーナメント試合を更新
    await updateFinalTournamentMatches(tournamentId, promotions);
    
    console.log(`[PROMOTION] 決勝トーナメント進出処理完了`);
    
  } catch (error) {
    console.error(`[PROMOTION] 決勝トーナメント進出処理エラー:`, error);
    throw new Error('決勝トーナメント進出処理に失敗しました');
  }
}

/**
 * 全ブロックの順位表を取得
 */
async function getAllBlockRankings(tournamentId: number): Promise<{
  block_name: string;
  rankings: BlockRanking[];
}[]> {
  try {
    const blocks = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          block_name,
          team_rankings
        FROM t_match_blocks 
        WHERE tournament_id = ? 
        AND phase = 'preliminary'
        AND team_rankings IS NOT NULL
        ORDER BY block_name
      `,
      args: [tournamentId]
    });

    const blockRankings: { block_name: string; rankings: BlockRanking[]; }[] = [];

    for (const block of blocks.rows) {
      if (block.team_rankings) {
        try {
          const rankings = JSON.parse(block.team_rankings as string) as BlockRanking[];
          blockRankings.push({
            block_name: block.block_name as string,
            rankings: rankings
          });
        } catch (parseError) {
          console.error(`[PROMOTION] ブロック ${block.block_name} の順位表パースエラー:`, parseError);
        }
      }
    }

    return blockRankings;
  } catch (error) {
    console.error(`[PROMOTION] ブロック順位表取得エラー:`, error);
    throw error;
  }
}

/**
 * 各ブロックの上位2チームを抽出
 */
function extractTopTeams(blockRankings: { block_name: string; rankings: BlockRanking[]; }[]): {
  [key: string]: { team_id: string; team_name: string; };
} {
  const promotions: { [key: string]: { team_id: string; team_name: string; }; } = {};

  blockRankings.forEach(block => {
    const sortedRankings = block.rankings.sort((a, b) => a.position - b.position);
    
    if (sortedRankings.length >= 1) {
      promotions[`${block.block_name}_1`] = {
        team_id: sortedRankings[0].team_id,
        team_name: sortedRankings[0].team_name
      };
    }
    
    if (sortedRankings.length >= 2) {
      promotions[`${block.block_name}_2`] = {
        team_id: sortedRankings[1].team_id,
        team_name: sortedRankings[1].team_name
      };
    }
  });

  return promotions;
}

/**
 * 部分進出対応：確定したブロックのみから上位チームを抽出
 * 1位が確定したブロックは即座に進出、2位が同着の場合は待機
 */
function extractTopTeamsPartial(blockRankings: { block_name: string; rankings: BlockRanking[]; }[]): {
  [key: string]: { team_id: string; team_name: string; };
} {
  const promotions: { [key: string]: { team_id: string; team_name: string; }; } = {};

  blockRankings.forEach(block => {
    const sortedRankings = block.rankings.sort((a, b) => a.position - b.position);
    
    // 1位チームの進出（常に可能）
    if (sortedRankings.length >= 1) {
      promotions[`${block.block_name}_1`] = {
        team_id: sortedRankings[0].team_id,
        team_name: sortedRankings[0].team_name
      };
      console.log(`[PROMOTION] ${block.block_name}ブロック1位確定: ${sortedRankings[0].team_name}`);
    }
    
    // 2位チームの進出（同着がないかチェック）
    if (sortedRankings.length >= 2) {
      const secondPlace = sortedRankings.filter(team => team.position === 2);
      
      if (secondPlace.length === 1) {
        // 2位が単独の場合は進出確定
        promotions[`${block.block_name}_2`] = {
          team_id: secondPlace[0].team_id,
          team_name: secondPlace[0].team_name
        };
        console.log(`[PROMOTION] ${block.block_name}ブロック2位確定: ${secondPlace[0].team_name}`);
      } else if (secondPlace.length > 1) {
        // 2位が同着の場合は手動決定待ち
        console.log(`[PROMOTION] ${block.block_name}ブロック2位同着（${secondPlace.length}チーム）: 手動決定待ち`);
        secondPlace.forEach(team => {
          console.log(`[PROMOTION]   同着2位: ${team.team_name}`);
        });
      }
    }
  });

  return promotions;
}

/**
 * 決勝トーナメント試合のチーム情報を更新
 */
async function updateFinalTournamentMatches(
  tournamentId: number, 
  promotions: { [key: string]: { team_id: string; team_name: string; }; }
): Promise<void> {
  try {
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
      console.log(`[PROMOTION] 決勝トーナメントブロックが見つかりません`);
      return;
    }

    const finalBlockId = finalBlockResult.rows[0].match_block_id as number;
    
    // 決勝トーナメント試合を取得
    const matchesResult = await db.execute({
      sql: `
        SELECT match_id, match_code, team1_id, team2_id, team1_display_name, team2_display_name
        FROM t_matches_live
        WHERE match_block_id = ?
        ORDER BY match_code
      `,
      args: [finalBlockId]
    });

    console.log(`[PROMOTION] 決勝トーナメント試合: ${matchesResult.rows.length}件`);

    // 各試合のチーム情報を更新
    for (const match of matchesResult.rows) {
      const matchId = match.match_id as number;
      const matchCode = match.match_code as string;
      const team1Id = match.team1_id as string;
      const team2Id = match.team2_id as string;
      
      let newTeam1Id = team1Id;
      let newTeam2Id = team2Id;
      let newTeam1Name = match.team1_display_name as string;
      let newTeam2Name = match.team2_display_name as string;
      
      // チーム1の更新
      if (promotions[team1Id]) {
        newTeam1Id = promotions[team1Id].team_id;
        newTeam1Name = promotions[team1Id].team_name;
      }
      
      // チーム2の更新
      if (promotions[team2Id]) {
        newTeam2Id = promotions[team2Id].team_id;
        newTeam2Name = promotions[team2Id].team_name;
      }
      
      // 更新が必要かチェック
      if (newTeam1Id !== team1Id || newTeam2Id !== team2Id) {
        await db.execute({
          sql: `
            UPDATE t_matches_live 
            SET team1_id = ?, team2_id = ?, team1_display_name = ?, team2_display_name = ?
            WHERE match_id = ?
          `,
          args: [newTeam1Id, newTeam2Id, newTeam1Name, newTeam2Name, matchId]
        });
        
        console.log(`[PROMOTION] ${matchCode} 更新: ${team1Id} vs ${team2Id} → ${newTeam1Id} vs ${newTeam2Id}`);
      }
    }
    
  } catch (error) {
    console.error(`[PROMOTION] 決勝トーナメント試合更新エラー:`, error);
    throw error;
  }
}

/**
 * 特定ブロックの順位確定後に進出処理を実行（自動トリガー用）
 */
export async function checkAndPromoteBlockWinners(
  tournamentId: number, 
  completedBlockId: number
): Promise<void> {
  try {
    console.log(`[PROMOTION] ブロック ${completedBlockId} 完了後の進出チェック`);
    
    // 全予選ブロックの順位が確定しているかチェック
    const blocksResult = await db.execute({
      sql: `
        SELECT 
          COUNT(*) as total_blocks,
          COUNT(CASE WHEN team_rankings IS NOT NULL THEN 1 END) as completed_blocks
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'preliminary'
      `,
      args: [tournamentId]
    });
    
    const totalBlocks = blocksResult.rows[0]?.total_blocks as number || 0;
    const completedBlocks = blocksResult.rows[0]?.completed_blocks as number || 0;
    
    console.log(`[PROMOTION] 予選ブロック進捗: ${completedBlocks}/${totalBlocks}`);
    
    if (completedBlocks === totalBlocks && totalBlocks > 0) {
      console.log(`[PROMOTION] 全予選ブロック完了、決勝トーナメント進出処理開始`);
      await promoteTeamsToFinalTournament(tournamentId);
    } else {
      console.log(`[PROMOTION] まだ未完了のブロックがあります`);
    }
    
  } catch (error) {
    console.error(`[PROMOTION] ブロック進出チェックエラー:`, error);
    // エラーでも処理は続行
  }
}