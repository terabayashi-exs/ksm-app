// app/api/my/teams/link/route.ts
// チームIDでm_teamsを自分のアカウントに紐付ける
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const linkSchema = z.object({
  team_id: z.string().min(1, "チームIDは必須です"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
  }

  const loginUserId = session.user.loginUserId;
  if (!loginUserId || loginUserId === 0) {
    return NextResponse.json(
      { success: false, error: "ログインユーザー情報が取得できません" },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const validationResult = linkSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: validationResult.error.issues[0]?.message || "バリデーションエラー",
        },
        { status: 400 },
      );
    }

    const { team_id } = validationResult.data;

    // 1. team_idでm_teamsを検索
    const teamResult = await db.execute(
      `
      SELECT team_id, team_name, team_omission FROM m_teams
      WHERE team_id = ? AND is_active = 1
    `,
      [team_id],
    );

    if (teamResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "指定されたチームIDが見つかりません。チームIDを確認してください。",
        },
        { status: 404 },
      );
    }

    const team = teamResult.rows[0] as unknown as {
      team_id: string;
      team_name: string;
      team_omission: string;
    };

    // 2. 既に他のユーザーが紐付けているかチェック
    const existingMemberResult = await db.execute(
      `
      SELECT tm.login_user_id, lu.display_name
      FROM m_team_members tm
      JOIN m_login_users lu ON tm.login_user_id = lu.login_user_id
      WHERE tm.team_id = ? AND tm.is_active = 1
    `,
      [team_id],
    );

    if (existingMemberResult.rows.length > 0) {
      const existingMember = existingMemberResult.rows[0] as unknown as {
        login_user_id: number;
        display_name: string;
      };
      if (existingMember.login_user_id === loginUserId) {
        return NextResponse.json(
          {
            success: false,
            error: "このチームは既にあなたのアカウントに紐付けられています。",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "このチームは既に別のユーザーに紐付けられています。",
        },
        { status: 409 },
      );
    }

    // 3. ログインユーザーが既にチームを持っている場合、既存のm_team_membersを無効化
    await db.execute(
      `
      UPDATE m_team_members
      SET is_active = 0, updated_at = datetime('now', '+9 hours')
      WHERE login_user_id = ? AND is_active = 1
    `,
      [loginUserId],
    );

    // 4. 新規m_team_membersレコード作成
    await db.execute(
      `
      INSERT INTO m_team_members (team_id, login_user_id, member_role, is_active, created_at, updated_at)
      VALUES (?, ?, 'primary', 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `,
      [team_id, loginUserId],
    );

    // 5. ユーザーにteamロールがなければ追加
    const roleResult = await db.execute(
      `
      SELECT role FROM m_login_user_roles
      WHERE login_user_id = ? AND role = 'team'
    `,
      [loginUserId],
    );

    if (roleResult.rows.length === 0) {
      await db.execute(
        `
        INSERT INTO m_login_user_roles (login_user_id, role, created_at)
        VALUES (?, 'team', datetime('now', '+9 hours'))
      `,
        [loginUserId],
      );
    }

    return NextResponse.json({
      success: true,
      message: `チーム「${team.team_name}」をアカウントに紐付けました。`,
      data: {
        team_id: team.team_id,
        team_name: team.team_name,
        team_omission: team.team_omission,
      },
    });
  } catch (error) {
    console.error("Team link error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "チームの紐付けに失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
