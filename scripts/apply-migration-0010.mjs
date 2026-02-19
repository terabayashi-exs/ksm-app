import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || '',
});

async function applyMigration() {
  console.log('=== マイグレーション 0010 を手動適用 ===\n');

  // 都道府県マスタテーブルの作成
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_prefectures (
        prefecture_id integer PRIMARY KEY NOT NULL,
        prefecture_name text NOT NULL,
        prefecture_code text NOT NULL,
        region_name text NOT NULL,
        display_order integer NOT NULL,
        is_active integer DEFAULT 1 NOT NULL,
        created_at numeric DEFAULT (datetime('now', '+9 hours'))
      )
    `);
    console.log('✓ m_prefectures テーブルを作成しました');
  } catch (error) {
    console.log('⊘ m_prefectures テーブルは既に存在します');
  }

  // 会場テーブルにprefecture_idカラムを追加
  try {
    await db.execute(`ALTER TABLE m_venues ADD COLUMN prefecture_id integer REFERENCES m_prefectures(prefecture_id)`);
    console.log('✓ m_venues に prefecture_id カラムを追加しました');
  } catch (error) {
    console.log('⊘ prefecture_id カラムは既に存在します:', error.message);
  }

  console.log('\n✨ マイグレーション適用完了');
}

applyMigration().catch(console.error);
