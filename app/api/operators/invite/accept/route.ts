import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/operators/invite/accept?token=xxx
 * トークン情報の事前確認（承認画面表示用）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ success: false, error: "トークンが必要です" }, { status: 400 });
  }

  const result = await db.execute({
    sql: `SELECT
            i.id,
            i.email,
            i.tournament_access,
            i.status,
            i.expires_at,
            u.display_name AS invited_by_name
          FROM t_operator_invitations i
          LEFT JOIN m_login_users u ON i.invited_by_login_user_id = u.login_user_id
          WHERE i.token = ?`,
    args: [token],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ success: false, error: "無効な招待トークンです" }, { status: 404 });
  }

  const invite = result.rows[0];

  if (String(invite.status) !== "pending") {
    const errorMessage =
      String(invite.status) === "accepted"
        ? "この招待はすでに承認済みです"
        : String(invite.status) === "expired"
          ? "この招待の有効期限が切れています"
          : "この招待はキャンセルされています";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
  }

  const expiresAt = new Date(String(invite.expires_at));
  const now = new Date();
  if (expiresAt < now) {
    // 有効期限切れの場合、ステータスを更新
    await db.execute({
      sql: `UPDATE t_operator_invitations SET status = 'expired' WHERE token = ?`,
      args: [token],
    });
    return NextResponse.json(
      { success: false, error: "この招待の有効期限が切れています" },
      { status: 400 },
    );
  }

  // 部門情報を取得
  const tournamentAccess = JSON.parse(String(invite.tournament_access));
  const tournamentNames = await Promise.all(
    tournamentAccess.map(async (access: { tournamentId: number }) => {
      const tResult = await db.execute({
        sql: "SELECT tournament_name, category_name FROM t_tournaments WHERE tournament_id = ?",
        args: [access.tournamentId],
      });
      if (tResult.rows.length > 0) {
        const row = tResult.rows[0];
        return `${row.tournament_name} - ${row.category_name}`;
      }
      return "";
    }),
  );

  // 既にアカウント登録されているかチェック
  const userResult = await db.execute({
    sql: "SELECT login_user_id, display_name FROM m_login_users WHERE email = ?",
    args: [invite.email],
  });

  const hasAccount = userResult.rows.length > 0;

  return NextResponse.json({
    success: true,
    data: {
      email: String(invite.email),
      invitedByName: String(invite.invited_by_name || "管理者"),
      expiresAt: String(invite.expires_at),
      tournamentNames: tournamentNames.filter((name) => name),
      hasAccount, // アカウント登録済みかどうか
      displayName: hasAccount ? String(userResult.rows[0].display_name) : null,
    },
  });
}

