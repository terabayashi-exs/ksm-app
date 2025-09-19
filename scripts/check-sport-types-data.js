// 競技種別マスタデータの確認スクリプト
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkSportTypesData() {
  console.log('🔍 競技種別マスタデータ確認...\n');
  
  try {
    // 1. 競技種別マスタの確認
    console.log('📋 登録された競技種別:');
    const sportTypes = await db.execute('SELECT * FROM m_sport_types ORDER BY sport_type_id');
    
    for (const sport of sportTypes.rows) {
      console.log(`\n[${sport.sport_name} (${sport.sport_code})]`);
      console.log(`  ID: ${sport.sport_type_id}`);
      console.log(`  最大ピリオド数: ${sport.max_period_count}`);
      console.log(`  通常ピリオド数: ${sport.regular_period_count}`);
      console.log(`  スコアタイプ: ${sport.score_type}`);
      console.log(`  デフォルト試合時間: ${sport.default_match_duration}分`);
      console.log(`  スコア単位: ${sport.score_unit}`);
      
      // ピリオド定義の詳細
      const periodDefs = JSON.parse(sport.period_definitions);
      console.log('  ピリオド定義:');
      periodDefs.forEach(p => {
        console.log(`    - ${p.period_name} (ID: ${p.period_id}, タイプ: ${p.type}${p.duration ? `, ${p.duration}分` : ''})`);
      });
    }
    
    // 2. 既存データの競技種別設定確認
    console.log('\n\n📊 既存データの競技種別設定状況:');
    
    const formats = await db.execute(`
      SELECT f.format_id, f.format_name, f.sport_type_id, s.sport_name 
      FROM m_tournament_formats f
      LEFT JOIN m_sport_types s ON f.sport_type_id = s.sport_type_id
      LIMIT 5
    `);
    
    console.log('\n[大会フォーマット]');
    if (formats.rows.length > 0) {
      formats.rows.forEach(f => {
        console.log(`  ${f.format_name}: ${f.sport_name || '未設定'} (sport_type_id: ${f.sport_type_id || 'NULL'})`);
      });
    } else {
      console.log('  フォーマットデータなし');
    }
    
    const tournaments = await db.execute(`
      SELECT t.tournament_id, t.tournament_name, t.sport_type_id, s.sport_name 
      FROM t_tournaments t
      LEFT JOIN m_sport_types s ON t.sport_type_id = s.sport_type_id
      LIMIT 5
    `);
    
    console.log('\n[大会]');
    if (tournaments.rows.length > 0) {
      tournaments.rows.forEach(t => {
        console.log(`  ${t.tournament_name}: ${t.sport_name || '未設定'} (sport_type_id: ${t.sport_type_id || 'NULL'})`);
      });
    } else {
      console.log('  大会データなし');
    }
    
    // 3. 大会ルール設定テーブルの確認
    console.log('\n\n📝 大会ルール設定テーブル:');
    const rules = await db.execute('SELECT COUNT(*) as count FROM t_tournament_rules');
    console.log(`  登録件数: ${rules.rows[0].count}件`);
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

checkSportTypesData()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 エラー:', error);
    process.exit(1);
  });