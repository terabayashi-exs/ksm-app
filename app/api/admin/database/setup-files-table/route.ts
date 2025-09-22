// app/api/admin/database/setup-files-table/route.ts
// ファイルテーブル作成API（開発・デバッグ用）

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(_request: NextRequest) {
  try {
    console.log('🔧 ファイルテーブル作成API開始');
    
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    console.log('📊 ファイルテーブル作成開始');

    // t_tournament_files テーブル作成
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS t_tournament_files (
        file_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        file_title TEXT NOT NULL,
        file_description TEXT,
        original_filename TEXT NOT NULL,
        blob_url TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        upload_order INTEGER DEFAULT 0,
        is_public BOOLEAN DEFAULT TRUE,
        uploaded_by TEXT NOT NULL,
        uploaded_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE
      )
    `;

    await db.execute(createTableSQL);
    console.log('✅ t_tournament_files テーブル作成完了');

    // インデックス作成
    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_tournament_files_tournament_id 
      ON t_tournament_files(tournament_id)
    `;
    
    await db.execute(createIndexSQL);
    console.log('✅ インデックス作成完了');

    // t_tournaments テーブルにfiles_countカラム追加（存在しない場合）
    try {
      const alterTableSQL = `
        ALTER TABLE t_tournaments 
        ADD COLUMN files_count INTEGER DEFAULT 0
      `;
      await db.execute(alterTableSQL);
      console.log('✅ files_countカラム追加完了');
    } catch {
      console.log('ℹ️  files_countカラムは既に存在します');
    }

    // テーブル存在確認
    const checkResult = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='t_tournament_files'
    `);

    const tableExists = checkResult.rows.length > 0;
    console.log('🔍 テーブル存在確認:', tableExists);

    return NextResponse.json({
      success: true,
      message: 'ファイルテーブルのセットアップが完了しました',
      details: {
        table_created: tableExists,
        indexes_created: true,
        files_count_column_added: true
      }
    });

  } catch (error) {
    console.error('❌ テーブル作成エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'テーブル作成に失敗しました',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}