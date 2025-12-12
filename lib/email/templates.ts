/**
 * 大会参加確定メールのテンプレート
 */
export function generateTournamentJoinConfirmation(data: {
  teamName: string;
  tournamentName: string;
  tournamentDate: string;
  venueName?: string;
  contactEmail: string;
  playerCount: number;
  tournamentUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = `【大会参加確定】${data.tournamentName} - 参加登録が完了しました`;

  const text = `
${data.teamName} 様

この度は「${data.tournamentName}」へのご参加ありがとうございます。
参加登録が正常に完了しましたのでお知らせいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 大会情報
━━━━━━━━━━━━━━━━━━━━━━━━
大会名: ${data.tournamentName}
開催日: ${data.tournamentDate}
${data.venueName ? `会場: ${data.venueName}` : ''}
登録選手数: ${data.playerCount}名

━━━━━━━━━━━━━━━━━━━━━━━━
■ 次のステップ
━━━━━━━━━━━━━━━━━━━━━━━━
1. チーム代表者ダッシュボードから選手情報を確認してください
2. 大会開始までに選手登録の変更が必要な場合は、ダッシュボードから編集できます
3. 大会の詳細情報や日程は以下のURLから確認できます

大会詳細ページ: ${data.tournamentUrl}

━━━━━━━━━━━━━━━━━━━━━━━━
■ お問い合わせ
━━━━━━━━━━━━━━━━━━━━━━━━
ご不明な点がございましたら、以下のメールアドレスまでお問い合わせください。
${data.contactEmail}

━━━━━━━━━━━━━━━━━━━━━━━━

楽勝GO大会運営システム
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: bold;
    }
    .content {
      padding: 30px 20px;
    }
    .success-box {
      background: #d1fae5;
      border-left: 4px solid #10b981;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .success-box strong {
      color: #065f46;
      display: block;
      margin-bottom: 8px;
      font-size: 16px;
    }
    .info-section {
      background: #f9fafb;
      padding: 20px;
      border-radius: 6px;
      margin: 20px 0;
      border: 1px solid #e5e7eb;
    }
    .info-section h2 {
      margin: 0 0 15px 0;
      font-size: 18px;
      color: #1f2937;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 8px;
    }
    .info-row {
      margin: 10px 0;
      display: flex;
      align-items: flex-start;
    }
    .info-label {
      font-weight: bold;
      color: #4b5563;
      min-width: 120px;
      flex-shrink: 0;
    }
    .info-value {
      color: #1f2937;
    }
    .steps {
      background: #eff6ff;
      padding: 20px;
      border-radius: 6px;
      margin: 20px 0;
      border: 1px solid #dbeafe;
    }
    .steps h2 {
      margin: 0 0 15px 0;
      font-size: 18px;
      color: #1e40af;
    }
    .steps ol {
      margin: 0;
      padding-left: 20px;
    }
    .steps li {
      margin: 8px 0;
      color: #1f2937;
    }
    .button {
      display: inline-block;
      background: #2563eb;
      color: white !important;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: bold;
      margin: 20px 0;
      text-align: center;
    }
    .button:hover {
      background: #1d4ed8;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #e5e7eb;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 大会参加登録完了</h1>
    </div>

    <div class="content">
      <div class="success-box">
        <strong>✅ 参加登録が完了しました</strong>
        <p style="margin: 0;">${data.teamName} 様の「${data.tournamentName}」への参加登録が正常に完了しました。</p>
      </div>

      <div class="info-section">
        <h2>📋 大会情報</h2>
        <div class="info-row">
          <span class="info-label">大会名:</span>
          <span class="info-value">${data.tournamentName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">開催日:</span>
          <span class="info-value">${data.tournamentDate}</span>
        </div>
        ${data.venueName ? `
        <div class="info-row">
          <span class="info-label">会場:</span>
          <span class="info-value">${data.venueName}</span>
        </div>
        ` : ''}
        <div class="info-row">
          <span class="info-label">登録選手数:</span>
          <span class="info-value">${data.playerCount}名</span>
        </div>
      </div>

      <div class="steps">
        <h2>📌 次のステップ</h2>
        <ol>
          <li>チーム代表者ダッシュボードから選手情報を確認してください</li>
          <li>大会開始までに選手登録の変更が必要な場合は、ダッシュボードから編集できます</li>
          <li>大会の詳細情報や日程は以下のボタンから確認できます</li>
        </ol>
      </div>

      <div style="text-align: center;">
        <a href="${data.tournamentUrl}" class="button">大会詳細ページを見る</a>
      </div>

      <div class="info-section">
        <h2>📧 お問い合わせ</h2>
        <p style="margin: 0;">ご不明な点がございましたら、以下のメールアドレスまでお問い合わせください。</p>
        <p style="margin: 10px 0 0 0;"><a href="mailto:${data.contactEmail}" style="color: #2563eb;">${data.contactEmail}</a></p>
      </div>
    </div>

    <div class="footer">
      <p>楽勝GO大会運営システム</p>
      <p style="margin: 5px 0 0 0; font-size: 12px;">このメールは自動送信されています。返信しないでください。</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
