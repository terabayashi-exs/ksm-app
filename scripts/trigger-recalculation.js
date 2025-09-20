// Trigger standings recalculation for tournament 43
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function triggerRecalculation() {
  try {
    console.log('=== 順位再計算の実行 ===\n');
    
    // 大会43の各ブロックを取得
    const blocksResult = await client.execute(`
      SELECT match_block_id, block_name 
      FROM t_match_blocks 
      WHERE tournament_id = 43 AND phase = 'preliminary'
      ORDER BY block_name
    `);
    
    console.log('対象ブロック:');
    blocksResult.rows.forEach(block => {
      console.log(`  ${block.block_name}ブロック (ID: ${block.match_block_id})`);
    });
    
    // 各ブロックの順位を再計算
    for (const block of blocksResult.rows) {
      console.log(`\n${block.block_name}ブロックの順位再計算中...`);
      
      try {
        // API経由で再計算実行
        const response = await fetch('http://localhost:3000/api/tournaments/43/update-rankings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            blockId: block.match_block_id
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log(`  ✅ ${block.block_name}ブロック再計算成功`);
          
          // 更新後の順位を確認
          const updatedRankings = await client.execute(`
            SELECT team_rankings FROM t_match_blocks 
            WHERE match_block_id = ?
          `, [block.match_block_id]);
          
          if (updatedRankings.rows.length > 0 && updatedRankings.rows[0].team_rankings) {
            const rankings = JSON.parse(updatedRankings.rows[0].team_rankings);
            console.log(`    順位:${rankings.map(t => `${t.position}位 ${t.team_name}(${t.points}pt, ${t.goal_difference}差, ${t.goals_for}得点)`).join(', ')}`);
          }
        } else {
          console.error(`  ❌ ${block.block_name}ブロック再計算失敗:`, response.status);
          const errorText = await response.text();
          console.error(`     エラー詳細:`, errorText);
        }
      } catch (apiError) {
        console.error(`  ❌ ${block.block_name}ブロック API エラー:`, apiError.message);
      }
    }
    
    console.log('\n=== 再計算完了 ===');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    client.close();
  }
}

triggerRecalculation();