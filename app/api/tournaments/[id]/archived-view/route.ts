// app/api/tournaments/[id]/archived-view/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getArchivedTournamentJson } from '@/lib/tournament-json-archiver';
import { TournamentBlobArchiver } from '@/lib/tournament-blob-archiver';

/**
 * アーカイブされた大会データを取得
 * Phase 2: Blobとデータベースの両方に対応
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // 並行運用: Blob Storageが利用可能な場合は優先的に使用
    const useBlobStorage = !!process.env.BLOB_READ_WRITE_TOKEN;
    console.log(`🔍 アーカイブ取得開始: tournament_id=${tournamentId}, useBlobStorage=${useBlobStorage}`);
    
    if (useBlobStorage) {
      console.log(`📦 Blob Storageからアーカイブを取得します... (大会ID: ${tournamentId})`);
      
      try {
        // Blobからアーカイブデータを取得
        const blobArchive = await TournamentBlobArchiver.getArchivedTournament(tournamentId);
        console.log(`📦 Blob取得結果:`, blobArchive ? '見つかりました' : '見つかりませんでした');
        
        if (blobArchive) {
          // データ形式を既存のフォーマットに合わせる
          const formattedData = {
            tournament_id: tournamentId,
            tournament_name: blobArchive.tournament.tournament_name,
            tournament: blobArchive.tournament,
            teams: blobArchive.teams,
            matches: blobArchive.matches,
            standings: blobArchive.standings,
            results: blobArchive.results,
            pdfInfo: blobArchive.pdf_info,
            archived_at: blobArchive.archived_at,
            archived_by: blobArchive.archived_by,
            metadata: blobArchive.metadata
          };
          
          console.log(`✅ Blobアーカイブを返却: ${formattedData.tournament_name}`);
          return NextResponse.json({
            success: true,
            data: formattedData,
            source: 'blob'
          });
        } else {
          console.warn(`Blobにアーカイブが見つかりません。DBを確認します... (大会ID: ${tournamentId})`);
        }
      } catch (blobError) {
        console.error('Blob取得エラー:', blobError);
        // エラー時はDB取得にフォールバック
      }
    }

    // 従来のDBベースのアーカイブ取得
    console.log(`💾 データベースからアーカイブを取得します... (大会ID: ${tournamentId})`);
    const archived = await getArchivedTournamentJson(tournamentId);
    console.log(`💾 DB取得結果:`, archived ? '見つかりました' : '見つかりませんでした');

    if (!archived) {
      console.error(`❌ DBアーカイブが見つからない: tournament_id=${tournamentId}`);
      return NextResponse.json(
        { success: false, error: 'アーカイブデータが見つかりません' },
        { status: 404 }
      );
    }

    console.log(`✅ DBアーカイブを返却: ${archived.tournament_name}`);
    return NextResponse.json({
      success: true,
      data: archived,
      source: 'database'
    });

  } catch (error) {
    console.error('アーカイブデータ取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アーカイブデータ取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}