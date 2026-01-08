// scripts/migrate-announcements.mjs
// お知らせテーブルのマイグレーション

import { createClient } from '@libsql/client';
import fs from 'fs';

async function migrate() {
  const dbUrl = process.env.DATABASE_URL || 'libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io';
  const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '';

  console.log(`Migrating to: ${dbUrl}`);

  const client = createClient({
    url: dbUrl,
    authToken: authToken
  });

  try {
    // テーブル作成
    await client.execute(`
      CREATE TABLE IF NOT EXISTS t_announcements (
        announcement_id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        display_order INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (created_by) REFERENCES m_administrators(admin_login_id)
      )
    `);
    console.log('✅ Table created: t_announcements');

    // インデックス作成
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_announcements_display
      ON t_announcements(status, display_order, created_at DESC)
    `);
    console.log('✅ Index created: idx_announcements_display');

    // テーブル作成確認
    const result = await client.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='t_announcements'
    `);

    console.log('\n✅ Migration completed successfully!');
    console.log('Table exists:', result.rows.length > 0 ? 'YES' : 'NO');

    // インデックス確認
    const indexResult = await client.execute(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND name='idx_announcements_display'
    `);
    console.log('Index exists:', indexResult.rows.length > 0 ? 'YES' : 'NO');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
