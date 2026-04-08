// app/api/my/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.loginUserId) {
    return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
  }

  const result = await db.execute(
    `SELECT display_name, email, organization_name FROM m_login_users WHERE login_user_id = ?`,
    [session.user.loginUserId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "ユーザーが見つかりません" },
      { status: 404 },
    );
  }

  const row = result.rows[0];
  return NextResponse.json({
    success: true,
    data: {
      display_name: String(row.display_name),
      email: String(row.email),
      organization_name: row.organization_name ? String(row.organization_name) : "",
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.loginUserId) {
    return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const displayName = (body.display_name ?? "").trim();
  const organizationName = (body.organization_name ?? "").trim();

  if (!displayName || displayName.length > 50) {
    return NextResponse.json(
      { success: false, error: "表示名は1〜50文字で入力してください" },
      { status: 400 },
    );
  }

  await db.execute(
    `UPDATE m_login_users SET display_name = ?, organization_name = ?, updated_at = datetime('now', '+9 hours') WHERE login_user_id = ?`,
    [displayName, organizationName || null, session.user.loginUserId],
  );

  return NextResponse.json({ success: true, message: "プロフィールを更新しました" });
}
