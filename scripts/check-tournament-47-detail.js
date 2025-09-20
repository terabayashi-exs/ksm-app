const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkCurrentState() {
  try {
    console.log('=== 現在の大会47の状態詳細調査 ===');
    
    // 大会47の全体状況を確認
    const tournament = await client.execute(`
      SELECT tournament_name, status FROM t_tournaments WHERE tournament_id = 47
    `);
    console.log('大会47:', tournament.rows[0]);
    
    // 各ブロックの試合状態を確認
    const allMatches = await client.execute(`
      SELECT 
        mb.block_name,
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.team1_scores,
        ml.team2_scores,
        ml.winner_team_id,
        ms.match_status,
        CASE WHEN mf.match_id IS NOT NULL THEN 'confirmed' ELSE 'not_confirmed' END as confirmed_status
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE mb.tournament_id = 47
      ORDER BY mb.block_name, ml.match_number
    `);
    
    // ブロック別に分類
    const blocks = {};
    allMatches.rows.forEach(match => {
      if (!blocks[match.block_name]) blocks[match.block_name] = [];
      blocks[match.block_name].push(match);
    });
    
    Object.keys(blocks).forEach(blockName => {
      console.log(`\n【${blockName}ブロック】`);
      blocks[blockName].forEach(match => {
        console.log(`  ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
        console.log(`    Status: ${match.match_status || 'NULL'}, Confirmed: ${match.confirmed_status}`);
        console.log(`    Scores: ${match.team1_scores} - ${match.team2_scores}, Winner: ${match.winner_team_id || 'NULL'}`);
      });
    });
    
    // UIで表示される予選ブロックの状況確認
    console.log('\n=== UIでの表示用 ===');
    console.log('各ブロックの試合確定数：');
    Object.keys(blocks).forEach(blockName => {
      if (blockName !== 'final') {
        const confirmedCount = blocks[blockName].filter(m => m.confirmed_status === 'confirmed').length;
        const totalCount = blocks[blockName].length;
        console.log(`  ${blockName}: ${confirmedCount}/${totalCount} 確定済み`);
      }
    });
    
  } catch (error) {
    console.error('調査エラー:', error);
  } finally {
    client.close();
  }
}

checkCurrentState();