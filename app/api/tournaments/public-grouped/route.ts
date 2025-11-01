import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { calculateTournamentStatus } from '@/lib/tournament-status';

// GET /api/tournaments/public-grouped - グループ化された公開大会を取得
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const teamId = session?.user?.role === 'team' ? session.user.teamId : undefined;

    const query = `
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.status,
        t.visibility,
        t.tournament_dates,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        t.created_by,
        t.group_id,
        t.group_order,
        t.category_name,
        v.venue_name,
        f.format_name,
        a.logo_blob_url,
        a.organization_name,
        g.group_name,
        g.group_description,
        g.group_color,
        g.display_order,
        ${teamId ? 'CASE WHEN tt.team_id IS NOT NULL THEN 1 ELSE 0 END as is_joined' : '0 as is_joined'}
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN m_administrators a ON t.created_by = a.admin_login_id
      LEFT JOIN m_tournament_groups g ON t.group_id = g.group_id
      ${teamId ? 'LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id AND tt.team_id = ?' : ''}
      WHERE t.visibility = 'open' 
        AND t.public_start_date <= date('now')
      ORDER BY g.display_order NULLS LAST, t.group_order, t.created_at DESC
    `;

    const result = await db.execute(query, teamId ? [teamId] : []);

    // ステータス計算
    const tournaments = await Promise.all(result.rows.map(async (row) => {
      // tournament_datesからevent_start_dateとevent_end_dateを計算
      let eventStartDate = '';
      let eventEndDate = '';
      
      if (row.tournament_dates) {
        try {
          const dates = JSON.parse(row.tournament_dates as string);
          const dateValues = Object.values(dates) as string[];
          const sortedDates = dateValues.sort();
          eventStartDate = sortedDates[0] || '';
          eventEndDate = sortedDates[sortedDates.length - 1] || '';
        } catch (error) {
          console.error('Error parsing tournament_dates:', error);
        }
      }

      const calculatedStatus = await calculateTournamentStatus({
        status: (row.status as string) || 'planning',
        recruitment_start_date: row.recruitment_start_date as string | null,
        recruitment_end_date: row.recruitment_end_date as string | null,
        tournament_dates: (row.tournament_dates as string) || '{}'
      }, Number(row.tournament_id));

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        format_id: Number(row.format_id),
        venue_id: Number(row.venue_id),
        team_count: Number(row.team_count),
        court_count: Number(row.court_count),
        tournament_dates: row.tournament_dates as string,
        match_duration_minutes: Number(row.match_duration_minutes),
        break_duration_minutes: Number(row.break_duration_minutes),
        status: calculatedStatus as 'planning' | 'ongoing' | 'completed',
        visibility: row.visibility === 'open' ? 1 : 0,
        public_start_date: row.public_start_date as string,
        recruitment_start_date: row.recruitment_start_date as string,
        recruitment_end_date: row.recruitment_end_date as string,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        created_by: row.created_by as string,
        venue_name: row.venue_name as string,
        format_name: row.format_name as string,
        logo_blob_url: row.logo_blob_url as string | null,
        organization_name: row.organization_name as string | null,
        group_id: row.group_id ? Number(row.group_id) : null,
        group_order: Number(row.group_order) || 0,
        category_name: row.category_name as string | null,
        group_name: row.group_name as string | null,
        group_description: row.group_description as string | null,
        group_color: row.group_color as string | null,
        group_display_order: Number(row.display_order) || 0,
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
        is_joined: Boolean(row.is_joined)
      };
    }));

    // グループ化処理
    const groupedData: Record<string, { group: any; tournaments: any[] }> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const ungroupedTournaments: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

    tournaments.forEach(tournament => {
      if (tournament.group_id) {
        const groupKey = tournament.group_id.toString();
        if (!groupedData[groupKey]) {
          groupedData[groupKey] = {
            group: {
              group_id: tournament.group_id,
              group_name: tournament.group_name || '',
              group_description: tournament.group_description || '',
              group_color: tournament.group_color || '#3B82F6',
              display_order: tournament.group_display_order
            },
            tournaments: []
          };
        }
        groupedData[groupKey].tournaments.push(tournament);
      } else {
        ungroupedTournaments.push(tournament);
      }
    });

    // グループ内の大会を順序でソート
    Object.values(groupedData).forEach(group => {
      group.tournaments.sort((a, b) => (a.group_order || 0) - (b.group_order || 0));
    });

    return NextResponse.json({
      success: true,
      data: {
        grouped: Object.values(groupedData),
        ungrouped: ungroupedTournaments
      }
    });

  } catch (error) {
    console.error('グループ化公開大会取得エラー:', error);
    return NextResponse.json({
      error: 'グループ化公開大会の取得に失敗しました'
    }, { status: 500 });
  }
}