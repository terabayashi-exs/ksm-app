const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

async function addGroupIdColumn() {
  console.log('🚀 group_idカラムの追加を開始します...');

  const db = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    // group_idカラムの追加
    console.log('\n📊 t_tournamentsテーブルにgroup_idカラムを追加中...');
    try {
      await db.execute(`ALTER TABLE t_tournaments ADD COLUMN group_id INTEGER`);
      console.log('✅ group_idカラムが追加されました');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('⏭️ group_idカラムは既に存在します');
      } else {
        throw error;
      }
    }

    // インデックス作成
    console.log('\n📊 インデックスを作成中...');
    try {
      await db.execute(`CREATE INDEX idx_tournaments_group_id ON t_tournaments(group_id)`);
      console.log('✅ idx_tournaments_group_id インデックスが作成されました');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⏭️ idx_tournaments_group_id インデックスは既に存在します');
      } else {
        throw error;
      }
    }
    
    try {
      await db.execute(`CREATE INDEX idx_tournament_groups_display_order ON m_tournament_groups(display_order)`);
      console.log('✅ idx_tournament_groups_display_order インデックスが作成されました');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⏭️ idx_tournament_groups_display_order インデックスは既に存在します');
      } else {
        throw error;
      }
    }

    // テーブル構造の確認
    console.log('\n📊 データベース構造の確認...');
    
    // m_tournament_groupsの確認
    const groupsTable = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='m_tournament_groups'
    `);
    
    if (groupsTable.rows.length > 0) {
      const columns = await db.execute(`PRAGMA table_info(m_tournament_groups)`);
      console.log('\nm_tournament_groups カラム一覧:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.name} (${col.type})`);
      });
    }

    // t_tournamentsの確認
    console.log('\n📊 t_tournamentsテーブルのグループ関連カラム:');
    const tournamentColumns = await db.execute(`PRAGMA table_info(t_tournaments)`);
    const groupColumns = tournamentColumns.rows.filter(col => 
      ['group_id', 'group_order', 'category_name'].includes(col.name)
    );
    
    groupColumns.forEach(col => {
      console.log(`  - ${col.name} (${col.type})`);
    });

    console.log('\n✨ データベース拡張が完了しました！');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
addGroupIdColumn();