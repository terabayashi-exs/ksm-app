// app/api/my/teams/invite/accept/route.ts
// 招待トークンを承認してm_team_membersに secondary として登録
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET: トークン情報の事前確認（承認画面表示用）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ success: false, error: "トークンが必要です" }, { status: 400 });
  }

  const result = await db.execute(
    `
    SELECT
      i.id,
      i.team_id,
      i.invited_email,
      i.status,
      i.expires_at,
      t.team_name,
      u.display_name AS invited_by_name
    FROM t_team_invitations i
    JOIN m_teams t ON i.team_id = t.team_id
    JOIN m_login_users u ON i.invited_by_login_user_id = u.login_user_id
    WHERE i.token = ?
  `,
    [token],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ success: false, error: "無効な招待トークンです" }, { status: 404 });
  }

  const invite = result.rows[0];

  if (String(invite.status) !== "pending") {
    return NextResponse.json(
      {
        success: false,
        error:
          String(invite.status) === "accepted"
            ? "この招待はすでに承認済みです"
            : "この招待はキャンセルされています",
      },
      { status: 400 },
    );
  }

  const expiresAt = new Date(String(invite.expires_at));
  const now = new Date();
  if (expiresAt < now) {
    return NextResponse.json(
      { success: false, error: "この招待の有効期限が切れています" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      team_id: String(invite.team_id),
      team_name: String(invite.team_name),
      invited_email: String(invite.invited_email),
      invited_by_name: String(invite.invited_by_name),
      expires_at: String(invite.expires_at),
    },
  });
}

// POST: 招待を承認（ログインユーザーのみ）
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json(
      { success: false, error: "認証が必要です。先にログインしてください。" },
      { status: 401 },
    );
  }

  const loginUserId = session.user.loginUserId;
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ success: false, error: "トークンが必要です" }, { status: 400 });
  }

  // 招待情報取得
  const result = await db.execute(
    `
    SELECT i.id, i.team_id, i.invited_email, i.status, i.expires_at, t.team_name
    FROM t_team_invitations i
    JOIN m_teams t ON i.team_id = t.team_id
    WHERE i.token = ?
  `,
    [token],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ success: false, error: "無効な招待トークンです" }, { status: 404 });
  }

  const invite = result.rows[0];

  if (String(invite.status) !== "pending") {
    return NextResponse.json(
      {
        success: false,
        error:
          String(invite.status) === "accepted"
            ? "この招待はすでに承認済みです"
            : "この招待はキャンセルされています",
      },
      { status: 400 },
    );
  }

  const expiresAt = new Date(String(invite.expires_at));
  if (expiresAt < new Date()) {
    return NextResponse.json(
      { success: false, error: "この招待の有効期限が切れています" },
      { status: 400 },
    );
  }

  // ログインユーザーのメールが招待先と一致するかチェック
  const userResult = await db.execute(`SELECT email FROM m_login_users WHERE login_user_id = ?`, [
    loginUserId,
  ]);
  if (userResult.rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "ユーザーが見つかりません" },
      { status: 404 },
    );
  }
  const userEmail = String(userResult.rows[0].email);
  if (userEmail !== String(invite.invited_email)) {
    return NextResponse.json(
      {
        success: false,
        error: `この招待は ${invite.invited_email} 宛です。招待先のメールアドレスでログインしてください。`,
      },
      { status: 403 },
    );
  }

  const teamId = String(invite.team_id);

  // 担当者数チェック（最大2名）
  const managerCount = await db.execute(
    `SELECT COUNT(*) AS cnt FROM m_team_members WHERE team_id = ? AND is_active = 1`,
    [teamId],
  );
  if (Number(managerCount.rows[0].cnt) >= 2) {
    return NextResponse.json(
      { success: false, error: "このチームの担当者はすでに2名います" },
      { status: 400 },
    );
  }

  // 既に担当者かチェック
  const existingMember = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, loginUserId],
  );
  if (existingMember.rows.length > 0) {
    return NextResponse.json(
      { success: false, error: "すでにこのチームの担当者として登録されています" },
      { status: 400 },
    );
  }

  // 既に別のチームの担当者でないかチェック（1アカウント1チームのみ）
  const otherTeam = await db.execute(
    `SELECT COUNT(*) AS cnt FROM m_team_members WHERE login_user_id = ? AND is_active = 1`,
    [loginUserId],
  );
  if (Number(otherTeam.rows[0]?.cnt ?? 0) > 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "既に別のチームの担当者として登録されています。1つのアカウントで複数のチームを管理することはできません。",
      },
      { status: 400 },
    );
  }

  // m_team_members に member として登録
  await db.execute(
    `
    INSERT INTO m_team_members (team_id, login_user_id, member_role, is_active, created_at, updated_at)
    VALUES (?, ?, 'member', 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
  `,
    [teamId, loginUserId],
  );

  // m_login_user_roles に "team" ロールがなければ追加
  const existingRole = await db.execute(
    `SELECT id FROM m_login_user_roles WHERE login_user_id = ? AND role = 'team' LIMIT 1`,
    [loginUserId],
  );
  if (existingRole.rows.length === 0) {
    await db.execute(
      `INSERT INTO m_login_user_roles (login_user_id, role, created_at) VALUES (?, 'team', datetime('now', '+9 hours'))`,
      [loginUserId],
    );
  }

  // 招待を承認済みに更新
  await db.execute(
    `
    UPDATE t_team_invitations
    SET status = 'accepted', accepted_at = datetime('now', '+9 hours')
    WHERE token = ?
  `,
    [token],
  );

  return NextResponse.json({
    success: true,
    message: `チーム「${invite.team_name}」の担当者として登録されました`,
    team_id: teamId,
  });
}
