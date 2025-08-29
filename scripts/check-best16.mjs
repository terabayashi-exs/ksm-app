import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * ベスト16チーム（Round3敗者）の詳細確認
 */
async function checkBest16() {
  try {
    console.log('🔍 進出修正後のRound3状況確認...');
    
    // Round3試合の詳細確認（進出修正後）
    const result = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_name,
          ml.team1_id, ml.team2_id,
          mf.winner_team_id,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
          AND ml.match_code IN ('M25', 'M26', 'M27', 'M28')
        ORDER BY ml.match_code
      `
    });
    
    console.log('進出修正後のRound3試合詳細 (M25-M28):');
    console.log('═══════════════════════════════════════════════');
    
    const losers = [];
    
    result.rows.forEach(row => {
      const loser = row.winner_team_id === row.team1_id ? 
        { id: row.team2_id, name: row.team2_name } : 
        { id: row.team1_id, name: row.team1_name };
      const winner = row.winner_team_id === row.team1_id ? 
        { id: row.team1_id, name: row.team1_name } : 
        { id: row.team2_id, name: row.team2_name };
        
      console.log(`${row.match_code}: ${row.team1_name} vs ${row.team2_name}`);
      console.log(`  勝者: ${winner.name} (${winner.id})`);
      console.log(`  敗者: ${loser.name} (${loser.id}) ← ベスト16候補`);
      console.log(`  確定: ${row.is_confirmed ? 'Yes' : 'No'}`);
      console.log('');
      
      if (row.is_confirmed && row.winner_team_id) {
        losers.push(loser);
      }
    });
    
    console.log('\n🔍 ベスト16チーム（Round3敗者）:');
    console.log('═══════════════════════════════════════════════');
    const uniqueLosers = [];
    const seenIds = new Set();
    
    losers.forEach(loser => {
      if (!seenIds.has(loser.id)) {
        seenIds.add(loser.id);
        uniqueLosers.push(loser);
      } else {
        console.log(`⚠️  重複検出: ${loser.name} (${loser.id})`);
      }
    });
    
    uniqueLosers.forEach((loser, index) => {
      console.log(`  ${index + 1}. ${loser.name} (${loser.id})`);
    });
    
    console.log(`\n📊 ベスト16チーム数: ${uniqueLosers.length} (期待値: 4)`);
    
    if (uniqueLosers.length !== 4) {
      console.log('\n❌ 異常: ベスト16チーム数が4でありません');
      console.log('原因調査のため、すべてのRound3試合を詳細確認...\n');
      
      // 全Round3試合の追加調査
      result.rows.forEach(row => {
        console.log(`詳細分析 - ${row.match_code}:`);
        console.log(`  Team1: ${row.team1_name} (${row.team1_id})`);
        console.log(`  Team2: ${row.team2_name} (${row.team2_id})`);
        console.log(`  Winner: ${row.winner_team_id}`);
        console.log(`  Confirmed: ${row.is_confirmed}`);
        
        if (row.winner_team_id) {
          const loser = row.winner_team_id === row.team1_id ? row.team2_id : row.team1_id;
          console.log(`  → Loser: ${loser}`);
        }
        console.log('');
      });
      
    } else {
      console.log('\n✅ 正常: ベスト16チーム数が正しいです');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
checkBest16();