// app/api/tournaments/[id]/files/route.ts
// 大会の公開ファイル一覧取得API（一般ユーザー向け）

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { type FileListResponse, type TournamentFile } from "@/lib/types/tournament-files";

// 公開ファイル一覧取得（認証不要）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<FileListResponse>> {
  try {
    const { id } = await params;
    const tournamentId = parseInt(id);
    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効な大会IDです" }, { status: 400 });
    }

    // 大会の存在確認と公開状態チェック
    const tournamentResult = await db.execute(
      `
      SELECT tournament_id, tournament_name, visibility 
      FROM t_tournaments 
      WHERE tournament_id = ?
    `,
      [tournamentId],
    );

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "大会が見つかりません" }, { status: 404 });
    }

    const tournament = tournamentResult.rows[0];

    // 大会が非公開の場合は空の結果を返す
    if (tournament.visibility !== "open") {
      return NextResponse.json({
        success: true,
        data: {
          files: [],
          total_count: 0,
          total_size: 0,
        },
      });
    }

    // 公開ファイルのみを取得
    const filesResult = await db.execute(
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
        uploaded_at
      FROM t_tournament_files
      WHERE tournament_id = ? AND is_public = 1
      ORDER BY upload_order ASC, uploaded_at DESC
    `,
      [tournamentId],
    );

    const files: Omit<TournamentFile, "is_public" | "uploaded_by" | "updated_at">[] =
      filesResult.rows.map((row) => ({
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
        uploaded_at: String(row.uploaded_at),
      }));

    // 統計情報を計算
    const totalCount = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.file_size, 0);

    console.log(`📊 大会${tournamentId}の公開ファイル: ${totalCount}件`);

    return NextResponse.json({
      success: true,
      data: {
        files: files as TournamentFile[], // 型アサーション（公開API用）
        total_count: totalCount,
        total_size: totalSize,
      },
    });
  } catch (error) {
    console.error("❌ 公開ファイル一覧取得エラー:", error);
    return NextResponse.json(
      { success: false, error: "ファイル一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}
