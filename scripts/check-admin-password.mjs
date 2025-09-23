// scripts/check-admin-password.mjs
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function checkAdminPassword() {
  try {
    console.log('🔐 管理者ログイン情報を確認中...\n');

    // 管理者情報を取得
    const result = await db.execute('SELECT administrator_id, admin_login_id, password_hash, email FROM m_administrators');
    
    console.log('📋 管理者ユーザー一覧:');
    console.table(result.rows.map(row => ({
      ID: row.administrator_id,
      ログインID: row.admin_login_id,
      メール: row.email
    })));

    // パスワードをテスト
    console.log('\n🔑 パスワードテスト結果:');
    
    for (const admin of result.rows) {
      console.log(`\n管理者: ${admin.admin_login_id}`);
      
      // よく使われるパスワードをテスト
      const testPasswords = ['admin123', 'password123', 'admin', 'password', '12345678'];
      
      for (const testPassword of testPasswords) {
        try {
          const isMatch = await bcrypt.compare(testPassword, admin.password_hash);
          if (isMatch) {
            console.log(`✅ パスワード "${testPassword}" が一致しました！`);
            break;
          }
        } catch (error) {
          // bcryptエラーは無視
        }
      }
    }

    // パスワードのリセット方法を案内
    console.log('\n💡 パスワードをリセットする場合:');
    console.log('1. 以下のコマンドでパスワードをリセットできます:');
    console.log('   node scripts/reset-admin-password.mjs');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

checkAdminPassword();