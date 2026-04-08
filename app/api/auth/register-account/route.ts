// app/api/auth/register-account/route.ts

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { token, display_name, password } = await request.json();

    // バリデーション
    if (!token) {
      return NextResponse.json({ success: false, error: "トークンが必要です" }, { status: 400 });
    }
    if (!display_name || display_name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "表示名を入力してください" },
        { status: 400 },
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: "パスワードは6文字以上で入力してください" },
        { status: 400 },
      );
    }

    // トークン検証
    const tokenResult = await db.execute(
      `
      SELECT token_id, email, expires_at, used
      FROM t_email_verification_tokens
      WHERE token = ? AND purpose = 'registration'
    `,
      [token],
    );

    if (tokenResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "無効なトークンです" }, { status: 400 });
    }

    const tokenData = tokenResult.rows[0];

    if (tokenData.used) {
      return NextResponse.json(
        { success: false, error: "このトークンは既に使用されています" },
        { status: 400 },
      );
    }

    const expiresAt = new Date(String(tokenData.expires_at));
    if (expiresAt < new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: "トークンの有効期限が切れています。再度登録申請を行ってください。",
        },
        { status: 400 },
      );
    }

    const email = String(tokenData.email);

    // メールアドレスの重複チェック
    const existingUser = await db.execute(
      `
      SELECT login_user_id FROM m_login_users WHERE email = ?
    `,
      [email],
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: "このメールアドレスは既に登録されています" },
        { status: 400 },
      );
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, 12);

    // m_login_users に登録
    await db.execute(
      `
      INSERT INTO m_login_users (email, password_hash, display_name, is_superadmin, is_active)
      VALUES (?, ?, ?, 0, 1)
    `,
      [email, passwordHash, display_name.trim()],
    );

    // トークンを使用済みにする
    await db.execute(
      `
      UPDATE t_email_verification_tokens
      SET used = 1
      WHERE token = ?
    `,
      [token],
    );

    return NextResponse.json({
      success: true,
      message: "アカウント登録が完了しました。",
    });
  } catch (error) {
    console.error("Account registration error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "アカウント登録に失敗しました",
        details: process.env.NODE_ENV === "development" ? String(error) : undefined,
      },
      { status: 500 },
    );
  }
}
