const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkColumns() {
  try {
    // t_matches_finalテーブルの構造を確認
    const schema = await client.execute(`PRAGMA table_info(t_matches_final);`);
    
    console.log('=== t_matches_final テーブル構造 ===');
    schema.rows.forEach(column => {
      console.log(`${column.name}: ${column.type}`);
    });
    
    // サンプルデータを確認
    const sample = await client.execute(`
      SELECT * FROM t_matches_final LIMIT 3
    `);
    
    console.log('\n=== サンプルデータ ===');
    if (sample.rows.length > 0) {
      console.log('列名:', sample.columns);
      sample.rows.forEach((row, idx) => {
        console.log(`行${idx + 1}:`, row);
      });
    } else {
      console.log('データがありません');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    client.close();
  }
}

checkColumns();