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

// 本番用データベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

const prodDb = createClient({
  url: PROD_DB_URL,
  authToken: PROD_DB_AUTH_TOKEN
});

console.log('=== m_administrators テーブル同期 ===\n');

async function syncAdministrators() {
  try {
    // 開発DBから管理者データを取得
    console.log('【ステップ1】開発用DBから管理者データを取得\n');
    const devAdmins = await devDb.execute('SELECT * FROM m_administrators');
    console.log(`  取得件数: ${devAdmins.rows.length} 件\n`);

    if (devAdmins.rows.length === 0) {
      console.log('  同期するデータがありません。');
      return;
    }

    // データの詳細表示
    devAdmins.rows.forEach((admin, index) => {
      console.log(`  [${index + 1}] ${admin.admin_login_id} (${admin.organization_name || '組織名なし'})`);
    });

    // 本番DBの既存データを確認
    console.log('\n【ステップ2】本番用DBの既存データを確認\n');
    const prodAdmins = await prodDb.execute('SELECT * FROM m_administrators');
    console.log(`  既存件数: ${prodAdmins.rows.length} 件\n`);

    // 外部キー制約を一時的に無効化
    console.log('【ステップ3】外部キー制約を無効化\n');
    await prodDb.execute('PRAGMA foreign_keys = OFF');
    console.log('  ✓ 外部キー制約無効化完了\n');

    // 本番DBにデータを追加
    console.log('【ステップ4】管理者データをインポート\n');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const admin of devAdmins.rows) {
      try {
        // 既に存在するかチェック
        const existing = await prodDb.execute(
          'SELECT administrator_id FROM m_administrators WHERE admin_login_id = ?',
          [admin.admin_login_id]
        );

        if (existing.rows.length > 0) {
          console.log(`  ⊘ ${admin.admin_login_id}: 既に存在（スキップ）`);
          skipCount++;
          continue;
        }

        // カラム名を取得
        const columns = Object.keys(admin);
        const values = Object.values(admin);
        const placeholders = columns.map(() => '?').join(', ');

        // INSERT実行
        const insertSql = `INSERT INTO m_administrators (${columns.join(', ')}) VALUES (${placeholders})`;
        await prodDb.execute(insertSql, values);

        console.log(`  ✓ ${admin.admin_login_id}: インポート成功`);
        successCount++;

      } catch (error) {
        console.log(`  ✗ ${admin.admin_login_id}: エラー - ${error.message}`);
        errorCount++;
      }
    }

    // 外部キー制約を再度有効化
    console.log('\n【ステップ5】外部キー制約を再度有効化\n');
    await prodDb.execute('PRAGMA foreign_keys = ON');
    console.log('  ✓ 外部キー制約有効化完了\n');

    // 結果サマリー
    console.log('=== 同期結果 ===');
    console.log(`  成功: ${successCount} 件`);
    console.log(`  スキップ: ${skipCount} 件`);
    console.log(`  エラー: ${errorCount} 件`);
    console.log(`  合計: ${devAdmins.rows.length} 件\n`);

    // 本番DBの最終状態を確認
    console.log('【最終確認】本番用DBの管理者データ\n');
    const finalAdmins = await prodDb.execute('SELECT admin_login_id, organization_name, created_at FROM m_administrators ORDER BY created_at');
    console.log(`  総件数: ${finalAdmins.rows.length} 件\n`);
    finalAdmins.rows.forEach((admin, index) => {
      console.log(`  [${index + 1}] ${admin.admin_login_id} (${admin.organization_name || '組織名なし'})`);
    });

    console.log('\n=== 同期完了 ===');

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

syncAdministrators();
