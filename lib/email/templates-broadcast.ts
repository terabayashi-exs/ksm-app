/**
 * カスタムメール送信用テンプレート
 */
export function generateCustomBroadcastEmail(data: {
  title: string;
  body: string;
  tournamentName?: string;
  organizerEmail?: string; // 大会運営者のメールアドレス
  tournamentId?: number; // 大会ID（URL生成用）
  baseUrl?: string; // ベースURL（デフォルト: NEXT_PUBLIC_BASE_URL環境変数）
}): { subject: string; text: string; html: string } {
  const subject = data.title;

  // 大会詳細URLの生成
  const baseUrl = data.baseUrl ||
                  process.env.NEXT_PUBLIC_BASE_URL ||
                  process.env.NEXTAUTH_URL ||
                  'https://rakusyo-go.com';
  const tournamentUrl = data.tournamentId
    ? `${baseUrl}/public/tournaments/${data.tournamentId}`
    : null;

  // URL置換処理
  let processedBody = data.body;
  if (tournamentUrl) {
    processedBody = processedBody.replace(/\[URLをここに記載\]/g, tournamentUrl);
  }

  // 処理日時の置換
  const now = new Date();
  const processedDate = now.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  processedBody = processedBody.replace(/\[処理日時\]/g, processedDate);

  // フッター部分（問い合わせ先）
  const contactFooter = data.organizerEmail
    ? `\n\nご不明な点がございましたら、大会運営者までお問い合わせください。\n${data.organizerEmail}`
    : '';

  const text = `
${processedBody}${contactFooter}

${data.tournamentName ? `━━━━━━━━━━━━━━━━━━━━━━━━
大会名: ${data.tournamentName}
━━━━━━━━━━━━━━━━━━━━━━━━

` : ''}楽勝GO大会運営システム
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif;
      line-height: 1.8;
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
      font-size: 22px;
      font-weight: bold;
      word-wrap: break-word;
    }
    .content {
      padding: 30px 20px;
    }
    .message-body {
      background: #f9fafb;
      padding: 20px;
      border-radius: 6px;
      margin: 20px 0;
      border-left: 4px solid #2563eb;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .tournament-info {
      background: #eff6ff;
      padding: 15px;
      border-radius: 6px;
      margin: 20px 0;
      border: 1px solid #dbeafe;
      text-align: center;
    }
    .tournament-info strong {
      color: #1e40af;
      font-size: 16px;
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
      <h1>${data.title}</h1>
    </div>

    <div class="content">
      <div class="message-body">${processedBody.replace(/\n/g, '<br>')}</div>

      ${data.organizerEmail ? `
      <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          <strong>📧 お問い合わせ先</strong><br>
          ご不明な点がございましたら、大会運営者までお問い合わせください。<br>
          <a href="mailto:${data.organizerEmail}" style="color: #2563eb; text-decoration: none;">${data.organizerEmail}</a>
        </p>
      </div>
      ` : ''}

      ${data.tournamentName ? `
      <div class="tournament-info">
        <strong>📋 大会名: ${data.tournamentName}</strong>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      <p>楽勝GO大会運営システム</p>
      <p style="margin: 5px 0 0 0; font-size: 12px;">このメールは楽勝GO運営から送信されています。</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * メールプリセット定数（データベース不要）
 */
export const EMAIL_PRESETS = {
  custom: {
    id: 'custom',
    name: 'カスタム（自由記述）',
    title: '',
    body: '',
  },
  scheduleChange: {
    id: 'scheduleChange',
    name: '試合日程変更のお知らせ',
    title: '【重要】試合日程変更のお知らせ',
    body: `チーム代表者の皆様

お疲れ様です。大会運営事務局です。

試合日程に変更がございましたので、お知らせいたします。

■変更内容
・変更前: [ここに記載]
・変更後: [ここに記載]

■変更理由
[ここに記載]

ご確認の程、よろしくお願いいたします。`,
  },
  reminder: {
    id: 'reminder',
    name: '大会参加リマインド',
    title: '【リマインド】大会参加について',
    body: `チーム代表者の皆様

お疲れ様です。大会運営事務局です。

大会開催日が近づいてまいりましたので、ご連絡いたします。

■開催日時
[ここに記載]

■会場
[ここに記載]

■確認事項
・選手登録情報の最終確認をお願いいたします
・当日の集合時刻: [ここに記載]
・持ち物: [ここに記載]`,
  },
  importantNotice: {
    id: 'importantNotice',
    name: '重要なお知らせ',
    title: '【重要】大会に関するお知らせ',
    body: `チーム代表者の皆様

お疲れ様です。大会運営事務局です。

重要なお知らせがございますので、ご連絡いたします。

■お知らせ内容
[ここに記載]

■対応のお願い
[ここに記載]

ご確認の程、よろしくお願いいたします。`,
  },
  thankYou: {
    id: 'thankYou',
    name: '大会終了のお礼',
    title: '【お礼】大会へのご参加ありがとうございました',
    body: `チーム代表者の皆様

お疲れ様でした。大会運営事務局です。

この度は大会にご参加いただき、誠にありがとうございました。

皆様のおかげで無事に大会を終えることができました。

■結果について
大会結果は以下のページからご確認いただけます。
[URLをここに記載]

■アンケートのお願い
今後の大会運営の参考とさせていただきたく、アンケートへのご協力をお願いいたします。
[URLをここに記載]

またの機会がございましたら、ぜひご参加ください。
今後ともよろしくお願いいたします。`,
  },
  participationConfirmed: {
    id: 'participationConfirmed',
    name: '参加確定通知',
    title: '【参加確定】大会への参加が確定しました',
    body: `チーム代表者の皆様

お疲れ様です。大会運営事務局です。

この度は大会への参加申請をいただき、ありがとうございました。
正式に参加確定となりましたことをお知らせいたします。

■対象チーム
{{teamName}}

■次のステップ
・チーム代表者ダッシュボードから選手情報を確認してください
・大会の詳細情報は、以下のページからご確認いただけます

大会詳細ページ: [URLをここに記載]

引き続き、よろしくお願いいたします。`,
  },
  participationNotSelected: {
    id: 'participationNotSelected',
    name: '参加見送り通知',
    title: '【選考結果】大会参加について',
    body: `チーム代表者の皆様

お疲れ様です。大会運営事務局です。

この度は大会への参加申請をいただき、誠にありがとうございました。

慎重に選考させていただきました結果、誠に残念ながら、
今回は参加をお見送りさせていただくこととなりました。

■対象チーム
{{teamName}}

多数のご応募をいただいたため、やむを得ずこのような結果となりましたことを、
何卒ご理解いただけますと幸いです。

またの機会がございましたら、ぜひご参加いただけますよう、
心よりお待ちしております。

今後ともよろしくお願いいたします。`,
  },
  withdrawal_approved: {
    id: 'withdrawal_approved',
    name: '辞退承認通知',
    title: '【辞退承認】辞退申請が承認されました',
    body: `チーム代表者の皆様

お疲れ様です。大会運営事務局です。

この度は、大会への辞退申請をいただき、ありがとうございました。
辞退申請を承認いたしましたので、お知らせいたします。

■対象チーム
{{teamName}}

■承認内容
・ステータス: 辞退承認済み
・処理日時: [処理日時]

今回は残念ではございますが、またの機会がございましたら、ぜひご参加ください。
今後ともよろしくお願いいたします。`,
  },
  withdrawal_rejected: {
    id: 'withdrawal_rejected',
    name: '辞退却下通知',
    title: '【辞退却下】辞退申請について',
    body: `チーム代表者の皆様

お疲れ様です。大会運営事務局です。

この度は、大会への辞退申請をいただきました。
慎重に検討させていただきました結果、誠に恐れ入りますが、
今回の辞退申請を却下させていただくこととなりました。

■対象チーム
{{teamName}}

■却下理由
・大会運営上の都合により、辞退を承認することができませんでした
・詳細については別途ご連絡させていただきます

ご理解のほど、よろしくお願いいたします。`,
  },
} as const;

export type EmailPresetId = keyof typeof EMAIL_PRESETS;
