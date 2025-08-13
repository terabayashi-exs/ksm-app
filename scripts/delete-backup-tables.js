#!/usr/bin/env node

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function deleteBackupTables() {
  console.log('🗑️  バックアップテーブル削除開始...\n');
  
  try {
    // バックアップテーブル一覧取得
    const backupTables = await db.execute(`
      SELECT name 
      FROM sqlite_master 
      WHERE type='table' 
      AND (name LIKE '%_backup' OR name LIKE '%_tz_backup')
      ORDER BY name
    `);
    
    if (backupTables.rows.length === 0) {
      console.log('📄 削除対象のバックアップテーブルはありません');
      return;
    }
    
    console.log(`📋 削除対象テーブル (${backupTables.rows.length}個):`);
    
    // 各テーブルの詳細表示と削除
    let deletedCount = 0;
    let totalRecords = 0;
    
    for (const table of backupTables.rows) {
      const tableName = table.name;
      
      // レコード数確認
      const count = await db.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
      const recordCount = count.rows[0].count;
      totalRecords += recordCount;
      
      console.log(`  🗂️  ${tableName} (${recordCount}件) 削除中...`);
      
      // テーブル削除
      await db.execute(`DROP TABLE IF EXISTS ${tableName}`);
      
      // 削除確認
      const verify = await db.execute(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='${tableName}'
      `);
      
      if (verify.rows.length === 0) {
        console.log(`  ✅ ${tableName} 削除完了`);
        deletedCount++;
      } else {
        console.log(`  ❌ ${tableName} 削除失敗`);
      }
    }
    
    console.log(`\n📊 削除結果:`);
    console.log(`  - 削除したテーブル数: ${deletedCount}個`);
    console.log(`  - 削除したレコード数: ${totalRecords}件`);
    
    if (deletedCount === backupTables.rows.length) {
      console.log('🎉 すべてのバックアップテーブル削除完了！');
    } else {
      console.log(`⚠️  ${backupTables.rows.length - deletedCount}個のテーブル削除に失敗しました`);
    }
    
    // 最終確認
    console.log('\n🔍 削除後確認中...');
    const remaining = await db.execute(`
      SELECT name 
      FROM sqlite_master 
      WHERE type='table' 
      AND (name LIKE '%_backup' OR name LIKE '%_tz_backup')
    `);
    
    if (remaining.rows.length === 0) {
      console.log('✅ バックアップテーブルは完全に削除されました');
    } else {
      console.log(`⚠️  ${remaining.rows.length}個のバックアップテーブルが残っています:`);
      remaining.rows.forEach(row => {
        console.log(`  - ${row.name}`);
      });
    }
    
  } catch (error) {
    console.error('❌ バックアップテーブル削除エラー:', error);
  } finally {
    db.close();
  }
}

deleteBackupTables();