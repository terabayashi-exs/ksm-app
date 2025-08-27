// scripts/add-cancellation-fields.js
// 試合中止機能のためのcancellation_typeフィールド追加スクリプト

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || ''
});

async function addCancellationFields() {
  try {
    console.log('🔧 試合中止機能のフィールドを追加中...');

    // t_matches_liveテーブルにcancellation_typeフィールド追加
    try {
      await db.execute(`
        ALTER TABLE t_matches_live 
        ADD COLUMN cancellation_type TEXT
      `);
      console.log('✅ t_matches_live.cancellation_type フィールドを追加しました');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('ℹ️  t_matches_live.cancellation_type は既に存在します');
      } else {
        throw error;
      }
    }

    // t_matches_finalテーブルにcancellation_typeフィールド追加
    try {
      await db.execute(`
        ALTER TABLE t_matches_final 
        ADD COLUMN cancellation_type TEXT
      `);
      console.log('✅ t_matches_final.cancellation_type フィールドを追加しました');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('ℹ️  t_matches_final.cancellation_type は既に存在します');
      } else {
        throw error;
      }
    }

    console.log('🎉 試合中止機能のフィールド追加が完了しました！');

  } catch (error) {
    console.error('❌ フィールド追加中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
addCancellationFields();