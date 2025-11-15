import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
const envPath = join(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;

  const equalIndex = trimmed.indexOf('=');
  if (equalIndex === -1) return;

  const key = trimmed.substring(0, equalIndex).trim();
  let value = trimmed.substring(equalIndex + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  envVars[key] = value;
});

// 開発用データベース接続
const devDb = createClient({
  url: envVars.DATABASE_URL,
  authToken: envVars.DATABASE_AUTH_TOKEN
});

// 本番用データベース接続情報（コメントアウトされている本番用の情報を使用）
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

const prodDb = createClient({
  url: PROD_DB_URL,
  authToken: PROD_DB_AUTH_TOKEN
});

console.log('=== データベース同期スクリプト: ksm-dev → ksm-main ===\n');

// テーブルの依存関係順序（外部キー制約を考慮）
const TABLE_ORDER = [
  // マスターテーブル（依存関係なし）
  'm_venues',
  'm_sport_types',
  'm_administrators',
  'm_subscription_plans',
  'm_tournament_formats',
  'm_match_templates',
  'm_teams',
  'm_players',

  // トランザクションテーブル（依存関係あり）
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

async function getTableSchema(db, tableName) {
  try {
    const result = await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [tableName]);
    if (result.rows.length === 0) {
      console.log(`  ⚠️  テーブル ${tableName} が存在しません（スキップ）`);
      return null;
    }
    return result.rows[0].sql;
  } catch (error) {
    console.log(`  ⚠️  テーブル ${tableName} のスキーマ取得エラー:`, error.message);
    return null;
  }
}

async function getTableData(db, tableName) {
  try {
    const result = await db.execute(`SELECT * FROM ${tableName}`);
    return result.rows;
  } catch (error) {
    console.log(`  ⚠️  テーブル ${tableName} のデータ取得エラー:`, error.message);
    return [];
  }
}

async function getAllIndexes(db, tableName) {
  try {
    const result = await db.execute(
      `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`,
      [tableName]
    );
    return result.rows.map(row => row.sql);
  } catch (error) {
    console.log(`  ⚠️  テーブル ${tableName} のインデックス取得エラー:`, error.message);
    return [];
  }
}

async function syncDatabase() {
  try {
    console.log('【ステップ1】開発用データベース（ksm-dev）からデータ取得\n');

    const tableSchemas = {};
    const tableData = {};
    const tableIndexes = {};

    for (const tableName of TABLE_ORDER) {
      console.log(`  ${tableName} を処理中...`);

      const schema = await getTableSchema(devDb, tableName);
      if (!schema) continue;

      const data = await getTableData(devDb, tableName);
      const indexes = await getAllIndexes(devDb, tableName);

      tableSchemas[tableName] = schema;
      tableData[tableName] = data;
      tableIndexes[tableName] = indexes;

      console.log(`    ✓ スキーマ取得完了`);
      console.log(`    ✓ データ ${data.length} 件取得`);
      console.log(`    ✓ インデックス ${indexes.length} 件取得`);
    }

    console.log('\n【ステップ2】本番用データベース（ksm-main）の全テーブル削除\n');

    // 外部キー制約を一時的に無効化
    await prodDb.execute('PRAGMA foreign_keys = OFF');
    console.log('  ✓ 外部キー制約を無効化');

    // 既存テーブルを逆順で削除（外部キー制約対応）
    const reversedOrder = [...TABLE_ORDER].reverse();
    for (const tableName of reversedOrder) {
      try {
        await prodDb.execute(`DROP TABLE IF EXISTS ${tableName}`);
        console.log(`  ✓ ${tableName} 削除完了`);
      } catch (error) {
        console.log(`  ⚠️  ${tableName} 削除エラー:`, error.message);
      }
    }

    console.log('\n【ステップ3】スキーマの再作成\n');

    for (const tableName of TABLE_ORDER) {
      if (!tableSchemas[tableName]) continue;

      try {
        await prodDb.execute(tableSchemas[tableName]);
        console.log(`  ✓ ${tableName} スキーマ作成完了`);
      } catch (error) {
        console.log(`  ✗ ${tableName} スキーマ作成エラー:`, error.message);
      }
    }

    console.log('\n【ステップ4】データのインポート\n');

    for (const tableName of TABLE_ORDER) {
      if (!tableData[tableName] || tableData[tableName].length === 0) {
        console.log(`  - ${tableName}: データなし（スキップ）`);
        continue;
      }

      const rows = tableData[tableName];
      console.log(`  ${tableName}: ${rows.length} 件をインポート中...`);

      try {
        for (const row of rows) {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = columns.map(() => '?').join(', ');

          const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
          await prodDb.execute(insertSql, values);
        }
        console.log(`    ✓ ${rows.length} 件インポート完了`);
      } catch (error) {
        console.log(`    ✗ インポートエラー:`, error.message);
      }
    }

    console.log('\n【ステップ5】インデックスの再作成\n');

    for (const tableName of TABLE_ORDER) {
      if (!tableIndexes[tableName] || tableIndexes[tableName].length === 0) continue;

      console.log(`  ${tableName}: ${tableIndexes[tableName].length} 件のインデックスを作成中...`);

      for (const indexSql of tableIndexes[tableName]) {
        try {
          await prodDb.execute(indexSql);
        } catch (error) {
          console.log(`    ⚠️  インデックス作成エラー:`, error.message);
        }
      }
      console.log(`    ✓ インデックス作成完了`);
    }

    // 外部キー制約を再度有効化
    await prodDb.execute('PRAGMA foreign_keys = ON');
    console.log('\n  ✓ 外部キー制約を再度有効化');

    console.log('\n【ステップ6】整合性チェック\n');

    for (const tableName of TABLE_ORDER) {
      if (!tableData[tableName]) continue;

      const devCount = tableData[tableName].length;
      const prodResult = await prodDb.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
      const prodCount = Number(prodResult.rows[0].count);

      if (devCount === prodCount) {
        console.log(`  ✓ ${tableName}: ${prodCount} 件（一致）`);
      } else {
        console.log(`  ✗ ${tableName}: 開発=${devCount} 件、本番=${prodCount} 件（不一致）`);
      }
    }

    console.log('\n=== データベース同期完了 ===');

  } catch (error) {
    console.error('\n同期エラー:', error);
    // エラー時も外部キー制約を再度有効化
    try {
      await prodDb.execute('PRAGMA foreign_keys = ON');
    } catch (fkError) {
      console.error('外部キー制約の再有効化に失敗しました:', fkError);
    }
    process.exit(1);
  }
}

// 確認プロンプト
console.log('⚠️  警告: この操作は本番データベース（ksm-main）の全データを削除します！');
console.log('本番データベース: ' + PROD_DB_URL);
console.log('\n5秒後に同期を開始します...');
console.log('中止する場合は Ctrl+C を押してください。\n');

setTimeout(() => {
  syncDatabase();
}, 5000);
