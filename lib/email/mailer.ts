import { createTransport } from 'nodemailer';

// 環境変数デバッグログ（起動時に1回だけ出力）
console.log('📧 Nodemailer初期化:', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  hasUser: !!process.env.SMTP_USER,
  hasPassword: !!process.env.SMTP_PASSWORD,
  passwordLength: process.env.SMTP_PASSWORD?.length || 0,
});

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
    console.log('📤 メール送信開始:', {
      to: options.to,
      subject: options.subject,
      from: `"${process.env.SMTP_FROM_NAME || 'KSM App'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    });

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
      response: info.response,
    });
  } catch (error) {
    const errorObj = error as Record<string, unknown>;
    console.error('❌ メール送信エラー（詳細）:', {
      error: error,
      errorType: error?.constructor?.name,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      // nodemailerのエラー詳細
      code: errorObj?.code as string | undefined,
      command: errorObj?.command as string | undefined,
      response: errorObj?.response as string | undefined,
      responseCode: errorObj?.responseCode as number | undefined,
    });
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
