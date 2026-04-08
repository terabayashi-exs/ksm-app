import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH: フォーマットのvisibility変更（スーパーユーザー専用）
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    if (!session.user.isSuperadmin) {
      return NextResponse.json({ error: "スーパー管理者権限が必要です" }, { status: 403 });
    }

    const params = await context.params;
    const formatId = parseInt(params.id);
    const body = await request.json();
    const { visibility } = body;

    if (!visibility || !["public", "restricted"].includes(visibility)) {
      return NextResponse.json(
        { error: "visibilityは 'public' または 'restricted' を指定してください" },
        { status: 400 },
      );
    }

    // フォーマット存在確認
    const formatResult = await db.execute(
      `SELECT format_id, format_name FROM m_tournament_formats WHERE format_id = ?`,
      [formatId],
    );

    if (formatResult.rows.length === 0) {
      return NextResponse.json({ error: "フォーマットが見つかりません" }, { status: 404 });
    }

    await db.execute(
      `UPDATE m_tournament_formats SET visibility = ?, updated_at = datetime('now', '+9 hours') WHERE format_id = ?`,
      [visibility, formatId],
    );

    return NextResponse.json({
      success: true,
      message: `フォーマットの公開設定を「${visibility === "public" ? "公開" : "制限"}」に変更しました`,
      format_id: formatId,
      visibility,
    });
  } catch (error) {
    console.error("visibility変更エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}
