/**
 * 大会参加申請受付メールのテンプレート（統一版）
 */
export function generateTournamentApplicationConfirmation(data: {
  teamName: string;
  tournamentName: string;
  groupName?: string;
  categoryName?: string;
  tournamentDate: string;
  venueName?: string;
  contactEmail: string;
  playerCount: number;
  tournamentUrl: string;
}): { subject: string; text: string; html: string } {
  const displayTournamentName = data.groupName || data.tournamentName;
  const categoryPart = data.categoryName ? ` (${data.categoryName})` : '';
  const subject = `【受付完了】${displayTournamentName}${categoryPart} - 参加申請を受け付けました`;

  const text = `
${data.teamName} 様

この度は「${displayTournamentName}」への参加申請をいただき、ありがとうございます。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 申請内容
━━━━━━━━━━━━━━━━━━━━━━━━
${data.groupName ? `大会名: ${data.groupName}` : `大会名: ${data.tournamentName}`}
${data.categoryName ? `部門名: ${data.categoryName}\n` : ''}開催日: ${data.tournamentDate}
${data.venueName ? `会場: ${data.venueName}` : ''}
登録選手数: ${data.playerCount}名
申請日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}

━━━━━━━━━━━━━━━━━━━━━━━━
■ 今後の流れ
━━━━━━━━━━━━━━━━━━━━━━━━
参加の可否につきましては、募集締切後に運営側で確認の上、
改めてメールにてご連絡いたします。

※ 申請順ではなく、抽選または選考により決定する場合があります。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 申請内容の変更
━━━━━━━━━━━━━━━━━━━━━━━━
募集期間中は、チーム代表者ダッシュボードから選手情報を
変更することができます。

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
      background: #dbeafe;
      border-left: 4px solid #2563eb;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .success-box strong {
      color: #1e40af;
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
    .notice-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .notice-box p {
      margin: 5px 0;
      color: #92400e;
      font-size: 14px;
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
      <h1>📝 参加申請受付完了</h1>
    </div>

    <div class="content">
      <div class="success-box">
        <strong>✅ 参加申請を受け付けました</strong>
        <p style="margin: 0;">${data.teamName} 様の「${displayTournamentName}」への参加申請を受け付けました。</p>
      </div>

      <div class="info-section">
        <h2>📋 申請内容</h2>
        <div class="info-row">
          <span class="info-label">大会名:</span>
          <span class="info-value">${data.groupName || data.tournamentName}</span>
        </div>
        ${data.categoryName ? `
        <div class="info-row">
          <span class="info-label">部門名:</span>
          <span class="info-value">${data.categoryName}</span>
        </div>
        ` : ''}
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
        <div class="info-row">
          <span class="info-label">申請日時:</span>
          <span class="info-value">${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
        </div>
      </div>

      <div class="info-section">
        <h2>📌 今後の流れ</h2>
        <p style="margin: 0 0 10px 0;">参加の可否につきましては、募集締切後に運営側で確認の上、改めてメールにてご連絡いたします。</p>
        <div class="notice-box">
          <p>※ 申請順ではなく、抽選または選考により決定する場合があります。</p>
        </div>
      </div>

      <div class="info-section">
        <h2>✏️ 申請内容の変更</h2>
        <p style="margin: 0;">募集期間中は、チーム代表者ダッシュボードから選手情報を変更することができます。</p>
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

/**
 * 大会参加確定メールのテンプレート（旧版・後方互換用）
 */
export function generateTournamentJoinConfirmation(data: {
  teamName: string;
  tournamentName: string;
  groupName?: string;
  categoryName?: string;
  tournamentDate: string;
  venueName?: string;
  contactEmail: string;
  playerCount: number;
  tournamentUrl: string;
}): { subject: string; text: string; html: string } {
  // 大会名の表示を決定（グループ大会の場合はグループ名を使用）
  const displayTournamentName = data.groupName || data.tournamentName;
  const categoryPart = data.categoryName ? ` (${data.categoryName})` : '';
  const subject = `【大会参加確定】${displayTournamentName}${categoryPart} - 参加登録が完了しました`;

  const text = `
${data.teamName} 様

この度は「${displayTournamentName}」へのご参加ありがとうございます。
参加登録が正常に完了しましたのでお知らせいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 大会情報
━━━━━━━━━━━━━━━━━━━━━━━━
${data.groupName ? `大会名: ${data.groupName}` : `大会名: ${data.tournamentName}`}
${data.categoryName ? `部門名: ${data.categoryName}` : ''}
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
        <p style="margin: 0;">${data.teamName} 様の「${displayTournamentName}」への参加登録が正常に完了しました。</p>
      </div>

      <div class="info-section">
        <h2>📋 大会情報</h2>
        <div class="info-row">
          <span class="info-label">大会名:</span>
          <span class="info-value">${data.groupName || data.tournamentName}</span>
        </div>
        ${data.categoryName ? `
        <div class="info-row">
          <span class="info-label">部門名:</span>
          <span class="info-value">${data.categoryName}</span>
        </div>
        ` : ''}
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

/**
 * キャンセル待ち登録メールのテンプレート
 */
export function generateTournamentWaitlistConfirmation(data: {
  teamName: string;
  tournamentName: string;
  groupName?: string;
  categoryName?: string;
  tournamentDate: string;
  venueName?: string;
  contactEmail: string;
  playerCount: number;
  tournamentUrl: string;
  waitlistPosition: number;
}): { subject: string; text: string; html: string } {
  const displayTournamentName = data.groupName || data.tournamentName;
  const categoryPart = data.categoryName ? ` (${data.categoryName})` : '';
  const subject = `【キャンセル待ち登録】${displayTournamentName}${categoryPart} - キャンセル待ちとして受付しました`;

  const text = `
${data.teamName} 様

この度は「${displayTournamentName}」へのお申し込みありがとうございます。
現在、大会の参加枠が満員のため、キャンセル待ちとして登録いたしました。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 登録情報
━━━━━━━━━━━━━━━━━━━━━━━━
${data.groupName ? `大会名: ${data.groupName}` : `大会名: ${data.tournamentName}`}
${data.categoryName ? `部門名: ${data.categoryName}` : ''}
開催日: ${data.tournamentDate}
${data.venueName ? `会場: ${data.venueName}` : ''}
登録選手数: ${data.playerCount}名
キャンセル待ち順位: ${data.waitlistPosition}位

━━━━━━━━━━━━━━━━━━━━━━━━
■ 今後の流れ
━━━━━━━━━━━━━━━━━━━━━━━━
・他のチームがキャンセルした場合、順次繰り上げて参加確定となります
・参加確定となりましたら、改めてメールにてご連絡いたします
・キャンセル待ち状態でも、選手情報の編集は可能です

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
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
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
    .warning-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .warning-box strong {
      color: #92400e;
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
      border-bottom: 2px solid #f59e0b;
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
    .waitlist-badge {
      display: inline-block;
      background: #f59e0b;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 18px;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏳ キャンセル待ち登録完了</h1>
    </div>

    <div class="content">
      <div class="warning-box">
        <strong>キャンセル待ちとして登録しました</strong>
        <p style="margin: 0;">${data.teamName} 様のお申し込みを受け付けました。現在、参加枠が満員のため、キャンセル待ちとして登録されています。</p>
      </div>

      <div style="text-align: center; margin: 20px 0;">
        <span class="waitlist-badge">キャンセル待ち ${data.waitlistPosition}位</span>
      </div>

      <div class="info-section">
        <h2>📋 登録情報</h2>
        <div class="info-row">
          <span class="info-label">大会名:</span>
          <span class="info-value">${data.groupName || data.tournamentName}</span>
        </div>
        ${data.categoryName ? `
        <div class="info-row">
          <span class="info-label">部門名:</span>
          <span class="info-value">${data.categoryName}</span>
        </div>
        ` : ''}
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

      <div class="info-section">
        <h2>📌 今後の流れ</h2>
        <ul style="margin: 0; padding-left: 20px;">
          <li>他のチームがキャンセルした場合、順次繰り上げて参加確定となります</li>
          <li>参加確定となりましたら、改めてメールにてご連絡いたします</li>
          <li>キャンセル待ち状態でも、選手情報の編集は可能です</li>
        </ul>
      </div>

      <div class="info-section">
        <h2>📧 お問い合わせ</h2>
        <p style="margin: 0;">ご不明な点がございましたら、以下のメールアドレスまでお問い合わせください。</p>
        <p style="margin: 10px 0 0 0;"><a href="mailto:${data.contactEmail}" style="color: #f59e0b;">${data.contactEmail}</a></p>
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

/**
 * 参加確定通知メール
 */
export function generateParticipationConfirmedNotification(data: {
  teamName: string;
  tournamentName: string;
  adminComment?: string;
}): { subject: string; text: string; html: string } {
  const subject = `【参加確定】${data.tournamentName} - 参加が確定しました`;

  const text = `
${data.teamName} 様

この度は「${data.tournamentName}」への参加申請をいただき、ありがとうございました。
正式に参加確定となりましたのでお知らせいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 参加確定のお知らせ
━━━━━━━━━━━━━━━━━━━━━━━━
大会名: ${data.tournamentName}
ステータス: 参加確定

${data.adminComment ? `
運営からのメッセージ:
${data.adminComment}
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━
■ 次のステップ
━━━━━━━━━━━━━━━━━━━━━━━━
1. チーム代表者ダッシュボードから選手情報を確認してください
2. ご不明な点がございましたら、お気軽にお問い合わせください

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
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
      border-bottom: 2px solid #10b981;
      padding-bottom: 8px;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 参加確定のお知らせ</h1>
    </div>

    <div class="content">
      <div class="success-box">
        <strong>✅ 参加が確定しました</strong>
        <p style="margin: 0;">この度は「${data.tournamentName}」への参加申請をいただき、ありがとうございました。${data.teamName} 様の参加が正式に確定しました。</p>
      </div>

      ${data.adminComment ? `
      <div class="info-section">
        <h2>💬 運営からのメッセージ</h2>
        <p>${data.adminComment}</p>
      </div>
      ` : ''}

      <div class="info-section">
        <h2>📌 次のステップ</h2>
        <ul style="margin: 0; padding-left: 20px;">
          <li>チーム代表者ダッシュボードから選手情報を確認してください</li>
          <li>ご不明な点がございましたら、お気軽にお問い合わせください</li>
        </ul>
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

/**
 * キャンセル待ち変更通知メール
 */
export function generateWaitlistNotification(data: {
  teamName: string;
  tournamentName: string;
  adminComment?: string;
}): { subject: string; text: string; html: string } {
  const subject = `【キャンセル待ちへ変更】${data.tournamentName}`;

  const text = `
${data.teamName} 様

「${data.tournamentName}」の参加状態がキャンセル待ちに変更されましたのでお知らせいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 変更内容
━━━━━━━━━━━━━━━━━━━━━━━━
大会名: ${data.tournamentName}
新しいステータス: キャンセル待ち

${data.adminComment ? `
運営からのメッセージ:
${data.adminComment}
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━
■ 今後の流れ
━━━━━━━━━━━━━━━━━━━━━━━━
・参加枠に空きが出た場合、順次繰り上げて参加確定となります
・参加確定となりましたら、改めてメールにてご連絡いたします

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
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
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
    .warning-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .warning-box strong {
      color: #92400e;
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
      border-bottom: 2px solid #f59e0b;
      padding-bottom: 8px;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏳ キャンセル待ちへ変更</h1>
    </div>

    <div class="content">
      <div class="warning-box">
        <strong>参加状態がキャンセル待ちに変更されました</strong>
        <p style="margin: 0;">「${data.tournamentName}」の参加状態がキャンセル待ちに変更されました。</p>
      </div>

      ${data.adminComment ? `
      <div class="info-section">
        <h2>💬 運営からのメッセージ</h2>
        <p>${data.adminComment}</p>
      </div>
      ` : ''}

      <div class="info-section">
        <h2>📌 今後の流れ</h2>
        <ul style="margin: 0; padding-left: 20px;">
          <li>参加枠に空きが出た場合、順次繰り上げて参加確定となります</li>
          <li>参加確定となりましたら、改めてメールにてご連絡いたします</li>
        </ul>
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

/**
 * 参加キャンセル通知メール
 */
export function generateParticipationCancelledNotification(data: {
  teamName: string;
  tournamentName: string;
  adminComment?: string;
}): { subject: string; text: string; html: string } {
  const subject = `【参加キャンセル】${data.tournamentName}`;

  const text = `
${data.teamName} 様

「${data.tournamentName}」の参加がキャンセルされましたのでお知らせいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ キャンセル通知
━━━━━━━━━━━━━━━━━━━━━━━━
大会名: ${data.tournamentName}
ステータス: キャンセル済み

${data.adminComment ? `
運営からのメッセージ:
${data.adminComment}
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━

またのご参加をお待ちしております。

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
      background: linear-gradient(135deg, #64748b 0%, #475569 100%);
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
    .cancel-box {
      background: #f1f5f9;
      border-left: 4px solid #64748b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .cancel-box strong {
      color: #1e293b;
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
      border-bottom: 2px solid #64748b;
      padding-bottom: 8px;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ 参加キャンセルのお知らせ</h1>
    </div>

    <div class="content">
      <div class="cancel-box">
        <strong>参加がキャンセルされました</strong>
        <p style="margin: 0;">「${data.tournamentName}」の参加がキャンセルされました。</p>
      </div>

      ${data.adminComment ? `
      <div class="info-section">
        <h2>💬 運営からのメッセージ</h2>
        <p>${data.adminComment}</p>
      </div>
      ` : ''}

      <p style="text-align: center; margin: 30px 0;">またのご参加をお待ちしております。</p>
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
