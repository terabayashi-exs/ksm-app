// app/api/tournaments/public/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { calculateTournamentStatus } from "@/lib/tournament-status";

export async function GET() {
  try {
    const session = await auth();
    const teamId = session?.user?.role === 'team' ? session.user.teamId : undefined;

    // 公開されている大会を取得
    const tournamentsResult = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.tournament_dates,
        t.status,
        t.visibility,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        tf.format_name,
        v.venue_name
        ${teamId ? `,
          CASE WHEN tt.team_id IS NOT NULL THEN 1 ELSE 0 END as is_joined
        ` : ', 0 as is_joined'}
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats tf ON t.format_id = tf.format_id
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      ${teamId ? `
        LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id AND tt.team_id = ?
      ` : ''}
      WHERE t.visibility = 'open'
      ORDER BY 
        CASE t.status 
          WHEN 'ongoing' THEN 1
          WHEN 'planning' THEN 2
          WHEN 'completed' THEN 3
          ELSE 4
        END,
        t.created_at DESC
    `, teamId ? [teamId] : []);

    const tournaments = tournamentsResult.rows.map((row: Record<string, unknown>) => {
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

      // 動的ステータス判定を適用
      const dynamicStatus = calculateTournamentStatus({
        status: String(row.status),
        recruitment_start_date: row.recruitment_start_date as string | null,
        recruitment_end_date: row.recruitment_end_date as string | null,
        tournament_dates: String(row.tournament_dates || '{}')
      });

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        format_id: Number(row.format_id),
        format_name: String(row.format_name),
        venue_id: Number(row.venue_id),
        venue_name: String(row.venue_name),
        team_count: Number(row.team_count),
        status: dynamicStatus, // 動的ステータスを使用
        is_public: String(row.visibility) === 'open',
        recruitment_start_date: String(row.recruitment_start_date),
        recruitment_end_date: String(row.recruitment_end_date),
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
        start_time: '',
        end_time: '',
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        is_joined: Boolean(row.is_joined)
      };
    });

    // ステータス別に分類
    const recruiting = tournaments.filter(t => t.status === 'recruiting');
    const beforeEvent = tournaments.filter(t => t.status === 'before_event');
    const ongoing = tournaments.filter(t => t.status === 'ongoing');
    const completed = tournaments.filter(t => t.status === 'completed');


    return NextResponse.json({
      success: true,
      data: {
        recruiting,
        beforeEvent,
        ongoing,
        completed,
        total: tournaments.length
      }
    });

  } catch (error) {
    console.error('公開大会取得エラー:', error);
    return NextResponse.json({
      success: false,
      error: 'データベース接続エラーが発生しました'
    }, { status: 500 });
  }
}