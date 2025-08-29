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
    
    // 確定したブロックから上位チームを取得（動的進出対応）
    const promotions = await extractTopTeamsDynamic(tournamentId, blockRankings);
    console.log(`[PROMOTION] 進出チーム（動的進出対応）:`, JSON.stringify(promotions, null, 2));
    
    // 決勝トーナメント試合を更新
    await updateFinalTournamentMatches(tournamentId, promotions);
    
    console.log(`[PROMOTION] 決勝トーナメント進出処理完了`);
    
  } catch (error) {
    console.error(`[PROMOTION] 決勝トーナメント進出処理エラー:`, error);
    throw new Error('決勝トーナメント進出処理に失敗しました');
  }
}

/**
 * 全ブロックの順位表を取得（完了ブロックのみ）
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
        // ブロック完了チェック
        const isBlockCompleted = await checkBlockCompletion(block.match_block_id as number);
        
        if (isBlockCompleted) {
          try {
            const rankings = JSON.parse(block.team_rankings as string) as BlockRanking[];
            blockRankings.push({
              block_name: block.block_name as string,
              rankings: rankings
            });
            console.log(`[PROMOTION] ${block.block_name}ブロック: 完了済み、進出処理対象`);
          } catch (parseError) {
            console.error(`[PROMOTION] ブロック ${block.block_name} の順位表パースエラー:`, parseError);
          }
        } else {
          console.log(`[PROMOTION] ${block.block_name}ブロック: 未完了のため進出処理対象外`);
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
 * ブロックの全試合が完了しているかチェック（中止試合も含む）
 */
