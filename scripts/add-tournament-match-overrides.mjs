#!/usr/bin/env node
// scripts/add-tournament-match-overrides.mjs
// 大会別試合進出条件オーバーライドテーブル作成マイグレーション

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 環境変数読み込み
config({ path: join(__dirname, '../.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function runMigration() {
  console.log('=== 大会別試合進出条件オーバーライドテーブル作成マイグレーション ===\n');

  try {
    // テーブル存在チェック
    console.log('🔍 既存テーブル確認中...');
    const checkTable = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='t_tournament_match_overrides'
    `);

    if (checkTable.rows.length > 0) {
      console.log('⚠️  t_tournament_match_overrides テーブルは既に存在します');
      console.log('   スキップします\n');
      return;
    }

    // マイグレーション実行
    console.log('🚀 マイグレーション実行中...');

    // CREATE TABLE文を直接実行
    console.log('  - テーブル作成中...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_tournament_match_overrides (
        override_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        team1_source_override TEXT,
        team2_source_override TEXT,
        override_reason TEXT,
        overridden_by TEXT,
        overridden_at TEXT DEFAULT (datetime('now', '+9 hours')),
        created_at TEXT DEFAULT (datetime('now', '+9 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+9 hours')),
        UNIQUE(tournament_id, match_code),
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE
      )
    `);

    // CREATE INDEX文を実行
    console.log('  - インデックス作成中（1/2）...');
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_match_overrides_tournament
      ON t_tournament_match_overrides(tournament_id)
    `);

    console.log('  - インデックス作成中（2/2）...');
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_match_overrides_match_code
      ON t_tournament_match_overrides(match_code)
    `);

    console.log('✅ マイグレーション完了\n');

    // テーブルが作成されたか確認
    const checkCreated = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='t_tournament_match_overrides'
    `);

    if (checkCreated.rows.length === 0) {
      throw new Error('テーブルの作成に失敗しました');
    }

    // テーブル構造確認
    console.log('📊 テーブル構造確認:');
    const tableInfo = await db.execute(`
      PRAGMA table_info(t_tournament_match_overrides)
    `);

    console.log('\n  カラム一覧:');
    tableInfo.rows.forEach(col => {
      console.log(`    - ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
    });

    // インデックス確認
    const indexes = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='t_tournament_match_overrides'
    `);

    if (indexes.rows.length > 0) {
      console.log('\n  インデックス一覧:');
      indexes.rows.forEach(idx => {
        console.log(`    - ${idx.name}`);
      });
    }

    console.log('\n✨ マイグレーション成功\n');
    console.log('📝 使用方法:');
    console.log('   - このテーブルは、大会ごとに試合の進出条件をカスタマイズする際に使用します');
    console.log('   - team1_source_override/team2_source_overrideがNULLの場合は、m_match_templatesの元の条件を使用');
    console.log('   - 値が設定されている場合は、その値で元の条件を上書き');
    console.log('   - 例: Aブロック辞退により「A_3rd」→「B_4th」に変更\n');

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    console.error('詳細:', error.message);
    process.exit(1);
  }
}

// 実行
runMigration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('予期しないエラー:', err);
    process.exit(1);
  });
