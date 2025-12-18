import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const teamId = searchParams.get('teamId') || 'team_ekusupato';

  const result = await db.execute(`
    SELECT player_id, player_name, jersey_number, current_team_id
    FROM m_players
    WHERE current_team_id = ?
    ORDER BY player_name
  `, [teamId]);

  return NextResponse.json({
    teamId,
    totalRows: result.rows.length,
    players: result.rows.map(r => ({
      player_id: r.player_id,
      player_name: r.player_name,
      jersey_number: r.jersey_number
    }))
  });
}
