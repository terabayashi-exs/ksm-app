const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

async function createGroupsTable() {
  console.log('🚀 m_tournament_groupsテーブルの作成を開始します...');

  const db = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    // テーブル作成
    console.log('\n📊 m_tournament_groupsテーブルを作成中...');
    await db.execute(`
      CREATE TABLE m_tournament_groups (
        group_id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name TEXT NOT NULL,
        group_description TEXT,
        group_color TEXT DEFAULT '#3B82F6',
        display_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
      )
    `);
    console.log('✅ m_tournament_groupsテーブルが作成されました');

    // インデックス作成
    console.log('\n📊 インデックスを作成中...');
    await db.execute(`CREATE INDEX idx_tournaments_group_id ON t_tournaments(group_id)`);
    console.log('✅ idx_tournaments_group_id インデックスが作成されました');
    
    await db.execute(`CREATE INDEX idx_tournament_groups_display_order ON m_tournament_groups(display_order)`);
    console.log('✅ idx_tournament_groups_display_order インデックスが作成されました');

    // テーブル構造の確認
    console.log('\n📊 作成されたテーブル構造の確認...');
    const columns = await db.execute(`PRAGMA table_info(m_tournament_groups)`);
    console.log('m_tournament_groups カラム一覧:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.name} (${col.type})`);
    });

    // t_tournamentsの確認
    console.log('\n📊 t_tournamentsテーブルの拡張確認...');
    const tournamentColumns = await db.execute(`PRAGMA table_info(t_tournaments)`);
    const groupColumns = tournamentColumns.rows.filter(col => 
      ['group_id', 'group_order', 'category_name'].includes(col.name)
    );
    
    console.log('グループ関連カラム:');
    groupColumns.forEach(col => {
      console.log(`  - ${col.name} (${col.type})`);
    });

    console.log('\n✨ テーブル作成が完了しました！');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
createGroupsTable();