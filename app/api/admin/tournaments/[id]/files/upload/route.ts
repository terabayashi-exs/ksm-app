// app/api/admin/tournaments/[id]/files/upload/route.ts
// 大会ファイルアップロードAPI

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { put } from '@vercel/blob';
import { FILE_VALIDATION, type FileUploadResponse } from '@/lib/types/tournament-files';
import { getBlobToken, isBlobStorageAvailable, logBlobConfig } from '@/lib/blob-config';

// ファイル名をサニタイズする関数
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 100);
}

// ファイルサイズを人間が読みやすい形式に変換
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// CORS対応のOPTIONSハンドラー
export async function OPTIONS(_request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<FileUploadResponse>> {
  console.log('🚀 ファイルアップロードAPI開始');
  
  try {
    // 認証チェック
    console.log('🔐 認証チェック開始');
    const session = await auth();
    console.log('👤 セッション情報:', session?.user?.id, session?.user?.role);
    
    if (!session || session.user.role !== 'admin') {
      console.log('❌ 認証失敗: 管理者権限なし');
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }
    
    console.log('✅ 認証成功');

    const { id } = await params;
    const tournamentId = parseInt(id);
    console.log('🏆 大会ID:', tournamentId);
    
    if (isNaN(tournamentId)) {
      console.log('❌ 無効な大会ID:', id);
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 大会の存在確認
    const tournamentResult = await db.execute(
      'SELECT tournament_id FROM t_tournaments WHERE tournament_id = ?',
      [tournamentId]
    );

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    // FormDataから情報を取得
    console.log('📋 FormData解析開始');
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string | null;
    const uploadOrder = parseInt(formData.get('upload_order') as string) || 0;
    
    console.log('📂 ファイル情報:', {
      filename: file?.name,
      size: file?.size,
      type: file?.type,
      title,
      description: description ? '設定あり' : 'なし'
    });

    // バリデーション
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'ファイルが選択されていません' },
        { status: 400 }
      );
    }

    if (!title || title.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'ファイルタイトルは必須です' },
        { status: 400 }
      );
    }

    // ファイルサイズチェック
    if (file.size > FILE_VALIDATION.maxSize) {
      return NextResponse.json(
        { 
          success: false, 
          error: `ファイルサイズが大きすぎます。最大${formatFileSize(FILE_VALIDATION.maxSize)}まで` 
        },
        { status: 400 }
      );
    }

    // ファイル形式チェック
    if (!FILE_VALIDATION.allowedTypes.includes(file.type as 'application/pdf')) {
      return NextResponse.json(
        { success: false, error: 'PDFファイルのみアップロード可能です' },
        { status: 400 }
      );
    }

    // 拡張子チェック
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !FILE_VALIDATION.allowedExtensions.includes(fileExtension as '.pdf')) {
      return NextResponse.json(
        { success: false, error: '.pdf拡張子のファイルのみアップロード可能です' },
        { status: 400 }
      );
    }

    // 既存ファイル数チェック
    const existingFilesResult = await db.execute(
      'SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_size FROM t_tournament_files WHERE tournament_id = ?',
      [tournamentId]
    );

    const existingCount = Number(existingFilesResult.rows[0].count);
    const existingTotalSize = Number(existingFilesResult.rows[0].total_size);

    if (existingCount >= FILE_VALIDATION.maxFilesPerTournament) {
      return NextResponse.json(
        { 
          success: false, 
          error: `ファイル数の上限（${FILE_VALIDATION.maxFilesPerTournament}件）に達しています` 
        },
        { status: 400 }
      );
    }

    if (existingTotalSize + file.size > FILE_VALIDATION.maxTotalSizePerTournament) {
      return NextResponse.json(
        { 
          success: false, 
          error: `大会あたりの総ファイルサイズ上限（${formatFileSize(FILE_VALIDATION.maxTotalSizePerTournament)}）を超過します` 
        },
        { status: 400 }
      );
    }

    // ファイル名をサニタイズ
    const sanitizedFilename = sanitizeFilename(file.name);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blobFilename = `tournaments/${tournamentId}/${timestamp}_${sanitizedFilename}`;

    // Vercel Blob Storageにアップロード
    console.log('🔄 Vercel Blob Storageにアップロード中...');
    logBlobConfig(); // デバッグ情報を出力
    
    const blobToken = getBlobToken();
    let blob;
    
    try {
      if (!blobToken || !isBlobStorageAvailable()) {
        throw new Error('Blob Storage トークンが設定されていません');
      }
      
      blob = await put(blobFilename, file, {
        access: 'public',
        token: blobToken
      });
      console.log('✅ Blob Storage アップロード完了:', blob.url);
    } catch (blobError) {
      console.warn('⚠️ Vercel Blob Storage エラー:', blobError);
      
      // 開発環境用フォールバック: データURLとして保存
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 開発環境用フォールバック処理を実行中...');
        
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const dataUrl = `data:${file.type};base64,${base64}`;
        
        blob = {
          url: dataUrl,
          size: file.size,
          uploadedAt: new Date().toISOString()
        };
        
        console.log('✅ 開発環境用ファイル保存完了（Base64形式）');
      } else {
        throw new Error(`Blob Storage エラー: ${blobError instanceof Error ? blobError.message : String(blobError)}`);
      }
    }

    // データベースに保存
    const insertResult = await db.execute(`
      INSERT INTO t_tournament_files (
        tournament_id,
        file_title,
        file_description,
        original_filename,
        blob_url,
        file_size,
        mime_type,
        upload_order,
        uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tournamentId,
      title.trim(),
      description?.trim() || null,
      file.name,
      blob.url,
      file.size,
      file.type,
      uploadOrder,
      session.user.id
    ]);

    // 大会のファイル数を更新
    await db.execute(
      'UPDATE t_tournaments SET files_count = files_count + 1 WHERE tournament_id = ?',
      [tournamentId]
    );

    console.log('✅ データベース保存完了');

    return NextResponse.json({
      success: true,
      data: {
        file_id: Number(insertResult.lastInsertRowid),
        file_title: title.trim(),
        blob_url: blob.url,
        file_size: file.size
      }
    });

  } catch (error) {
    console.error('❌ ファイルアップロードエラー:', error);
    console.error('❌ エラースタック:', error instanceof Error ? error.stack : 'スタックなし');
    console.error('❌ エラー詳細:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error ? error.cause : undefined
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'ファイルアップロードに失敗しました',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}