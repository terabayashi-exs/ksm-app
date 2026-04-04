import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const roles = (session?.user?.roles ?? []) as string[];
    const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
    if (!roles.includes('admin') && !isSuperadmin) {
      return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournament_id');
    if (!tournamentId) {
      return NextResponse.json({ success: false, error: 'tournament_id が必要です' }, { status: 400 });
    }

    const result = await db.execute(`
      SELECT
        tt.tournament_team_id,
        tt.team_id,
        tt.team_name,
        tt.team_omission,
        tt.participation_status,
        tt.withdrawal_status,
        m.team_name AS master_team_name
      FROM t_tournament_teams tt
      LEFT JOIN m_teams m ON tt.team_id = m.team_id
      WHERE tt.tournament_id = ?
      ORDER BY tt.tournament_team_id ASC
    `, [tournamentId]);

    return NextResponse.json({
      success: true,
      data: result.rows.map(row => ({
        tournament_team_id: Number(row.tournament_team_id),
        team_id: String(row.team_id ?? ''),
        team_name: String(row.team_name ?? ''),
        team_omission: row.team_omission ? String(row.team_omission) : null,
        participation_status: String(row.participation_status ?? ''),
        withdrawal_status: String(row.withdrawal_status ?? ''),
        master_team_name: row.master_team_name ? String(row.master_team_name) : null,
      })),
    });
  } catch (error) {
    console.error('[DATA_REG] tournament-teams error:', error);
    return NextResponse.json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
