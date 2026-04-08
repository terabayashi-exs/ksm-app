import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasOperatorPermission } from "@/lib/operator-permission-check";

/**
 * GET /api/admin/operators
 * 管理者配下の運営者一覧を取得
 * ?group_id=N を指定した場合、そのグループの部門にアクセス権がある運営者のみ返す
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const adminLoginUserId = (session.user as { loginUserId?: number }).loginUserId;
    const isSuperadmin = !!(session.user as { isSuperadmin?: boolean }).isSuperadmin;
    const roles = (session.user as { roles?: string[] }).roles || [];
    const isAdmin = roles.includes("admin");
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

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("group_id");

    let operatorsResult;

    if (isOperatorWithPerm && !isAdmin && !isSuperadmin) {
      // operator権限者: 自分がアクセス権を持つ大会と同じグループの運営者を全て表示
      if (groupId) {
        operatorsResult = await db.execute({
          sql: `SELECT DISTINCT
                  u.login_user_id,
                  u.email,
                  u.display_name,
                  u.is_active,
                  u.created_at,
                  u.updated_at
                FROM m_login_users u
                INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
                INNER JOIN t_operator_tournament_access ota ON u.login_user_id = ota.operator_id
                INNER JOIN t_tournaments t ON ota.tournament_id = t.tournament_id
                WHERE r.role = 'operator'
                  AND t.group_id = ?
                ORDER BY u.created_at DESC`,
          args: [parseInt(groupId)],
        });
      } else {
        // group_id未指定: 自分がアクセス権を持つ大会のグループに属する全運営者
        operatorsResult = await db.execute({
          sql: `SELECT DISTINCT
                  u.login_user_id,
                  u.email,
                  u.display_name,
                  u.is_active,
                  u.created_at,
                  u.updated_at
                FROM m_login_users u
                INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
                INNER JOIN t_operator_tournament_access ota ON u.login_user_id = ota.operator_id
                INNER JOIN t_tournaments t ON ota.tournament_id = t.tournament_id
                WHERE r.role = 'operator'
                  AND t.group_id IN (
                    SELECT DISTINCT t2.group_id
                    FROM t_operator_tournament_access ota2
                    INNER JOIN t_tournaments t2 ON ota2.tournament_id = t2.tournament_id
                    WHERE ota2.operator_id = ?
                  )
                ORDER BY u.created_at DESC`,
          args: [adminLoginUserId],
        });
      }
    } else if (groupId) {
      // admin: group_id指定時
      const baseCondition = isSuperadmin ? "" : "AND u.created_by_login_user_id = ?";
      const args = isSuperadmin ? [parseInt(groupId)] : [parseInt(groupId), adminLoginUserId];

      operatorsResult = await db.execute({
        sql: `SELECT DISTINCT
                u.login_user_id,
                u.email,
                u.display_name,
                u.is_active,
                u.created_at,
                u.updated_at
              FROM m_login_users u
              INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
              INNER JOIN t_operator_tournament_access ota ON u.login_user_id = ota.operator_id
              INNER JOIN t_tournaments t ON ota.tournament_id = t.tournament_id
              WHERE r.role = 'operator'
                AND t.group_id = ?
                ${baseCondition}
              ORDER BY u.created_at DESC`,
        args,
      });
    } else {
      // admin: group_id未指定時
      operatorsResult = isSuperadmin
        ? await db.execute({
            sql: `SELECT
                    u.login_user_id,
                    u.email,
                    u.display_name,
                    u.is_active,
                    u.created_at,
                    u.updated_at
                  FROM m_login_users u
                  INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
                  WHERE r.role = 'operator'
                  ORDER BY u.created_at DESC`,
            args: [],
          })
        : await db.execute({
            sql: `SELECT
                    u.login_user_id,
                    u.email,
                    u.display_name,
                    u.is_active,
                    u.created_at,
                    u.updated_at
                  FROM m_login_users u
                  INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
                  WHERE r.role = 'operator' AND u.created_by_login_user_id = ?
                  ORDER BY u.created_at DESC`,
            args: [adminLoginUserId],
          });
    }

    // アクセス可能な部門を取得
    const operators = await Promise.all(
      operatorsResult.rows.map(async (operator) => {
        const accessResult = await db.execute({
          sql: `SELECT
                  ota.tournament_id,
                  ota.permissions,
                  t.tournament_name,
                  t.category_name,
                  t.group_id,
                  tg.group_name
                FROM t_operator_tournament_access ota
                JOIN t_tournaments t ON ota.tournament_id = t.tournament_id
                JOIN t_tournament_groups tg ON t.group_id = tg.group_id
                WHERE ota.operator_id = ?
                ORDER BY tg.group_name, t.category_name`,
          args: [operator.login_user_id],
        });

        return {
          operatorId: Number(operator.login_user_id),
          operatorLoginId: operator.email,
          operatorName: operator.display_name,
          isActive: operator.is_active === 1,
          createdAt: operator.created_at,
          updatedAt: operator.updated_at,
          accessibleTournaments: accessResult.rows.map((row) => ({
            tournamentId: Number(row.tournament_id),
            tournamentName: row.tournament_name,
            categoryName: row.category_name,
            groupId: Number(row.group_id),
            groupName: row.group_name,
            permissions: JSON.parse(row.permissions as string),
          })),
        };
      }),
    );

    return NextResponse.json(operators);
  } catch (error) {
    console.error("運営者一覧取得エラー:", error);
    return NextResponse.json({ error: "運営者一覧の取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST /api/admin/operators
 * 新しい運営者を登録
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = session.user as { loginUserId?: number; roles?: string[] };
    const roles = user.roles || [];
    const isAdmin = roles.includes("admin");
    const adminLoginUserId = user.loginUserId;
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

    const body = await request.json();

    // メールアドレス（ログインID）の重複チェック
    const duplicateCheck = await db.execute({
      sql: "SELECT login_user_id FROM m_login_users WHERE email = ?",
      args: [body.operatorLoginId],
    });

    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json(
        { error: "このメールアドレスは既に使用されています" },
        { status: 400 },
      );
    }

    // パスワードをハッシュ化
    const passwordHash = await bcrypt.hash(body.password, 10);

    // operatorの場合、自分の作成者（親管理者）を特定して引き継ぐ
    let createdByLoginUserId = adminLoginUserId;
    if (isOperatorWithPerm && !isAdmin) {
      const parentResult = await db.execute({
        sql: "SELECT created_by_login_user_id FROM m_login_users WHERE login_user_id = ?",
        args: [adminLoginUserId],
      });
      if (parentResult.rows.length > 0 && parentResult.rows[0].created_by_login_user_id) {
        createdByLoginUserId = Number(parentResult.rows[0].created_by_login_user_id);
      }
    }

    // m_login_users に登録（運営者はプラン契約者ではないため current_plan_id は NULL）
    const insertResult = await db.execute({
      sql: `INSERT INTO m_login_users (
              email,
              password_hash,
              display_name,
              is_superadmin,
              is_active,
              current_plan_id,
              created_by_login_user_id,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, 0, 1, NULL, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
      args: [body.operatorLoginId, passwordHash, body.operatorName, createdByLoginUserId],
    });

    const loginUserId = Number(insertResult.lastInsertRowid);

    // m_login_user_roles に operator ロールを付与
    await db.execute({
      sql: `INSERT INTO m_login_user_roles (login_user_id, role, created_at)
            VALUES (?, 'operator', datetime('now', '+9 hours'))`,
      args: [loginUserId],
    });

    // 部門アクセス権を登録
    if (body.tournamentAccess && body.tournamentAccess.length > 0) {
      for (const access of body.tournamentAccess) {
        await db.execute({
          sql: "INSERT INTO t_operator_tournament_access (operator_id, tournament_id, permissions, assigned_by_login_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))",
          args: [
            loginUserId,
            access.tournamentId,
            JSON.stringify(access.permissions),
            adminLoginUserId,
          ],
        });
      }
    }

    return NextResponse.json({
      message: "運営者を登録しました",
      operatorId: loginUserId,
    });
  } catch (error) {
    console.error("運営者登録エラー:", error);
    return NextResponse.json({ error: "運営者の登録に失敗しました" }, { status: 500 });
  }
}
