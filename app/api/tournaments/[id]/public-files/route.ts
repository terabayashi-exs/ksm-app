// app/api/tournaments/[id]/public-files/route.ts
// 大会の公開ファイル一覧取得API

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface PublicFile {
  file_id: number;
  file_title: string;
  file_description?: string;
  original_filename: string;
  blob_url: string;
  file_size: number;
  upload_order: number;
  uploaded_at: string;
}

interface PublicFilesResponse {
  success: boolean;
  data?: {
    files: PublicFile[];
    total_files: number;
  };
  error?: string;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<PublicFilesResponse>> {
  try {
    // パラメータ取得
    const params = await context.params;
    const tournamentId = parseInt(params.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 大会存在確認
    const tournamentResult = await db.execute(`
      SELECT tournament_id, tournament_name, status, visibility
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const tournament = tournamentResult.rows[0];

    // 公開設定確認
    if (!tournament.visibility) {
      return NextResponse.json(
        { success: false, error: 'この大会は非公開です' },
        { status: 403 }
      );
    }

    // 公開ファイル一覧取得
    const filesResult = await db.execute(`
      SELECT 
        file_id,
        file_title,
        file_description,
        original_filename,
        blob_url,
        file_size,
        upload_order,
        uploaded_at
      FROM t_tournament_files 
      WHERE tournament_id = ? AND is_public = 1
      ORDER BY upload_order ASC, uploaded_at ASC
    `, [tournamentId]);

    // データ変換
    const files: PublicFile[] = filesResult.rows.map(row => ({
      file_id: Number(row.file_id),
      file_title: String(row.file_title),
      file_description: row.file_description ? String(row.file_description) : undefined,
      original_filename: String(row.original_filename),
      blob_url: String(row.blob_url),
      file_size: Number(row.file_size),
      upload_order: Number(row.upload_order),
      uploaded_at: String(row.uploaded_at)
    }));

    console.log(`📎 公開ファイル取得: 大会${tournamentId} - ${files.length}件`);

    return NextResponse.json({
      success: true,
      data: {
        files,
        total_files: files.length
      }
    });

  } catch (error) {
    console.error('❌ 公開ファイル取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '公開ファイル一覧の取得に失敗しました' 
      },
      { status: 500 }
    );
  }
}