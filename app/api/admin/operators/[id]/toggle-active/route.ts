import { NextResponse } from "next/server";
import { auth, ExtendedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasOperatorPermission } from "@/lib/operator-permission-check";

/**
 * PUT /api/admin/operators/[id]/toggle-active
 * 運営者の有効/無効を切り替え
 */
export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = session.user as ExtendedUser;
    const roles = user.roles || [];
    const isAdmin = roles.includes("admin");
    const adminLoginUserId = user.loginUserId;
    const isSuperadmin = !!user.isSuperadmin;
    const isOperatorWithPerm =
      roles.includes("operator") && adminLoginUserId
        ? await hasOperatorPermission(adminLoginUserId, "canManageOperators")
        : false;
    if (!isAdmin && !isOperatorWithPerm) {
      return NextResponse.json({ error: "権限がありません" }, { status: 401 });
    }
    if (!adminLoginUserId) {
      return NextResponse.json({ error: "管理者情報が見つかりません" }, { status: 404 });
    }

    const resolvedParams = await params;
    const operatorId = parseInt(resolvedParams.id);

    // 運営者を取得（m_login_users + m_login_user_roles）
    const operatorResult = await db.execute({
      sql: `SELECT u.is_active, u.created_by_login_user_id
            FROM m_login_users u
            INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
            WHERE u.login_user_id = ? AND r.role = 'operator'`,
      args: [operatorId],
    });

    if (operatorResult.rows.length === 0) {
      return NextResponse.json({ error: "運営者が見つかりません" }, { status: 404 });
    }

    const operator = operatorResult.rows[0];

    // 所属確認（自分が作成した運営者のみ操作可能、スーパー管理者は全運営者を操作可能）
    if (!isSuperadmin && operator.created_by_login_user_id !== adminLoginUserId) {
      return NextResponse.json({ error: "この運営者を操作する権限がありません" }, { status: 403 });
    }

    // 有効/無効を切り替え
    const newIsActive = operator.is_active === 1 ? 0 : 1;

    await db.execute({
      sql: `UPDATE m_login_users
            SET is_active = ?, updated_at = datetime('now', '+9 hours')
            WHERE login_user_id = ?`,
      args: [newIsActive, operatorId],
    });

    return NextResponse.json({
      message: newIsActive === 1 ? "運営者を有効にしました" : "運営者を無効にしました",
      isActive: newIsActive,
    });
  } catch (error) {
    console.error("運営者有効/無効切り替えエラー:", error);
    return NextResponse.json({ error: "運営者の有効/無効切り替えに失敗しました" }, { status: 500 });
  }
}
