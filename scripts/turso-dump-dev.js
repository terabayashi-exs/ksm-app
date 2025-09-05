const { createClient } = require('@libsql/client');
const fs = require('fs').promises;
const path = require('path');

// 開発環境のデータベース接続情報
const DEV_DB_URL = "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io";
const DEV_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA";

async function dumpDatabase() {
  const client = createClient({
    url: DEV_DB_URL,
    authToken: DEV_DB_TOKEN
  });

  try {
    console.log('開発環境のデータベースに接続中...');

    // データベース内の全テーブルを取得
    const tables = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%' 
      AND name NOT LIKE '_litestream_%'
      ORDER BY name
    `);

    const dumpData = {
      timestamp: new Date().toISOString(),
      source: 'ksm-dev',
      tables: {}
    };

    console.log(`\n${tables.rows.length}個のテーブルが見つかりました。`);

    // 各テーブルのデータを取得
    for (const table of tables.rows) {
      const tableName = table.name;
      console.log(`\nテーブル: ${tableName}`);

      // テーブル構造を取得
      const schema = await client.execute(`SELECT sql FROM sqlite_master WHERE name = '${tableName}'`);
      
      // テーブルのデータを取得
      const data = await client.execute(`SELECT * FROM ${tableName}`);
      
      dumpData.tables[tableName] = {
        schema: schema.rows[0].sql,
        rowCount: data.rows.length,
        data: data.rows
      };

      console.log(`  - ${data.rows.length}行のデータを取得しました`);
    }

    // ダンプファイルを保存
    const dumpPath = path.join(__dirname, `../data/dump-dev-${new Date().toISOString().split('T')[0]}.json`);
    await fs.writeFile(dumpPath, JSON.stringify(dumpData, null, 2));

    console.log(`\n✅ ダンプファイルを保存しました: ${dumpPath}`);
    console.log(`ファイルサイズ: ${(await fs.stat(dumpPath)).size / 1024 / 1024} MB`);

    // 重要なテーブルの統計情報を表示
    console.log('\n=== データベース統計情報 ===');
    const importantTables = ['t_tournaments', 't_tournament_teams', 't_matches_live', 't_matches_final'];
    for (const tableName of importantTables) {
      if (dumpData.tables[tableName]) {
        console.log(`${tableName}: ${dumpData.tables[tableName].rowCount}行`);
      }
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
console.log('=== Turso開発環境データベースダンプツール ===\n');
dumpDatabase().catch(console.error);