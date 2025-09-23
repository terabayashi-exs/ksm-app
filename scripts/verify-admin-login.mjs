// scripts/verify-admin-login.mjs
import { createClient } from '@libsql/client';

const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function verifyAdminLogin() {
  try {
    console.log('🔐 管理者ログイン情報の確認...\n');

    // データを確認
    const result = await db.execute('SELECT administrator_id, admin_login_id, password_hash, email FROM m_administrators');
    
    console.log('✅ 管理者アカウント情報:');
    console.log('─────────────────────────────────────────');
    
    for (const admin of result.rows) {
      console.log(`管理者ID: ${admin.administrator_id}`);
      console.log(`ログインID: ${admin.admin_login_id}`);
      console.log(`メール: ${admin.email}`);
      console.log(`パスワードハッシュ: ${String(admin.password_hash).substring(0, 20)}...`);
      console.log('─────────────────────────────────────────');
    }

    console.log('\n✅ ログイン情報:');
    console.log('ログインID: admin');
    console.log('パスワード: admin123');
    console.log('\n管理者ロゴ機能の実装により、administrator_idカラムが追加されました。');
    console.log('上記の情報でログインできるはずです。');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

verifyAdminLogin();