// app/api/tournaments/[id]/disciplinary/[actionId]/route.ts
// 個別カードの更新・取消
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { voidDisciplinaryAction } from "@/lib/disciplinary-calculator";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string; actionId: string }>;
}

/**
 * DELETE: カード登録を取消（is_void=1）
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const { actionId } = await params;
    const id = parseInt(actionId);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "無効なIDです" }, { status: 400 });
    }

    await voidDisciplinaryAction(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("カード取消エラー:", error);
    return NextResponse.json({ success: false, error: "取消に失敗しました" }, { status: 500 });
  }
}
