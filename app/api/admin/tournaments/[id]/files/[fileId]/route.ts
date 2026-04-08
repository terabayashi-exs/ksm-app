// app/api/admin/tournaments/[id]/files/[fileId]/route.ts
// 個別ファイル削除API

import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBlobToken } from "@/lib/blob-config";
import { db } from "@/lib/db";
import { type FileDeleteResponse } from "@/lib/types/tournament-files";

// ファイル削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
): Promise<NextResponse<FileDeleteResponse>> {
  try {
    // 認証チェック
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
    }

    const { id, fileId: fileIdParam } = await params;
    const tournamentId = parseInt(id);
    const fileId = parseInt(fileIdParam);

    if (isNaN(tournamentId) || isNaN(fileId)) {
      return NextResponse.json({ success: false, error: "無効なIDです" }, { status: 400 });
    }

    // ファイル情報を取得
    const fileResult = await db.execute(
      `
      SELECT
        file_id,
        tournament_id,
        link_type,
        file_title,
        blob_url,
        original_filename
      FROM t_tournament_files
      WHERE file_id = ? AND tournament_id = ?
    `,
      [fileId, tournamentId],
    );

    if (fileResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "ファイルが見つかりません" },
        { status: 404 },
      );
    }

    const file = fileResult.rows[0];
    const linkType = String(file.link_type || "upload");
    const blobUrl = String(file.blob_url);
    const fileName = String(file.file_title);

    console.log(`🗑️  ファイル削除開始: ${fileName} (ID: ${fileId}, Type: ${linkType})`);

    // Vercel Blob Storageから削除（アップロードファイルの場合のみ）
    if (linkType === "upload") {
      try {
        // データURLの場合はBlobストレージ削除をスキップ
        if (blobUrl.startsWith("data:")) {
          console.log("🔄 データURL形式のため、Blob削除をスキップ");
        } else {
          const blobToken = getBlobToken();
          await del(blobUrl, {
            token: blobToken,
          });
          console.log("✅ Blob Storage から削除完了");
        }
      } catch (blobError) {
        console.warn("⚠️  Blob Storage削除エラー (続行):", blobError);
        // Blob削除が失敗してもデータベースからは削除する
      }
    } else {
      console.log("🔗 外部URLリンクのため、Blob削除をスキップ");
    }

    // データベースから削除
    await db.execute("DELETE FROM t_tournament_files WHERE file_id = ? AND tournament_id = ?", [
      fileId,
      tournamentId,
    ]);

    // 大会のファイル数を更新
    await db.execute(
      "UPDATE t_tournaments SET files_count = files_count - 1 WHERE tournament_id = ?",
      [tournamentId],
    );

    console.log("✅ データベースから削除完了");

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("❌ ファイル削除エラー:", error);
    return NextResponse.json(
      { success: false, error: "ファイル削除に失敗しました" },
      { status: 500 },
    );
  }
}

// 個別ファイル情報取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
): Promise<NextResponse> {
  try {
    // 認証チェック
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
    }

    const { id, fileId: fileIdParam } = await params;
    const tournamentId = parseInt(id);
    const fileId = parseInt(fileIdParam);

    if (isNaN(tournamentId) || isNaN(fileId)) {
      return NextResponse.json({ success: false, error: "無効なIDです" }, { status: 400 });
    }

    // ファイル情報を取得
    const fileResult = await db.execute(
      `
      SELECT
        file_id,
        tournament_id,
        link_type,
        file_title,
        file_description,
        original_filename,
        blob_url,
        external_url,
        file_size,
        mime_type,
        upload_order,
        is_public,
        uploaded_by,
        uploaded_at,
        updated_at
      FROM t_tournament_files
      WHERE file_id = ? AND tournament_id = ?
    `,
      [fileId, tournamentId],
    );

    if (fileResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "ファイルが見つかりません" },
        { status: 404 },
      );
    }

    const row = fileResult.rows[0];
    const file = {
      file_id: Number(row.file_id),
      tournament_id: Number(row.tournament_id),
      link_type: (row.link_type as "upload" | "external") || "upload",
      file_title: String(row.file_title),
      file_description: row.file_description ? String(row.file_description) : undefined,
      original_filename: String(row.original_filename),
      blob_url: String(row.blob_url),
      external_url: row.external_url ? String(row.external_url) : undefined,
      file_size: Number(row.file_size),
      mime_type: String(row.mime_type),
      upload_order: Number(row.upload_order),
      is_public: Boolean(row.is_public),
      uploaded_by: String(row.uploaded_by),
      uploaded_at: String(row.uploaded_at),
      updated_at: String(row.updated_at),
    };

    return NextResponse.json({
      success: true,
      data: file,
    });
  } catch (error) {
    console.error("❌ ファイル情報取得エラー:", error);
    return NextResponse.json(
      { success: false, error: "ファイル情報の取得に失敗しました" },
      { status: 500 },
    );
  }
}
