#!/usr/bin/env node

const { createClient } = require('@libsql/client');

// 環境変数の読み込み
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function migrateMatchTemplates() {
  try {
    console.log('🔧 m_match_templatesテーブルのmatch_orderフィールドを削除します...');

    // 既存テーブル構造を確認
    const tableInfo = await client.execute('PRAGMA table_info(m_match_templates)');
    console.log('現在のテーブル構造:', tableInfo.rows.map(row => row.name));

    // match_orderフィールドが存在するか確認
    const hasMatchOrder = tableInfo.rows.some(row => row.name === 'match_order');
    
    if (!hasMatchOrder) {
      console.log('✅ match_orderフィールドは既に存在しません。');
      return;
    }

    // SQLiteではCOLUMNの削除が直接できないので、テーブルを再作成
    console.log('📋 データをバックアップ中...');
    
    // 既存データをバックアップ
    const existingData = await client.execute(`
      SELECT template_id, format_id, match_number, match_code, match_type, 
             phase, round_name, block_name, team1_source, team2_source,
             team1_display_name, team2_display_name, day_number, 
             execution_priority, created_at 
      FROM m_match_templates
    `);

    console.log(`📊 ${existingData.rows.length}件のデータをバックアップしました`);

    // 新しいテーブル構造を作成
    console.log('🔨 新しいテーブル構造を作成中...');
    
    await client.execute('DROP TABLE IF EXISTS m_match_templates_new');
    
    await client.execute(`
      CREATE TABLE m_match_templates_new (
        template_id INTEGER PRIMARY KEY AUTOINCREMENT,
        format_id INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        match_type TEXT NOT NULL,
        phase TEXT NOT NULL,
        round_name TEXT,
        block_name TEXT,
        team1_source TEXT,
        team2_source TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        day_number INTEGER NOT NULL DEFAULT 1,
        execution_priority INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (format_id) REFERENCES m_tournament_formats(format_id)
      )
    `);

    // データを新しいテーブルにコピー
    console.log('📥 データを新しいテーブルにコピー中...');
    
    for (const row of existingData.rows) {
      await client.execute(`
        INSERT INTO m_match_templates_new (
          format_id, match_number, match_code, match_type, phase,
          round_name, block_name, team1_source, team2_source,
          team1_display_name, team2_display_name, day_number,
          execution_priority, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.format_id, row.match_number, row.match_code, row.match_type, row.phase,
        row.round_name, row.block_name, row.team1_source, row.team2_source,
        row.team1_display_name, row.team2_display_name, row.day_number,
        row.execution_priority, row.created_at
      ]);
    }

    // 古いテーブルを削除し、新しいテーブルをリネーム
    console.log('🔄 テーブルを置き換え中...');
    
    await client.execute('DROP TABLE m_match_templates');
    await client.execute('ALTER TABLE m_match_templates_new RENAME TO m_match_templates');

    // 新しいテーブル構造を確認
    const newTableInfo = await client.execute('PRAGMA table_info(m_match_templates)');
    console.log('新しいテーブル構造:', newTableInfo.rows.map(row => row.name));

    console.log('✅ match_orderフィールドの削除が完了しました！');
    
  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  }
}

async function main() {
  try {
    await migrateMatchTemplates();
    console.log('🎉 マイグレーションが正常に完了しました！');
  } catch (error) {
    console.error('❌ マイグレーション失敗:', error);
    process.exit(1);
  }
}

main();