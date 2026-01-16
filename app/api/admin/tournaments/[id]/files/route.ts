// app/api/admin/tournaments/[id]/files/route.ts
// 大会ファイル一覧取得・更新API

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { type FileListResponse, type TournamentFile } from '@/lib/types/tournament-files';

// ファイルサイズを人間が読みやすい形式に変換
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ファイル一覧取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<FileListResponse>> {
  try {
    // 認証チェック
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const tournamentId = parseInt(id);
    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 大会の存在確認
    const tournamentResult = await db.execute(
      'SELECT tournament_id, tournament_name FROM t_tournaments WHERE tournament_id = ?',
      [tournamentId]
    );

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    // ファイル一覧を取得
    const filesResult = await db.execute(`
      SELECT 
        file_id,
        tournament_id,
        file_title,
        file_description,
        original_filename,
        blob_url,
        file_size,
        mime_type,
        upload_order,
        is_public,
        uploaded_by,
        uploaded_at,
        updated_at
      FROM t_tournament_files 
      WHERE tournament_id = ?
      ORDER BY upload_order ASC, uploaded_at DESC
    `, [tournamentId]);

    const files: TournamentFile[] = filesResult.rows.map(row => ({
      file_id: Number(row.file_id),
      tournament_id: Number(row.tournament_id),
      file_title: String(row.file_title),
      file_description: row.file_description ? String(row.file_description) : undefined,
      original_filename: String(row.original_filename),
      blob_url: String(row.blob_url),
      file_size: Number(row.file_size),
      mime_type: String(row.mime_type),
      upload_order: Number(row.upload_order),
      is_public: Boolean(row.is_public),
      uploaded_by: String(row.uploaded_by),
      uploaded_at: String(row.uploaded_at),
      updated_at: String(row.updated_at)
    }));

    // 統計情報を計算
    const totalCount = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.file_size, 0);

    console.log(`📊 大会${tournamentId}のファイル情報: ${totalCount}件, ${formatFileSize(totalSize)}`);

    return NextResponse.json({
      success: true,
      data: {
        files,
        total_count: totalCount,
        total_size: totalSize
      }
    });

  } catch (error) {
    console.error('❌ ファイル一覧取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ファイル一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// ファイル情報更新（タイトル、説明、公開設定など）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean; error?: string }>> {
  try {
    // 認証チェック
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const tournamentId = parseInt(id);
    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { file_id, file_title, file_description, is_public, upload_order } = body;

    if (!file_id || !file_title) {
      return NextResponse.json(
        { success: false, error: 'ファイルIDとタイトルは必須です' },
        { status: 400 }
      );
    }

    // ファイルの存在確認と権限チェック
    const fileResult = await db.execute(
      'SELECT file_id FROM t_tournament_files WHERE file_id = ? AND tournament_id = ?',
      [file_id, tournamentId]
    );

    if (fileResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ファイルが見つかりません' },
        { status: 404 }
      );
    }

    // ファイル情報更新
    await db.execute(`
      UPDATE t_tournament_files 
      SET 
        file_title = ?,
        file_description = ?,
        is_public = ?,
        upload_order = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE file_id = ? AND tournament_id = ?
    `, [
      file_title.trim(),
      file_description?.trim() || null,
      is_public !== false ? 1 : 0, // デフォルトは公開
      upload_order || 0,
      file_id,
      tournamentId
    ]);

    console.log(`✅ ファイル更新完了: file_id=${file_id}, title="${file_title}"`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ ファイル更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ファイル情報の更新に失敗しました' },
      { status: 500 }
    );
  }
}