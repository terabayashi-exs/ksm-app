import { NextRequest, NextResponse } from 'next/server';
import { getTournamentWalkoverSettings } from '@/lib/tournament-rules';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const params = await context.params;
    const tournamentId = parseInt(params.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 不戦勝設定を取得
    const walkoverSettings = await getTournamentWalkoverSettings(tournamentId);

    return NextResponse.json({
      success: true,
      data: walkoverSettings
    });

  } catch (error) {
    console.error('不戦勝設定取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '不戦勝設定の取得に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー'
      },
      { status: 500 }
    );
  }
}