async function checkBlockCompletion(matchBlockId: number): Promise<boolean> {
  try {
    const result = await db.execute({
      sql: `
        SELECT 
          COUNT(*) as total_matches,
          COUNT(CASE WHEN mf.match_id IS NOT NULL OR ml.match_status = 'cancelled' THEN 1 END) as completed_matches
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
    
    return totalMatches > 0 && totalMatches === completedMatches;
  } catch (error) {
    console.error(`ブロック完了チェックエラー:`, error);
    return false;
  }
}

/**
 * 各ブロックの上位2チームを抽出（未使用）
 */
// function extractTopTeams(blockRankings: { block_name: string; rankings: BlockRanking[]; }[]): {
//   [key: string]: { team_id: string; team_name: string; };
// } {
//   const promotions: { [key: string]: { team_id: string; team_name: string; }; } = {};
//   blockRankings.forEach(block => {
//     const sortedRankings = block.rankings.sort((a, b) => a.position - b.position);
//     if (sortedRankings.length >= 1) {
//       promotions[`${block.block_name}_1`] = {
//         team_id: sortedRankings[0].team_id,
//         team_name: sortedRankings[0].team_name
//       };
//     }
//     if (sortedRankings.length >= 2) {
//       promotions[`${block.block_name}_2`] = {
//         team_id: sortedRankings[1].team_id,
//         team_name: sortedRankings[1].team_name
//       };
//     }
//   });
//   return promotions;
// }

/**
 * テンプレートベースで必要な進出チームを動的に抽出
 */
async function extractTopTeamsDynamic(
  tournamentId: number,
  blockRankings: { block_name: string; rankings: BlockRanking[]; }[]
): Promise<{ [key: string]: { team_id: string; team_name: string; }; }> {
  const promotions: { [key: string]: { team_id: string; team_name: string; }; } = {};

  try {
    // 大会のフォーマットIDを取得
    const formatResult = await db.execute({
      sql: `SELECT format_id FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });
    
    if (formatResult.rows.length === 0) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }
    
    const formatId = formatResult.rows[0].format_id as number;
    
    // 決勝トーナメントのテンプレートから必要な進出条件を取得
    const templateResult = await db.execute({
      sql: `
        SELECT DISTINCT team1_source, team2_source
        FROM m_match_templates
        WHERE format_id = ? AND phase = 'final'
        AND (team1_source LIKE '%_1' OR team1_source LIKE '%_2' OR team1_source LIKE '%_3' OR team1_source LIKE '%_4'
             OR team2_source LIKE '%_1' OR team2_source LIKE '%_2' OR team2_source LIKE '%_3' OR team2_source LIKE '%_4')
      `,
      args: [formatId]
    });
    
    // 必要な進出パターンを抽出
    const requiredPromotions = new Set<string>();
    templateResult.rows.forEach(row => {
      const team1Source = row.team1_source as string;
      const team2Source = row.team2_source as string;
      
      if (team1Source && team1Source.match(/^[ABCD]_[1-4]$/)) {
        requiredPromotions.add(team1Source);
      }
      if (team2Source && team2Source.match(/^[ABCD]_[1-4]$/)) {
        requiredPromotions.add(team2Source);
      }
    });
    
    console.log(`[PROMOTION] 必要な進出条件:`, Array.from(requiredPromotions));
    
    // 各ブロックから必要な順位のチームを抽出
    blockRankings.forEach(block => {
      const sortedRankings = block.rankings.sort((a, b) => a.position - b.position);
      
      // 1位～4位まで確認
      for (let position = 1; position <= 4; position++) {
        const promotionKey = `${block.block_name}_${position}`;
        
        if (requiredPromotions.has(promotionKey)) {
          const teamsAtPosition = sortedRankings.filter(team => team.position === position);
          
          if (teamsAtPosition.length === 1) {
            // 単独順位の場合は進出確定
            promotions[promotionKey] = {
              team_id: teamsAtPosition[0].team_id,
              team_name: teamsAtPosition[0].team_name
            };
            console.log(`[PROMOTION] ${block.block_name}ブロック${position}位確定: ${teamsAtPosition[0].team_name}`);
          } else if (teamsAtPosition.length > 1) {
            // 同着の場合は手動決定待ち
            console.log(`[PROMOTION] ${block.block_name}ブロック${position}位同着（${teamsAtPosition.length}チーム）: 手動決定待ち`);
            teamsAtPosition.forEach(team => {
              console.log(`[PROMOTION]   同着${position}位: ${team.team_name}`);
            });
          } else {
            console.log(`[PROMOTION] ${block.block_name}ブロック${position}位: チームなし`);
          }
        }
      }
    });

    return promotions;
    
  } catch (error) {
    console.error(`[PROMOTION] 動的進出チーム抽出エラー:`, error);
    // フォールバック: 従来の上位2チーム方式
    return extractTopTeamsPartial(blockRankings);
  }
}

