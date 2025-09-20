// 大会43の順位計算をデバッグするスクリプト
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function debugStandings() {
  try {
    console.log('=== 大会43 順位計算デバッグ ===\n');
    
    // Cブロックの試合データを詳細確認
    const matches = await client.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        mf.team1_scores,
        mf.team2_scores,
        mf.winner_team_id,
        mf.is_draw,
        mf.is_walkover,
        t1.team_name as team1_name,
        t2.team_name as team2_name
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
      LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 43 AND mb.block_name = 'C'
      ORDER BY ml.match_code
    `);
    
    console.log('📊 Cブロック試合データ:');
    matches.rows.forEach(match => {
      console.log(`試合 ${match.match_code}: ${match.team1_name} vs ${match.team2_name}`);
      console.log(`  team1_scores: ${match.team1_scores} (type: ${typeof match.team1_scores})`);
      console.log(`  team2_scores: ${match.team2_scores} (type: ${typeof match.team2_scores})`);
      console.log(`  winner: ${match.winner_team_id || 'なし'}, draw: ${match.is_draw ? 'はい' : 'いいえ'}`);
      console.log('');
    });
    
    // parseScore関数のテスト
    function parseScore(score) {
      if (score === null || score === undefined) {
        return 0;
      }
      
      if (typeof score === 'number') {
        return isNaN(score) ? 0 : score;
      }
      
      if (typeof score === 'bigint') {
        return Number(score);
      }
      
      if (typeof score === 'string') {
        if (score.trim() === '') {
          return 0;
        }
        
        if (score.includes(',')) {
          const total = score.split(',').reduce((sum, s) => sum + (parseInt(s.trim()) || 0), 0);
          return isNaN(total) ? 0 : total;
        }
        
        const parsed = parseInt(score.trim());
        return isNaN(parsed) ? 0 : parsed;
      }
      
      return 0;
    }
    
    console.log('🧪 parseScore関数テスト:');
    matches.rows.forEach(match => {
      const team1Goals = parseScore(match.team1_scores);
      const team2Goals = parseScore(match.team2_scores);
      console.log(`試合 ${match.match_code}:`);
      console.log(`  ${match.team1_scores} → ${team1Goals}`);
      console.log(`  ${match.team2_scores} → ${team2Goals}`);
    });
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    client.close();
  }
}

debugStandings();