// app/api/tournament-groups/[id]/disciplinary-settings/route.ts
// 懲罰設定の取得・更新
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDisciplinarySettings } from "@/lib/disciplinary-calculator";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: 懲罰設定を取得
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const gid = parseInt(id);
    if (isNaN(gid)) {
      return NextResponse.json({ success: false, error: "無効なグループIDです" }, { status: 400 });
    }

    const settings = await getDisciplinarySettings(gid);
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("懲罰設定取得エラー:", error);
    return NextResponse.json({ success: false, error: "取得に失敗しました" }, { status: 500 });
  }
}

/**
 * PUT: 懲罰設定を更新（なければ作成）
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const { id } = await params;
    const gid = parseInt(id);
    if (isNaN(gid)) {
      return NextResponse.json({ success: false, error: "無効なグループIDです" }, { status: 400 });
    }

    const body = await request.json();
    const { yellowThreshold, isEnabled } = body;

    if (yellowThreshold !== undefined && (yellowThreshold < 1 || yellowThreshold > 10)) {
      return NextResponse.json(
        { success: false, error: "閾値は1〜10の範囲で設定してください" },
        { status: 400 },
      );
    }

    // UPSERT
    const existing = await db.execute(
      `SELECT setting_id FROM t_disciplinary_settings WHERE group_id = ?`,
      [gid],
    );

    if (existing.rows.length > 0) {
      await db.execute(
        `UPDATE t_disciplinary_settings
         SET yellow_threshold = COALESCE(?, yellow_threshold),
             is_enabled = COALESCE(?, is_enabled),
             updated_at = datetime('now', '+9 hours')
         WHERE group_id = ?`,
        [yellowThreshold ?? null, isEnabled ?? null, gid],
      );
    } else {
      await db.execute(
        `INSERT INTO t_disciplinary_settings (group_id, yellow_threshold, is_enabled)
         VALUES (?, ?, ?)`,
        [gid, yellowThreshold ?? 2, isEnabled ?? 1],
      );
    }

    const settings = await getDisciplinarySettings(gid);
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("懲罰設定更新エラー:", error);
    return NextResponse.json({ success: false, error: "更新に失敗しました" }, { status: 500 });
  }
}
