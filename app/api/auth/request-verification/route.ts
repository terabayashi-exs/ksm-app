// app/api/auth/request-verification/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { sendEmail } from '@/lib/email/mailer';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'メールアドレスを正しく入力してください' },
        { status: 400 }
      );
    }

    // メールアドレスの重複チェック
    const existingTeam = await db.execute(`
      SELECT team_id FROM m_teams WHERE contact_email = ?
    `, [email]);

    if (existingTeam.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'このメールアドレスは既に登録されています。別のメールアドレスをご使用ください。' },
        { status: 400 }
      );
    }

    // 既存のトークンを無効化
    await db.execute(`
      UPDATE t_email_verification_tokens
      SET used = 1
      WHERE email = ? AND purpose = 'registration' AND used = 0
    `, [email]);

    // 新しいトークンを生成
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分後

    // トークンをDBに保存
    await db.execute(`
      INSERT INTO t_email_verification_tokens (email, token, purpose, expires_at)
      VALUES (?, ?, 'registration', ?)
    `, [email, token, expiresAt.toISOString()]);

    // 認証用URL
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const verificationUrl = `${baseUrl}/auth/register?token=${token}`;

    // メール送信
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">チーム登録のご案内</h2>
        <p>楽勝 GOへのチーム登録ありがとうございます。</p>
        <p>以下のリンクをクリックして、チーム登録を完了してください。</p>
        <p style="margin: 30px 0;">
          <a href="${verificationUrl}"
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            チーム登録を完了する
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          このリンクは10分間有効です。<br>
          有効期限が切れた場合は、再度チーム登録申請を行ってください。
        </p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #999; font-size: 12px;">
          このメールに心当たりがない場合は、削除してください。
        </p>
      </div>
    `;

    const textContent = `
楽勝 GO - チーム登録のご案内

楽勝 GOへのチーム登録ありがとうございます。

以下のリンクをクリックして、チーム登録を完了してください。
${verificationUrl}

このリンクは10分間有効です。
有効期限が切れた場合は、再度チーム登録申請を行ってください。

このメールに心当たりがない場合は、削除してください。
    `;

    await sendEmail({
      to: email,
      subject: '【楽勝 GO】チーム登録のご案内',
      text: textContent,
      html: htmlContent,
    });

    return NextResponse.json({
      success: true,
      message: 'メールを送信しました。メールボックスをご確認ください。',
    });

  } catch (error) {
    console.error('Verification email error:', error);

    // エラーメッセージを詳細に分類
    let errorMessage = 'メール送信に失敗しました';

    if (error instanceof Error) {
      if (error.message.includes('no such column')) {
        errorMessage = 'データベースエラーが発生しました。システム管理者にお問い合わせください。';
      } else if (error.message.includes('SMTP')) {
        errorMessage = 'メール送信サーバーに接続できませんでした。しばらく経ってから再度お試しください。';
      } else if (error.message.includes('invalid email')) {
        errorMessage = 'メールアドレスの形式が正しくありません。';
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}
