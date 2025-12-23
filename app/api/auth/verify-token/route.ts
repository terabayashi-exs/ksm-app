// app/api/auth/verify-token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'トークンが必要です' },
        { status: 400 }
      );
    }

    // トークンを検証
    const result = await db.execute(`
      SELECT token_id, email, expires_at, used
      FROM t_email_verification_tokens
      WHERE token = ? AND purpose = 'registration'
    `, [token]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '無効なトークンです' },
        { status: 400 }
      );
    }

    const tokenData = result.rows[0];

    // 使用済みチェック
    if (tokenData.used) {
      return NextResponse.json(
        { success: false, error: 'このトークンは既に使用されています' },
        { status: 400 }
      );
    }

    // 有効期限チェック
    const expiresAt = new Date(String(tokenData.expires_at));
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: 'トークンの有効期限が切れています' },
        { status: 400 }
      );
    }

    // メールアドレスの重複チェック（念のため再確認）
    const existingTeam = await db.execute(`
      SELECT team_id FROM m_teams WHERE contact_email = ?
    `, [tokenData.email]);

    if (existingTeam.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'このメールアドレスは既に登録されています。別のメールアドレスで再度お申し込みください。' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      email: tokenData.email,
    });

  } catch (error) {
    console.error('Token verification error:', error);

    let errorMessage = 'トークン検証に失敗しました';

    if (error instanceof Error) {
      if (error.message.includes('no such column')) {
        errorMessage = 'データベースエラーが発生しました。システム管理者にお問い合わせください。';
      } else if (error.message.includes('no such table')) {
        errorMessage = 'システムエラーが発生しました。管理者にお問い合わせください。';
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
