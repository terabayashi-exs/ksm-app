import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * 大会9の手動進出処理を実行
 */
async function manualProgressionTournament9() {
  try {
    console.log('🚀 大会9の手動進出処理を開始...');
    
    // 1. 各ブロックの順位表を取得
    console.log('\n1️⃣ 各ブロックの順位表を取得:');
    const blocks = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          block_name,
          team_rankings
        FROM t_match_blocks 
        WHERE tournament_id = 9 
        AND phase = 'preliminary'
        AND team_rankings IS NOT NULL
        ORDER BY block_name
      `,
    });

    const promotions = {};
    
    for (const block of blocks.rows) {
      if (block.team_rankings) {
        try {
          const rankings = JSON.parse(block.team_rankings);
          const sortedRankings = rankings.sort((a, b) => a.position - b.position);
          
          console.log(`   ${block.block_name}ブロック:`);
          
          // 1位〜4位まで取得（このフォーマットでは1-4位が必要）
          for (let position = 1; position <= 4; position++) {
            const teamsAtPosition = sortedRankings.filter(team => team.position === position);
            
            if (teamsAtPosition.length === 1) {
              const team = teamsAtPosition[0];
              promotions[`${block.block_name}_${position}`] = {
                team_id: team.team_id,
                team_name: team.team_name
              };
              console.log(`     ${position}位: ${team.team_name} (${team.team_id})`);
            } else if (teamsAtPosition.length > 1) {
              console.log(`     ${position}位: 同着${teamsAtPosition.length}チーム - 手動決定必要`);
              teamsAtPosition.forEach(team => {
                console.log(`       - ${team.team_name} (${team.team_id})`);
              });
            }
          }
        } catch (parseError) {
          console.error(`   ❌ ブロック ${block.block_name} の順位表パースエラー:`, parseError);
        }
      }
    }
    
    console.log('\n2️⃣ 進出チーム一覧:');
    Object.entries(promotions).forEach(([key, team]) => {
      console.log(`   ${key}: ${team.team_name} (${team.team_id})`);
    });
    
    // 2. 決勝トーナメント試合を取得して更新
    console.log('\n3️⃣ 決勝トーナメント試合の更新:');
    const finalMatches = await db.execute({
      sql: `
        SELECT ml.match_id, ml.match_code, ml.team1_display_name, ml.team2_display_name, ml.team1_id, ml.team2_id
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
        ORDER BY ml.match_code
      `,
    });
    
    console.log(`   決勝トーナメント試合: ${finalMatches.rows.length}件`);
    
    for (const match of finalMatches.rows) {
      const matchId = match.match_id;
      const matchCode = match.match_code;
      const currentTeam1Name = match.team1_display_name;
      const currentTeam2Name = match.team2_display_name;
      const currentTeam1Id = match.team1_id;
      const currentTeam2Id = match.team2_id;
      
      let newTeam1Id = currentTeam1Id;
      let newTeam2Id = currentTeam2Id;
      let newTeam1Name = currentTeam1Name;
      let newTeam2Name = currentTeam2Name;
      let hasUpdate = false;
      
      console.log(`   ${matchCode}: "${currentTeam1Name}" vs "${currentTeam2Name}"`);
      
      // チーム1の更新をチェック
      const team1Match = findMatchingPromotion(currentTeam1Name, promotions);
      if (team1Match) {
        newTeam1Id = team1Match.team_id;
        newTeam1Name = team1Match.team_name;
        hasUpdate = true;
        console.log(`     team1更新: "${currentTeam1Name}" → "${team1Match.team_name}"`);
      }
      
      // チーム2の更新をチェック
      const team2Match = findMatchingPromotion(currentTeam2Name, promotions);
      if (team2Match) {
        newTeam2Id = team2Match.team_id;
        newTeam2Name = team2Match.team_name;
        hasUpdate = true;
        console.log(`     team2更新: "${currentTeam2Name}" → "${team2Match.team_name}"`);
      }
      
      // 更新を実行
      if (hasUpdate) {
        await db.execute({
          sql: `
            UPDATE t_matches_live 
            SET team1_id = ?, team2_id = ?, team1_display_name = ?, team2_display_name = ?, updated_at = datetime('now', '+9 hours')
            WHERE match_id = ?
          `,
          args: [newTeam1Id, newTeam2Id, newTeam1Name, newTeam2Name, matchId]
        });
        
        console.log(`     ✅ 更新完了: [${newTeam1Name} vs ${newTeam2Name}]`);
      } else {
        console.log(`     ⏭️ 更新不要`);
      }
    }
    
    console.log('\n✅ 大会9の手動進出処理完了');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

/**
 * プレースホルダーテキストから対応する進出チームを検索
 */
function findMatchingPromotion(displayName, promotions) {
  // パターン1: "A1位", "B2位", "C3位", "D4位" などの形式（1-4位対応）
  const blockPositionMatch = displayName.match(/([A-L])([1-4])位/);
  if (blockPositionMatch) {
    const block = blockPositionMatch[1];
    const position = blockPositionMatch[2];
    const key = `${block}_${position}`;
    if (promotions[key]) {
      return promotions[key];
    }
  }

  // パターン2: "A組1位", "B組2位" などの形式
  const blockGroupMatch = displayName.match(/([A-L])組([1-4])位/);
  if (blockGroupMatch) {
    const block = blockGroupMatch[1];
    const position = blockGroupMatch[2];
    const key = `${block}_${position}`;
    if (promotions[key]) {
      return promotions[key];
    }
  }

  // パターン3: 個別マッチング
  for (const [promotionKey, teamInfo] of Object.entries(promotions)) {
    const [block, position] = promotionKey.split('_');
    const blockPositionPattern = `${block}${position}位`;
    
    if (displayName.includes(blockPositionPattern)) {
      return teamInfo;
    }
  }

  return null;
}

// 実行
manualProgressionTournament9();