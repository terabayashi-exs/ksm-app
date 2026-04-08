// app/api/administrators/[id]/route.ts

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 個別利用者の取得
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const resolvedParams = await params;
    const loginUserId = Number(resolvedParams.id);

    const result = await db.execute(
      `
      SELECT
        u.login_user_id,
        u.display_name,
        u.email,
        u.is_active,
        u.is_superadmin,
        u.organization_name,
        u.created_at,
        u.updated_at
      FROM m_login_users u
      INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
      WHERE u.login_user_id = ? AND r.role = 'admin'
    `,
      [loginUserId],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "利用者が見つかりません" },
        { status: 404 },
      );
    }

    const row = result.rows[0];
    return NextResponse.json({
      success: true,
      data: {
        admin_id: Number(row.login_user_id),
        admin_name: String(row.display_name),
        email: String(row.email),
        role: "admin",
        is_active: Number(row.is_active) === 1,
        is_superadmin: Number(row.is_superadmin) === 1,
        organization_name: row.organization_name ? String(row.organization_name) : "",
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      },
    });
  } catch (error) {
    console.error("利用者取得エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "利用者データの取得に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// 利用者の更新
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const resolvedParams = await params;
    const loginUserId = Number(resolvedParams.id);

    const body = await request.json();
    const { admin_name, email, password, is_active, is_superadmin, organization_name } = body;

    // バリデーション
    if (!admin_name || !admin_name.trim()) {
      return NextResponse.json(
        { success: false, error: "管理者名を入力してください" },
        { status: 400 },
      );
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { success: false, error: "メールアドレスを入力してください" },
        { status: 400 },
      );
    }

    if (password && password.length < 6) {
      return NextResponse.json(
        { success: false, error: "パスワードは6文字以上で入力してください" },
        { status: 400 },
      );
    }

    // 存在確認
    const existingUser = await db.execute(
      `
      SELECT u.login_user_id
      FROM m_login_users u
      INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
      WHERE u.login_user_id = ? AND r.role = 'admin'
    `,
      [loginUserId],
    );

    if (existingUser.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "利用者が見つかりません" },
        { status: 404 },
      );
    }

    // メールアドレスの重複チェック（自分以外）
    const duplicateUser = await db.execute(
      `
      SELECT login_user_id FROM m_login_users WHERE email = ? AND login_user_id != ?
    `,
      [email.trim(), loginUserId],
    );

    if (duplicateUser.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: "同じメールアドレスが既に登録されています" },
        { status: 400 },
      );
    }

    const isActiveValue = is_active === false ? 0 : 1;
    const isSuperadminValue = is_superadmin === true ? 1 : 0;

    const orgName = organization_name?.trim() || null;

    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.execute(
        `
        UPDATE m_login_users
        SET display_name = ?, email = ?, password_hash = ?, is_active = ?, is_superadmin = ?,
            organization_name = ?,
            current_plan_id = COALESCE(current_plan_id, 1),
            updated_at = datetime('now', '+9 hours')
        WHERE login_user_id = ?
      `,
        [
          admin_name.trim(),
          email.trim(),
          hashedPassword,
          isActiveValue,
          isSuperadminValue,
          orgName,
          loginUserId,
        ],
      );
    } else {
      await db.execute(
        `
        UPDATE m_login_users
        SET display_name = ?, email = ?, is_active = ?, is_superadmin = ?,
            organization_name = ?,
            current_plan_id = COALESCE(current_plan_id, 1),
            updated_at = datetime('now', '+9 hours')
        WHERE login_user_id = ?
      `,
        [admin_name.trim(), email.trim(), isActiveValue, isSuperadminValue, orgName, loginUserId],
      );
    }

    return NextResponse.json({
      success: true,
      message: "利用者が正常に更新されました",
    });
  } catch (error) {
    console.error("利用者更新エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "利用者の更新に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// 利用者の削除
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const resolvedParams = await params;
    const loginUserId = Number(resolvedParams.id);

    // 存在確認
    const existingUser = await db.execute(
      `
      SELECT u.login_user_id
      FROM m_login_users u
      INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
      WHERE u.login_user_id = ? AND r.role = 'admin'
    `,
      [loginUserId],
    );

    if (existingUser.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "利用者が見つかりません" },
        { status: 404 },
      );
    }

    // 管理者が1人しかいない場合は削除不可
    const adminCountResult = await db.execute(`
      SELECT COUNT(*) as count
      FROM m_login_user_roles
      WHERE role = 'admin'
    `);

    const adminCount = Number(adminCountResult.rows[0]?.count) || 0;
    if (adminCount <= 1) {
      return NextResponse.json(
        {
          success: false,
          error: "利用者を全て削除することはできません。最低1人の管理者が必要です。",
        },
        { status: 400 },
      );
    }

    // admin ロールのみ削除（アカウント自体は残す）
    await db.execute(
      `
      DELETE FROM m_login_user_roles WHERE login_user_id = ? AND role = 'admin'
    `,
      [loginUserId],
    );

    return NextResponse.json({
      success: true,
      message: "利用者が正常に削除されました",
    });
  } catch (error) {
    console.error("利用者削除エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "利用者の削除に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
