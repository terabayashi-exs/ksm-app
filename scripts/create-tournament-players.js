const { createClient } = require('@libsql/client');
const fs = require('fs');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function createTable() {
  try {
    const sql = fs.readFileSync('scripts/create-tournament-players-table.sql', 'utf8');
    await client.execute(sql);
    console.log('✅ t_tournament_players テーブルを作成しました');
  } catch (error) {
    console.error('❌ テーブル作成エラー:', error);
  } finally {
    client.close();
  }
}

createTable();