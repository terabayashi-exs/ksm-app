// scripts/create-json-archive-table.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');

async function createJsonArchiveTable() {
  const db = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    console.log('🔄 データベースに接続中...');

    // t_archived_tournament_json テーブルを作成
    console.log('📝 t_archived_tournament_json テーブルを作成中...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_archived_tournament_json (
        tournament_id INTEGER PRIMARY KEY,
        tournament_name TEXT NOT NULL,
        tournament_data TEXT NOT NULL,
        teams_data TEXT NOT NULL,
        matches_data TEXT NOT NULL,
        standings_data TEXT NOT NULL,
        results_data TEXT,
        pdf_info_data TEXT,
        archive_version TEXT DEFAULT 'v1_json',
        archived_at DATETIME NOT NULL,
        archived_by TEXT NOT NULL,
        last_accessed DATETIME,
        metadata TEXT
      )
    `);
    console.log('✅ t_archived_tournament_json テーブルを作成しました');

    // インデックスを作成
    console.log('📊 インデックスを作成中...');
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_archived_json_date 
      ON t_archived_tournament_json(archived_at)
    `);
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_archived_json_version 
      ON t_archived_tournament_json(archive_version)
    `);
    console.log('✅ インデックスを作成しました');

    // テーブル構造の確認
    console.log('\n📋 テーブル構造の確認:');
    const result = await db.execute('PRAGMA table_info(t_archived_tournament_json)');
    
    console.log('t_archived_tournament_json テーブルの列:');
    result.rows.forEach(row => {
      console.log(`  - ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : 'NULL'} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });

    console.log('\n✅ JSON アーカイブテーブルの作成が完了しました！');
    
  } catch (error) {
    console.error('🔥 エラーが発生しました:', error);
    throw error;
  } finally {
    db.close();
  }
}

createJsonArchiveTable();