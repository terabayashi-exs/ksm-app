// lib/tournament-promotion.ts
import { db } from '@/lib/db';

export interface BlockRanking {
  tournament_team_id?: number; // 複数エントリーチーム対応
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
export async function promoteTeamsToFinalTournament(tournamentId: number, targetBlockId?: number): Promise<void> {
  try {
    if (targetBlockId) {
      console.log(`[PROMOTION] 決勝トーナメント進出処理開始: Tournament ${tournamentId}, Target Block ${targetBlockId}`);
    } else {
      console.log(`[PROMOTION] 決勝トーナメント進出処理開始: Tournament ${tournamentId} (全ブロック)`);
    }

    // 【重要】複数エントリーチーム対応: targetBlockIdに関わらず、常に全ブロックの進出情報を収集
    // これにより、1回の処理で全試合のtournament_team_idが正しく設定される
    const blockRankings = await getAllBlockRankings(tournamentId, undefined);

    if (blockRankings.length === 0) {
      console.log(`[PROMOTION] 順位表が見つかりません`);
      return;
    }

    // 確定したブロックから上位チームを取得（動的進出対応）
    const promotions = await extractTopTeamsDynamic(tournamentId, blockRankings);
    console.log(`[PROMOTION] 進出チーム数: ${Object.keys(promotions).length}件`);
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
 * @param targetBlockId 指定された場合、そのブロックのみを取得
 */
async function getAllBlockRankings(tournamentId: number, targetBlockId?: number): Promise<{
  block_name: string;
  rankings: BlockRanking[];
}[]> {
  try {
    // 特定のブロックのみを取得する場合
    const sql = targetBlockId
      ? `
        SELECT
          match_block_id,
          block_name,
          team_rankings
        FROM t_match_blocks
        WHERE tournament_id = ?
        AND match_block_id = ?
        AND phase = 'preliminary'
        AND team_rankings IS NOT NULL
        ORDER BY block_name
      `
      : `
        SELECT
          match_block_id,
          block_name,
          team_rankings
        FROM t_match_blocks
        WHERE tournament_id = ?
        AND phase = 'preliminary'
        AND team_rankings IS NOT NULL
        ORDER BY block_name
      `;

    const args = targetBlockId ? [tournamentId, targetBlockId] : [tournamentId];

    const blocks = await db.execute({
      sql,
      args
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
        AND ml.team1_tournament_team_id IS NOT NULL
        AND ml.team2_tournament_team_id IS NOT NULL
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
 * データベースの順位表（team_rankings）から正確に順位を取得する
 */
async function extractTopTeamsDynamic(
  tournamentId: number,
  blockRankings: { block_name: string; rankings: BlockRanking[]; }[]
): Promise<{ [key: string]: { tournament_team_id?: number; team_id: string; team_name: string; }; }> {
  const promotions: { [key: string]: { tournament_team_id?: number; team_id: string; team_name: string; }; } = {};

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
    
    // 決勝トーナメントのテンプレートから必要な進出条件を取得（オーバーライド適用）
    const templateResult = await db.execute({
      sql: `
        SELECT DISTINCT
          COALESCE(mo.team1_source_override, mt.team1_source) as team1_source,
          COALESCE(mo.team2_source_override, mt.team2_source) as team2_source
        FROM m_match_templates mt
        LEFT JOIN t_tournament_match_overrides mo
          ON mt.match_code = mo.match_code AND mo.tournament_id = ?
        WHERE mt.format_id = ? AND mt.phase = 'final'
      `,
      args: [tournamentId, formatId]
    });
    
    // 必要な進出パターンを抽出（ブロック_順位形式のみ、試合の勝敗は除外）
    const requiredPromotions = new Set<string>();
    templateResult.rows.forEach(row => {
      const team1Source = row.team1_source as string;
      const team2Source = row.team2_source as string;
      
      // ブロック名_順位の形式のみを抽出（予選ブロック進出条件のみ）
      // パターン: 単一文字ブロック名_数字順位 (例: A_1, B_2, F_3, L_4)
      if (team1Source && team1Source.match(/^[A-Z]_\d+$/)) {
        requiredPromotions.add(team1Source);
      }
      if (team2Source && team2Source.match(/^[A-Z]_\d+$/)) {
        requiredPromotions.add(team2Source);
      }
    });
    
    console.log(`[PROMOTION] 必要な進出条件:`, Array.from(requiredPromotions));
    
    // 各ブロックから必要な順位のチームを抽出（データベース順位表ベース）
    blockRankings.forEach(block => {
      console.log(`[PROMOTION] ${block.block_name}ブロック順位表処理開始`);
      
      // データベースに保存されている順位表をそのまま使用（手動調整済みの順位を尊重）
      const rankings = block.rankings;
      
      console.log(`[PROMOTION] ${block.block_name}ブロック順位表:`, rankings.map(r => `${r.position}位: ${r.team_name}(${r.team_id})`));
      
      // このブロックに必要な順位を動的に取得
      const blockPromotions = Array.from(requiredPromotions).filter(key => key.startsWith(`${block.block_name}_`));
      
      blockPromotions.forEach(promotionKey => {
        const [, positionStr] = promotionKey.split('_'); 
        const position = parseInt(positionStr);
        
        if (!isNaN(position)) {
          // データベースから該当順位のチームを直接取得（手動調整済み順位を使用）
          const teamsAtPosition = rankings.filter(team => team.position === position);
          
          if (teamsAtPosition.length === 1) {
            // 単独順位の場合は進出確定
            const selectedTeam = teamsAtPosition[0];
            promotions[promotionKey] = {
              tournament_team_id: selectedTeam.tournament_team_id,
              team_id: selectedTeam.team_id,
              team_name: selectedTeam.team_name || selectedTeam.team_omission || selectedTeam.team_id
            };
            console.log(`[PROMOTION] ${block.block_name}ブロック${position}位確定: ${selectedTeam.team_name}(tournament_team_id: ${selectedTeam.tournament_team_id}, team_id: ${selectedTeam.team_id})`);
          } else if (teamsAtPosition.length > 1) {
            // 複数チームが同じ順位の場合（通常は手動調整で解決されているはず）
            console.log(`[PROMOTION] ${block.block_name}ブロック${position}位に複数チーム（${teamsAtPosition.length}チーム）`);
            teamsAtPosition.forEach((team, index) => {
              console.log(`[PROMOTION]   ${position}位-${index+1}: ${team.team_name}(tournament_team_id: ${team.tournament_team_id}, team_id: ${team.team_id})`);
            });

            // 最初のチームを選択（手動調整されていれば通常1チームのはず）
            if (teamsAtPosition.length > 0) {
              const selectedTeam = teamsAtPosition[0];
              promotions[promotionKey] = {
                tournament_team_id: selectedTeam.tournament_team_id,
                team_id: selectedTeam.team_id,
                team_name: selectedTeam.team_name || selectedTeam.team_omission || selectedTeam.team_id
              };
              console.log(`[PROMOTION] ${block.block_name}ブロック${position}位: 複数チーム中から先頭チーム選択: ${selectedTeam.team_name}(tournament_team_id: ${selectedTeam.tournament_team_id}, team_id: ${selectedTeam.team_id})`);
            }
          } else {
            console.log(`[PROMOTION] ${block.block_name}ブロック${position}位: チームなし`);
          }
        }
      });
    });

    // 試合の勝者・敗者もpromotionsに追加（決勝トーナメント内での進出条件対応）
    try {
      const matchWinnersResult = await db.execute({
        sql: `
          SELECT
            mf.match_code,
            mf.winner_tournament_team_id,
            mf.team1_tournament_team_id,
            mf.team2_tournament_team_id,
            ml.team1_display_name,
            ml.team2_display_name,
            tt1.team_id as team1_team_id,
            tt2.team_id as team2_team_id
          FROM t_matches_final mf
          JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
          LEFT JOIN t_matches_live ml ON mf.match_id = ml.match_id
          LEFT JOIN t_tournament_teams tt1 ON mf.team1_tournament_team_id = tt1.tournament_team_id
          LEFT JOIN t_tournament_teams tt2 ON mf.team2_tournament_team_id = tt2.tournament_team_id
          WHERE mb.tournament_id = ?
            AND mb.phase = 'final'
            AND mf.winner_tournament_team_id IS NOT NULL
        `,
        args: [tournamentId]
      });

      matchWinnersResult.rows.forEach(row => {
        const matchCode = row.match_code as string;
        const winnerTournamentTeamId = row.winner_tournament_team_id as number;
        const team1TournamentTeamId = row.team1_tournament_team_id as number | null;
        const team2TournamentTeamId = row.team2_tournament_team_id as number | null;
        const team1DisplayName = row.team1_display_name as string;
        const team2DisplayName = row.team2_display_name as string;
        const team1TeamId = row.team1_team_id as string | null;
        const team2TeamId = row.team2_team_id as string | null;

        if (!team1TournamentTeamId || !team2TournamentTeamId) {
          console.warn(`[PROMOTION] ${matchCode}: tournament_team_id が見つかりません`);
          return;
        }

        // 勝者を追加
        const winnerKey = `${matchCode}_winner`;
        const isTeam1Winner = winnerTournamentTeamId === team1TournamentTeamId;
        const winnerName = isTeam1Winner ? team1DisplayName : team2DisplayName;
        const winnerTeamId = isTeam1Winner ? team1TeamId : team2TeamId;

        promotions[winnerKey] = {
          tournament_team_id: winnerTournamentTeamId,
          team_id: winnerTeamId || `unknown_${winnerTournamentTeamId}`,
          team_name: winnerName
        };
        console.log(`[PROMOTION] ${matchCode}の勝者: ${winnerName}(tournament_team_id:${winnerTournamentTeamId})`);

        // 敗者を追加
        const loserKey = `${matchCode}_loser`;
        const loserTournamentTeamId = isTeam1Winner ? team2TournamentTeamId : team1TournamentTeamId;
        const loserName = isTeam1Winner ? team2DisplayName : team1DisplayName;
        const loserTeamId = isTeam1Winner ? team2TeamId : team1TeamId;

        promotions[loserKey] = {
          tournament_team_id: loserTournamentTeamId,
          team_id: loserTeamId || `unknown_${loserTournamentTeamId}`,
          team_name: loserName
        };
        console.log(`[PROMOTION] ${matchCode}の敗者: ${loserName}(tournament_team_id:${loserTournamentTeamId})`);
      });
    } catch (matchError) {
      console.error(`[PROMOTION] 試合勝者・敗者取得エラー:`, matchError);
      // エラーが発生してもブロック進出条件のpromotionsは返す
    }

    console.log(`[PROMOTION] 進出チーム最終確定:`, Object.entries(promotions).map(([key, team]) => `${key}: ${team.team_name}(${team.team_id})`));
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
  [key: string]: { tournament_team_id?: number; team_id: string; team_name: string; };
} {
  const promotions: { [key: string]: { tournament_team_id?: number; team_id: string; team_name: string; }; } = {};

  blockRankings.forEach(block => {
    const sortedRankings = block.rankings.sort((a, b) => a.position - b.position);

    // 1位チームの進出（常に可能）
    if (sortedRankings.length >= 1) {
      promotions[`${block.block_name}_1`] = {
        tournament_team_id: sortedRankings[0].tournament_team_id,
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
          tournament_team_id: secondPlace[0].tournament_team_id,
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
 * 既に確定済みの試合も強制更新する（手動順位調整後の再進出処理に対応）
 * t_tournament_teamsのassigned_blockとblock_positionも更新する
 */
async function updateFinalTournamentMatches(
  tournamentId: number,
  promotions: { [key: string]: { tournament_team_id?: number; team_id: string; team_name: string; }; }
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

    console.log(`[PROMOTION] 決勝トーナメントブロック数: ${finalBlockResult.rows.length}`);

    // 全ての決勝トーナメントブロックから試合を取得（確定済み試合も含める）
    const matchesResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_tournament_team_id,
          ml.team2_tournament_team_id,
          ml.team1_display_name,
          ml.team2_display_name,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE mb.tournament_id = ? AND mb.phase = 'final'
        ORDER BY ml.match_code
      `,
      args: [tournamentId]
    });

    console.log(`[PROMOTION] 決勝トーナメント試合: ${matchesResult.rows.length}件`);

    // テンプレートから各試合の進出条件を取得（オーバーライド適用）
    const templateResult = await db.execute({
      sql: `
        SELECT
          mt.match_code,
          mt.round_name,
          COALESCE(mo.team1_source_override, mt.team1_source) as team1_source,
          COALESCE(mo.team2_source_override, mt.team2_source) as team2_source,
          mt.team1_display_name as template_team1_name,
          mt.team2_display_name as template_team2_name
        FROM m_match_templates mt
        JOIN t_tournaments t ON mt.format_id = t.format_id
        LEFT JOIN t_tournament_match_overrides mo
          ON mt.match_code = mo.match_code AND mo.tournament_id = ?
        WHERE t.tournament_id = ? AND mt.phase = 'final'
        ORDER BY mt.match_code
      `,
      args: [tournamentId, tournamentId]
    });

    // テンプレート情報をマップ化
    const templateMap = new Map();
    templateResult.rows.forEach(row => {
      templateMap.set(row.match_code as string, {
        round_name: row.round_name as string,
        team1_source: row.team1_source as string,
        team2_source: row.team2_source as string,
        template_team1_name: row.template_team1_name as string,
        template_team2_name: row.template_team2_name as string
      });
    });

    // チームソースとブロック・位置のマッピング（例: A_1 → {block: "1位リーグ", position: 1}）
    const teamBlockAssignments = new Map<string, { block_name: string; position: number }>();

    // テンプレートから各チームソースがどのブロック・位置に属するかを決定
    templateResult.rows.forEach(row => {
      const roundName = row.round_name as string;
      const team1Source = row.team1_source as string;
      const team2Source = row.team2_source as string;

      // A_1, B_1などのパターンからブロック位置を計算
      const assignTeamSource = (source: string) => {
        if (source && source.match(/^[A-Z]_\d+$/)) {
          const [block] = source.split('_');
          // A=1, B=2, C=3, D=4, E=5, F=6
          const blockPosition = block.charCodeAt(0) - 'A'.charCodeAt(0) + 1;

          if (!teamBlockAssignments.has(source)) {
            teamBlockAssignments.set(source, {
              block_name: roundName,
              position: blockPosition
            });
          }
        }
      };

      assignTeamSource(team1Source);
      assignTeamSource(team2Source);
    });

    console.log(`[PROMOTION] チームブロック割り当てマップ:`, Array.from(teamBlockAssignments.entries()).map(([source, info]) => `${source} → ${info.block_name} (位置${info.position})`));

    // 各試合のチーム情報を更新
    for (const match of matchesResult.rows) {
      const matchId = match.match_id as number;
      const matchCode = match.match_code as string;
      const currentTeam1TournamentTeamId = match.team1_tournament_team_id as number | null;
      const currentTeam2TournamentTeamId = match.team2_tournament_team_id as number | null;
      const currentTeam1Name = match.team1_display_name as string;
      const currentTeam2Name = match.team2_display_name as string;
      const isConfirmed = Boolean(match.is_confirmed);

      const template = templateMap.get(matchCode);
      if (!template) {
        console.log(`[PROMOTION] ${matchCode}: テンプレート情報が見つかりません`);
        continue;
      }

      let newTeam1TournamentTeamId: number | null = currentTeam1TournamentTeamId;
      let newTeam2TournamentTeamId: number | null = currentTeam2TournamentTeamId;
      let newTeam1Name = currentTeam1Name;
      let newTeam2Name = currentTeam2Name;
      let hasUpdate = false;

      console.log(`[PROMOTION] ${matchCode} 現在の対戦: "${currentTeam1Name}" vs "${currentTeam2Name}" ${isConfirmed ? '(確定済み)' : ''}`);
      console.log(`[PROMOTION] ${matchCode} テンプレート進出条件: "${template.team1_source}" vs "${template.team2_source}"`);

      // team1_sourceから進出チームを取得
      if (template.team1_source && promotions[template.team1_source]) {
        const newTeam1 = promotions[template.team1_source];
        const team1TournamentTeamIdChanged = newTeam1.tournament_team_id !== currentTeam1TournamentTeamId;
        const team1Changed = newTeam1.team_name !== currentTeam1Name || team1TournamentTeamIdChanged;

        if (team1Changed) {
          newTeam1TournamentTeamId = newTeam1.tournament_team_id || null;
          newTeam1Name = newTeam1.team_name;
          hasUpdate = true;
          console.log(`[PROMOTION] ${matchCode} team1 更新: "${currentTeam1Name}"(tournament_team_id:${currentTeam1TournamentTeamId}) → "${newTeam1.team_name}"(tournament_team_id:${newTeam1.tournament_team_id})`);
        }
      }

      // team2_sourceから進出チームを取得
      if (template.team2_source && promotions[template.team2_source]) {
        const newTeam2 = promotions[template.team2_source];
        const team2TournamentTeamIdChanged = newTeam2.tournament_team_id !== currentTeam2TournamentTeamId;
        const team2Changed = newTeam2.team_name !== currentTeam2Name || team2TournamentTeamIdChanged;

        if (team2Changed) {
          newTeam2TournamentTeamId = newTeam2.tournament_team_id || null;
          newTeam2Name = newTeam2.team_name;
          hasUpdate = true;
          console.log(`[PROMOTION] ${matchCode} team2 更新: "${currentTeam2Name}"(tournament_team_id:${currentTeam2TournamentTeamId}) → "${newTeam2.team_name}"(tournament_team_id:${newTeam2.tournament_team_id})`);
        }
      }

      // 更新が必要な場合は実行（確定済み試合も強制更新）
      if (hasUpdate) {
        if (isConfirmed) {
          console.log(`[PROMOTION] ⚠️ ${matchCode} 確定済み試合を強制更新します`);
        }

        await db.execute({
          sql: `
            UPDATE t_matches_live
            SET team1_tournament_team_id = ?,
                team2_tournament_team_id = ?,
                team1_display_name = ?,
                team2_display_name = ?,
                updated_at = datetime('now', '+9 hours')
            WHERE match_id = ?
          `,
          args: [newTeam1TournamentTeamId, newTeam2TournamentTeamId, newTeam1Name, newTeam2Name, matchId]
        });

        console.log(`[PROMOTION] ✅ ${matchCode} 更新完了: [${currentTeam1Name} vs ${currentTeam2Name}] → [${newTeam1Name} vs ${newTeam2Name}]`);
      } else {
        console.log(`[PROMOTION] ${matchCode}: 更新不要 (${currentTeam1Name} vs ${currentTeam2Name})`);
      }
    }

    // 注: 以前はassigned_blockを更新していましたが、
    // getParticipatingTeamsForBlock()が試合データから参加チームを取得するようになったため、
    // assigned_blockの更新は不要になりました（戦績表表示で予選ブロック名を維持）

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

/**
 * 決勝トーナメント試合の進出条件チェック結果
 */
export interface PromotionValidationIssue {
  match_code: string;
  match_id: number;
  position: 'team1' | 'team2';
  expected_source: string;  // 例: "C_3"
  expected_team_id: string | null;
  expected_tournament_team_id: number | null;  // 複数エントリーチーム対応
  expected_team_name: string | null;
  current_tournament_team_id: number | null;   // 複数エントリーチーム対応
  current_team_name: string | null;
  is_placeholder: boolean;  // プレースホルダー表記（"C3位"など）のまま
  severity: 'error' | 'warning';
  message: string;
}

export interface PromotionValidationResult {
  isValid: boolean;
  totalMatches: number;
  checkedMatches: number;
  issues: PromotionValidationIssue[];
  summary: {
    errorCount: number;
    warningCount: number;
    placeholderCount: number;
  };
}

/**
 * 決勝トーナメント試合の進出条件が正しく設定されているかチェック
 * 順位表再計算時に実行され、未設定や誤設定を検出する
 */
export async function validateFinalTournamentPromotions(tournamentId: number): Promise<PromotionValidationResult> {
  const issues: PromotionValidationIssue[] = [];

  try {
    console.log(`[PROMOTION_VALIDATION] 決勝トーナメント進出条件チェック開始: Tournament ${tournamentId}`);

    // 1. 大会のフォーマットIDを取得
    const formatResult = await db.execute({
      sql: `SELECT format_id FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });

    if (formatResult.rows.length === 0) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    const formatId = formatResult.rows[0].format_id as number;

    // 2. 予選ブロックの順位表から進出チーム情報を取得
    const blockRankings = await getAllBlockRankings(tournamentId);
    const promotions = await extractTopTeamsDynamic(tournamentId, blockRankings);

    console.log(`[PROMOTION_VALIDATION] 進出チーム情報取得完了: ${Object.keys(promotions).length}件`);

    // 3. 決勝トーナメント試合のテンプレートと実際のデータを取得（オーバーライド適用）
    const matchesResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_tournament_team_id,
          ml.team2_tournament_team_id,
          ml.team1_display_name,
          ml.team2_display_name,
          COALESCE(mo.team1_source_override, mt.team1_source) as team1_source,
          COALESCE(mo.team2_source_override, mt.team2_source) as team2_source,
          mt.team1_display_name as template_team1_display,
          mt.team2_display_name as template_team2_display,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_match_templates mt ON mt.match_code = ml.match_code AND mt.format_id = ? AND mt.phase = mb.phase
        LEFT JOIN t_tournament_match_overrides mo ON mt.match_code = mo.match_code AND mo.tournament_id = ?
        LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
        LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
        WHERE mb.tournament_id = ? AND mb.phase = 'final'
        ORDER BY ml.match_code
      `,
      args: [formatId, tournamentId, tournamentId]
    });

    console.log(`[PROMOTION_VALIDATION] 決勝トーナメント試合: ${matchesResult.rows.length}件`);

    // 4. 各試合の進出条件をチェック
    for (const match of matchesResult.rows) {
      const matchId = match.match_id as number;
      const matchCode = match.match_code as string;
      const team1TournamentTeamId = match.team1_tournament_team_id as number | null;
      const team2TournamentTeamId = match.team2_tournament_team_id as number | null;
      const team1DisplayName = match.team1_display_name as string;
      const team2DisplayName = match.team2_display_name as string;
      const team1Source = match.team1_source as string | null;
      const team2Source = match.team2_source as string | null;
      const templateTeam1Display = match.template_team1_display as string;
      const templateTeam2Display = match.template_team2_display as string;
      const isConfirmed = Boolean(match.is_confirmed);

      // team1のチェック（予選ブロック進出パターンのみ）
      if (team1Source && team1Source.match(/^[A-Z]_\d+$/)) {
        const expectedTeam = promotions[team1Source];

        if (expectedTeam) {
          const isMismatch = team1TournamentTeamId !== expectedTeam.tournament_team_id;

          if (isMismatch) {
            const isPlaceholder = team1DisplayName === templateTeam1Display;

            issues.push({
              match_code: matchCode,
              match_id: matchId,
              position: 'team1',
              expected_source: team1Source,
              expected_team_id: expectedTeam.team_id,
              expected_tournament_team_id: expectedTeam.tournament_team_id || null,
              expected_team_name: expectedTeam.team_name,
              current_tournament_team_id: team1TournamentTeamId,
              current_team_name: team1DisplayName,
              is_placeholder: isPlaceholder,
              severity: isConfirmed ? 'error' : 'warning',
              message: isPlaceholder
                ? `team1がプレースホルダー表記のまま: "${team1DisplayName}" → 正しくは "${expectedTeam.team_name}" (tt_id: ${expectedTeam.tournament_team_id})`
                : `team1が誤設定: "${team1DisplayName}" (tt_id: ${team1TournamentTeamId}) → 正しくは "${expectedTeam.team_name}" (tt_id: ${expectedTeam.tournament_team_id})`
            });

            console.log(`[PROMOTION_VALIDATION] ⚠️ ${matchCode} team1: "${team1DisplayName}" (tt_id: ${team1TournamentTeamId}) → 期待値 "${expectedTeam.team_name}" (tt_id: ${expectedTeam.tournament_team_id})`);
          }
        } else {
          // 進出チーム情報が見つからない（予選ブロック未完了の可能性）
          console.log(`[PROMOTION_VALIDATION] ${matchCode} team1: ${team1Source} の進出チーム情報なし（予選未完了の可能性）`);
        }
      }

      // team2のチェック（予選ブロック進出パターンのみ）
      if (team2Source && team2Source.match(/^[A-Z]_\d+$/)) {
        const expectedTeam = promotions[team2Source];

        if (expectedTeam) {
          const isMismatch = team2TournamentTeamId !== expectedTeam.tournament_team_id;

          if (isMismatch) {
            const isPlaceholder = team2DisplayName === templateTeam2Display;

            issues.push({
              match_code: matchCode,
              match_id: matchId,
              position: 'team2',
              expected_source: team2Source,
              expected_team_id: expectedTeam.team_id,
              expected_tournament_team_id: expectedTeam.tournament_team_id || null,
              expected_team_name: expectedTeam.team_name,
              current_tournament_team_id: team2TournamentTeamId,
              current_team_name: team2DisplayName,
              is_placeholder: isPlaceholder,
              severity: isConfirmed ? 'error' : 'warning',
              message: isPlaceholder
                ? `team2がプレースホルダー表記のまま: "${team2DisplayName}" → 正しくは "${expectedTeam.team_name}" (tt_id: ${expectedTeam.tournament_team_id})`
                : `team2が誤設定: "${team2DisplayName}" (tt_id: ${team2TournamentTeamId}) → 正しくは "${expectedTeam.team_name}" (tt_id: ${expectedTeam.tournament_team_id})`
            });

            console.log(`[PROMOTION_VALIDATION] ⚠️ ${matchCode} team2: "${team2DisplayName}" (tt_id: ${team2TournamentTeamId}) → 期待値 "${expectedTeam.team_name}" (tt_id: ${expectedTeam.tournament_team_id})`);
          }
        } else {
          // 進出チーム情報が見つからない（予選ブロック未完了の可能性）
          console.log(`[PROMOTION_VALIDATION] ${matchCode} team2: ${team2Source} の進出チーム情報なし（予選未完了の可能性）`);
        }
      }
    }

    // 5. チェック結果のサマリー
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const placeholderCount = issues.filter(i => i.is_placeholder).length;

    const result: PromotionValidationResult = {
      isValid: issues.length === 0,
      totalMatches: matchesResult.rows.length,
      checkedMatches: matchesResult.rows.length,
      issues,
      summary: {
        errorCount,
        warningCount,
        placeholderCount
      }
    };

    console.log(`[PROMOTION_VALIDATION] チェック完了: ${result.isValid ? '✅ 正常' : '⚠️ 問題あり'}`);
    console.log(`[PROMOTION_VALIDATION] エラー: ${errorCount}件、警告: ${warningCount}件、プレースホルダー残存: ${placeholderCount}件`);

    return result;

  } catch (error) {
    console.error(`[PROMOTION_VALIDATION] チェック処理エラー:`, error);
    return {
      isValid: false,
      totalMatches: 0,
      checkedMatches: 0,
      issues,
      summary: {
        errorCount: 0,
        warningCount: 0,
        placeholderCount: 0
      }
    };
  }
}

/**
 * 進出条件チェックで検出された問題を自動修正
 */
export async function autoFixPromotionIssues(_tournamentId: number, issues: PromotionValidationIssue[]): Promise<{
  fixedCount: number;
  failedCount: number;
  errors: string[];
}> {
  let fixedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  try {
    console.log(`[PROMOTION_AUTO_FIX] 自動修正開始: ${issues.length}件の問題`);

    for (const issue of issues) {
      try {
        const field = issue.position === 'team1' ? 'team1' : 'team2';

        await db.execute({
          sql: `
            UPDATE t_matches_live
            SET ${field}_tournament_team_id = ?,
                ${field}_display_name = ?,
                updated_at = datetime('now', '+9 hours')
            WHERE match_id = ?
          `,
          args: [
            issue.expected_tournament_team_id,
            issue.expected_team_name,
            issue.match_id
          ]
        });

        console.log(`[PROMOTION_AUTO_FIX] ✅ ${issue.match_code} ${field}: "${issue.current_team_name}" (tt_id: ${issue.current_tournament_team_id}) → "${issue.expected_team_name}" (tt_id: ${issue.expected_tournament_team_id})`);
        fixedCount++;

      } catch (error) {
        const errorMsg = `${issue.match_code} ${issue.position}の修正失敗: ${error}`;
        console.error(`[PROMOTION_AUTO_FIX] ❌ ${errorMsg}`);
        errors.push(errorMsg);
        failedCount++;
      }
    }

    console.log(`[PROMOTION_AUTO_FIX] 修正完了: 成功 ${fixedCount}件、失敗 ${failedCount}件`);

    return { fixedCount, failedCount, errors };

  } catch (error) {
    console.error(`[PROMOTION_AUTO_FIX] 自動修正処理エラー:`, error);
    return { fixedCount, failedCount, errors: [...errors, String(error)] };
  }
}

/**
 * オーバーライド設定が影響するブロックの試合が全て確定しているかチェックし、
 * 確定している場合は自動的に決勝進出処理を実行
 * @param tournamentId 大会ID
 * @param overrideMatchCodes 影響を受ける試合コード一覧
 */
export async function checkAndPromoteOnOverrideChange(tournamentId: number, overrideMatchCodes: string[]): Promise<void> {
  try {
    console.log(`[OVERRIDE_AUTO_PROMOTE] オーバーライド変更後の自動進出チェック開始: Tournament ${tournamentId}`);
    console.log(`[OVERRIDE_AUTO_PROMOTE] 影響を受ける試合コード: ${overrideMatchCodes.join(', ')}`);

    // 影響を受ける試合が属するブロックを特定
    const affectedBlocksResult = await db.execute({
      sql: `
        SELECT DISTINCT mb.match_block_id, mb.block_name
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND ml.match_code IN (${overrideMatchCodes.map(() => '?').join(',')})
      `,
      args: [tournamentId, ...overrideMatchCodes]
    });

    if (affectedBlocksResult.rows.length === 0) {
      console.log(`[OVERRIDE_AUTO_PROMOTE] 影響を受けるブロックが見つかりませんでした`);
      return;
    }

    const affectedBlocks = affectedBlocksResult.rows.map(row => ({
      match_block_id: Number(row.match_block_id),
      block_name: String(row.block_name)
    }));

    console.log(`[OVERRIDE_AUTO_PROMOTE] 影響を受けるブロック: ${affectedBlocks.map(b => b.block_name).join(', ')}`);

    // 各ブロックの進出元を特定（予選ブロックのパターン: A_1, A_2, B_1, B_2...）
    const sourceBlockPattern = /^([A-Z])_\d+$/;
    const sourceBlocks = new Set<string>();

    for (const matchCode of overrideMatchCodes) {
      // このmatch_codeの元の進出条件を取得
      const sourceResult = await db.execute({
        sql: `
          SELECT
            COALESCE(mo.team1_source_override, mt.team1_source) as team1_source,
            COALESCE(mo.team2_source_override, mt.team2_source) as team2_source
          FROM m_match_templates mt
          INNER JOIN t_tournaments t ON t.format_id = mt.format_id
          LEFT JOIN t_tournament_match_overrides mo ON mt.match_code = mo.match_code AND mo.tournament_id = t.tournament_id
          WHERE t.tournament_id = ? AND mt.match_code = ?
        `,
        args: [tournamentId, matchCode]
      });

      if (sourceResult.rows.length > 0) {
        const team1Source = sourceResult.rows[0].team1_source;
        const team2Source = sourceResult.rows[0].team2_source;

        // パターンマッチでブロック名を抽出（例: A_1 → A, B_2 → B）
        if (team1Source) {
          const match1 = String(team1Source).match(sourceBlockPattern);
          if (match1) sourceBlocks.add(match1[1]);
        }
        if (team2Source) {
          const match2 = String(team2Source).match(sourceBlockPattern);
          if (match2) sourceBlocks.add(match2[1]);
        }
      }
    }

    console.log(`[OVERRIDE_AUTO_PROMOTE] 進出元予選ブロック: ${Array.from(sourceBlocks).join(', ')}`);

    // 各進出元ブロックの試合が全て確定しているかチェック
    for (const blockName of sourceBlocks) {
      const blockResult = await db.execute({
        sql: `
          SELECT match_block_id, block_name
          FROM t_match_blocks
          WHERE tournament_id = ? AND phase = 'preliminary' AND block_name = ?
        `,
        args: [tournamentId, blockName]
      });

      if (blockResult.rows.length === 0) {
        console.log(`[OVERRIDE_AUTO_PROMOTE] ブロック ${blockName} が見つかりませんでした`);
        continue;
      }

      const blockId = Number(blockResult.rows[0].match_block_id);

      // ブロック内の試合確定状況をチェック
      const matchStatusResult = await db.execute({
        sql: `
          SELECT
            COUNT(*) as total_matches,
            COUNT(CASE WHEN ml.result_status = 'confirmed' OR ml.match_status = 'cancelled' THEN 1 END) as completed_matches
          FROM t_matches_live ml
          WHERE ml.match_block_id = ?
        `,
        args: [blockId]
      });

      const totalMatches = Number(matchStatusResult.rows[0].total_matches);
      const completedMatches = Number(matchStatusResult.rows[0].completed_matches);

      console.log(`[OVERRIDE_AUTO_PROMOTE] ブロック ${blockName} (ID: ${blockId}): ${completedMatches}/${totalMatches} 試合完了`);

      if (completedMatches === totalMatches && totalMatches > 0) {
        // 全試合が確定または中止されている場合、自動的に進出処理を実行
        console.log(`[OVERRIDE_AUTO_PROMOTE] ブロック ${blockName} の全試合が完了しているため、進出処理を実行します`);
        await promoteTeamsToFinalTournament(tournamentId, blockId);
      } else {
        console.log(`[OVERRIDE_AUTO_PROMOTE] ブロック ${blockName} はまだ完了していないため、進出処理はスキップします`);
      }
    }

    console.log(`[OVERRIDE_AUTO_PROMOTE] 自動進出チェック完了`);

  } catch (error) {
    console.error(`[OVERRIDE_AUTO_PROMOTE] 自動進出チェックエラー:`, error);
    // エラーが発生してもオーバーライド設定は成功扱いとする（進出処理は後で手動実行可能）
  }
}

/**
 * 試合確定時にオーバーライド設定を考慮した自動進出チェックを行う
 * @param tournamentId 大会ID
 * @param matchBlockId 確定された試合のブロックID
 * @param _matchCodeOrBlockName 試合コードまたはブロック名（将来の拡張用）
 */
export async function checkAndPromoteOnMatchConfirm(
  tournamentId: number,
  matchBlockId: number,
  _matchCodeOrBlockName: string
): Promise<void> {
  try {
    console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] 試合確定後の自動進出チェック開始: Tournament ${tournamentId}, Block ${matchBlockId}`);

    // ブロックのフェーズを確認（予選ブロックのみ処理）
    const blockInfoResult = await db.execute({
      sql: `
        SELECT phase, block_name
        FROM t_match_blocks
        WHERE match_block_id = ?
      `,
      args: [matchBlockId]
    });

    if (blockInfoResult.rows.length === 0) {
      console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] ブロックが見つかりませんでした`);
      return;
    }

    const phase = String(blockInfoResult.rows[0].phase);
    const blockName = String(blockInfoResult.rows[0].block_name);

    if (phase === 'final') {
      // 決勝トーナメントの場合は、この試合の勝者を使って次の試合を更新
      console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] 決勝トーナメントの試合確定、次の試合への進出処理を実行します`);
      await promoteTeamsToFinalTournament(tournamentId);
      return;
    }

    if (phase !== 'preliminary') {
      console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] 予選でも決勝でもないため、自動進出チェックをスキップします`);
      return;
    }

    // ブロック内の試合確定状況をチェック
    const matchStatusResult = await db.execute({
      sql: `
        SELECT
          COUNT(*) as total_matches,
          COUNT(CASE WHEN ml.result_status = 'confirmed' OR ml.match_status = 'cancelled' THEN 1 END) as completed_matches
        FROM t_matches_live ml
        WHERE ml.match_block_id = ?
      `,
      args: [matchBlockId]
    });

    const totalMatches = Number(matchStatusResult.rows[0].total_matches);
    const completedMatches = Number(matchStatusResult.rows[0].completed_matches);

    console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] ブロック ${blockName}: ${completedMatches}/${totalMatches} 試合完了`);

    if (completedMatches === totalMatches && totalMatches > 0) {
      // 全試合が確定または中止されている場合
      console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] ブロック ${blockName} の全試合が完了しました`);

      // このブロックを進出元とする決勝トーナメント試合にオーバーライドがあるかチェック
      const overrideCheckResult = await db.execute({
        sql: `
          SELECT COUNT(*) as override_count
          FROM t_tournament_match_overrides mo
          INNER JOIN m_match_templates mt ON mt.match_code = mo.match_code
          INNER JOIN t_tournaments t ON t.tournament_id = mo.tournament_id AND t.format_id = mt.format_id
          WHERE mo.tournament_id = ?
            AND mt.phase = 'final'
            AND (
              COALESCE(mo.team1_source_override, mt.team1_source) LIKE ? OR
              COALESCE(mo.team2_source_override, mt.team2_source) LIKE ?
            )
        `,
        args: [tournamentId, `${blockName}_%`, `${blockName}_%`]
      });

      const overrideCount = Number(overrideCheckResult.rows[0]?.override_count || 0);

      if (overrideCount > 0) {
        console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] ブロック ${blockName} を進出元とする決勝試合に ${overrideCount} 件のオーバーライドが設定されています`);
        console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] オーバーライド設定を考慮した進出処理を実行します`);
      } else {
        console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] ブロック ${blockName} にオーバーライドは設定されていません（通常の進出処理を実行）`);
      }

      // 進出処理を実行（オーバーライドは内部で自動的に考慮される）
      await promoteTeamsToFinalTournament(tournamentId, matchBlockId);
      console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] ブロック ${blockName} の進出処理が完了しました`);
    } else {
      console.log(`[MATCH_CONFIRM_AUTO_PROMOTE] ブロック ${blockName} はまだ完了していません（${totalMatches - completedMatches} 試合残り）`);
    }

  } catch (error) {
    console.error(`[MATCH_CONFIRM_AUTO_PROMOTE] 試合確定後の自動進出チェックエラー:`, error);
    // エラーが発生しても試合確定処理は成功扱いとする
  }
}