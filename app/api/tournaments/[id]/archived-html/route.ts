// app/api/tournaments/[id]/archived-html/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { TournamentHtmlArchiver } from '@/lib/tournament-html-archiver';

/**
 * アーカイブHTMLを返却するAPI
 * 未認証でもアクセス可（公開ページ用）
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
        { error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    const html = await TournamentHtmlArchiver.getArchivedHtml(tournamentId);

    if (!html) {
      return NextResponse.json(
        { error: 'HTMLアーカイブが見つかりません' },
        { status: 404 }
      );
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('HTMLアーカイブ取得エラー:', error);
    return NextResponse.json(
      { error: 'HTMLアーカイブの取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
