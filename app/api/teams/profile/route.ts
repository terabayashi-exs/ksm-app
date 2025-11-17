// app/api/teams/profile/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import type { TournamentStatus } from '@/lib/tournament-status';

export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'team') {
      return NextResponse.json(
        { success: false, error: 'チーム権限が必要です' },
        { status: 401 }
      );
    }

    const teamId = session.user.teamId;
    if (!teamId) {
      return NextResponse.json(
        { success: false, error: 'チームIDが見つかりません' },
        { status: 400 }
      );
    }

    // チーム情報を取得
    const teamResult = await db.execute(`
      SELECT 
        team_id,
        team_name,
        team_omission,
        contact_person,
        contact_email,
        contact_phone,
        is_active,
        created_at,
        updated_at
      FROM m_teams 
      WHERE team_id = ? AND is_active = 1
    `, [teamId]);

    if (teamResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'チームが見つかりません' },
        { status: 404 }
      );
    }

    const team = teamResult.rows[0];

    // 選手情報を取得
    const playersResult = await db.execute(`
      SELECT 
        player_id,
        player_name,
        jersey_number,
        is_active,
        created_at,
        updated_at
      FROM m_players 
      WHERE current_team_id = ? AND is_active = 1
      ORDER BY jersey_number ASC, player_name ASC
    `, [teamId]);

    const players = playersResult.rows.map(row => ({
      player_id: Number(row.player_id),
      player_name: String(row.player_name),
      jersey_number: row.jersey_number ? Number(row.jersey_number) : null,
      is_active: Boolean(row.is_active),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    }));

    // 参加中の大会情報を取得
    const tournamentsResult = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.status,
        t.tournament_dates,
        tt.assigned_block,
        tt.block_position,
        v.venue_name
      FROM t_tournaments t
      JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      WHERE tt.team_id = ?
      ORDER BY t.created_at DESC
    `, [teamId]);

    const tournaments = tournamentsResult.rows.map(row => {
      // tournament_datesから最初の日程を取得
      let eventStartDate = '';
      if (row.tournament_dates) {
        try {
          const dates = JSON.parse(row.tournament_dates as string);
          const dateValues = Object.values(dates) as string[];
          eventStartDate = dateValues.sort()[0] || '';
        } catch (error) {
          console.error('Error parsing tournament_dates:', error);
        }
      }

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        status: row.status as TournamentStatus,
        assigned_block: row.assigned_block as string,
        block_position: row.block_position ? Number(row.block_position) : null,
        venue_name: row.venue_name as string,
        event_start_date: eventStartDate
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        team: {
          team_id: String(team.team_id),
          team_name: String(team.team_name),
          team_omission: team.team_omission as string,
          contact_person: String(team.contact_person),
          contact_email: String(team.contact_email),
          contact_phone: team.contact_phone as string,
          is_active: Boolean(team.is_active),
          created_at: String(team.created_at),
          updated_at: String(team.updated_at)
        },
        players,
        tournaments
      }
    });

  } catch (error) {
    console.error('Team profile fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'チーム情報の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}