// scripts/debug-db-structure.js
// データベースの現在の構造をデバッグするスクリプト

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@libsql/client';

console.log('環境変数チェック:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'undefined');
console.log('DATABASE_AUTH_TOKEN:', process.env.DATABASE_AUTH_TOKEN ? 'defined' : 'undefined');

const db = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function debugDatabase() {
  try {
    console.log('🔍 データベースの構造をデバッグ中...');
    
    // 接続テスト
    console.log('\n🔗 データベース接続テスト...');
    await db.execute('SELECT 1 as test');
    console.log('✅ データベース接続成功');
    
    // 全てのテーブル一覧を表示
    console.log('\n📋 存在するテーブル一覧:');
    const allTables = await db.execute(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `);
    
    if (allTables.rows.length === 0) {
      console.log('  ❌ テーブルが見つかりませんでした');
      
      // データベースの詳細情報を表示
      console.log('\n🔍 sqlite_master の全内容:');
      const allObjects = await db.execute(`
        SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name
      `);
      if (allObjects.rows.length === 0) {
        console.log('  ❌ sqlite_master が完全に空です');
      } else {
        allObjects.rows.forEach(row => {
          console.log(`  ${row.type}: ${row.name} (table: ${row.tbl_name})`);
        });
      }
      return;
    }
    
    allTables.rows.forEach(row => {
      console.log(`  - ${row.name}`);
    });
    
    // t_tournament_teamsテーブルが存在するかチェック
    const tournamentTeamsTable = allTables.rows.find(row => row.name === 't_tournament_teams');
    if (tournamentTeamsTable) {
      console.log('\n✅ t_tournament_teamsテーブルが存在します');
      
      // テーブル構造を確認
      const tableInfo = await db.execute('PRAGMA table_info(t_tournament_teams)');
      console.log('\n📋 t_tournament_teamsテーブルのフィールド:');
      tableInfo.rows.forEach(row => {
        console.log(`  ${row.cid}: ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''}`);
      });
    } else {
      console.log('\n❌ t_tournament_teamsテーブルが存在しません');
    }
    
    // t_tournamentsテーブルが存在するかチェック
    const tournamentsTable = allTables.rows.find(row => row.name === 't_tournaments');
    if (tournamentsTable) {
      console.log('\n✅ t_tournamentsテーブルが存在します');
      
      // テーブル構造を確認
      const tableInfo = await db.execute('PRAGMA table_info(t_tournaments)');
      console.log('\n📋 t_tournamentsテーブルのフィールド:');
      tableInfo.rows.forEach(row => {
        console.log(`  ${row.cid}: ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''}`);
      });
    } else {
      console.log('\n❌ t_tournamentsテーブルが存在しません');
    }
    
  } catch (error) {
    console.error('❌ デバッグエラー:', error);
    console.error('エラー詳細:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
  }
}

debugDatabase()
  .then(() => {
    console.log('\n✨ デバッグ完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 デバッグが失敗しました:', error);
    process.exit(1);
  });