// scripts/test-promotion-api.js
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.DATABASE_URL || "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: process.env.DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

// 進出処理関数をここに実装（tournament-promotion.tsから抜粋）
async function testPromotionLogic() {
  const tournamentId = 9;
  
  console.log(`=== Testing Promotion Logic for Tournament ${tournamentId} ===`);
  
  try {
    // 1. フォーマットIDを取得
    const formatResult = await db.execute({
      sql: `SELECT format_id FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });
    
    if (formatResult.rows.length === 0) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }
    
    const formatId = formatResult.rows[0].format_id;
    console.log('Format ID:', formatId);
    
    // 2. 決勝トーナメントのテンプレートから必要な進出条件を取得
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
    const requiredPromotions = new Set();
    templateResult.rows.forEach(row => {
      const team1Source = row.team1_source;
      const team2Source = row.team2_source;
      
      if (team1Source && team1Source.match(/^[A-L]_[1-4]$/)) {
        requiredPromotions.add(team1Source);
      }
      if (team2Source && team2Source.match(/^[A-L]_[1-4]$/)) {
        requiredPromotions.add(team2Source);
      }
    });
    
    console.log('Required Promotions:', Array.from(requiredPromotions).sort());
    
    // 3. 各ブロックの順位表を取得
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

    console.log('\\n=== Block Analysis ===');
    const promotions = {};
    
    for (const block of blocks.rows) {
      if (block.team_rankings) {
        try {
          const rankings = JSON.parse(block.team_rankings);
          const sortedRankings = rankings.sort((a, b) => a.position - b.position);
          
          console.log(`${block.block_name}ブロック:`);
          
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
                console.log(`  ${position}位確定: ${teamsAtPosition[0].team_name} (${promotionKey})`);
              } else if (teamsAtPosition.length > 1) {
                // 同着の場合は手動決定待ち
                console.log(`  ${position}位同着（${teamsAtPosition.length}チーム）: 手動決定待ち`);
                teamsAtPosition.forEach(team => {
                  console.log(`    同着${position}位: ${team.team_name}`);
                });
              } else {
                console.log(`  ${position}位: チームなし`);
              }
            }
          }
        } catch (parseError) {
          console.error(`Block ${block.block_name} rankings parse error:`, parseError);
        }
      }
    }

    console.log('\\n=== Promotion Results ===');
    console.log('Total promotions found:', Object.keys(promotions).length);
    
    Object.entries(promotions).forEach(([key, team]) => {
      console.log(`${key}: ${team.team_name} (${team.team_id})`);
    });
    
    return promotions;
    
  } catch (error) {
    console.error('Test promotion logic error:', error);
    throw error;
  }
}

testPromotionLogic().catch(console.error);