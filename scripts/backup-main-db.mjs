import { createClient } from '@libsql/client';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 本番用データベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

const prodDb = createClient({
  url: PROD_DB_URL,
  authToken: PROD_DB_AUTH_TOKEN
});

console.log('=== ksm-main データベースバックアップ ===\n');

const TABLE_ORDER = [
  'm_venues',
  'm_sport_types',
  'm_administrators',
  'm_subscription_plans',
  'm_tournament_formats',
  'm_match_templates',
  'm_teams',
  'm_players',
  't_tournament_groups',
  't_tournaments',
  't_match_blocks',
  't_matches_live',
  't_matches_final',
  't_match_status',
  't_tournament_teams',
  't_tournament_players',
  't_tournament_notifications',
  't_tournament_rules',
  't_archived_tournament_json',
  't_tournament_files',
  't_administrator_subscriptions',
  't_subscription_usage',
  't_payment_history'
];

async function backupDatabase() {
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      database: 'ksm-main',
      tables: {}
    };

    console.log('バックアップ開始時刻:', backup.timestamp, '\n');

    for (const tableName of TABLE_ORDER) {
      try {
        // スキーマ取得
        const schemaResult = await prodDb.execute(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
          [tableName]
        );

        if (schemaResult.rows.length === 0) {
          console.log(`  ⚠️  ${tableName}: テーブルが存在しません`);
          continue;
        }

        // データ取得
        const dataResult = await prodDb.execute(`SELECT * FROM ${tableName}`);

        // インデックス取得
        const indexResult = await prodDb.execute(
          `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`,
          [tableName]
        );

        backup.tables[tableName] = {
          schema: schemaResult.rows[0].sql,
          data: dataResult.rows,
          indexes: indexResult.rows.map(row => row.sql),
          count: dataResult.rows.length
        };

        console.log(`  ✓ ${tableName}: ${dataResult.rows.length} 件バックアップ完了`);

      } catch (error) {
        console.log(`  ✗ ${tableName}: バックアップエラー -`, error.message);
      }
    }

    // バックアップファイル保存
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = join(__dirname, `../data/backup-ksm-main-${timestamp}.json`);

    writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8');

    console.log('\n=== バックアップ完了 ===');
    console.log('保存先:', backupPath);
    console.log('総テーブル数:', Object.keys(backup.tables).length);

    const totalRecords = Object.values(backup.tables).reduce((sum, table) => sum + table.count, 0);
    console.log('総レコード数:', totalRecords);

    return backupPath;

  } catch (error) {
    console.error('\nバックアップエラー:', error);
    process.exit(1);
  }
}

backupDatabase();
