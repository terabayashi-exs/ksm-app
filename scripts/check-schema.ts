import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL_STAG!,
  authToken: process.env.DATABASE_AUTH_TOKEN_STAG,
});

async function checkSchema() {
  try {
    // テーブル一覧を取得
    const tables = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      args: [],
    });

    console.log('=== テーブル一覧 ===');
    tables.rows.forEach((row) => {
      console.log(row.name);
    });

    // t_tournament_groupsのスキーマを確認
    console.log('\n=== t_tournament_groups のスキーマ ===');
    const groupSchema = await db.execute({
      sql: `PRAGMA table_info(t_tournament_groups)`,
      args: [],
    });
    groupSchema.rows.forEach((row) => {
      console.log(`${row.name} (${row.type})`);
    });

    // ユーザー関連のテーブルを確認
    console.log('\n=== ユーザー関連テーブルの検索 ===');
    const userTables = tables.rows.filter((row: any) =>
      row.name.toLowerCase().includes('user') ||
      row.name.toLowerCase().includes('admin') ||
      row.name.toLowerCase().includes('login')
    );
    userTables.forEach((row: any) => {
      console.log(row.name);
    });

    // group_id=23の大会を確認
    console.log('\n=== group_id=23 の大会情報 ===');
    const group = await db.execute({
      sql: 'SELECT * FROM t_tournament_groups WHERE group_id = ?',
      args: [23],
    });

    if (group.rows.length > 0) {
      console.log(JSON.stringify(group.rows[0], null, 2));
    } else {
      console.log('group_id=23の大会が見つかりません');
    }

  } catch (error) {
    console.error('エラー:', error);
  }
}

checkSchema().catch(console.error);
