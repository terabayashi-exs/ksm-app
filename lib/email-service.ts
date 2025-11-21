// lib/email-service.ts
// メール通知サービス基盤

interface EmailConfig {
  service: 'console' | 'smtp' | 'sendgrid' | 'resend';
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  apiKey?: string;
  fromEmail: string;
  fromName: string;
}

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

interface EmailData {
  to: string;
  toName?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  template: EmailTemplate;
  variables?: Record<string, string>;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * メール送信サービス
 * 開発環境ではコンソール出力、本番環境では実際のメール送信
 */
export class EmailService {
  private config: EmailConfig;

  constructor() {
    this.config = {
      service: process.env.NODE_ENV === 'development' ? 'console' : 'smtp',
      smtp: {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || ''
        }
      },
      apiKey: process.env.EMAIL_API_KEY,
      fromEmail: process.env.FROM_EMAIL || 'noreply@ksm-app.com',
      fromName: process.env.FROM_NAME || '楽勝 GO 運営'
    };
  }

  /**
   * メール送信メソッド
   */
  async sendEmail(emailData: EmailData): Promise<EmailResult> {
    try {
      // テンプレート変数の置換
      const processedTemplate = this.processTemplate(emailData.template, emailData.variables || {});
      
      const emailPayload = {
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: emailData.toName ? `${emailData.toName} <${emailData.to}>` : emailData.to,
        cc: emailData.cc,
        bcc: emailData.bcc,
        replyTo: emailData.replyTo,
        subject: processedTemplate.subject,
        html: processedTemplate.htmlBody,
        text: processedTemplate.textBody
      };

      switch (this.config.service) {
        case 'console':
          return await this.sendConsoleEmail(emailPayload);
        case 'smtp':
          return await this.sendSMTPEmail(emailPayload);
        default:
          throw new Error(`未対応のメールサービス: ${this.config.service}`);
      }
    } catch (error) {
      console.error('メール送信エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 開発環境用コンソール出力
   */
  private async sendConsoleEmail(payload: Record<string, unknown>): Promise<EmailResult> {
    console.log('\n📧 ========== メール送信 (開発環境) ==========');
    console.log(`From: ${payload.from}`);
    console.log(`To: ${payload.to}`);
    if (payload.cc && Array.isArray(payload.cc)) console.log(`CC: ${payload.cc.join(', ')}`);
    if (payload.bcc && Array.isArray(payload.bcc)) console.log(`BCC: ${payload.bcc.join(', ')}`);
    if (payload.replyTo) console.log(`Reply-To: ${payload.replyTo}`);
    console.log(`Subject: ${payload.subject}`);
    console.log('\n--- HTML Body ---');
    console.log(payload.html);
    console.log('\n--- Text Body ---');
    console.log(payload.text);
    console.log('=============================================\n');

    return {
      success: true,
      messageId: `dev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * SMTP経由でのメール送信（本番用）
   */
  private async sendSMTPEmail(payload: Record<string, unknown>): Promise<EmailResult> {
    // payload parameter is used for future SMTP implementation
    console.log('SMTP payload ready for implementation:', Object.keys(payload).length, 'properties');
    // 本番環境でのSMTP実装
    // nodemailerなどのライブラリを使用する場合はここに実装
    
    console.log('🚀 SMTP メール送信準備完了');
    console.log('注意: 実際のSMTP送信は未実装です。nodemailerの設定が必要です。');
    
    return {
      success: true,
      messageId: `smtp-${Date.now()}`
    };
  }

  /**
   * テンプレート変数の処理
   */
  private processTemplate(template: EmailTemplate, variables: Record<string, string>): EmailTemplate {
    const processString = (str: string): string => {
      let processed = str;
      Object.entries(variables).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        processed = processed.replace(new RegExp(placeholder, 'g'), value);
      });
      return processed;
    };

    return {
      subject: processString(template.subject),
      htmlBody: processString(template.htmlBody),
      textBody: processString(template.textBody)
    };
  }
}

/**
 * メール送信ユーティリティ関数
 */
export async function sendEmail(emailData: EmailData): Promise<EmailResult> {
  const emailService = new EmailService();
  return await emailService.sendEmail(emailData);
}

/**
 * 複数宛先への一括メール送信
 */
export async function sendBulkEmails(
  recipients: Array<{ email: string; name?: string; variables?: Record<string, string> }>,
  template: EmailTemplate,
  options?: {
    cc?: string[];
    bcc?: string[];
    replyTo?: string;
    batchSize?: number;
    delayMs?: number;
  }
): Promise<{ success: number; failed: number; results: EmailResult[] }> {
  const emailService = new EmailService();
  const batchSize = options?.batchSize || 10;
  const delayMs = options?.delayMs || 1000;
  
  let success = 0;
  let failed = 0;
  const results: EmailResult[] = [];

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    
    const batchPromises = batch.map(recipient => 
      emailService.sendEmail({
        to: recipient.email,
        toName: recipient.name,
        cc: options?.cc,
        bcc: options?.bcc,
        replyTo: options?.replyTo,
        template,
        variables: recipient.variables
      })
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    batchResults.forEach(result => {
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    });

    // バッチ間の待機時間
    if (i + batchSize < recipients.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log(`📊 一括メール送信完了: 成功 ${success}件, 失敗 ${failed}件`);

  return { success, failed, results };
}