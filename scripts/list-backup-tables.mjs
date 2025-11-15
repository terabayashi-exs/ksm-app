import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function listBackupTables() {
  try {
    console.log('=== バックアップテーブル一覧 ===\n');

    // sqlite_masterからバックアップテーブルを検索
    const result = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      AND name LIKE '%backup%' 
      AND name LIKE '%tournaments%'
      ORDER BY name
    `);
    
    console.log('見つかったバックアップテーブル:');
    for (const row of result.rows) {
      console.log(`- ${row.name}`);
    }

    // t_tournamentsテーブルの存在確認
    console.log('\n現在のt_tournamentsテーブルの状態:');
    const tournamentsCheck = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournaments WHERE tournament_id = 9
    `);
    console.log(`大会ID:9のレコード数: ${tournamentsCheck.rows[0].count}`);

    // 全ての大会IDを確認
    const allTournaments = await db.execute(`
      SELECT tournament_id, tournament_name FROM t_tournaments ORDER BY tournament_id
    `);
    console.log('\n全大会一覧:');
    for (const row of allTournaments.rows) {
      console.log(`- ID: ${row.tournament_id}, 名前: ${row.tournament_name}`);
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

listBackupTables();