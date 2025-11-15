// scripts/run-administrator-logo-migration.js
// 管理者ロゴ機能のデータベースマイグレーション実行（lib/db.tsを使用）

const { db } = require('../lib/db');

async function runMigration() {
  try {
    console.log('🚀 管理者ロゴ機能マイグレーション開始...');

    // 既存のテーブル構造を確認
    console.log('📋 現在のm_administratorsテーブル構造:');
    const currentTableInfo = await db.execute("PRAGMA table_info(m_administrators)");
    console.table(currentTableInfo.rows);

    // 新しいフィールドが既に存在するかチェック
    const hasLogoFields = currentTableInfo.rows.some(row => row.name === 'logo_blob_url');
    
    if (hasLogoFields) {
      console.log('✅ ロゴ関連フィールドは既に存在します。マイグレーションをスキップします。');
      return;
    }

    // フィールドを追加
    console.log('📝 logo_blob_urlフィールドを追加中...');
    await db.execute('ALTER TABLE m_administrators ADD COLUMN logo_blob_url TEXT');

    console.log('📝 logo_filenameフィールドを追加中...');
    await db.execute('ALTER TABLE m_administrators ADD COLUMN logo_filename TEXT');

    console.log('📝 organization_nameフィールドを追加中...');
    await db.execute('ALTER TABLE m_administrators ADD COLUMN organization_name TEXT');

    // インデックスを追加
    console.log('📊 インデックスを追加中...');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_administrators_logo_url ON m_administrators(logo_blob_url)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_administrators_organization ON m_administrators(organization_name)');

    // 更新後のテーブル構造を確認
    console.log('\n✅ マイグレーション完了。更新後のm_administratorsテーブル構造:');
    const updatedTableInfo = await db.execute("PRAGMA table_info(m_administrators)");
    console.table(updatedTableInfo.rows);

    // 既存データの確認
    const adminCount = await db.execute("SELECT COUNT(*) as count FROM m_administrators");
    console.log(`\n📊 既存管理者数: ${adminCount.rows[0].count}名`);

    console.log('\n🎉 管理者ロゴ機能のマイグレーションが正常に完了しました！');

  } catch (error) {
    console.error('❌ マイグレーション中にエラーが発生しました:', error);
    process.exit(1);
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