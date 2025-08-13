// lib/email-templates.ts
// メールテンプレート定義

import { EmailTemplate } from './email-service';

export interface WithdrawalEmailVariables {
  teamName: string;
  tournamentName: string;
  contactPerson: string;
  adminComment?: string;
  withdrawalReason?: string;
  processedDate: string;
  tournamentDate?: string;
  venueInfo?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/**
 * 辞退申請承認通知メール
 */
export function getWithdrawalApprovedTemplate(): EmailTemplate {
  return {
    subject: '【{{tournamentName}}】辞退申請が承認されました',
    
    htmlBody: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>辞退申請承認のお知らせ</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #22c55e; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { padding: 30px; }
        .info-box { background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 6px; padding: 15px; margin: 20px 0; }
        .highlight { background: #ecfdf5; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0; }
        .footer { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #64748b; }
        .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        h1 { margin: 0; font-size: 24px; }
        h2 { color: #1e40af; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
        .status { display: inline-block; background: #22c55e; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏆 PK選手権大会</h1>
            <p>辞退申請承認のお知らせ</p>
        </div>
        
        <div class="content">
            <p>{{contactPerson}} 様</p>
            <p>いつもお世話になっております。</p>
            
            <div class="highlight">
                <h2>辞退申請が承認されました</h2>
                <p><strong>チーム名:</strong> {{teamName}}</p>
                <p><strong>大会名:</strong> {{tournamentName}}</p>
                <p><strong>処理日時:</strong> {{processedDate}}</p>
                <div class="status">承認済み</div>
            </div>

            <div class="info-box">
                <h3>📋 承認内容</h3>
                <p>お申し込みいただいた辞退申請を承認いたしました。</p>
                <p>大会参加から正式に除外されましたことをお知らせいたします。</p>
            </div>

            {{#if adminComment}}
            <div class="info-box">
                <h3>💬 運営からのメッセージ</h3>
                <p>{{adminComment}}</p>
            </div>
            {{/if}}

            <h2>📞 今後について</h2>
            <ul>
                <li><strong>参加費について:</strong> 返金手続きについては別途ご案内いたします</li>
                <li><strong>次回大会:</strong> 次回大会への参加を心よりお待ちしております</li>
                <li><strong>お問い合わせ:</strong> ご不明な点がございましたらお気軽にご連絡ください</li>
            </ul>

            <h2>🏢 大会情報</h2>
            <div class="info-box">
                <p><strong>大会名:</strong> {{tournamentName}}</p>
                {{#if tournamentDate}}<p><strong>開催予定:</strong> {{tournamentDate}}</p>{{/if}}
                {{#if venueInfo}}<p><strong>会場:</strong> {{venueInfo}}</p>{{/if}}
            </div>

            <p>この度は貴重なお時間をいただき、ありがとうございました。<br>
            また次の機会にお会いできることを楽しみにしております。</p>
        </div>
        
        <div class="footer">
            <p>このメールは自動送信されています。<br>
            {{#if contactEmail}}お問い合わせ: {{contactEmail}}{{/if}}
            {{#if contactPhone}} | 電話: {{contactPhone}}{{/if}}</p>
            <p>© PK選手権大会運営事務局</p>
        </div>
    </div>
</body>
</html>`,

    textBody: `
【{{tournamentName}}】辞退申請承認のお知らせ

{{contactPerson}} 様

いつもお世話になっております。
PK選手権大会運営事務局です。

■ 辞退申請が承認されました
チーム名: {{teamName}}
大会名: {{tournamentName}}
処理日時: {{processedDate}}
ステータス: 承認済み

■ 承認内容
お申し込みいただいた辞退申請を承認いたしました。
大会参加から正式に除外されましたことをお知らせいたします。

{{#if adminComment}}
■ 運営からのメッセージ
{{adminComment}}
{{/if}}

■ 今後について
・参加費について: 返金手続きについては別途ご案内いたします
・次回大会: 次回大会への参加を心よりお待ちしております
・お問い合わせ: ご不明な点がございましたらお気軽にご連絡ください

■ 大会情報
大会名: {{tournamentName}}
{{#if tournamentDate}}開催予定: {{tournamentDate}}{{/if}}
{{#if venueInfo}}会場: {{venueInfo}}{{/if}}

この度は貴重なお時間をいただき、ありがとうございました。
また次の機会にお会いできることを楽しみにしております。

───────────────────────────
このメールは自動送信されています。
{{#if contactEmail}}お問い合わせ: {{contactEmail}}{{/if}}
{{#if contactPhone}} | 電話: {{contactPhone}}{{/if}}
© PK選手権大会運営事務局
───────────────────────────
`
  };
}

/**
 * 辞退申請却下通知メール
 */
export function getWithdrawalRejectedTemplate(): EmailTemplate {
  return {
    subject: '【{{tournamentName}}】辞退申請について',
    
    htmlBody: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>辞退申請についてのお知らせ</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { padding: 30px; }
        .info-box { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0; }
        .highlight { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
        .footer { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #64748b; }
        .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        h1 { margin: 0; font-size: 24px; }
        h2 { color: #1e40af; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
        .status { display: inline-block; background: #f59e0b; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏆 PK選手権大会</h1>
            <p>辞退申請についてのお知らせ</p>
        </div>
        
        <div class="content">
            <p>{{contactPerson}} 様</p>
            <p>いつもお世話になっております。</p>
            
            <div class="highlight">
                <h2>辞退申請について</h2>
                <p><strong>チーム名:</strong> {{teamName}}</p>
                <p><strong>大会名:</strong> {{tournamentName}}</p>
                <p><strong>処理日時:</strong> {{processedDate}}</p>
                <div class="status">要再検討</div>
            </div>

            <div class="info-box">
                <h3>📋 運営からの回答</h3>
                <p>この度ご提出いただいた辞退申請について、以下の理由により再検討をお願いしたく、ご連絡いたします。</p>
            </div>

            {{#if adminComment}}
            <div class="info-box">
                <h3>💬 詳細な理由・ご提案</h3>
                <p>{{adminComment}}</p>
            </div>
            {{/if}}

            <h2>📞 今後の対応について</h2>
            <ul>
                <li><strong>再申請:</strong> 状況が変わらない場合は、再度辞退申請をしていただけます</li>
                <li><strong>ご相談:</strong> 参加に関してご不明な点がございましたら、お気軽にご相談ください</li>
                <li><strong>参加継続:</strong> 現在の参加状態は維持されています</li>
            </ul>

            <h2>🏢 大会情報</h2>
            <div class="info-box">
                <p><strong>大会名:</strong> {{tournamentName}}</p>
                {{#if tournamentDate}}<p><strong>開催予定:</strong> {{tournamentDate}}</p>{{/if}}
                {{#if venueInfo}}<p><strong>会場:</strong> {{venueInfo}}</p>{{/if}}
            </div>

            <p>ご不明な点がございましたら、運営事務局までお気軽にお問い合わせください。<br>
            引き続きよろしくお願いいたします。</p>
        </div>
        
        <div class="footer">
            <p>このメールは自動送信されています。<br>
            {{#if contactEmail}}お問い合わせ: {{contactEmail}}{{/if}}
            {{#if contactPhone}} | 電話: {{contactPhone}}{{/if}}</p>
            <p>© PK選手権大会運営事務局</p>
        </div>
    </div>
</body>
</html>`,

    textBody: `
【{{tournamentName}}】辞退申請についてのお知らせ

{{contactPerson}} 様

いつもお世話になっております。
PK選手権大会運営事務局です。

■ 辞退申請について
チーム名: {{teamName}}
大会名: {{tournamentName}}
処理日時: {{processedDate}}
ステータス: 要再検討

■ 運営からの回答
この度ご提出いただいた辞退申請について、以下の理由により再検討をお願いしたく、ご連絡いたします。

{{#if adminComment}}
■ 詳細な理由・ご提案
{{adminComment}}
{{/if}}

■ 今後の対応について
・再申請: 状況が変わらない場合は、再度辞退申請をしていただけます
・ご相談: 参加に関してご不明な点がございましたら、お気軽にご相談ください
・参加継続: 現在の参加状態は維持されています

■ 大会情報
大会名: {{tournamentName}}
{{#if tournamentDate}}開催予定: {{tournamentDate}}{{/if}}
{{#if venueInfo}}会場: {{venueInfo}}{{/if}}

ご不明な点がございましたら、運営事務局までお気軽にお問い合わせください。
引き続きよろしくお願いいたします。

───────────────────────────
このメールは自動送信されています。
{{#if contactEmail}}お問い合わせ: {{contactEmail}}{{/if}}
{{#if contactPhone}} | 電話: {{contactPhone}}{{/if}}
© PK選手権大会運営事務局
───────────────────────────
`
  };
}

/**
 * 辞退申請受付確認メール
 */
export function getWithdrawalReceivedTemplate(): EmailTemplate {
  return {
    subject: '【{{tournamentName}}】辞退申請を受け付けました',
    
    htmlBody: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>辞退申請受付確認</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #3b82f6; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { padding: 30px; }
        .info-box { background: #dbeafe; border: 1px solid #3b82f6; border-radius: 6px; padding: 15px; margin: 20px 0; }
        .highlight { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        .footer { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #64748b; }
        h1 { margin: 0; font-size: 24px; }
        h2 { color: #1e40af; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
        .status { display: inline-block; background: #3b82f6; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏆 PK選手権大会</h1>
            <p>辞退申請受付確認</p>
        </div>
        
        <div class="content">
            <p>{{contactPerson}} 様</p>
            <p>いつもお世話になっております。</p>
            
            <div class="highlight">
                <h2>辞退申請を受け付けました</h2>
                <p><strong>チーム名:</strong> {{teamName}}</p>
                <p><strong>大会名:</strong> {{tournamentName}}</p>
                <p><strong>申請日時:</strong> {{processedDate}}</p>
                <div class="status">審査中</div>
            </div>

            <div class="info-box">
                <h3>📋 申請内容</h3>
                {{#if withdrawalReason}}
                <p><strong>辞退理由:</strong></p>
                <p>{{withdrawalReason}}</p>
                {{/if}}
            </div>

            <h2>📞 今後の流れ</h2>
            <ul>
                <li><strong>審査期間:</strong> 3営業日以内に審査結果をご連絡いたします</li>
                <li><strong>審査結果:</strong> 承認・却下に関わらず、メールにてご連絡いたします</li>
                <li><strong>お問い合わせ:</strong> 急ぎの場合は運営事務局までご連絡ください</li>
            </ul>

            <p>審査結果をお待ちください。<br>
            何かご不明な点がございましたら、お気軽にお問い合わせください。</p>
        </div>
        
        <div class="footer">
            <p>このメールは自動送信されています。<br>
            {{#if contactEmail}}お問い合わせ: {{contactEmail}}{{/if}}
            {{#if contactPhone}} | 電話: {{contactPhone}}{{/if}}</p>
            <p>© PK選手権大会運営事務局</p>
        </div>
    </div>
</body>
</html>`,

    textBody: `
【{{tournamentName}}】辞退申請受付確認

{{contactPerson}} 様

いつもお世話になっております。
PK選手権大会運営事務局です。

■ 辞退申請を受け付けました
チーム名: {{teamName}}
大会名: {{tournamentName}}
申請日時: {{processedDate}}
ステータス: 審査中

■ 申請内容
{{#if withdrawalReason}}
辞退理由: {{withdrawalReason}}
{{/if}}

■ 今後の流れ
・審査期間: 3営業日以内に審査結果をご連絡いたします
・審査結果: 承認・却下に関わらず、メールにてご連絡いたします
・お問い合わせ: 急ぎの場合は運営事務局までご連絡ください

審査結果をお待ちください。
何かご不明な点がございましたら、お気軽にお問い合わせください。

───────────────────────────
このメールは自動送信されています。
{{#if contactEmail}}お問い合わせ: {{contactEmail}}{{/if}}
{{#if contactPhone}} | 電話: {{contactPhone}}{{/if}}
© PK選手権大会運営事務局
───────────────────────────
`
  };
}