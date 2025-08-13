#!/usr/bin/env node

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function listBackupTables() {
  console.log('🔍 バックアップテーブル一覧確認中...\n');
  
  const backupTables = await db.execute(`
    SELECT name 
    FROM sqlite_master 
    WHERE type='table' 
    AND (name LIKE '%_backup' OR name LIKE '%_tz_backup')
    ORDER BY name
  `);
  
  if (backupTables.rows.length === 0) {
    console.log('📄 バックアップテーブルは見つかりませんでした');
    return [];
  }
  
  console.log(`📋 見つかったバックアップテーブル (${backupTables.rows.length}個):`);
  
  const tableDetails = [];
  
  for (const table of backupTables.rows) {
    const tableName = table.name;
    const count = await db.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
    
    tableDetails.push({
      name: tableName,
      count: count.rows[0].count,
      originalTable: tableName.replace(/_backup$|_tz_backup$/, '')
    });
    
    console.log(`  📦 ${tableName} - ${count.rows[0].count}件`);
  }
  
  return tableDetails;
}

async function main() {
  try {
    const tables = await listBackupTables();
    console.log(`\n🗂️  合計バックアップテーブル: ${tables.length}個`);
    
    if (tables.length > 0) {
      console.log('\n⚠️  これらのテーブルを削除しますか？');
      console.log('削除スクリプト: node scripts/delete-backup-tables.js');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    db.close();
  }
}

main();