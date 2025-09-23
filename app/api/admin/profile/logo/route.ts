// app/api/admin/profile/logo/route.ts
// 管理者ロゴアップロード・取得・削除API

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { put, del } from '@vercel/blob';

// 環境に応じたトークンを選択
const BLOB_TOKEN = process.env.NODE_ENV === 'production' 
  ? process.env.PROD_BLOB_READ_WRITE_TOKEN 
  : process.env.DEV_BLOB_READ_WRITE_TOKEN;

console.log('Blob Storage Configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  hasDevToken: !!process.env.DEV_BLOB_READ_WRITE_TOKEN,
  hasProdToken: !!process.env.PROD_BLOB_READ_WRITE_TOKEN,
  selectedToken: BLOB_TOKEN ? BLOB_TOKEN.substring(0, 20) + '...' : 'undefined'
});

// ロゴアップロード（POST）
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('logo') as File;
    const organizationName = formData.get('organization_name') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'ロゴファイルが必要です' },
        { status: 400 }
      );
    }

    // ファイル形式チェック
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'サポートされていないファイル形式です。JPEG、PNG、WebPファイルをアップロードしてください。' },
        { status: 400 }
      );
    }

    // ファイルサイズチェック（5MB制限）
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'ファイルサイズは5MB以下にしてください' },
        { status: 400 }
      );
    }

    const administratorId = session.user.administratorId;
    
    if (!administratorId) {
      return NextResponse.json(
        { success: false, error: '管理者IDが見つかりません' },
        { status: 400 }
      );
    }
    
    // 既存のロゴを確認
    const existingLogo = await db.execute(
      'SELECT logo_blob_url, logo_filename FROM m_administrators WHERE administrator_id = ?',
      [administratorId]
    );

    // 既存のロゴがあれば削除
    if (existingLogo.rows.length > 0 && existingLogo.rows[0].logo_blob_url) {
      try {
        await del(existingLogo.rows[0].logo_blob_url as string, { token: BLOB_TOKEN });
        console.log('既存ロゴファイルを削除しました:', existingLogo.rows[0].logo_blob_url);
      } catch (error) {
        console.warn('既存ロゴファイルの削除に失敗しました:', error);
        // 削除失敗でもアップロードは続行
      }
    }

    // 新しいファイル名を生成（管理者IDフォルダ配下に配置）
    const timestamp = Date.now();
    const extension = file.type.split('/')[1];
    const filename = `logo-${timestamp}.${extension}`;
    const filepath = `logos/${administratorId}/${filename}`;

    // Vercel Blobにアップロード
    const blob = await put(filepath, file, {
      access: 'public',
      contentType: file.type,
      token: BLOB_TOKEN,
    });

    console.log('Vercel Blobアップロード成功:', {
      url: blob.url,
      filepath: filepath,
      filename: filename,
      size: file.size,
      type: file.type
    });

    // データベース更新
    await db.execute(
      `UPDATE m_administrators 
       SET logo_blob_url = ?, 
           logo_filename = ?, 
           organization_name = ?,
           updated_at = datetime('now', '+9 hours')
       WHERE administrator_id = ?`,
      [blob.url, filename, organizationName || null, administratorId]
    );

    console.log('データベース更新完了:', {
      administratorId,
      logoUrl: blob.url,
      filepath: filepath,
      filename: filename,
      organizationName
    });

    return NextResponse.json({
      success: true,
      data: {
        logo_url: blob.url,
        filename: filename,
        filepath: filepath,
        organization_name: organizationName
      },
      message: 'ロゴが正常にアップロードされました'
    });

  } catch (error) {
    console.error('ロゴアップロードエラー:', error);
    return NextResponse.json(
      { success: false, error: 'ロゴのアップロードに失敗しました' },
      { status: 500 }
    );
  }
}

// ロゴ情報取得（GET）
export async function GET() {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const administratorId = session.user.administratorId;

    if (!administratorId) {
      return NextResponse.json(
        { success: false, error: '管理者IDが見つかりません' },
        { status: 400 }
      );
    }

    const result = await db.execute(
      'SELECT logo_blob_url, logo_filename, organization_name FROM m_administrators WHERE administrator_id = ?',
      [administratorId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '管理者情報が見つかりません' },
        { status: 404 }
      );
    }

    const logoData = result.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        has_logo: !!logoData.logo_blob_url,
        logo_url: logoData.logo_blob_url || null,
        filename: logoData.logo_filename || null,
        organization_name: logoData.organization_name || null
      }
    });

  } catch (error) {
    console.error('ロゴ情報取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ロゴ情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// ロゴ削除（DELETE）
export async function DELETE() {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const administratorId = session.user.administratorId;

    if (!administratorId) {
      return NextResponse.json(
        { success: false, error: '管理者IDが見つかりません' },
        { status: 400 }
      );
    }

    // 現在のロゴ情報を取得
    const result = await db.execute(
      'SELECT logo_blob_url, logo_filename FROM m_administrators WHERE administrator_id = ?',
      [administratorId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '管理者情報が見つかりません' },
        { status: 404 }
      );
    }

    const logoData = result.rows[0];

    if (!logoData.logo_blob_url) {
      return NextResponse.json(
        { success: false, error: '削除するロゴが存在しません' },
        { status: 400 }
      );
    }

    // Vercel Blobからファイル削除
    try {
      await del(logoData.logo_blob_url as string, { token: BLOB_TOKEN });
      console.log('Vercel Blobからファイルを削除しました:', logoData.logo_blob_url);
    } catch (error) {
      console.warn('Vercel Blobファイル削除に失敗しました:', error);
      // 削除失敗でもデータベース更新は続行
    }

    // データベースからロゴ情報をクリア
    await db.execute(
      `UPDATE m_administrators 
       SET logo_blob_url = NULL, 
           logo_filename = NULL,
           updated_at = datetime('now', '+9 hours')
       WHERE administrator_id = ?`,
      [administratorId]
    );

    console.log('データベースからロゴ情報をクリアしました:', administratorId);

    return NextResponse.json({
      success: true,
      message: 'ロゴが正常に削除されました'
    });

  } catch (error) {
    console.error('ロゴ削除エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ロゴの削除に失敗しました' },
      { status: 500 }
    );
  }
}