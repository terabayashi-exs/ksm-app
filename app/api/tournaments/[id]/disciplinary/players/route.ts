// app/api/tournaments/[id]/disciplinary/players/route.ts
// チームの選手一覧を取得（懲罰管理用）
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
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

    const tournamentTeamId = request.nextUrl.searchParams.get('tournament_team_id');
    if (!tournamentTeamId) {
      return NextResponse.json({ success: false, error: 'tournament_team_idが必要です' }, { status: 400 });
    }

    const result = await db.execute(
      `SELECT COALESCE(tp.player_name, mp.player_name) as player_name, tp.jersey_number
       FROM t_tournament_players tp
       LEFT JOIN m_players mp ON tp.player_id = mp.player_id
       WHERE tp.tournament_team_id = ?
       AND tp.player_status = 'active'
       ORDER BY tp.jersey_number, player_name`,
      [parseInt(tournamentTeamId)]
    );

    const players = result.rows
      .filter((row) => row.player_name != null)
      .map((row) => ({
        player_name: String(row.player_name),
        jersey_number: row.jersey_number != null ? Number(row.jersey_number) : null,
      }));

    return NextResponse.json({ success: true, data: players });
  } catch (error) {
    console.error('選手一覧取得エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}
