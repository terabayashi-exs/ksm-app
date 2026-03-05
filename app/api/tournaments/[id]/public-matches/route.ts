// app/api/tournaments/[id]/public-matches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTournamentPublicMatches } from '@/lib/tournament-public-matches';

// キャッシュはCache-Controlヘッダーで制御

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 大会の公開用試合一覧を取得（認証不要）
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  console.log('API called with params:', params);
  console.log('Params type:', typeof params);

  let tournamentId: number = 0; // Initialize with default value

  try {
    // Next.js 15対応：paramsは常にPromise
    const resolvedParams = await params;

    console.log('Resolved params:', resolvedParams);

    if (!resolvedParams || !resolvedParams.id) {
      console.log('No ID found in params');
      return NextResponse.json(
        { success: false, error: 'パラメータが不正です' },
        { status: 400 }
      );
    }

    const tournamentIdStr = resolvedParams.id;
    console.log('Tournament ID string:', tournamentIdStr);

    tournamentId = parseInt(tournamentIdStr);
    console.log('Parsed tournament ID:', tournamentId);

    if (isNaN(tournamentId) || !tournamentIdStr) {
      console.log('Invalid tournament ID - NaN or empty');
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    const result = await getTournamentPublicMatches(tournamentId);

    if (result === null) {
      return NextResponse.json(
        { success: false, error: '指定された大会が存在しません' },
        { status: 404 }
      );
    }

    return new Response(JSON.stringify({
      success: true,
      data: result
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });

  } catch (error) {
    console.error('公開試合データ取得エラー:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
    console.error('Tournament ID:', tournamentId);
    console.error('Full error object:', JSON.stringify(error, null, 2));

    return NextResponse.json(
      {
        success: false,
        error: '試合データの取得に失敗しました',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack available',
        tournamentId: tournamentId
      },
      { status: 500 }
    );
  }
}
