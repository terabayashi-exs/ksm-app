// app/api/tournaments/dashboard/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';

export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const isAdmin = userId === 'admin';

    // 現在日時（JST）
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const oneYearAgo = new Date(jstNow);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    // 募集中（planning）と開催中（ongoing）の大会を取得
    const activeResult = await db.execute(`
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
        t.is_archived,
        t.archive_ui_version,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.status IN ('planning', 'ongoing')
        AND (t.created_by = ? OR ? = 1)
      ORDER BY 
        CASE t.status 
          WHEN 'ongoing' THEN 1 
          WHEN 'planning' THEN 2 
          ELSE 3 
        END,
        t.created_at DESC
    `, [userId, isAdmin ? 1 : 0]);

    // 完了した大会を取得（開催日から1年以内）
    const completedResult = await db.execute(`
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
        t.is_archived,
        t.archive_ui_version,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.status = 'completed'
        AND (t.created_by = ? OR ? = 1)
      ORDER BY t.created_at DESC
    `, [userId, isAdmin ? 1 : 0]);

    // 完了した大会から開催日から1年経過したものを除外
    const filteredCompletedRows = completedResult.rows.filter(row => {
      if (row.tournament_dates) {
        try {
          const dates = JSON.parse(row.tournament_dates as string);
          const dateValues = Object.values(dates) as string[];
          const latestDate = dateValues.sort().pop();
          if (latestDate && latestDate >= oneYearAgoStr) {
            return true;
          }
        } catch (error) {
          console.error('Error parsing tournament_dates:', error);
        }
      }
      return false;
    });

    // アクティブな大会と1年以内の完了大会を結合
    const allRows = [...activeResult.rows, ...filteredCompletedRows];

    // 各大会の試合時刻データを取得
    const tournamentsWithTimes = await Promise.all(allRows.map(async (row) => {
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

      // 大会の実際の試合時刻を取得
      let startTime = '';
      let endTime = '';
      
      try {
        const matchTimesResult = await db.execute(`
          SELECT 
            MIN(start_time) as earliest_start,
            MAX(start_time) as latest_start,
            match_duration_minutes,
            break_duration_minutes
          FROM t_matches_live ml
          JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
          JOIN t_tournaments t ON mb.tournament_id = t.tournament_id
          WHERE mb.tournament_id = ?
          AND ml.start_time IS NOT NULL
          AND ml.start_time != ''
        `, [row.tournament_id]);

        if (matchTimesResult.rows.length > 0 && matchTimesResult.rows[0].earliest_start) {
          const matchData = matchTimesResult.rows[0];
          startTime = matchData.earliest_start as string;
          
          // 最後の試合開始時刻 + 試合時間で終了時刻を計算
          if (matchData.latest_start) {
            const latestStartTime = matchData.latest_start as string;
            const matchDuration = Number(matchData.match_duration_minutes) || Number(row.match_duration_minutes) || 15;
            
            // 時刻を分に変換
            const [hours, minutes] = latestStartTime.split(':').map(Number);
            const totalMinutes = hours * 60 + minutes + matchDuration;
            
            // 分を時刻に変換
            const endHours = Math.floor(totalMinutes / 60);
            const endMinutes = totalMinutes % 60;
            endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
          }
        }
      } catch (error) {
        console.error('Error fetching match times for tournament:', row.tournament_id, error);
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
        start_time: startTime,
        end_time: endTime,
        is_archived: Boolean(row.is_archived),
        archive_ui_version: row.archive_ui_version as string
      } as Tournament;
    }));

    // 募集中、開催中、完了に分類
    const recruiting = tournamentsWithTimes.filter(t => t.status === 'planning');
    const ongoing = tournamentsWithTimes.filter(t => t.status === 'ongoing');
    const completed = tournamentsWithTimes.filter(t => t.status === 'completed');

    return NextResponse.json({
      success: true,
      data: {
        recruiting,
        ongoing,
        completed,
        total: tournamentsWithTimes.length
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