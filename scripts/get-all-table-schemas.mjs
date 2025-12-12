import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

(async () => {
  console.log('=== データベーステーブル一覧とスキーマ ===\n');

  // テーブル一覧を取得
  const tables = await db.execute(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    ORDER BY name
  `);

  for (const table of tables.rows) {
    const tableName = table.name;
    console.log(`\n## ${tableName}`);
    console.log('```sql');

    // テーブルのスキーマを取得
    const schema = await db.execute(`SELECT sql FROM sqlite_master WHERE name = ?`, [tableName]);
    if (schema.rows[0]?.sql) {
      console.log(schema.rows[0].sql);
    }

    console.log('```');

    // レコード数を取得
    const count = await db.execute(`SELECT COUNT(*) as cnt FROM ${tableName}`);
    console.log(`レコード数: ${count.rows[0].cnt}`);
  }
})();
