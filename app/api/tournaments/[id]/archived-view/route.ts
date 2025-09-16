// app/api/tournaments/[id]/archived-view/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getArchivedTournamentJson } from '@/lib/tournament-json-archiver';

/**
 * アーカイブされた大会データを取得
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

    // アーカイブデータを取得
    const archived = await getArchivedTournamentJson(tournamentId);

    if (!archived) {
      return NextResponse.json(
        { success: false, error: 'アーカイブデータが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: archived
    });

  } catch (error) {
    console.error('アーカイブデータ取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アーカイブデータ取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}