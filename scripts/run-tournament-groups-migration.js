const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
  console.log('🚀 大会グループ化機能のデータベース拡張を開始します...');

  const db = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    // SQLファイルを読み込む
    const sqlPath = path.join(__dirname, 'add-tournament-groups.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // SQLを個別のステートメントに分割
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    // 各ステートメントを実行
    for (const statement of statements) {
      console.log(`\n実行中: ${statement.substring(0, 50)}...`);
      try {
        await db.execute(statement);
        console.log('✅ 成功');
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('⏭️ スキップ（カラムは既に存在します）');
        } else if (error.message.includes('already exists')) {
          console.log('⏭️ スキップ（テーブルは既に存在します）');
        } else if (error.message.includes('no such table') && statement.includes('CREATE INDEX')) {
          console.log('⏭️ スキップ（インデックス作成時のエラー）');
        } else {
          throw error;
        }
      }
    }

    // テーブル作成の確認
    console.log('\n📊 テーブル作成の確認...');
    const tables = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='m_tournament_groups'
    `);
    
    if (tables.rows.length > 0) {
      console.log('✅ m_tournament_groups テーブルが正常に作成されました');
      
      // テーブル構造の確認
      const columns = await db.execute(`PRAGMA table_info(m_tournament_groups)`);
      console.log('\nカラム一覧:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.name} (${col.type})`);
      });
    }

    // t_tournamentsテーブルのカラム確認
    console.log('\n📊 t_tournamentsテーブルの拡張確認...');
    const tournamentColumns = await db.execute(`PRAGMA table_info(t_tournaments)`);
    const groupColumns = tournamentColumns.rows.filter(col => 
      ['group_id', 'group_order', 'category_name'].includes(col.name)
    );
    
    console.log('追加されたカラム:');
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
runMigration();