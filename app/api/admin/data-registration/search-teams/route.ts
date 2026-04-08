import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const roles = (session?.user?.roles ?? []) as string[];
    const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
    if (!roles.includes("admin") && !isSuperadmin) {
      return NextResponse.json({ success: false, error: "権限がありません" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    if (!q || q.trim().length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const searchTerm = q.trim();
    const likeTerm = `%${searchTerm}%`;

    // m_teams のチーム名・team_id と、t_tournament_teams のチーム名からも検索
    const result = await db.execute(
      `
      SELECT DISTINCT m.team_id, m.team_name, m.team_omission, m.is_active
      FROM m_teams m
      WHERE m.team_id = ? OR m.team_name LIKE ?
      UNION
      SELECT DISTINCT m2.team_id, m2.team_name, m2.team_omission, m2.is_active
      FROM t_tournament_teams tt
      JOIN m_teams m2 ON tt.team_id = m2.team_id
      WHERE tt.team_name LIKE ?
      ORDER BY team_name ASC
      LIMIT 20
    `,
      [searchTerm, likeTerm, likeTerm],
    );

    return NextResponse.json({
      success: true,
      data: result.rows.map((row) => ({
        team_id: String(row.team_id),
        team_name: String(row.team_name ?? ""),
        team_omission: row.team_omission ? String(row.team_omission) : null,
        is_active: Number(row.is_active ?? 1),
      })),
    });
  } catch (error) {
    console.error("[DATA_REG] search-teams error:", error);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
