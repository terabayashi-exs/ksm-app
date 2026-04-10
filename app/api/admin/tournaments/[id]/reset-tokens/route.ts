import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resetTokenForMatch, resetTokensForTournament } from "@/lib/match-result-token";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効な部門IDです" }, { status: 400 });
    }

    const body = await request.json();
    const { scope, matchId } = body;

    if (scope === "match") {
      if (!matchId || isNaN(Number(matchId))) {
        return NextResponse.json({ success: false, error: "無効な試合IDです" }, { status: 400 });
      }

      const newToken = await resetTokenForMatch(Number(matchId));
      return NextResponse.json({
        success: true,
        message: "試合のQRトークンをリセットしました",
        tokensReset: 1,
        newToken,
      });
    }

    if (scope === "tournament") {
      const tokensReset = await resetTokensForTournament(tournamentId);
      return NextResponse.json({
        success: true,
        message: `${tokensReset}件のQRトークンをリセットしました`,
        tokensReset,
      });
    }

    return NextResponse.json(
      { success: false, error: "scopeは 'tournament' または 'match' を指定してください" },
      { status: 400 },
    );
  } catch (error) {
    console.error("トークンリセットエラー:", error);
    return NextResponse.json(
      { success: false, error: "QRトークンのリセットに失敗しました" },
      { status: 500 },
    );
  }
}
