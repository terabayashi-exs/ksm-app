import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchGroupedPublicTournaments } from "@/lib/public-tournaments";

// GET /api/tournaments/public-grouped - 大会グループごとにグループ化された公開大会を取得
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const teamId = session?.user?.role === "team" ? session.user.teamId : undefined;

    const categorizedData = await fetchGroupedPublicTournaments(teamId);

    return NextResponse.json({
      success: true,
      data: categorizedData,
    });
  } catch (error) {
    console.error("グループ化公開大会取得エラー:", error);
    return NextResponse.json(
      {
        error: "グループ化公開大会の取得に失敗しました",
      },
      { status: 500 },
    );
  }
}
