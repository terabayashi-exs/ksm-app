// scripts/check-admin-table.mjs
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function checkAdminTable() {
  try {
    console.log('📋 m_administratorsテーブル構造を確認中...\n');

    // テーブル構造を確認
    const tableInfo = await db.execute("PRAGMA table_info(m_administrators)");
    console.log('カラム情報:');
    console.table(tableInfo.rows.map(row => ({
      名前: row.name,
      型: row.type,
      NULL許可: row.notnull ? 'いいえ' : 'はい',
      デフォルト値: row.dflt_value || '(なし)',
      主キー: row.pk ? 'はい' : 'いいえ'
    })));

    // 管理者情報を取得（存在するカラムのみ）
    console.log('\n🔐 管理者ユーザー一覧:');
    const result = await db.execute('SELECT * FROM m_administrators');
    console.table(result.rows);

    // パスワードをテスト
    console.log('\n🔑 パスワードテスト結果:');
    
    for (const admin of result.rows) {
      console.log(`\n管理者: ${admin.admin_login_id}`);
      
      // よく使われるパスワードをテスト
      const testPasswords = ['admin123', 'password123', 'admin', 'password', '12345678'];
      
      for (const testPassword of testPasswords) {
        try {
          if (admin.password_hash) {
            const isMatch = await bcrypt.compare(testPassword, admin.password_hash);
            if (isMatch) {
              console.log(`✅ パスワード "${testPassword}" が一致しました！`);
              break;
            }
          }
        } catch (error) {
          // bcryptエラーは無視
        }
      }
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

checkAdminTable();