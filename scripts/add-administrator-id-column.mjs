// scripts/add-administrator-id-column.mjs
import { createClient } from '@libsql/client';

const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function addAdministratorIdColumn() {
  try {
    console.log('🔧 administrator_idカラムを追加中...\n');

    // 既存のデータを確認
    const existingData = await db.execute('SELECT * FROM m_administrators');
    console.log('既存データ:', existingData.rows);

    // 新しいテーブルを作成（SQLiteではALTER TABLEで主キーを変更できないため）
    console.log('\n📋 新しいテーブル構造を作成中...');
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_administrators_new (
        administrator_id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_login_id TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        logo_blob_url TEXT,
        logo_filename TEXT,
        organization_name TEXT
      )
    `);

    // データを移行
    console.log('\n📝 既存データを移行中...');
    await db.execute(`
      INSERT INTO m_administrators_new (admin_login_id, password_hash, email, created_at, updated_at, logo_blob_url, logo_filename, organization_name)
      SELECT admin_login_id, password_hash, email, created_at, updated_at, logo_blob_url, logo_filename, organization_name
      FROM m_administrators
    `);

    // 古いテーブルを削除し、新しいテーブルをリネーム
    console.log('\n🔄 テーブルを置き換え中...');
    await db.execute('DROP TABLE m_administrators');
    await db.execute('ALTER TABLE m_administrators_new RENAME TO m_administrators');

    // 結果を確認
    console.log('\n✅ 更新後のテーブル構造:');
    const newTableInfo = await db.execute("PRAGMA table_info(m_administrators)");
    console.table(newTableInfo.rows);

    console.log('\n✅ 更新後のデータ:');
    const newData = await db.execute('SELECT * FROM m_administrators');
    console.table(newData.rows);

    console.log('\n🎉 administrator_idカラムの追加が完了しました！');
    console.log('adminユーザーでログインできるようになりました。');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

addAdministratorIdColumn();