/**
 * 部分進出対応：確定したブロックのみから上位チームを抽出（フォールバック用）
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
      const currentTeam1Id = match.team1_id as string | null;
      const currentTeam2Id = match.team2_id as string | null;
      const currentTeam1Name = match.team1_display_name as string;
      const currentTeam2Name = match.team2_display_name as string;
      
      let newTeam1Id = currentTeam1Id;
      let newTeam2Id = currentTeam2Id;
      let newTeam1Name = currentTeam1Name;
      let newTeam2Name = currentTeam2Name;
      let hasUpdate = false;
      
      console.log(`[PROMOTION] ${matchCode} 現在の対戦: "${currentTeam1Name}" vs "${currentTeam2Name}"`);
      console.log(`[PROMOTION] 利用可能な進出チーム:`, Object.keys(promotions));
      
      // チーム1の更新
      const team1Match = findMatchingPromotion(currentTeam1Name, promotions);
      if (team1Match) {
        newTeam1Id = team1Match.team_id;
        newTeam1Name = team1Match.team_name;
        hasUpdate = true;
        console.log(`[PROMOTION] ${matchCode} team1 更新: "${currentTeam1Name}" → "${team1Match.team_name}"`);
      }
      
      // チーム2の更新
      const team2Match = findMatchingPromotion(currentTeam2Name, promotions);
      if (team2Match) {
        newTeam2Id = team2Match.team_id;
        newTeam2Name = team2Match.team_name;
        hasUpdate = true;
        console.log(`[PROMOTION] ${matchCode} team2 更新: "${currentTeam2Name}" → "${team2Match.team_name}"`);
      }
      
      // 更新が必要な場合のみ実行
      if (hasUpdate) {
        await db.execute({
          sql: `
            UPDATE t_matches_live 
            SET team1_id = ?, team2_id = ?, team1_display_name = ?, team2_display_name = ?, updated_at = datetime('now', '+9 hours')
            WHERE match_id = ?
          `,
          args: [newTeam1Id, newTeam2Id, newTeam1Name, newTeam2Name, matchId]
        });
        
        console.log(`[PROMOTION] ✅ ${matchCode} 更新完了: [${currentTeam1Name} vs ${currentTeam2Name}] → [${newTeam1Name} vs ${newTeam2Name}]`);
      } else {
        console.log(`[PROMOTION] ${matchCode}: 更新対象なし (${currentTeam1Name} vs ${currentTeam2Name})`);
      }
    }
    
  } catch (error) {
    console.error(`[PROMOTION] 決勝トーナメント試合更新エラー:`, error);
    throw error;
  }
}

/**
 * プレースホルダーテキストから対応する進出チームを検索
 */
function findMatchingPromotion(
  displayName: string, 
  promotions: { [key: string]: { team_id: string; team_name: string; }; }
): { team_id: string; team_name: string; } | null {
  // パターン1: "A1位", "B2位", "C3位", "D4位" などの形式（1-4位対応）
  const blockPositionMatch = displayName.match(/([ABCD])([1-4])位/);
  if (blockPositionMatch) {
    const block = blockPositionMatch[1];
    const position = blockPositionMatch[2];
    const key = `${block}_${position}`;
    if (promotions[key]) {
      console.log(`[PROMOTION] パターンマッチ成功: "${displayName}" → "${key}" → "${promotions[key].team_name}"`);
      return promotions[key];
    }
  }

  // パターン2: "A組1位", "B組2位", "C組3位", "D組4位" などの形式（1-4位対応）
  const blockGroupMatch = displayName.match(/([ABCD])組([1-4])位/);
  if (blockGroupMatch) {
    const block = blockGroupMatch[1];
    const position = blockGroupMatch[2];
    const key = `${block}_${position}`;
    if (promotions[key]) {
      console.log(`[PROMOTION] パターンマッチ成功: "${displayName}" → "${key}" → "${promotions[key].team_name}"`);
      return promotions[key];
    }
  }

  // パターン3: "K2位 vs A2位" のような形式での個別マッチング
  // "K2位", "A2位", "B3位", "C4位" などの個別パターン
  for (const [promotionKey, teamInfo] of Object.entries(promotions)) {
    // promotionKeyは "A_1", "B_2", "C_3", "D_4" の形式
    const [block, position] = promotionKey.split('_');
    const blockPositionPattern = `${block}${position}位`;
    
    if (displayName.includes(blockPositionPattern)) {
      console.log(`[PROMOTION] 個別パターンマッチ成功: "${displayName}" → "${blockPositionPattern}" → "${teamInfo.team_name}"`);
      return teamInfo;
    }
  }

  // パターン4: 完全一致
  for (const [promotionKey, teamInfo] of Object.entries(promotions)) {
    if (displayName === promotionKey || displayName.includes(promotionKey)) {
      console.log(`[PROMOTION] 完全マッチ成功: "${displayName}" → "${promotionKey}" → "${teamInfo.team_name}"`);
      return teamInfo;
    }
  }

  console.log(`[PROMOTION] マッチ失敗: "${displayName}" に対応する進出チームが見つかりません`);
  return null;
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