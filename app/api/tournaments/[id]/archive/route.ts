// app/api/tournaments/[id]/archive/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TournamentBlobArchiver } from "@/lib/tournament-blob-archiver";
import { TournamentHtmlArchiver } from "@/lib/tournament-html-archiver";

/**
 * 大会をアーカイブとして保存
 * HTML版（新方式）のみ。失敗時はエラーを返す（DB保存にフォールバックしない）
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: "有効な大会IDを指定してください" },
        { status: 400 },
      );
    }

    const archivedBy = session.user.id || session.user.email || "admin";

    const { isBlobStorageAvailable } = await import("@/lib/blob-config");
    if (!isBlobStorageAvailable()) {
      return NextResponse.json(
        { success: false, error: "Blob Storageが設定されていません" },
        { status: 500 },
      );
    }

    console.log("📦 HTMLアーカイブを作成します...");

    // HTML版アーカイブを作成
    const htmlResult = await TournamentHtmlArchiver.archiveTournamentAsHtml(
      tournamentId,
      archivedBy,
    );

    if (!htmlResult.success) {
      return NextResponse.json(
        { success: false, error: htmlResult.error || "HTMLアーカイブ作成に失敗しました" },
        { status: 500 },
      );
    }

    // JSON版もバックアップ保存（失敗しても無視）
    try {
      await TournamentBlobArchiver.archiveTournament(tournamentId, archivedBy);
      console.log("✅ JSON版アーカイブもバックアップ保存しました");
    } catch (jsonError) {
      console.warn("⚠️ JSON版バックアップ保存スキップ:", jsonError);
    }

    return NextResponse.json({
      success: true,
      message: "HTMLアーカイブが正常に作成されました",
      data: htmlResult.data,
      storage_type: "html",
    });
  } catch (error) {
    console.error("アーカイブ作成エラー:", error);
    return NextResponse.json(
      { success: false, error: "アーカイブ作成中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
