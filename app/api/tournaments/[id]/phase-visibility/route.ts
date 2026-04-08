import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { TournamentPhases } from "@/lib/types/tournament-phases";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);
    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効な大会IDです" }, { status: 400 });
    }

    const body = await request.json();
    const { visibility } = body as { visibility: Record<string, boolean> };
    // visibility: { "preliminary_league": true, "final_tournament": false, ... }

    if (!visibility || typeof visibility !== "object") {
      return NextResponse.json(
        { success: false, error: "visibility設定が必要です" },
        { status: 400 },
      );
    }

    // 現在のphases JSONを取得
    const result = await db.execute("SELECT phases FROM t_tournaments WHERE tournament_id = ?", [
      tournamentId,
    ]);

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "大会が見つかりません" }, { status: 404 });
    }

    const phasesRaw = result.rows[0].phases;
    let phases: TournamentPhases;
    try {
      phases =
        typeof phasesRaw === "string"
          ? JSON.parse(phasesRaw)
          : (phasesRaw as unknown as TournamentPhases);
    } catch {
      return NextResponse.json(
        { success: false, error: "フェーズ情報の解析に失敗しました" },
        { status: 500 },
      );
    }

    if (!phases?.phases) {
      return NextResponse.json(
        { success: false, error: "フェーズ情報がありません" },
        { status: 400 },
      );
    }

    // is_visible を更新
    phases.phases = phases.phases.map((phase) => ({
      ...phase,
      is_visible:
        visibility[phase.id] !== undefined ? visibility[phase.id] : phase.is_visible !== false,
    }));

    await db.execute(
      `UPDATE t_tournaments SET phases = ?, updated_at = datetime('now', '+9 hours') WHERE tournament_id = ?`,
      [JSON.stringify(phases), tournamentId],
    );

    return NextResponse.json({
      success: true,
      message: "フェーズ表示設定を更新しました",
      phases: phases.phases.map((p) => ({
        id: p.id,
        name: p.name,
        is_visible: p.is_visible !== false,
      })),
    });
  } catch (error) {
    console.error("Phase visibility update error:", error);
    return NextResponse.json(
      { success: false, error: "フェーズ表示設定の更新に失敗しました" },
      { status: 500 },
    );
  }
}
