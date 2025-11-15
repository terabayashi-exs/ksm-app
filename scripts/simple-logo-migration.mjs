// scripts/simple-logo-migration.mjs
// 管理者ロゴ機能のシンプルマイグレーション

import { createClient } from '@libsql/client';

const FALLBACK_CONFIG = {
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
};

async function runMigration() {
  const db = createClient(FALLBACK_CONFIG);

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
  } finally {
    db.close();
  }
}

runMigration();