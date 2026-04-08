import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const roles = (session?.user?.roles ?? []) as string[];
    const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
    if (!roles.includes("admin") && !isSuperadmin) {
      return NextResponse.json({ success: false, error: "権限がありません" }, { status: 403 });
    }

    const { email, team_id } = await request.json();

    if (!email || !team_id) {
      return NextResponse.json(
        { success: false, error: "email と team_id が必要です" },
        { status: 400 },
      );
    }

    // ユーザーをメールで検索
    const userResult = await db.execute(
      `SELECT login_user_id, email, display_name FROM m_login_users WHERE email = ?`,
      [email.trim()],
    );
    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "指定されたメールアドレスのユーザーが見つかりません" },
        { status: 404 },
      );
    }

    const loginUserId = Number(userResult.rows[0].login_user_id);

    // チームの存在確認
    const teamResult = await db.execute(
      `SELECT team_id, team_name FROM m_teams WHERE team_id = ?`,
      [team_id],
    );
    if (teamResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "指定されたチームが見つかりません" },
        { status: 404 },
      );
    }

    // 現在のアクティブな担当者数を確認
    const currentMembers = await db.execute(
      `SELECT id, login_user_id FROM m_team_members WHERE team_id = ? AND is_active = 1`,
      [team_id],
    );

    // 既にこのユーザーがアクティブな担当者として登録されているか確認
    const alreadyMember = currentMembers.rows.find((r) => Number(r.login_user_id) === loginUserId);
    if (alreadyMember) {
      return NextResponse.json(
        { success: false, error: "このユーザーは既にこのチームの担当者として登録されています" },
        { status: 409 },
      );
    }

    if (currentMembers.rows.length >= 2) {
      return NextResponse.json(
        {
          success: false,
          error:
            "このチームには既に2名の担当者が登録されています。追加するには先に既存の担当者を削除してください",
        },
        { status: 409 },
      );
    }

    // 担当者数に応じてロールを自動決定
    const memberRole = currentMembers.rows.length === 0 ? "primary" : "secondary";

    // 既存の非アクティブレコードがあるか確認
    const existingMember = await db.execute(
      `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ?`,
      [team_id, loginUserId],
    );

    if (existingMember.rows.length > 0) {
      await db.execute(
        `UPDATE m_team_members SET member_role = ?, is_active = 1, updated_at = datetime('now', '+9 hours') WHERE team_id = ? AND login_user_id = ?`,
        [memberRole, team_id, loginUserId],
      );
    } else {
      await db.execute(
        `INSERT INTO m_team_members (team_id, login_user_id, member_role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
        [team_id, loginUserId, memberRole],
      );
    }

    // team ロールを確保（既にあればスキップ）
    const roleCheck = await db.execute(
      `SELECT login_user_id FROM m_login_user_roles WHERE login_user_id = ? AND role = 'team'`,
      [loginUserId],
    );
    if (roleCheck.rows.length === 0) {
      await db.execute(`INSERT INTO m_login_user_roles (login_user_id, role) VALUES (?, 'team')`, [
        loginUserId,
      ]);
    }

    return NextResponse.json({
      success: true,
      data: {
        login_user_id: loginUserId,
        email: String(userResult.rows[0].email),
        display_name: String(userResult.rows[0].display_name ?? ""),
        team_id: String(team_id),
        team_name: String(teamResult.rows[0].team_name ?? ""),
        member_role: memberRole,
        member_count: currentMembers.rows.length + 1,
      },
    });
  } catch (error) {
    console.error("[DATA_REG] force-representative error:", error);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
