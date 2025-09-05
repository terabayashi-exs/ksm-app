const { createClient } = require('@libsql/client');
const fs = require('fs').promises;
const path = require('path');

// 本番環境のデータベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

async function backupDatabase() {
  const client = createClient({
    url: PROD_DB_URL,
    authToken: PROD_DB_TOKEN
  });

  try {
    console.log('本番環境のデータベースに接続中...');

    // データベース内の全テーブルを取得
    const tables = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%' 
      AND name NOT LIKE '_litestream_%'
      ORDER BY name
    `);

    const backupData = {
      timestamp: new Date().toISOString(),
      source: 'ksm-main',
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
      
      backupData.tables[tableName] = {
        schema: schema.rows[0].sql,
        rowCount: data.rows.length,
        data: data.rows
      };

      console.log(`  - ${data.rows.length}行のデータを取得しました`);
    }

    // バックアップファイルを保存
    const backupPath = path.join(__dirname, `../data/backup-prod-${new Date().toISOString().split('T')[0]}.json`);
    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));

    console.log(`\n✅ バックアップファイルを保存しました: ${backupPath}`);
    console.log(`ファイルサイズ: ${(await fs.stat(backupPath)).size / 1024 / 1024} MB`);

    // 重要なテーブルの統計情報を表示
    console.log('\n=== データベース統計情報 ===');
    const importantTables = ['t_tournaments', 't_tournament_teams', 't_matches_live', 't_matches_final'];
    for (const tableName of importantTables) {
      if (backupData.tables[tableName]) {
        console.log(`${tableName}: ${backupData.tables[tableName].rowCount}行`);
      }
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
console.log('=== Turso本番環境データベースバックアップツール ===\n');
console.log('⚠️  警告: これは本番環境のバックアップです。');
console.log('バックアップを作成してから、データベースの変更を行ってください。\n');
backupDatabase().catch(console.error);