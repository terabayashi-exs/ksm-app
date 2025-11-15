// app/api/tournaments/[id]/archive/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { archiveTournamentAsJson } from '@/lib/tournament-json-archiver';
import { TournamentBlobArchiver } from '@/lib/tournament-blob-archiver';

/**
 * 大会をJSONアーカイブとして保存
 * Phase 2: DBとBlobの両方に保存（並行運用）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    const archivedBy = session.user.id || session.user.email || 'admin';

    // 並行運用: Blob Storageが利用可能な場合は使用
    const useBlobStorage = !!process.env.BLOB_READ_WRITE_TOKEN;
    
    if (useBlobStorage) {
      console.log('📦 Blob Storageを使用してアーカイブを作成します...');
      
      try {
        // Blobにアーカイブを保存
        const blobResult = await TournamentBlobArchiver.archiveTournament(
          tournamentId,
          archivedBy
        );
        
        if (blobResult.success) {
          // 成功時は従来のDB保存も実行（バックアップとして）
          await archiveTournamentAsJson(tournamentId, archivedBy);
          
          return NextResponse.json({
            success: true,
            message: 'アーカイブが正常に作成されました（Blob Storage使用）',
            data: blobResult.data,
            storage_type: 'blob'
          });
        } else {
          // Blob保存に失敗した場合は従来のDB保存にフォールバック
          console.warn('Blob保存に失敗しました。DBに保存します:', blobResult.error);
        }
      } catch (blobError) {
        console.error('Blob保存エラー:', blobError);
        // エラーが発生してもDB保存に進む
      }
    }

    // 従来のDBベースのアーカイブ（Blobが無効またはエラー時）
    console.log('💾 データベースを使用してアーカイブを作成します...');
    const result = await archiveTournamentAsJson(
      tournamentId,
      archivedBy
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'アーカイブが正常に作成されました',
        data: result.data,
        storage_type: 'database'
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('アーカイブ作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アーカイブ作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}