/**
 * POST /api/operators/invite/accept
 * 招待を承認（新規アカウント作成 or 既存アカウントへのロール付与）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, displayName, password } = body;

    if (!token) {
      return NextResponse.json({ success: false, error: "トークンが必要です" }, { status: 400 });
    }

    // 招待情報取得
    const inviteResult = await db.execute({
      sql: `SELECT
              id,
              email,
              invited_by_login_user_id,
              tournament_access,
              status,
              expires_at
            FROM t_operator_invitations
            WHERE token = ?`,
      args: [token],
    });

    if (inviteResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "無効な招待トークンです" },
        { status: 404 },
      );
    }

    const invite = inviteResult.rows[0];

    if (String(invite.status) !== "pending") {
      const errorMessage =
        String(invite.status) === "accepted"
          ? "この招待はすでに承認済みです"
          : "この招待は無効です";
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
    }

    const expiresAt = new Date(String(invite.expires_at));
    if (expiresAt < new Date()) {
      await db.execute({
        sql: `UPDATE t_operator_invitations SET status = 'expired' WHERE token = ?`,
        args: [token],
      });
      return NextResponse.json(
        { success: false, error: "この招待の有効期限が切れています" },
        { status: 400 },
      );
    }

    const email = String(invite.email);
    const tournamentAccess = JSON.parse(String(invite.tournament_access));
    const invitedByLoginUserId = Number(invite.invited_by_login_user_id);

    // 既にアカウント登録されているかチェック
    const userResult = await db.execute({
      sql: "SELECT login_user_id, email FROM m_login_users WHERE email = ?",
      args: [email],
    });

    let loginUserId: number;

    if (userResult.rows.length > 0) {
      // 既存アカウント → ロール付与のみ
      loginUserId = Number(userResult.rows[0].login_user_id);

      // セキュリティチェック: メールアドレスが一致しているか確認
      const existingEmail = String(userResult.rows[0].email);
      if (existingEmail.toLowerCase() !== email.toLowerCase()) {
        console.error(`招待メールアドレス不一致: expected=${email}, actual=${existingEmail}`);
        return NextResponse.json(
          { success: false, error: "メールアドレスが一致しません" },
          { status: 400 },
        );
      }
    } else {
      // 新規アカウント → アカウント作成
      if (!displayName || !displayName.trim()) {
        return NextResponse.json(
          { success: false, error: "名前を入力してください" },
          { status: 400 },
        );
      }

      if (!password || password.length < 6) {
        return NextResponse.json(
          { success: false, error: "パスワードは6文字以上で入力してください" },
          { status: 400 },
        );
      }

      // パスワードをハッシュ化
      const passwordHash = await bcrypt.hash(password, 10);

      // m_login_users に登録（招待されたメールアドレスで固定）
      // 運営者はプラン契約者ではないため、current_plan_id は NULL
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
        args: [email, passwordHash, displayName.trim(), invitedByLoginUserId],
      });

      loginUserId = Number(insertResult.lastInsertRowid);
      console.log(`新規アカウント作成: email=${email}, login_user_id=${loginUserId}`);
    }

    // 運営者ロールを付与（既になければ）
    const roleResult = await db.execute({
      sql: "SELECT id FROM m_login_user_roles WHERE login_user_id = ? AND role = ?",
      args: [loginUserId, "operator"],
    });

    if (roleResult.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO m_login_user_roles (login_user_id, role, created_at)
              VALUES (?, 'operator', datetime('now', '+9 hours'))`,
        args: [loginUserId],
      });
    }

    // 部門アクセス権を登録（既存チェックして重複を避ける）
    for (const access of tournamentAccess) {
      try {
        const existingAccess = await db.execute({
          sql: "SELECT access_id FROM t_operator_tournament_access WHERE operator_id = ? AND tournament_id = ?",
          args: [loginUserId, access.tournamentId],
        });

        if (existingAccess.rows.length === 0) {
          await db.execute({
            sql: "INSERT INTO t_operator_tournament_access (operator_id, tournament_id, permissions, assigned_by_login_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))",
            args: [
              loginUserId,
              access.tournamentId,
              JSON.stringify(access.permissions),
              invitedByLoginUserId,
            ],
          });
          console.log(
            `部門アクセス権を追加: operator_id=${loginUserId}, tournament_id=${access.tournamentId}, assigned_by=${invitedByLoginUserId}`,
          );
        } else {
          // 既に存在する場合は権限を更新
          await db.execute({
            sql: "UPDATE t_operator_tournament_access SET permissions = ?, assigned_by_login_user_id = ?, updated_at = datetime('now', '+9 hours') WHERE operator_id = ? AND tournament_id = ?",
            args: [
              JSON.stringify(access.permissions),
              invitedByLoginUserId,
              loginUserId,
              access.tournamentId,
            ],
          });
          console.log(
            `部門アクセス権を更新: operator_id=${loginUserId}, tournament_id=${access.tournamentId}, assigned_by=${invitedByLoginUserId}`,
          );
        }
      } catch (accessError) {
        console.error(
          `部門アクセス権の登録エラー (operator_id=${loginUserId}, tournament_id=${access.tournamentId}):`,
          accessError,
        );
        // エラーが発生してもスキップして続行
      }
    }

    // 招待を承認済みに更新
    await db.execute({
      sql: `UPDATE t_operator_invitations
            SET status = 'accepted',
                accepted_by_login_user_id = ?,
                accepted_at = datetime('now', '+9 hours')
            WHERE token = ?`,
      args: [loginUserId, token],
    });

    return NextResponse.json({
      success: true,
      message: "運営者として登録されました",
      isNewAccount: userResult.rows.length === 0,
    });
  } catch (error) {
    console.error("招待承認エラー:", error);
    return NextResponse.json(
      { success: false, error: "招待の承認に失敗しました" },
      { status: 500 },
    );
  }
}
