// app/api/admin/archived-tournaments/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getArchivedTournamentsList } from '@/lib/tournament-json-archiver';
import { TournamentBlobArchiver } from '@/lib/tournament-blob-archiver';

/**
 * アーカイブされた大会一覧を取得（管理者用）
 * Phase 2: Blobとデータベースの両方から取得
 */
export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    // 並行運用: Blob Storageが利用可能な場合は優先的に使用
    const useBlobStorage = !!process.env.BLOB_READ_WRITE_TOKEN;
    
    if (useBlobStorage) {
      console.log('📦 Blob Storageからアーカイブ一覧を取得します...');
      
      try {
        // Blobからアーカイブ一覧を取得
        const blobArchives = await TournamentBlobArchiver.getArchiveIndex();
        
        // DBからも取得して比較（デバッグ用）
        const dbArchives = await getArchivedTournamentsList();
        
        // Blobに存在するIDのセット
        const blobIds = new Set(blobArchives.map(a => a.tournament_id));
        
        // DBにのみ存在するアーカイブを検出
        const dbOnlyArchives = dbArchives.filter(a => !blobIds.has(a.tournament_id as number));
        
        if (dbOnlyArchives.length > 0) {
          console.warn(`📊 DBにのみ存在するアーカイブ: ${dbOnlyArchives.length}件`);
        }
        
        // Blobの結果を返す（より新しい情報を優先）
        return NextResponse.json({
          success: true,
          data: blobArchives,
          source: 'blob',
          stats: {
            blob_count: blobArchives.length,
            db_count: dbArchives.length,
            db_only_count: dbOnlyArchives.length
          }
        });
        
      } catch (blobError) {
        console.error('Blob取得エラー:', blobError);
        // エラー時はDB取得にフォールバック
      }
    }

    // 従来のDBベースの一覧取得
    console.log('💾 データベースからアーカイブ一覧を取得します...');
    const archives = await getArchivedTournamentsList();

    return NextResponse.json({
      success: true,
      data: archives,
      source: 'database'
    });

  } catch (error) {
    console.error('アーカイブ一覧取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アーカイブ一覧取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}