// scripts/migrate-administrator-logo.js
// 管理者ロゴ機能のデータベースマイグレーション実行スクリプト

const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

// 環境変数から接続情報を取得
const databaseUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!databaseUrl || !authToken) {
  console.error('❌ DATABASE_URL and DATABASE_AUTH_TOKEN must be set');
  process.exit(1);
}

async function runMigration() {
  const db = createClient({
    url: databaseUrl,
    authToken: authToken,
  });

  try {
    console.log('🚀 管理者ロゴ機能マイグレーション開始...');

    // SQLファイルを読み込み
    const sqlPath = path.join(__dirname, 'add-administrator-logo-fields.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // SQLを分割して実行
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      const trimmedStatement = statement.trim();
      if (trimmedStatement) {
        console.log(`📝 実行中: ${trimmedStatement.substring(0, 50)}...`);
        await db.execute(trimmedStatement);
      }
    }

    // 現在のテーブル構造を確認
    console.log('\n✅ マイグレーション完了。現在のm_administratorsテーブル構造:');
    const tableInfo = await db.execute("PRAGMA table_info(m_administrators)");
    console.table(tableInfo.rows);

    // 既存データの確認
    const adminCount = await db.execute("SELECT COUNT(*) as count FROM m_administrators");
    console.log(`\n📊 既存管理者数: ${adminCount.rows[0].count}名`);

    console.log('\n🎉 管理者ロゴ機能のマイグレーションが正常に完了しました！');

  } catch (error) {
    console.error('❌ マイグレーション中にエラーが発生しました:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 実行確認
if (require.main === module) {
  console.log('⚠️  このスクリプトはm_administratorsテーブルに新しいフィールドを追加します。');
  console.log('   本番環境の場合は事前にバックアップを取ってください。');
  console.log('\n続行しますか? (y/N): ');
  
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', (data) => {
    const input = data.toString().trim().toLowerCase();
    if (input === 'y' || input === 'yes') {
      runMigration();
    } else {
      console.log('❌ マイグレーションがキャンセルされました。');
      process.exit(0);
    }
  });
} else {
  module.exports = { runMigration };
}