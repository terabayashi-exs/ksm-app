const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  // コメント行または空行をスキップ
  if (!trimmed || trimmed.startsWith('#')) {
    return;
  }

  const equalIndex = trimmed.indexOf('=');
  if (equalIndex === -1) {
    return;
  }

  const key = trimmed.substring(0, equalIndex).trim();
  let value = trimmed.substring(equalIndex + 1).trim();

  // クォートを除去
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  envVars[key] = value;
});

console.log('DATABASE_URL:', envVars.DATABASE_URL ? '設定済み' : '未設定');
console.log('DATABASE_AUTH_TOKEN:', envVars.DATABASE_AUTH_TOKEN ? '設定済み' : '未設定');

if (!envVars.DATABASE_URL || !envVars.DATABASE_AUTH_TOKEN) {
  console.error('エラー: DATABASE_URLまたはDATABASE_AUTH_TOKENが.env.localに設定されていません');
  process.exit(1);
}

const db = createClient({
  url: envVars.DATABASE_URL,
  authToken: envVars.DATABASE_AUTH_TOKEN
});

async function executeSqlStatements(sql) {
  // SQLステートメントを分割（セミコロンで区切る、ただしコメントや文字列内は除外）
  const statements = [];
  let current = '';
  let inString = false;
  let inComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    // コメント処理
    if (!inString && char === '-' && nextChar === '-') {
      inComment = true;
      i++;
      continue;
    }

    if (inComment && char === '\n') {
      inComment = false;
      continue;
    }

    if (inComment) {
      continue;
    }

    // 文字列リテラル処理
    if (char === "'" && sql[i - 1] !== '\\') {
      inString = !inString;
    }

    current += char;

    // ステートメント終了
    if (!inString && char === ';') {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith('--')) {
        statements.push(trimmed);
      }
      current = '';
    }
  }

  // 最後のステートメント
  if (current.trim() && !current.trim().startsWith('--')) {
    statements.push(current.trim());
  }

  return statements;
}

async function migrateSubscriptionTables() {
  try {
    console.log('=== サブスクリプション関連テーブルの作成開始 ===\n');

    // SQLファイルの読み込み
    const sqlPath = path.join(__dirname, 'add-subscription-tables.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    // SQLステートメントを分割
    const statements = await executeSqlStatements(sqlContent);

    console.log(`実行するSQLステートメント数: ${statements.length}\n`);

    // 各ステートメントを順次実行
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // SELECTステートメント（メッセージ表示用）
      if (statement.toUpperCase().startsWith('SELECT')) {
        try {
          const result = await db.execute(statement);
          if (result.rows && result.rows.length > 0) {
            console.log(`✓ ${result.rows[0].message || result.rows[0].total_plans || result.rows[0].total_subscriptions || result.rows[0].total_usage_records}`);
          }
        } catch (error) {
          // SELECTのエラーは無視（情報表示のみのため）
          continue;
        }
        continue;
      }

      // その他のステートメント
      try {
        // CREATE TABLEの場合
        if (statement.toUpperCase().includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          await db.execute(statement);
          console.log(`✓ テーブル作成: ${tableName}`);
        }
        // CREATE INDEXの場合
        else if (statement.toUpperCase().includes('CREATE INDEX')) {
          const indexName = statement.match(/CREATE INDEX (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          await db.execute(statement);
          console.log(`✓ インデックス作成: ${indexName}`);
        }
        // ALTER TABLEの場合
        else if (statement.toUpperCase().includes('ALTER TABLE')) {
          const tableName = statement.match(/ALTER TABLE (\w+)/i)?.[1];
          const columnName = statement.match(/ADD COLUMN (\w+)/i)?.[1];

          try {
            await db.execute(statement);
            console.log(`✓ カラム追加: ${tableName}.${columnName}`);
          } catch (error) {
            // カラムが既に存在する場合はエラーを無視
            if (error.message && error.message.includes('duplicate column')) {
              console.log(`⚠ カラム既存: ${tableName}.${columnName}（スキップ）`);
            } else {
              throw error;
            }
          }
        }
        // INSERTの場合
        else if (statement.toUpperCase().includes('INSERT INTO')) {
          const tableName = statement.match(/INSERT INTO (\w+)/i)?.[1];
          await db.execute(statement);
          console.log(`✓ データ挿入: ${tableName}`);
        }
        // UPDATEの場合
        else if (statement.toUpperCase().includes('UPDATE')) {
          const tableName = statement.match(/UPDATE (\w+)/i)?.[1];
          const result = await db.execute(statement);
          console.log(`✓ データ更新: ${tableName} (${result.rowsAffected || 0}件)`);
        }
        // その他
        else {
          await db.execute(statement);
          console.log(`✓ 実行完了`);
        }
      } catch (error) {
        console.error(`✗ エラー:`, error.message);
        console.error(`ステートメント: ${statement.substring(0, 100)}...`);
        // 致命的でないエラーは続行
        if (!error.message.includes('duplicate') && !error.message.includes('already exists')) {
          throw error;
        }
      }
    }

    console.log('\n=== マイグレーション完了 ===\n');

    // 作成結果の確認
    console.log('【作成されたテーブルの確認】');

    const tables = [
      'm_subscription_plans',
      't_administrator_subscriptions',
      't_subscription_usage',
      't_payment_history'
    ];

    for (const table of tables) {
      try {
        const result = await db.execute(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`${table}: ${result.rows[0].count}件`);
      } catch (error) {
        console.log(`${table}: エラー - ${error.message}`);
      }
    }

    console.log('\n【プランマスター確認】');
    const plans = await db.execute('SELECT plan_code, plan_name, monthly_price, max_tournaments, total_max_divisions FROM m_subscription_plans ORDER BY display_order');
    plans.rows.forEach(plan => {
      console.log(`- ${plan.plan_name} (${plan.plan_code}): ¥${plan.monthly_price}/月, 大会${plan.max_tournaments}件, 部門${plan.total_max_divisions}件`);
    });

  } catch (error) {
    console.error('マイグレーションエラー:', error);
    process.exit(1);
  }
}

migrateSubscriptionTables();
