import { createTransport } from 'nodemailer';

// nodemailerトランスポーター設定
const transporter = createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // false for TLS, true for SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  cc?: string | string[];
  bcc?: string | string[];
}

/**
 * メール送信関数
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'KSM App'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    console.log('✅ メール送信成功:', {
      messageId: info.messageId,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc ? `[${Array.isArray(options.bcc) ? options.bcc.length : 1}件]` : undefined,
      subject: options.subject,
    });
  } catch (error) {
    console.error('❌ メール送信エラー:', error);
    throw new Error(`メール送信に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

/**
 * SMTP接続テスト
 */
export async function verifyConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log('✅ SMTP接続確認成功');
    return true;
  } catch (error) {
    console.error('❌ SMTP接続確認エラー:', error);
    return false;
  }
}
