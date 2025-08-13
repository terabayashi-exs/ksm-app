// scripts/check-tournament-teams-table.js
// t_tournament_teamsテーブルの現在の構造を確認するスクリプト

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function checkTable() {
  try {
    console.log('🔍 t_tournament_teamsテーブルの構造を確認中...');
    
    // テーブルが存在するかチェック
    const tableExists = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='t_tournament_teams'
    `);
    
    if (tableExists.rows.length === 0) {
      console.log('❌ t_tournament_teamsテーブルが存在しません');
      
      // 全てのテーブル一覧を表示
      console.log('\n📋 存在するテーブル一覧:');
      const allTables = await db.execute(`
        SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
      `);
      allTables.rows.forEach(row => {
        console.log(`  - ${row.name}`);
      });
      return;
    }
    
    console.log('✅ t_tournament_teamsテーブルが存在します');
    
    // テーブル構造を確認
    const tableInfo = await db.execute('PRAGMA table_info(t_tournament_teams)');
    
    console.log('\n📋 現在のフィールド一覧:');
    tableInfo.rows.forEach(row => {
      console.log(`  ${row.cid}: ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });
    
    // withdrawal関連のフィールドがあるかチェック
    const withdrawalFields = tableInfo.rows.filter(row => 
      row.name.toString().startsWith('withdrawal')
    );
    
    console.log('\n🔍 withdrawal関連フィールド:');
    if (withdrawalFields.length === 0) {
      console.log('  ❌ withdrawal関連フィールドは見つかりませんでした');
    } else {
      withdrawalFields.forEach(field => {
        console.log(`  ✅ ${field.name} (${field.type})`);
      });
    }
    
    // インデックス一覧を確認
    console.log('\n🔍 インデックス一覧:');
    const indexes = await db.execute(`
      SELECT name, sql FROM sqlite_master 
      WHERE type='index' AND tbl_name='t_tournament_teams'
      ORDER BY name
    `);
    
    if (indexes.rows.length === 0) {
      console.log('  ❌ インデックスが見つかりませんでした');
    } else {
      indexes.rows.forEach(index => {
        console.log(`  - ${index.name}`);
      });
    }
    
    // withdrawal関連のインデックスをチェック
    const withdrawalIndexes = indexes.rows.filter(row => 
      row.name.toString().includes('withdrawal')
    );
    
    console.log('\n🔍 withdrawal関連インデックス:');
    if (withdrawalIndexes.length === 0) {
      console.log('  ❌ withdrawal関連インデックスは見つかりませんでした');
    } else {
      withdrawalIndexes.forEach(index => {
        console.log(`  ✅ ${index.name}`);
      });
    }
    
    // レコード数確認
    const recordCount = await db.execute('SELECT COUNT(*) as count FROM t_tournament_teams');
    console.log(`\n📊 現在のレコード数: ${recordCount.rows[0].count}件`);
    
    // サンプルレコードを表示（3件まで）
    if (recordCount.rows[0].count > 0) {
      console.log('\n📝 サンプルレコード:');
      const samples = await db.execute('SELECT * FROM t_tournament_teams LIMIT 3');
      samples.rows.forEach((row, index) => {
        console.log(`  レコード${index + 1}:`);
        Object.entries(row).forEach(([key, value]) => {
          console.log(`    ${key}: ${value}`);
        });
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ テーブル確認エラー:', error);
  }
}

checkTable()
  .then(() => {
    console.log('✨ テーブル確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 テーブル確認が失敗しました:', error);
    process.exit(1);
  });