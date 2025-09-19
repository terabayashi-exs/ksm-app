// scripts/check-tournament-stats.js
// TOP画面の統計情報をデバッグ

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkTournamentStats() {
  try {
    console.log('🔍 TOP画面の統計情報をチェックします...\n');
    
    // 1. 全大会の状態を確認
    console.log('📋 全大会の状態:');
    const allResult = await client.execute(
      'SELECT tournament_id, tournament_name, status, visibility, public_start_date FROM t_tournaments ORDER BY tournament_id DESC'
    );
    console.table(allResult.rows);
    
    // 2. 公開設定でフィルタリング後
    console.log('\n📋 公開大会（visibility = "open" AND public_start_date <= date("now")):');
    const publicResult = await client.execute(`
      SELECT tournament_id, tournament_name, status, visibility, public_start_date
      FROM t_tournaments 
      WHERE visibility = 'open' AND public_start_date <= date('now')
    `);
    console.table(publicResult.rows);
    console.log(`公開大会数: ${publicResult.rows.length}`);
    
    // 3. 進行中試合があるかチェック
    console.log('\n🎯 大会29の進行中試合:');
    const matchesResult = await client.execute(`
      SELECT ml.match_id, ml.match_code, ml.match_status, ml.current_period
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 29 AND ml.match_status = 'ongoing'
    `);
    console.table(matchesResult.rows);
    
    // 4. 現在の日付と比較
    const today = new Date().toISOString().split('T')[0];
    console.log(`\n📅 今日の日付: ${today}`);
    
    console.log('\n❓ 問題の分析:');
    if (publicResult.rows.length === 0) {
      console.log('- 公開大会が0件のため、統計が計算されない');
      console.log('- 大会29のvisibilityまたはpublic_start_dateを確認');
    } else {
      console.log('- 公開大会はあるが、ステータス計算に問題がある可能性');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await client.close();
  }
}

checkTournamentStats();