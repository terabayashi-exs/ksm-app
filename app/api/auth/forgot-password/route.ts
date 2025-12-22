// app/api/auth/forgot-password/route.ts
// パスワードリセット申請API

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";
import { sendEmail } from "@/lib/email/mailer";
import { format } from "date-fns";

export async function POST(request: Request) {
  try {
    const { teamId, email } = await request.json();

    if (!teamId || !email) {
      return NextResponse.json(
        { error: "チームIDとメールアドレスを入力してください" },
        { status: 400 }
      );
    }

    // チームIDとメールアドレスの組み合わせを検証
    const teamResult = await db.execute(
      `SELECT team_id, team_name, contact_email, is_active
       FROM m_teams
       WHERE team_id = ? AND contact_email = ? AND is_active = 1`,
      [teamId, email]
    );

    if (teamResult.rows.length === 0) {
      // セキュリティ上、存在しないことを明示しない
      return NextResponse.json(
        {
          success: true,
          message: "登録されているメールアドレスにパスワードリセットのご案内を送信しました。メールをご確認ください。"
        },
        { status: 200 }
      );
    }

    const team = teamResult.rows[0];

    // リセットトークンの生成（セキュアなランダム文字列）
    const resetToken = crypto.randomBytes(32).toString("hex");

    // 既存の未使用トークンを削除（同じチームの古いリクエストをクリーンアップ）
    await db.execute(
      `DELETE FROM t_password_reset_tokens
       WHERE team_id = ? AND used_at IS NULL`,
      [teamId]
    );

    // 新しいトークンを保存（有効期限は1時間後、JSTで保存）
    await db.execute(
      `INSERT INTO t_password_reset_tokens (team_id, reset_token, expires_at)
       VALUES (?, ?, datetime('now', '+9 hours', '+1 hour'))`,
      [teamId, resetToken]
    );

    // 保存した有効期限を取得
    const tokenResult = await db.execute(
      `SELECT expires_at FROM t_password_reset_tokens WHERE reset_token = ?`,
      [resetToken]
    );
    const expiresAtStr = tokenResult.rows[0].expires_at as string;

    // リセットURLの生成
    const baseUrl = process.env.NEXTAUTH_URL || request.headers.get("origin") || "";
    const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;

    // 有効期限の日本語表記（データベースの値はJSTなのでそのまま使用）
    const expiresAtFormatted = format(new Date(expiresAtStr.replace(' ', 'T')), "yyyy年MM月dd日 HH:mm");

    // メールテンプレートの作成
    const emailSubject = "【楽勝 GO】パスワードリセットのご案内";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background: white; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .info-box { background: #dbeafe; border: 1px solid #3b82f6; border-radius: 6px; padding: 15px; margin: 20px 0; }
        .warning-box { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏆 楽勝 GO</h1>
            <p>パスワードリセットのご案内</p>
        </div>
        <div class="content">
            <p>${team.team_name} 様</p>
            <h2>🔑 パスワードリセットリクエスト</h2>
            <p>パスワードリセットのリクエストを受け付けました。</p>
            <p><strong>チームID:</strong> ${teamId}</p>
            <div class="info-box">
                <h3>📋 リセット手順</h3>
                <p>以下のボタンをクリックして、新しいパスワードを設定してください。</p>
                <div style="text-align: center;">
                    <a href="${resetUrl}" class="button">パスワードをリセットする</a>
                </div>
                <p style="font-size: 12px; color: #64748b;">ボタンが機能しない場合は、以下のURLをブラウザにコピー&ペーストしてください：</p>
                <p style="word-break: break-all; background: #f1f5f9; padding: 10px; border-radius: 4px;">${resetUrl}</p>
            </div>
            <div class="warning-box">
                <h3>⚠️ 重要事項</h3>
                <ul>
                    <li><strong>有効期限:</strong> ${expiresAtFormatted} まで（1時間）</li>
                    <li><strong>セキュリティ:</strong> このリンクは1回のみ使用可能です</li>
                    <li><strong>心当たりがない場合:</strong> このメールを無視してください</li>
                </ul>
            </div>
            <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
        </div>
    </div>
</body>
</html>`;

    const emailText = `
【楽勝 GO】パスワードリセットのご案内

${team.team_name} 様

パスワードリセットのリクエストを受け付けました。

■ リセット情報
チームID: ${teamId}

■ リセット手順
以下のURLにアクセスして、新しいパスワードを設定してください。

${resetUrl}

■ 重要事項
・有効期限: ${expiresAtFormatted} まで（1時間）
・このリンクは1回のみ使用可能です
・心当たりがない場合は、このメールを無視してください

ご不明な点がございましたら、お気軽にお問い合わせください。

───────────────────────────
このメールは自動送信されています。
© 楽勝 GO 運営事務局
───────────────────────────
`;

    // メール送信
    try {
      await sendEmail({
        to: email,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
      });
    } catch (error) {
      console.error("Password reset email failed:", error);
      return NextResponse.json(
        { error: "メール送信に失敗しました。しばらく時間をおいて再度お試しください。" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "登録されているメールアドレスにパスワードリセットのご案内を送信しました。メールをご確認ください。"
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "パスワードリセット申請の処理中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
