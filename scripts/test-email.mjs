import { createTransport } from 'nodemailer';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '.env.local');

dotenv.config({ path: envPath });

console.log('=== KSM App メール送信テスト ===\n');

// 設定確認
console.log('📋 SMTP設定確認:');
console.log('  Host:', process.env.SMTP_HOST || '❌ 未設定');
console.log('  Port:', process.env.SMTP_PORT || '❌ 未設定');
console.log('  User:', process.env.SMTP_USER || '❌ 未設定');
console.log('  Password:', process.env.SMTP_PASSWORD ? '✅ 設定済み' : '❌ 未設定');
console.log('  From Name:', process.env.SMTP_FROM_NAME || '❌ 未設定');
console.log('  From Email:', process.env.SMTP_FROM_EMAIL || '❌ 未設定');
console.log('');

// 必須項目チェック
if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
  console.error('❌ エラー: .env.localにSMTP設定が不足しています');
  process.exit(1);
}

// トランスポーター作成
const transporter = createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

try {
  console.log('📧 メール送信テスト開始...\n');

  const info = await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'KSM App'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to: process.env.SMTP_USER, // 自分宛に送信
    subject: '【テスト】KSM App - メール送信機能確認',
    text: `
楽勝GO大会運営システム メール送信テスト

このメールは、nodemailerによるメール送信機能のテストです。
このメールが正常に届いている場合、メール送信設定は正しく動作しています。

送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
送信元: ${process.env.SMTP_USER}

楽勝GO大会運営システム
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
    .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; }
    .info { background: #e0e7ff; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>📧 メール送信機能テスト</h2>
    </div>
    <div class="content">
      <div class="success">
        <strong>✅ テスト成功</strong><br>
        このメールが正常に届いている場合、メール送信設定は正しく動作しています。
      </div>

      <h3>送信情報</h3>
      <div class="info">
        <p><strong>送信日時:</strong> ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
        <p><strong>送信元:</strong> ${process.env.SMTP_USER}</p>
        <p><strong>送信先:</strong> ${process.env.SMTP_USER}</p>
      </div>

      <p>このメールは nodemailer による自動送信テストです。</p>
    </div>
    <div class="footer">
      <p>楽勝GO大会運営システム</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  });

  console.log('✅ メール送信成功！');
  console.log('');
  console.log('📬 送信結果:');
  console.log('  Message ID:', info.messageId);
  console.log('  送信先:', process.env.SMTP_USER);
  console.log('');
  console.log('👉 メールボックスを確認してください:');
  console.log(`   https://mail.google.com/mail/u/${process.env.SMTP_USER}`);
  console.log('');

} catch (error) {
  console.error('❌ メール送信失敗\n');
  console.error('エラー詳細:');
  console.error(error);
  console.error('');
  console.error('💡 トラブルシューティング:');
  console.error('  1. .env.localのSMTP_PASSWORDが正しいアプリパスワード（16文字）か確認');
  console.error('  2. SMTP_USERがrakusyogo-official@rakusyo-go.comになっているか確認');
  console.error('  3. Google Workspaceで2段階認証が有効化されているか確認');
  console.error('  4. アプリパスワードが正しく生成されているか確認');
  process.exit(1);
}
