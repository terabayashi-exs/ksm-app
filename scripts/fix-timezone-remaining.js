#!/usr/bin/env node

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function fixSingleTable(tableName) {
  console.log(`🔧 ${tableName} 修正中...`);
  
  try {
    // 現在のスキーマ確認
    const schema = await db.execute(`PRAGMA table_info(${tableName})`);
    const hasCreatedAt = schema.rows.some(row => row.name === 'created_at');
    const hasUpdatedAt = schema.rows.some(row => row.name === 'updated_at');
    
    if (!hasCreatedAt && !hasUpdatedAt) {
      console.log(`⏭️  ${tableName} にはタイムスタンプフィールドがありません`);
      return;
    }
    
    // バックアップ作成
    await db.execute(`CREATE TABLE IF NOT EXISTS ${tableName}_tz_backup AS SELECT * FROM ${tableName}`);
    
    // 新テーブル作成（スキーマコピー）
    const createStmt = await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
    if (createStmt.rows.length === 0) {
      throw new Error(`テーブル ${tableName} が見つかりません`);
    }
    
    let newCreateSql = createStmt.rows[0].sql;
    
    // デフォルト値を日本時間に変更
    if (hasCreatedAt) {
      newCreateSql = newCreateSql.replace(
        /created_at\s+DATETIME\s+DEFAULT\s+CURRENT_TIMESTAMP/gi,
        "created_at DATETIME DEFAULT (datetime('now', '+9 hours'))"
      );
    }
    
    if (hasUpdatedAt) {
      newCreateSql = newCreateSql.replace(
        /updated_at\s+DATETIME\s+DEFAULT\s+CURRENT_TIMESTAMP/gi,
        "updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))"
      );
    }
    
    // テーブル名を変更
    newCreateSql = newCreateSql.replace(`CREATE TABLE ${tableName}`, `CREATE TABLE ${tableName}_new`);
    
    // 外部キー制約を一時的に無効化
    await db.execute('PRAGMA foreign_keys = OFF');
    
    // 新テーブル作成
    await db.execute(`DROP TABLE IF EXISTS ${tableName}_new`);
    await db.execute(newCreateSql);
    
    // データ移行
    const count = await db.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
    if (count.rows[0].count > 0) {
      const columns = schema.rows.map(row => row.name).join(', ');
      await db.execute(`INSERT INTO ${tableName}_new (${columns}) SELECT ${columns} FROM ${tableName}`);
    }
    
    // テーブル入れ替え
    await db.execute(`DROP TABLE ${tableName}`);
    await db.execute(`ALTER TABLE ${tableName}_new RENAME TO ${tableName}`);
    
    // 外部キー制約を再有効化
    await db.execute('PRAGMA foreign_keys = ON');
    
    console.log(`✅ ${tableName} 修正完了 (${count.rows[0].count}件)`);
    
  } catch (error) {
    console.error(`❌ ${tableName} 修正エラー:`, error);
    // 外部キー制約を再有効化（エラー時も）
    try { await db.execute('PRAGMA foreign_keys = ON'); } catch {}
    throw error;
  }
}

async function fixAllSimple() {
  const tablesToFix = [
    'm_players',
    'm_tournament_formats', 
    't_tournament_teams',
    't_match_blocks',
    't_tournament_players',
    't_match_status'
  ];
  
  console.log('🚀 残りのテーブルのタイムゾーン修正開始...\n');
  
  try {
    for (const tableName of tablesToFix) {
      await fixSingleTable(tableName);
    }
    
    console.log('\n🎉 全修正完了！');
    
  } catch (error) {
    console.error('❌ 修正エラー:', error);
  } finally {
    db.close();
  }
}

fixAllSimple();