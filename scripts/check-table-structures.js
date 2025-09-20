// テーブル構造を調査するスクリプト
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkTableStructures() {
  try {
    console.log('=== テーブル構造調査 ===\n');
    
    // 1. t_tournamentsテーブル構造
    const tournamentsSchema = await client.execute(`PRAGMA table_info(t_tournaments);`);
    console.log('📋 t_tournaments テーブル構造:');
    tournamentsSchema.rows.forEach(column => {
      console.log(`  ${column.name}: ${column.type}`);
    });
    
    // 2. m_tournament_formatsテーブル構造
    const formatsSchema = await client.execute(`PRAGMA table_info(m_tournament_formats);`);
    console.log('\n📊 m_tournament_formats テーブル構造:');
    formatsSchema.rows.forEach(column => {
      console.log(`  ${column.name}: ${column.type}`);
    });
    
    // 3. t_tournament_rulesテーブル構造（あるかチェック）
    try {
      const rulesSchema = await client.execute(`PRAGMA table_info(t_tournament_rules);`);
      console.log('\n⚙️ t_tournament_rules テーブル構造:');
      rulesSchema.rows.forEach(column => {
        console.log(`  ${column.name}: ${column.type}`);
      });
    } catch (e) {
      console.log('\n⚙️ t_tournament_rules テーブル: 存在しません');
    }
    
    // 4. 大会43の基本情報を取得（利用可能な列のみ）
    const tournament43 = await client.execute(`
      SELECT * FROM t_tournaments WHERE tournament_id = 43 LIMIT 1
    `);
    
    console.log('\n🎯 大会43の情報:');
    if (tournament43.rows.length > 0) {
      const tournament = tournament43.rows[0];
      Object.keys(tournament).forEach(key => {
        console.log(`  ${key}: ${tournament[key]}`);
      });
    } else {
      console.log('  大会43が見つかりません');
    }
    
    // 5. フォーマット情報も取得
    if (tournament43.rows.length > 0) {
      const formatId = tournament43.rows[0].format_id;
      const formatInfo = await client.execute(`
        SELECT * FROM m_tournament_formats WHERE format_id = ? LIMIT 1
      `, [formatId]);
      
      console.log('\n📊 大会43のフォーマット情報:');
      if (formatInfo.rows.length > 0) {
        const format = formatInfo.rows[0];
        Object.keys(format).forEach(key => {
          console.log(`  ${key}: ${format[key]}`);
        });
      } else {
        console.log('  フォーマット情報が見つかりません');
      }
    }
    
    // 6. 競技種別関連の情報がどこに保存されているかチェック
    console.log('\n🔍 競技種別情報の調査:');
    
    // 全てのテーブル名を取得
    const allTables = await client.execute(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
    `);
    
    console.log('\n📚 存在するテーブル一覧:');
    allTables.rows.forEach(table => {
      console.log(`  ${table.name}`);
    });
    
    // sport_codeを含む可能性のあるテーブルをチェック
    const tablesWithSport = [];
    for (const table of allTables.rows) {
      try {
        const schema = await client.execute(`PRAGMA table_info(${table.name});`);
        const hasSportCode = schema.rows.some(col => col.name.includes('sport'));
        if (hasSportCode) {
          tablesWithSport.push(table.name);
          console.log(`\n🏃 ${table.name} テーブルのsport関連列:`);
          schema.rows
            .filter(col => col.name.includes('sport'))
            .forEach(col => console.log(`    ${col.name}: ${col.type}`));
        }
      } catch (e) {
        // テーブルアクセスエラーは無視
      }
    }
    
    if (tablesWithSport.length === 0) {
      console.log('\n❓ sport関連の列を持つテーブルが見つかりませんでした');
    }
    
  } catch (error) {
    console.error('調査エラー:', error);
  } finally {
    client.close();
  }
}

checkTableStructures();