// app/api/tournaments/dashboard/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';

export async function GET() {
  try {
    // 募集中（planning）と開催中（ongoing）の大会を取得
    const result = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.win_points,
        t.draw_points,
        t.loss_points,
        t.walkover_winner_goals,
        t.walkover_loser_goals,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.status IN ('planning', 'ongoing')
      ORDER BY 
        CASE t.status 
          WHEN 'ongoing' THEN 1 
          WHEN 'planning' THEN 2 
          ELSE 3 
        END,
        t.created_at DESC
    `);

    const tournaments = result.rows.map(row => {
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
        win_points: Number(row.win_points),
        draw_points: Number(row.draw_points),
        loss_points: Number(row.loss_points),
        walkover_winner_goals: Number(row.walkover_winner_goals),
        walkover_loser_goals: Number(row.walkover_loser_goals),
        status: row.status as 'planning' | 'ongoing' | 'completed',
        visibility: Number(row.visibility === 'open' ? 1 : 0),
        public_start_date: row.public_start_date as string,
        recruitment_start_date: row.recruitment_start_date as string,
        recruitment_end_date: row.recruitment_end_date as string,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        venue_name: row.venue_name as string,
        format_name: row.format_name as string,
        is_public: row.visibility === 'open',
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
        start_time: '09:00',
        end_time: '17:00'
      } as Tournament;
    });

    // 募集中と開催中に分類
    const recruiting = tournaments.filter(t => t.status === 'planning');
    const ongoing = tournaments.filter(t => t.status === 'ongoing');

    return NextResponse.json({
      success: true,
      data: {
        recruiting,
        ongoing,
        total: tournaments.length
      }
    });

  } catch (error) {
    console.error('大会取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '大会データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}