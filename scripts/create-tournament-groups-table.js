// scripts/create-tournament-groups-table.js
// t_tournament_groups テーブルを作成するスクリプト

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function createTournamentGroupsTable() {
  try {
    console.log('🚀 t_tournament_groups テーブルを作成します...\n');

    // テーブルの存在確認
    const checkTableResult = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='t_tournament_groups'
    `);

    if (checkTableResult.rows.length > 0) {
      console.log('ℹ️  テーブルは既に存在します。');
      return;
    }

    // テーブル作成
    await db.execute(`
      CREATE TABLE t_tournament_groups (
        group_id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name TEXT NOT NULL,
        organizer TEXT,
        venue_id INTEGER,
        event_start_date TEXT,
        event_end_date TEXT,
        recruitment_start_date TEXT,
        recruitment_end_date TEXT,
        visibility TEXT DEFAULT 'open',
        event_description TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (venue_id) REFERENCES m_venues(venue_id)
      )
    `);

    console.log('✅ t_tournament_groups テーブルを作成しました');

    // インデックス作成
    await db.execute(`
      CREATE INDEX idx_tournament_groups_venue ON t_tournament_groups(venue_id)
    `);

    console.log('✅ インデックスを作成しました');

    // t_tournaments テーブルに group_id カラムが存在するか確認
    const columnsResult = await db.execute(`
      PRAGMA table_info(t_tournaments)
    `);

    const hasGroupId = columnsResult.rows.some(row => row.name === 'group_id');

    if (!hasGroupId) {
      console.log('\nℹ️  t_tournaments テーブルに group_id カラムを追加します...');

      await db.execute(`
        ALTER TABLE t_tournaments ADD COLUMN group_id INTEGER REFERENCES t_tournament_groups(group_id)
      `);

      console.log('✅ group_id カラムを追加しました');

      // インデックス作成
      await db.execute(`
        CREATE INDEX idx_tournaments_group ON t_tournaments(group_id)
      `);

      console.log('✅ インデックスを作成しました');
    } else {
      console.log('\nℹ️  group_id カラムは既に存在します');
    }

    console.log('\n✅ 全ての作業が完了しました！');
    console.log('\n📝 次のステップ:');
    console.log('   node scripts/analyze-tournament-groups.js');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

createTournamentGroupsTable();
