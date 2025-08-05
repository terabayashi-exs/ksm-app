const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

async function checkTournamentSchema() {
  console.log('📋 t_tournaments テーブルの構造を確認中...\n');

  const client = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    // t_tournaments テーブルの構造確認
    const result = await client.execute('PRAGMA table_info(t_tournaments)');
    
    console.log('🔍 t_tournaments テーブルのカラム情報:');
    console.log('=' .repeat(80));
    console.log('Index | Name                    | Type      | NotNull | Default  | PK');
    console.log('-'.repeat(80));
    
    result.rows.forEach((row) => {
      console.log(`${String(row.cid).padEnd(5)} | ${String(row.name).padEnd(23)} | ${String(row.type).padEnd(9)} | ${String(row.notnull).padEnd(7)} | ${String(row.dflt_value || 'NULL').padEnd(8)} | ${row.pk}`);
    });

    // 実際のデータサンプルも確認
    console.log('\n📊 t_tournaments の実際のデータサンプル:');
    console.log('=' .repeat(80));
    
    const data = await client.execute('SELECT * FROM t_tournaments LIMIT 1');
    if (data.rows.length > 0) {
      const tournament = data.rows[0];
      Object.keys(tournament).forEach(key => {
        console.log(`${key}: ${tournament[key]}`);
      });
    } else {
      console.log('データが見つかりません');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
  } finally {
    client.close();
  }
}

checkTournamentSchema();