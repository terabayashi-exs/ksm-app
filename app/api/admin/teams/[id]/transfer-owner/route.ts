// app/api/admin/teams/[id]/transfer-owner/route.ts
// 管理者によるチーム主担当者変更・担当者追加・削除
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET: チームの担当者一覧取得（管理者用）
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const roles = (session?.user?.roles ?? []) as string[];
  const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
  if (!roles.includes("admin") && !isSuperadmin) {
    return NextResponse.json({ success: false, error: "権限がありません" }, { status: 403 });
  }

  const { id: teamId } = await params;

  const teamResult = await db.execute(`SELECT team_id, team_name FROM m_teams WHERE team_id = ?`, [
    teamId,
  ]);
  if (teamResult.rows.length === 0) {
    return NextResponse.json({ success: false, error: "チームが見つかりません" }, { status: 404 });
  }

  const managersResult = await db.execute(
    `
    SELECT
      u.login_user_id,
      u.display_name,
      u.email,
      tm.member_role,
      tm.id AS member_id,
      tm.created_at AS joined_at
    FROM m_team_members tm
    JOIN m_login_users u ON tm.login_user_id = u.login_user_id
    WHERE tm.team_id = ? AND tm.is_active = 1
    ORDER BY tm.member_role DESC, tm.created_at ASC
  `,
    [teamId],
  );

  return NextResponse.json({
    success: true,
    team: {
      team_id: String(teamResult.rows[0].team_id),
      team_name: String(teamResult.rows[0].team_name),
    },
    managers: managersResult.rows.map((row) => ({
      login_user_id: Number(row.login_user_id),
      member_id: Number(row.member_id),
      display_name: String(row.display_name),
      email: String(row.email),
      member_role: String(row.member_role) as "primary" | "secondary",
      joined_at: String(row.joined_at),
    })),
  });
}

// PATCH: 主担当者（primary）の変更
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const roles = (session?.user?.roles ?? []) as string[];
  const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
  if (!roles.includes("admin") && !isSuperadmin) {
    return NextResponse.json({ success: false, error: "権限がありません" }, { status: 403 });
  }

  const { id: teamId } = await params;
  const { new_primary_login_user_id } = await request.json();

  if (!new_primary_login_user_id) {
    return NextResponse.json(
      { success: false, error: "new_primary_login_user_id が必要です" },
      { status: 400 },
    );
  }

  // 対象ユーザーがこのチームの担当者かチェック
  const memberCheck = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, new_primary_login_user_id],
  );
  if (memberCheck.rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "対象ユーザーはこのチームの担当者ではありません" },
      { status: 400 },
    );
  }

  // 全員を secondary に → 指定ユーザーを primary に
  await db.execute(
    `UPDATE m_team_members SET member_role = 'secondary', updated_at = datetime('now', '+9 hours') WHERE team_id = ? AND is_active = 1`,
    [teamId],
  );
  await db.execute(
    `UPDATE m_team_members SET member_role = 'primary', updated_at = datetime('now', '+9 hours') WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, new_primary_login_user_id],
  );

  return NextResponse.json({ success: true, message: "主担当者を変更しました" });
}

// DELETE: 担当者を削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const roles = (session?.user?.roles ?? []) as string[];
  const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
  if (!roles.includes("admin") && !isSuperadmin) {
    return NextResponse.json({ success: false, error: "権限がありません" }, { status: 403 });
  }

  const { id: teamId } = await params;
  const { login_user_id } = await request.json();

  if (!login_user_id) {
    return NextResponse.json(
      { success: false, error: "login_user_id が必要です" },
      { status: 400 },
    );
  }

  // 担当者数チェック（1人の場合は削除不可）
  const countResult = await db.execute(
    `SELECT COUNT(*) AS cnt FROM m_team_members WHERE team_id = ? AND is_active = 1`,
    [teamId],
  );
  if (Number(countResult.rows[0].cnt) <= 1) {
    return NextResponse.json(
      { success: false, error: "最後の担当者は削除できません" },
      { status: 400 },
    );
  }

  await db.execute(
    `UPDATE m_team_members SET is_active = 0, updated_at = datetime('now', '+9 hours') WHERE team_id = ? AND login_user_id = ?`,
    [teamId, login_user_id],
  );

  // 他にチームを持っていなければ team ロールを削除
  const otherTeams = await db.execute(
    `SELECT id FROM m_team_members WHERE login_user_id = ? AND is_active = 1 LIMIT 1`,
    [login_user_id],
  );
  if (otherTeams.rows.length === 0) {
    await db.execute(`DELETE FROM m_login_user_roles WHERE login_user_id = ? AND role = 'team'`, [
      login_user_id,
    ]);
  }

  return NextResponse.json({ success: true, message: "担当者を削除しました" });
}
