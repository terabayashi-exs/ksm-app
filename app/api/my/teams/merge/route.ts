// app/api/my/teams/merge/route.ts
// チーム統合API: 複数チームを1つに統合する
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
      return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
    }

    const loginUserId = session.user.loginUserId;
    const { mainTeamId, absorbedTeamId } = await request.json();

    if (!mainTeamId || !absorbedTeamId) {
      return NextResponse.json(
        { success: false, error: "メインチームIDと統合対象チームIDが必要です" },
        { status: 400 },
      );
    }

    if (mainTeamId === absorbedTeamId) {
      return NextResponse.json(
        { success: false, error: "同じチームを指定することはできません" },
        { status: 400 },
      );
    }

    // ユーザーが両方のチームの担当者であることを確認
    const memberCheck = await db.execute(
      `SELECT team_id FROM m_team_members
       WHERE login_user_id = ? AND is_active = 1 AND team_id IN (?, ?)`,
      [loginUserId, mainTeamId, absorbedTeamId],
    );

    const memberTeamIds = memberCheck.rows.map((r) => String(r.team_id));
    if (!memberTeamIds.includes(mainTeamId) || !memberTeamIds.includes(absorbedTeamId)) {
      return NextResponse.json(
        { success: false, error: "両方のチームの担当者である必要があります" },
        { status: 403 },
      );
    }

    // 両チームの存在確認
    const teamsCheck = await db.execute(
      `SELECT team_id, team_name FROM m_teams WHERE team_id IN (?, ?) AND is_active = 1`,
      [mainTeamId, absorbedTeamId],
    );
    if (teamsCheck.rows.length < 2) {
      return NextResponse.json(
        { success: false, error: "チームが見つかりません" },
        { status: 404 },
      );
    }

    const absorbedTeamName = String(
      teamsCheck.rows.find((r) => String(r.team_id) === absorbedTeamId)?.team_name ?? "",
    );

    // アトミックに統合処理を実行
    await db.batch([
      // 1. 大会参加チームのteam_idをメインチームに書き換え（チーム名はそのまま）
      {
        sql: `UPDATE t_tournament_teams SET team_id = ? WHERE team_id = ?`,
        args: [mainTeamId, absorbedTeamId],
      },
      // 2. 大会参加選手のteam_idをメインチームに書き換え
      {
        sql: `UPDATE t_tournament_players SET team_id = ? WHERE team_id = ?`,
        args: [mainTeamId, absorbedTeamId],
      },
      // 3. 吸収側の選手データを削除（m_players.current_team_id は ON DELETE NO ACTION のため先に削除）
      {
        sql: `DELETE FROM m_players WHERE current_team_id = ?`,
        args: [absorbedTeamId],
      },
      // 4. 吸収側のチームを削除（CASCADE で m_team_members, t_team_invitations も削除）
      {
        sql: `DELETE FROM m_teams WHERE team_id = ?`,
        args: [absorbedTeamId],
      },
    ]);

    return NextResponse.json({
      success: true,
      message: `「${absorbedTeamName}」を「${String(teamsCheck.rows.find((r) => String(r.team_id) === mainTeamId)?.team_name ?? "")}」に統合しました`,
    });
  } catch (error) {
    console.error("チーム統合エラー:", error);
    return NextResponse.json(
      { success: false, error: "チーム統合に失敗しました" },
      { status: 500 },
    );
  }
}
