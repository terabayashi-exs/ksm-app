#!/usr/bin/env node
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

console.log('🔧 Adding UNIQUE constraint to m_players table...\n');

try {
  // 0. 外部キーチェックを無効化
  console.log('Step 0: Disabling foreign key checks...');
  await db.execute('PRAGMA foreign_keys = OFF');
  console.log('✅ Foreign key checks disabled');

  // 1. 新しいテーブルを作成（UNIQUE制約付き）
  console.log('\nStep 1: Creating new table with UNIQUE constraint...');
  await db.execute(`
    CREATE TABLE m_players_new (
      player_id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      jersey_number INTEGER,
      current_team_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
      updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
      FOREIGN KEY (current_team_id) REFERENCES m_teams(team_id),
      UNIQUE(current_team_id, player_name)
    )
  `);
  console.log('✅ New table created');

  // 2. データをコピー
  console.log('\nStep 2: Copying data from old table...');
  await db.execute(`
    INSERT INTO m_players_new (
      player_id, player_name, jersey_number, current_team_id,
      is_active, created_at, updated_at
    )
    SELECT
      player_id, player_name, jersey_number, current_team_id,
      is_active, created_at, updated_at
    FROM m_players
  `);

  const countResult = await db.execute('SELECT COUNT(*) as count FROM m_players_new');
  console.log(`✅ Copied ${countResult.rows[0].count} records`);

  // 3. 古いテーブルを削除
  console.log('\nStep 3: Dropping old table...');
  await db.execute('DROP TABLE m_players');
  console.log('✅ Old table dropped');

  // 4. 新しいテーブルをリネーム
  console.log('\nStep 4: Renaming new table...');
  await db.execute('ALTER TABLE m_players_new RENAME TO m_players');
  console.log('✅ Table renamed');

  // 5. 外部キーチェックを再有効化
  console.log('\nStep 5: Re-enabling foreign key checks...');
  await db.execute('PRAGMA foreign_keys = ON');
  console.log('✅ Foreign key checks re-enabled');

  console.log('\n✅ Migration completed successfully!');
  console.log('\n📋 New table schema:');
  const schemaResult = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='m_players'"
  );
  console.log(schemaResult.rows[0]?.sql);

} catch (error) {
  console.error('❌ Error during migration:', error.message);
  process.exit(1);
}
