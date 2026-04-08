// app/api/my/teams/route.ts
// ログイン中ユーザーが管理するチーム一覧を返す（GET）/ チーム新規作成（POST）

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
  }

  const loginUserId = session.user.loginUserId;
  if (!loginUserId || loginUserId === 0) {
    // 旧プロバイダーユーザーには対応していない
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    // m_team_members 経由でチーム情報を取得
    const result = await db.execute(
      `
      SELECT
        t.team_id,
        t.team_name,
        t.team_omission,
        t.contact_phone,
        t.prefecture_id,
        t.is_active,
        tm.member_role,
        tm.created_at AS joined_at,
        (
          SELECT COUNT(*)
          FROM m_players p
          WHERE p.current_team_id = t.team_id AND p.is_active = 1
        ) AS player_count,
        (
          SELECT COUNT(*)
          FROM m_team_members tm2
          WHERE tm2.team_id = t.team_id AND tm2.is_active = 1
        ) AS manager_count
      FROM m_team_members tm
      JOIN m_teams t ON tm.team_id = t.team_id
      WHERE tm.login_user_id = ? AND tm.is_active = 1 AND t.is_active = 1
      ORDER BY tm.member_role DESC, tm.created_at ASC
    `,
      [loginUserId],
    );

    return NextResponse.json({
      success: true,
      data: result.rows.map((row) => ({
        team_id: String(row.team_id),
        team_name: String(row.team_name),
        team_omission: row.team_omission ? String(row.team_omission) : null,
        contact_phone: row.contact_phone ? String(row.contact_phone) : null,
        prefecture_id: row.prefecture_id ? Number(row.prefecture_id) : null,
        is_active: Number(row.is_active) === 1,
        member_role: String(row.member_role) as "primary" | "secondary",
        joined_at: String(row.joined_at),
        player_count: Number(row.player_count) || 0,
        manager_count: Number(row.manager_count) || 0,
      })),
    });
  } catch (error) {
    console.error("チーム一覧取得エラー:", error);
    return NextResponse.json(
      { success: false, error: "チーム情報の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// POST: チーム新規作成
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
  }

  const loginUserId = session.user.loginUserId;

  let body: { team_name?: string; team_omission?: string; prefecture_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "リクエストの形式が不正です" },
      { status: 400 },
    );
  }

  const { team_name, team_omission, prefecture_id } = body;

  if (!team_name || team_name.trim() === "") {
    return NextResponse.json({ success: false, error: "チーム名は必須です" }, { status: 400 });
  }

  // 既にチーム担当者である場合は登録不可（1アカウント1チームのみ）
  const existingTeam = await db.execute(
    `SELECT COUNT(*) AS cnt FROM m_team_members WHERE login_user_id = ? AND is_active = 1`,
    [loginUserId],
  );
  if (Number(existingTeam.rows[0]?.cnt ?? 0) > 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "既にチームの担当者として登録されています。1つのアカウントで複数のチームを管理することはできません。",
      },
      { status: 400 },
    );
  }

  // 同名チームの重複チェック（同一ユーザーが管理するチームのみ）
  const duplicate = await db.execute(
    `
    SELECT t.team_id FROM m_teams t
    JOIN m_team_members tm ON t.team_id = tm.team_id
    WHERE t.team_name = ? AND tm.login_user_id = ? AND tm.is_active = 1 AND t.is_active = 1
  `,
    [team_name.trim(), loginUserId],
  );
  if (duplicate.rows.length > 0) {
    return NextResponse.json(
      { success: false, error: "同じ名前のチームが既に存在します" },
      { status: 400 },
    );
  }

  const teamId = randomUUID();
  const now = `datetime('now', '+9 hours')`;

  // m_teams に登録（contact_* は nullable なので省略）
  await db.execute(
    `
    INSERT INTO m_teams (team_id, team_name, team_omission, prefecture_id, is_active, registration_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 'self_registered', ${now}, ${now})
  `,
    [teamId, team_name.trim(), team_omission?.trim() || null, prefecture_id || null],
  );

  // m_team_members に member として登録
  await db.execute(
    `
    INSERT INTO m_team_members (team_id, login_user_id, member_role, is_active, created_at, updated_at)
    VALUES (?, ?, 'member', 1, ${now}, ${now})
  `,
    [teamId, loginUserId],
  );

  // team ロールを付与（未付与の場合のみ）
  const existingRole = await db.execute(
    `SELECT id FROM m_login_user_roles WHERE login_user_id = ? AND role = 'team'`,
    [loginUserId],
  );
  if (existingRole.rows.length === 0) {
    await db.execute(
      `INSERT INTO m_login_user_roles (login_user_id, role, created_at) VALUES (?, 'team', ${now})`,
      [loginUserId],
    );
  }

  return NextResponse.json({ success: true, data: { team_id: teamId } }, { status: 201 });
}
