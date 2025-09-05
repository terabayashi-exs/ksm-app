// app/api/tournaments/dashboard/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';
import { calculateTournamentStatus } from '@/lib/tournament-status';

export async function GET() {
  try {
    // 全ての大会を取得して動的にステータス判定を行う
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
      ORDER BY t.created_at DESC
    `);

    // 各大会の試合時刻データを取得
    const tournamentsWithTimes = await Promise.all(result.rows.map(async (row) => {
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
        end_time: endTime
      } as Tournament;
    }));

    // 動的ステータス判定を実行して募集中と開催中の大会を分類
    const recruiting = [];
    const ongoing = [];

    for (const tournament of tournamentsWithTimes) {
      const calculatedStatus = calculateTournamentStatus({
        status: tournament.status,
        tournament_dates: tournament.tournament_dates || '',
        recruitment_start_date: tournament.recruitment_start_date || null,
        recruitment_end_date: tournament.recruitment_end_date || null
      });

      // 募集中または開催前の場合は「募集中」として表示
      if (calculatedStatus === 'recruiting' || calculatedStatus === 'before_event') {
        recruiting.push(tournament);
      }
      // 開催中の場合は「開催中」として表示
      else if (calculatedStatus === 'ongoing') {
        ongoing.push(tournament);
      }
      // completed, before_recruitmentは表示しない
    }

    // 優先度順にソート（開催中 > 募集中）
    ongoing.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    recruiting.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return NextResponse.json({
      success: true,
      data: {
        recruiting,
        ongoing,
        total: recruiting.length + ongoing.length
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