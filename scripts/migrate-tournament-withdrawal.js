// scripts/migrate-tournament-withdrawal.js
// 大会エントリー辞退機能のためのデータベースマイグレーション

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// データベース接続設定
const db = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function runMigration() {
  console.log('🚀 大会エントリー辞退機能のマイグレーション開始...');
  
  try {
    // 1. 現在のt_tournament_teamsテーブル構造を確認
    console.log('📋 現在のテーブル構造を確認中...');
    const tableInfo = await db.execute('PRAGMA table_info(t_tournament_teams)');
    console.log('現在のフィールド:', tableInfo.rows.map(row => row.name).join(', '));
    
    // 2. withdrawal_statusフィールドが既に存在するかチェック
    const hasWithdrawalStatus = tableInfo.rows.some(row => row.name === 'withdrawal_status');
    
    if (hasWithdrawalStatus) {
      console.log('⚠️  withdrawal_statusフィールドは既に存在します。マイグレーションをスキップします。');
      return;
    }
    
    // 3. 辞退関連フィールドを追加
    console.log('📝 辞退関連フィールドを追加中...');
    
    await db.execute(`
      ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_status TEXT DEFAULT 'active'
    `);
    console.log('✅ withdrawal_status フィールドを追加しました');
    
    await db.execute(`
      ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_reason TEXT
    `);
    console.log('✅ withdrawal_reason フィールドを追加しました');
    
    await db.execute(`
      ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_requested_at DATETIME
    `);
    console.log('✅ withdrawal_requested_at フィールドを追加しました');
    
    await db.execute(`
      ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_processed_at DATETIME
    `);
    console.log('✅ withdrawal_processed_at フィールドを追加しました');
    
    await db.execute(`
      ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_processed_by TEXT
    `);
    console.log('✅ withdrawal_processed_by フィールドを追加しました');
    
    // 4. インデックスを追加
    console.log('🔍 インデックスを追加中...');
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_teams_withdrawal_status 
      ON t_tournament_teams(withdrawal_status)
    `);
    console.log('✅ withdrawal_status インデックスを追加しました');
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_teams_withdrawal_requested_at 
      ON t_tournament_teams(withdrawal_requested_at)
    `);
    console.log('✅ withdrawal_requested_at インデックスを追加しました');
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament_withdrawal 
      ON t_tournament_teams(tournament_id, withdrawal_status)
    `);
    console.log('✅ 複合インデックス (tournament_id, withdrawal_status) を追加しました');
    
    // 5. 既存データの初期化（全て'active'ステータスに設定）
    console.log('🔄 既存データを初期化中...');
    const updateResult = await db.execute(`
      UPDATE t_tournament_teams 
      SET withdrawal_status = 'active' 
      WHERE withdrawal_status IS NULL
    `);
    console.log(`✅ ${updateResult.rowsAffected}件の既存レコードを'active'ステータスに初期化しました`);
    
    // 6. マイグレーション結果を確認
    console.log('🔍 マイグレーション結果を確認中...');
    const newTableInfo = await db.execute('PRAGMA table_info(t_tournament_teams)');
    const withdrawalFields = newTableInfo.rows.filter(row => 
      row.name.toString().startsWith('withdrawal')
    );
    
    console.log('新しく追加されたフィールド:');
    withdrawalFields.forEach(field => {
      console.log(`  - ${field.name} (${field.type})`);
    });
    
    // 7. インデックス確認
    const indexes = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='index' AND tbl_name='t_tournament_teams' AND name LIKE '%withdrawal%'
    `);
    
    console.log('追加されたインデックス:');
    indexes.rows.forEach(index => {
      console.log(`  - ${index.name}`);
    });
    
    console.log('🎉 マイグレーション完了！');
    
  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    process.exit(1);
  }
}

// スクリプト実行
runMigration()
  .then(() => {
    console.log('✨ マイグレーションが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 マイグレーションが失敗しました:', error);
    process.exit(1);
  });