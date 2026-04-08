// app/api/my/profile/change-password/route.ts

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.loginUserId) {
    return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { success: false, error: "現在のパスワードと新しいパスワードを入力してください" },
      { status: 400 },
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { success: false, error: "新しいパスワードは8文字以上で入力してください" },
      { status: 400 },
    );
  }

  // 現在のパスワードハッシュを取得
  const result = await db.execute(
    `SELECT password_hash FROM m_login_users WHERE login_user_id = ?`,
    [session.user.loginUserId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "ユーザーが見つかりません" },
      { status: 404 },
    );
  }

  const passwordHash = String(result.rows[0].password_hash);

  // 現在のパスワードを検証
  const isValid = await bcrypt.compare(currentPassword, passwordHash);
  if (!isValid) {
    return NextResponse.json(
      { success: false, error: "現在のパスワードが正しくありません" },
      { status: 400 },
    );
  }

  // 新しいパスワードをハッシュ化して保存
  const newHash = await bcrypt.hash(newPassword, 12);
  await db.execute(
    `UPDATE m_login_users SET password_hash = ?, updated_at = datetime('now', '+9 hours') WHERE login_user_id = ?`,
    [newHash, session.user.loginUserId],
  );

  return NextResponse.json({ success: true, message: "パスワードを変更しました" });
}
