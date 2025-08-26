#!/usr/bin/env node

/**
 * 本番用管理者アカウントを作成するスクリプト
 */

import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// データベース接続設定
const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function createAdmin() {
  try {
    console.log('👤 本番用管理者アカウント作成開始...');
    console.log('📍 接続先:', process.env.DATABASE_URL);
    console.log('');
    
    // 既存の管理者アカウントを確認
    const existingAdmins = await db.execute('SELECT admin_login_id, email FROM m_administrators');
    
    if (existingAdmins.rows.length > 0) {
      console.log('⚠️  既存の管理者アカウント:');
      existingAdmins.rows.forEach(admin => {
        console.log(`  - ログインID: ${admin.admin_login_id}, メール: ${admin.email}`);
      });
      console.log('');
    } else {
      console.log('ℹ️  管理者アカウントが存在しません');
      console.log('');
    }
    
    // 本番用管理者アカウント情報
    const adminAccount = {
      loginId: 'admin',
      email: process.env.ADMIN_DEFAULT_EMAIL || 'admin@example.com',
      password: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'
    };
    
    console.log('🔐 管理者アカウント作成情報:');
    console.log(`  - ログインID: ${adminAccount.loginId}`);
    console.log(`  - メールアドレス: ${adminAccount.email}`);
    console.log(`  - パスワード: ${adminAccount.password}`);
    console.log('');
    
    // パスワードをハッシュ化
    console.log('🔒 パスワードをハッシュ化中...');
    const hashedPassword = await bcrypt.hash(adminAccount.password, 10);
    
    // 既存の同じログインIDを削除
    await db.execute('DELETE FROM m_administrators WHERE admin_login_id = ?', [adminAccount.loginId]);
    
    // 管理者アカウントを作成
    console.log('👤 管理者アカウントを作成中...');
    await db.execute(`
      INSERT INTO m_administrators (admin_login_id, password_hash, email, created_at, updated_at) 
      VALUES (?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [adminAccount.loginId, hashedPassword, adminAccount.email]);
    
    console.log('');
    console.log('✅ 管理者アカウント作成完了！');
    console.log('');
    console.log('📋 作成されたアカウント情報:');
    console.log(`  🆔 ログインID: ${adminAccount.loginId}`);
    console.log(`  📧 メールアドレス: ${adminAccount.email}`);
    console.log(`  🔑 パスワード: ${adminAccount.password}`);
    console.log('');
    console.log('🚨 セキュリティ推奨事項:');
    console.log('  1. 初回ログイン後、必ずパスワードを変更してください');
    console.log('  2. メールアドレスを実際の管理者メールに変更してください');
    console.log('  3. このログ情報は安全に管理してください');
    console.log('');
    
    // 作成確認
    const createdAdmin = await db.execute('SELECT admin_login_id, email, created_at FROM m_administrators WHERE admin_login_id = ?', [adminAccount.loginId]);
    
    if (createdAdmin.rows.length > 0) {
      const admin = createdAdmin.rows[0];
      console.log('🔍 作成確認:');
      console.log(`  - ログインID: ${admin.admin_login_id}`);
      console.log(`  - メール: ${admin.email}`);
      console.log(`  - 作成日時: ${admin.created_at}`);
    }
    
    return {
      success: true,
      account: {
        loginId: adminAccount.loginId,
        email: adminAccount.email,
        password: adminAccount.password
      }
    };
    
  } catch (error) {
    console.error('');
    console.error('💥 管理者アカウント作成失敗:', error);
    console.error('');
    console.error('🔧 トラブルシューティング:');
    console.error('  1. DATABASE_URLとDATABASE_AUTH_TOKENが正しく設定されているか確認');
    console.error('  2. m_administratorsテーブルが存在するか確認');
    console.error('  3. データベースへの書き込み権限があるか確認');
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  createAdmin()
    .then(result => {
      if (result.success) {
        console.log('\n🎊 管理者アカウント作成成功！');
        console.log('\n📝 次の手順:');
        console.log('  1. アプリケーションにアクセス: http://localhost:3000');
        console.log('  2. 管理者ログインページから以下の情報でログイン:');
        console.log(`     - ログインID: ${result.account.loginId}`);
        console.log(`     - パスワード: ${result.account.password}`);
        console.log('  3. 初回ログイン後、パスワードとメールアドレスを変更');
        process.exit(0);
      } else {
        console.error('\n💀 管理者アカウント作成失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error);
      process.exit(1);
    });
}

export { createAdmin };