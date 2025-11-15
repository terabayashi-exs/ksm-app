#!/usr/bin/env node
/**
 * t_tournamentsテーブルに created_by フィールドを追加するマイグレーションスクリプト
 * 
 * 実行方法:
 * node scripts/add-created-by-field.js
 */

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

async function addCreatedByField() {
  const client = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    console.log('🔄 データベースに接続中...');
    
    // 1. created_by フィールドを追加
    console.log('📝 created_by フィールドを追加中...');
    await client.execute(`
      ALTER TABLE t_tournaments 
      ADD COLUMN created_by TEXT DEFAULT 'admin'
    `);
    console.log('✅ created_by フィールドを追加しました');

    // 2. 既存のデータに admin をデフォルト値として設定（念のため）
    console.log('🔄 既存データを更新中...');
    const updateResult = await client.execute(`
      UPDATE t_tournaments 
      SET created_by = 'admin' 
      WHERE created_by IS NULL
    `);
    console.log(`✅ ${updateResult.rowsAffected}件の既存データを更新しました`);

    // 3. 現在のデータを確認
    console.log('\n📊 大会データの確認:');
    const tournaments = await client.execute(`
      SELECT tournament_id, tournament_name, status, created_by
      FROM t_tournaments
      ORDER BY tournament_id
    `);

    console.log('現在の大会一覧:');
    tournaments.rows.forEach(row => {
      console.log(`  - ID: ${row.tournament_id}, 名前: ${row.tournament_name}, 状態: ${row.status}, 作成者: ${row.created_by}`);
    });

    console.log('\n✅ マイグレーションが完了しました！');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    
    // フィールドが既に存在する場合のエラーをチェック
    if (error.message && error.message.includes('duplicate column name')) {
      console.log('ℹ️  created_by フィールドは既に存在しています。');
      
      // 既存データの確認のみ実行
      try {
        const tournaments = await client.execute(`
          SELECT tournament_id, tournament_name, created_by
          FROM t_tournaments
          WHERE created_by IS NULL OR created_by = ''
        `);

        if (tournaments.rows.length > 0) {
          console.log('\n⚠️  created_by が未設定の大会があります:');
          tournaments.rows.forEach(row => {
            console.log(`  - ID: ${row.tournament_id}, 名前: ${row.tournament_name}`);
          });

          // 未設定のデータを更新
          console.log('\n🔄 未設定のデータを更新中...');
          const updateResult = await client.execute(`
            UPDATE t_tournaments 
            SET created_by = 'admin' 
            WHERE created_by IS NULL OR created_by = ''
          `);
          console.log(`✅ ${updateResult.rowsAffected}件のデータを更新しました`);
        } else {
          console.log('✅ すべての大会に created_by が設定されています');
        }
      } catch (updateError) {
        console.error('更新エラー:', updateError);
      }
    }
  } finally {
    client.close();
  }
}

// スクリプトを実行
addCreatedByField().catch(console.error);