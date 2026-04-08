// app/api/administrators/check-email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// メールアドレスで既存ユーザーを確認する
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const { email } = body;

    if (!email || !email.trim()) {
      return NextResponse.json(
        { success: false, error: "メールアドレスを入力してください" },
        { status: 400 },
      );
    }

    // m_login_users にアカウントが存在するか確認
    const userResult = await db.execute(
      `
      SELECT login_user_id, display_name, email, is_active
      FROM m_login_users
      WHERE email = ?
    `,
      [email.trim()],
    );

    if (userResult.rows.length === 0) {
      // アカウントなし → 新規作成フローへ
      return NextResponse.json({
        success: true,
        exists: false,
      });
    }

    const user = userResult.rows[0];
    const loginUserId = Number(user.login_user_id);

    // 既に admin ロールを持っているか確認
    const roleResult = await db.execute(
      `
      SELECT id FROM m_login_user_roles
      WHERE login_user_id = ? AND role = 'admin'
    `,
      [loginUserId],
    );

    if (roleResult.rows.length > 0) {
      // 既に管理者として登録済み
      return NextResponse.json({
        success: true,
        exists: true,
        already_admin: true,
        user: {
          login_user_id: loginUserId,
          display_name: String(user.display_name),
          email: String(user.email),
        },
      });
    }

    // アカウントあり・admin ロールなし → ロール付与可能
    return NextResponse.json({
      success: true,
      exists: true,
      already_admin: false,
      user: {
        login_user_id: loginUserId,
        display_name: String(user.display_name),
        email: String(user.email),
      },
    });
  } catch (error) {
    console.error("メールアドレス確認エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "メールアドレスの確認に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
