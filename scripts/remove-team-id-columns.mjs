// scripts/remove-team-id-columns.mjs
// t_matches_liveとt_matches_finalからteam1_id, team2_id, winner_team_idカラムを削除

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

// .env.localを読み込み
dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

console.log('🔧 Starting column removal migration...\n');

try {
  // t_matches_finalテーブルの再作成
  console.log('📋 Step 1: Recreating t_matches_final table...');

  await client.execute('PRAGMA foreign_keys=OFF');

  // 新しいテーブルを作成（team1_id, team2_id, winner_team_idを除外）
  await client.execute(`
    CREATE TABLE t_matches_final_new (
      match_id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_block_id INTEGER NOT NULL,
      tournament_date TEXT NOT NULL,
      match_number INTEGER NOT NULL,
      match_code TEXT NOT NULL,
      team1_display_name TEXT NOT NULL,
      team2_display_name TEXT NOT NULL,
      court_number INTEGER,
      start_time TEXT,
      team1_scores TEXT,
      team2_scores TEXT,
      period_count INTEGER DEFAULT 1 NOT NULL,
      is_draw INTEGER DEFAULT 0 NOT NULL,
      is_walkover INTEGER DEFAULT 0 NOT NULL,
      match_status TEXT DEFAULT 'completed' NOT NULL,
      result_status TEXT DEFAULT 'confirmed' NOT NULL,
      remarks TEXT,
      created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
      updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
      cancellation_type TEXT,
      team1_tournament_team_id INTEGER,
      team2_tournament_team_id INTEGER,
      winner_tournament_team_id INTEGER,
      FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id)
    )
  `);

  // データをコピー
  await client.execute(`
    INSERT INTO t_matches_final_new (
      match_id, match_block_id, tournament_date, match_number, match_code,
      team1_display_name, team2_display_name, court_number, start_time,
      team1_scores, team2_scores, period_count, is_draw, is_walkover,
      match_status, result_status, remarks, created_at, updated_at,
      cancellation_type, team1_tournament_team_id, team2_tournament_team_id, winner_tournament_team_id
    )
    SELECT
      match_id, match_block_id, tournament_date, match_number, match_code,
      team1_display_name, team2_display_name, court_number, start_time,
      team1_scores, team2_scores, period_count, is_draw, is_walkover,
      match_status, result_status, remarks, created_at, updated_at,
      cancellation_type, team1_tournament_team_id, team2_tournament_team_id, winner_tournament_team_id
    FROM t_matches_final
  `);

  // 古いテーブルを削除
  await client.execute('DROP TABLE t_matches_final');

  // 新しいテーブルの名前を変更
  await client.execute('ALTER TABLE t_matches_final_new RENAME TO t_matches_final');

  // インデックスを再作成
  await client.execute('CREATE INDEX idx_matches_final_winner_tournament ON t_matches_final (winner_tournament_team_id)');
  await client.execute('CREATE INDEX idx_matches_final_team2_tournament ON t_matches_final (team2_tournament_team_id)');
  await client.execute('CREATE INDEX idx_matches_final_team1_tournament ON t_matches_final (team1_tournament_team_id)');

  console.log('✅ t_matches_final table recreated successfully\n');

  // t_matches_liveテーブルの再作成
  console.log('📋 Step 2: Recreating t_matches_live table...');

  await client.execute(`
    CREATE TABLE t_matches_live_new (
      match_id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_block_id INTEGER NOT NULL,
      tournament_date TEXT NOT NULL,
      match_number INTEGER NOT NULL,
      match_code TEXT NOT NULL,
      team1_display_name TEXT NOT NULL,
      team2_display_name TEXT NOT NULL,
      court_number INTEGER,
      start_time TEXT,
      team1_scores TEXT,
      team2_scores TEXT,
      period_count INTEGER DEFAULT 1 NOT NULL,
      is_draw INTEGER DEFAULT 0 NOT NULL,
      is_walkover INTEGER DEFAULT 0 NOT NULL,
      match_status TEXT DEFAULT 'scheduled' NOT NULL,
      result_status TEXT DEFAULT 'none' NOT NULL,
      remarks TEXT,
      confirmed_by TEXT,
      created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
      updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
      cancellation_type TEXT,
      team1_tournament_team_id INTEGER,
      team2_tournament_team_id INTEGER,
      winner_tournament_team_id INTEGER
    )
  `);

  await client.execute(`
    INSERT INTO t_matches_live_new (
      match_id, match_block_id, tournament_date, match_number, match_code,
      team1_display_name, team2_display_name, court_number, start_time,
      team1_scores, team2_scores, period_count, is_draw, is_walkover,
      match_status, result_status, remarks, confirmed_by, created_at, updated_at,
      cancellation_type, team1_tournament_team_id, team2_tournament_team_id, winner_tournament_team_id
    )
    SELECT
      match_id, match_block_id, tournament_date, match_number, match_code,
      team1_display_name, team2_display_name, court_number, start_time,
      team1_scores, team2_scores, period_count, is_draw, is_walkover,
      match_status, result_status, remarks, confirmed_by, created_at, updated_at,
      cancellation_type, team1_tournament_team_id, team2_tournament_team_id, winner_tournament_team_id
    FROM t_matches_live
  `);

  await client.execute('DROP TABLE t_matches_live');
  await client.execute('ALTER TABLE t_matches_live_new RENAME TO t_matches_live');

  // インデックスを再作成
  await client.execute('CREATE INDEX idx_matches_live_team1_tournament ON t_matches_live (team1_tournament_team_id)');
  await client.execute('CREATE INDEX idx_matches_live_winner_tournament ON t_matches_live (winner_tournament_team_id)');
  await client.execute('CREATE INDEX idx_matches_live_team2_tournament ON t_matches_live (team2_tournament_team_id)');

  await client.execute('PRAGMA foreign_keys=ON');

  console.log('✅ t_matches_live table recreated successfully\n');

  console.log('🎉 Migration completed successfully!');
  console.log('\n📊 Summary:');
  console.log('  - Removed team1_id, team2_id, winner_team_id from t_matches_final');
  console.log('  - Removed team1_id, team2_id, winner_team_id from t_matches_live');
  console.log('  - Kept tournament_team_id fields intact');
  console.log('  - Recreated all indexes');

} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  client.close();
}
