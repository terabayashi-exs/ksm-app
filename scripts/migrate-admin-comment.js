// scripts/migrate-admin-comment.js
// 管理者コメントフィールドのマイグレーション

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function runMigration() {
  console.log('🚀 管理者コメントフィールドのマイグレーション開始...');
  
  try {
    // 1. 現在のt_tournament_teamsテーブル構造を確認
    console.log('📋 現在のテーブル構造を確認中...');
    const tableInfo = await db.execute('PRAGMA table_info(t_tournament_teams)');
    
    // 2. withdrawal_admin_commentフィールドが既に存在するかチェック
    const hasAdminCommentField = tableInfo.rows.some(row => row.name === 'withdrawal_admin_comment');
    
    if (hasAdminCommentField) {
      console.log('⚠️  withdrawal_admin_commentフィールドは既に存在します。マイグレーションをスキップします。');
      return;
    }
    
    // 3. 管理者コメントフィールドを追加
    console.log('📝 管理者コメントフィールドを追加中...');
    
    await db.execute(`
      ALTER TABLE t_tournament_teams ADD COLUMN withdrawal_admin_comment TEXT
    `);
    console.log('✅ withdrawal_admin_comment フィールドを追加しました');
    
    // 4. マイグレーション結果を確認
    console.log('🔍 マイグレーション結果を確認中...');
    const newTableInfo = await db.execute('PRAGMA table_info(t_tournament_teams)');
    const adminCommentField = newTableInfo.rows.find(row => row.name === 'withdrawal_admin_comment');
    
    if (adminCommentField) {
      console.log(`✅ withdrawal_admin_comment フィールドが正常に追加されました (${adminCommentField.type})`);
    } else {
      console.log('❌ withdrawal_admin_comment フィールドの追加に失敗しました');
    }
    
    console.log('🎉 管理者コメントフィールドのマイグレーション完了！');
    
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