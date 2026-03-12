import { NextRequest, NextResponse } from 'next/server';
import { getTournamentBracketData, HttpError } from '@/lib/tournament-bracket-data';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournamentId = parseInt(id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid tournament ID' },
        { status: 400 }
      );
    }

    // クエリパラメータからphaseを取得（デフォルトは'final'）
    const { searchParams } = new URL(request.url);
    const phase = searchParams.get('phase') || 'final';

    const result = await getTournamentBracketData(tournamentId, phase);

    return new Response(JSON.stringify({
      success: true,
      data: result.data,
      sport_config: result.sport_config,
      target_team_count: result.target_team_count,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });

  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (status >= 500) {
      console.error('Error fetching tournament bracket:', error);
    }

    return NextResponse.json(
      { success: false, error: status >= 500 ? `データの取得に失敗しました: ${message}` : message },
      { status }
    );
  }
}