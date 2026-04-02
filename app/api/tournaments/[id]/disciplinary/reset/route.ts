// app/api/tournaments/[id]/disciplinary/reset/route.ts
// 選手の累積イエローリセット
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { resetPlayerAccumulation } from '@/lib/disciplinary-calculator';
import { normalizePlayerName } from '@/lib/player-name-normalizer';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST: 選手の累積イエローをリセット（出場停止消化後）
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json({ success: false, error: '管理者権限が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const tournamentId = parseInt(id);
    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: '無効な部門IDです' }, { status: 400 });
    }

    const body = await request.json();
    const { playerName } = body;

    if (!playerName) {
      return NextResponse.json({ success: false, error: '選手名は必須です' }, { status: 400 });
    }

    // group_id取得
    const tournamentResult = await db.execute(
      `SELECT group_id FROM t_tournaments WHERE tournament_id = ?`,
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: '部門が見つかりません' }, { status: 404 });
    }
    const groupId = Number(tournamentResult.rows[0].group_id);

    const normalizedName = normalizePlayerName(playerName);
    await resetPlayerAccumulation(groupId, normalizedName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('累積リセットエラー:', error);
    return NextResponse.json({ success: false, error: 'リセットに失敗しました' }, { status: 500 });
  }
}
