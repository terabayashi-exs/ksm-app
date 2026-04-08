import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET: トークン検証・招待情報取得
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ success: false, error: "トークンが必要です" }, { status: 400 });
    }

    const result = await db.execute(
      `SELECT ti.*, t.team_name
       FROM t_team_invitations ti
       INNER JOIN m_teams t ON ti.team_id = t.team_id
       WHERE ti.token = ?`,
      [token],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "無効な招待リンクです" }, { status: 404 });
    }

    const invite = result.rows[0];

    if (String(invite.status) !== "pending") {
      return NextResponse.json(
        { success: false, error: "この招待は既に処理済みです" },
        { status: 400 },
      );
    }

    // 有効期限チェック
    if (invite.expires_at && new Date(String(invite.expires_at)) < new Date()) {
      return NextResponse.json(
        { success: false, error: "この招待リンクは有効期限切れです" },
        { status: 400 },
      );
    }

    // メールアドレスで既存アカウント確認
    const userResult = await db.execute(
      `SELECT login_user_id, display_name, email FROM m_login_users WHERE email = ?`,
      [String(invite.invited_email)],
    );
    const hasAccount = userResult.rows.length > 0;

    // ログイン中のユーザー確認
    const session = await auth();
    const isLoggedIn = !!session?.user;
    const loggedInEmail = session?.user?.email || null;

    return NextResponse.json({
      success: true,
      invitation: {
        team_id: String(invite.team_id),
        team_name: String(invite.team_name),
        invited_email: String(invite.invited_email),
        expires_at: String(invite.expires_at),
      },
      hasAccount,
      isLoggedIn,
      loggedInEmail,
    });
  } catch (error) {
    console.error("招待検証エラー:", error);
    return NextResponse.json(
      { success: false, error: "招待情報の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST: 担当者登録実行
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, displayName, password } = body;

    if (!token) {
      return NextResponse.json({ success: false, error: "トークンが必要です" }, { status: 400 });
    }

    // 招待レコード取得
    const inviteResult = await db.execute(
      `SELECT ti.*, t.team_name
       FROM t_team_invitations ti
       INNER JOIN m_teams t ON ti.team_id = t.team_id
       WHERE ti.token = ? AND ti.status = 'pending'`,
      [token],
    );

    if (inviteResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "無効または処理済みの招待です" },
        { status: 400 },
      );
    }

    const invite = inviteResult.rows[0];
    const invitedEmail = String(invite.invited_email);
    const teamId = String(invite.team_id);

    // 有効期限チェック
    if (invite.expires_at && new Date(String(invite.expires_at)) < new Date()) {
      return NextResponse.json(
        { success: false, error: "この招待リンクは有効期限切れです" },
        { status: 400 },
      );
    }

    // 既存アカウント確認
    const userResult = await db.execute(`SELECT login_user_id FROM m_login_users WHERE email = ?`, [
      invitedEmail,
    ]);

    let loginUserId: number;

    if (userResult.rows.length > 0) {
      // 既存アカウント
      loginUserId = Number(userResult.rows[0].login_user_id);
    } else {
      // 新規アカウント作成
      if (!displayName || !displayName.trim()) {
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

      const hashedPassword = await bcrypt.hash(password, 10);
      const insertResult = await db.execute(
        `INSERT INTO m_login_users (email, password_hash, display_name, is_active, current_plan_id, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
        [invitedEmail, hashedPassword, displayName.trim()],
      );
      loginUserId = Number(insertResult.lastInsertRowid);
    }

    // 既にこのチームのメンバーか確認
    const existingMember = await db.execute(
      `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
      [teamId, loginUserId],
    );
    if (existingMember.rows.length > 0) {
      // 既にメンバーなら招待をacceptedにして終了
      await db.execute(
        `UPDATE t_team_invitations SET status = 'accepted', accepted_at = datetime('now', '+9 hours') WHERE token = ?`,
        [token],
      );
      return NextResponse.json({
        success: true,
        message: "既にこのチームの担当者として登録されています",
      });
    }

    // m_team_members に登録（primary）
    await db.execute(
      `INSERT INTO m_team_members (team_id, login_user_id, member_role, is_active, created_at, updated_at)
       VALUES (?, ?, 'primary', 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
      [teamId, loginUserId],
    );

    // team ロールがなければ追加
    const roleCheck = await db.execute(
      `SELECT id FROM m_login_user_roles WHERE login_user_id = ? AND role = 'team'`,
      [loginUserId],
    );
    if (roleCheck.rows.length === 0) {
      await db.execute(
        `INSERT INTO m_login_user_roles (login_user_id, role, created_at) VALUES (?, 'team', datetime('now', '+9 hours'))`,
        [loginUserId],
      );
    }

    // 招待ステータス更新
    await db.execute(
      `UPDATE t_team_invitations SET status = 'accepted', accepted_at = datetime('now', '+9 hours') WHERE token = ?`,
      [token],
    );

    return NextResponse.json({
      success: true,
      message: `${String(invite.team_name)} の担当者として登録しました`,
      needsLogin: userResult.rows.length === 0, // 新規アカウントの場合はログインが必要
    });
  } catch (error) {
    console.error("担当者登録エラー:", error);
    return NextResponse.json(
      { success: false, error: "担当者登録に失敗しました" },
      { status: 500 },
    );
  }
}
