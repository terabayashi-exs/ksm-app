// app/api/tournaments/dashboard/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';
import { calculateTournamentStatus } from '@/lib/tournament-status';

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

    // 現在日時（JST）で1年前の日付を計算
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    // 日付部分のみを YYYY-MM-DD 形式で取得（UTCベース）
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    // アクティブな大会を取得（planning, ongoing以外も含める - 動的計算で判定）
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
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.is_archived,
        t.archive_ui_version,
        t.created_by,
        t.created_at,
        t.updated_at,
        t.group_id,
        t.group_order,
        v.venue_name,
        f.format_name,
        a.logo_blob_url,
        a.logo_filename,
        a.organization_name,
        g.group_name,
        g.event_description as group_description,
        NULL as group_color,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'confirmed' AND tt.withdrawal_status = 'active') as confirmed_count,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'waitlisted' AND tt.withdrawal_status = 'active') as waitlisted_count,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.withdrawal_status = 'active') as applied_count,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.withdrawal_status = 'withdrawal_requested') as withdrawal_requested_count,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'cancelled') as cancelled_count
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN m_administrators a ON t.created_by = a.admin_login_id
      LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
      WHERE t.status != 'completed'
        AND (t.created_by = ? OR ? = 1)
      ORDER BY
        CASE t.status
          WHEN 'ongoing' THEN 1
          WHEN 'planning' THEN 2
          ELSE 3
        END,
        t.group_order,
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
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.is_archived,
        t.archive_ui_version,
        t.created_by,
        t.created_at,
        t.updated_at,
        t.group_id,
        t.group_order,
        v.venue_name,
        f.format_name,
        a.logo_blob_url,
        a.logo_filename,
        a.organization_name,
        g.group_name,
        g.event_description as group_description,
        NULL as group_color,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'confirmed' AND tt.withdrawal_status = 'active') as confirmed_count,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'waitlisted' AND tt.withdrawal_status = 'active') as waitlisted_count,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.withdrawal_status = 'active') as applied_count,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.withdrawal_status = 'withdrawal_requested') as withdrawal_requested_count,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'cancelled') as cancelled_count
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN m_administrators a ON t.created_by = a.admin_login_id
      LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
      WHERE t.status = 'completed'
        AND (t.created_by = ? OR ? = 1)
      ORDER BY t.group_order, t.created_at DESC
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

    // 各大会の試合時刻データを取得し、動的ステータスを計算
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

      // 動的ステータスを計算（試合進行状況を考慮）
      const calculatedStatus = await calculateTournamentStatus({
        status: (row.status as string) || 'planning',
        recruitment_start_date: row.recruitment_start_date as string | null,
        recruitment_end_date: row.recruitment_end_date as string | null,
        tournament_dates: (row.tournament_dates as string) || '{}',
        public_start_date: row.public_start_date as string | null
      }, Number(row.tournament_id));

      // TournamentStatus をそのまま使用（管理者は全てのステータスを確認可能）
      const mappedStatus = calculatedStatus;
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
        status: mappedStatus,
        visibility: Number(row.visibility === 'open' ? 1 : 0),
        public_start_date: row.public_start_date as string,
        recruitment_start_date: row.recruitment_start_date as string,
        recruitment_end_date: row.recruitment_end_date as string,
        created_by: row.created_by as string,
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
        archive_ui_version: row.archive_ui_version as string,
        logo_blob_url: row.logo_blob_url as string | null,
        organization_name: row.organization_name as string | null,
        group_id: row.group_id ? Number(row.group_id) : null,
        group_order: Number(row.group_order) || 0,
        category_name: row.tournament_name as string, // tournament_nameを部門名として使用
        group_name: row.group_name as string | null,
        group_description: row.group_description as string | null,
        group_color: row.group_color as string | null,
        confirmed_count: Number(row.confirmed_count) || 0,
        waitlisted_count: Number(row.waitlisted_count) || 0,
        applied_count: Number(row.applied_count) || 0,
        withdrawal_requested_count: Number(row.withdrawal_requested_count) || 0,
        cancelled_count: Number(row.cancelled_count) || 0
      } as Tournament;
    }));

    // グループごとのステータスを判定（部門の中で最も優先度の高いステータス）
    const groupStatuses: Record<number, 'planning' | 'recruiting' | 'before_event' | 'ongoing' | 'completed'> = {};

    // 各グループのステータスを決定
    tournamentsWithTimes.forEach(tournament => {
      if (tournament.group_id && !groupStatuses[tournament.group_id]) {
        const groupId = tournament.group_id;
        const groupTournaments = tournamentsWithTimes.filter(t => t.group_id === groupId);

        // 優先順位: ongoing > before_event > recruiting > planning > completed
        if (groupTournaments.some(t => t.status === 'ongoing')) {
          groupStatuses[groupId] = 'ongoing';
        }
        else if (groupTournaments.some(t => t.status === 'before_event')) {
          groupStatuses[groupId] = 'before_event';
        }
        else if (groupTournaments.some(t => t.status === 'recruiting')) {
          groupStatuses[groupId] = 'recruiting';
        }
        else if (groupTournaments.some(t => t.status === 'planning')) {
          groupStatuses[groupId] = 'planning';
        }
        else if (groupTournaments.every(t => t.status === 'completed')) {
          groupStatuses[groupId] = 'completed';
        }
        else {
          groupStatuses[groupId] = 'planning';
        }
      }
    });

    // 大会グループ単位で分類（グループ内の全部門を含める）
    const planning = tournamentsWithTimes.filter(t => {
      if (t.group_id) {
        return groupStatuses[t.group_id] === 'planning';
      } else {
        return t.status === 'planning';
      }
    });

    const recruiting = tournamentsWithTimes.filter(t => {
      if (t.group_id) {
        return groupStatuses[t.group_id] === 'recruiting';
      } else {
        return t.status === 'recruiting';
      }
    });

    const before_event = tournamentsWithTimes.filter(t => {
      if (t.group_id) {
        return groupStatuses[t.group_id] === 'before_event';
      } else {
        return t.status === 'before_event';
      }
    });

    const ongoing = tournamentsWithTimes.filter(t => {
      if (t.group_id) {
        return groupStatuses[t.group_id] === 'ongoing';
      } else {
        return t.status === 'ongoing';
      }
    });

    const completed = tournamentsWithTimes.filter(t => {
      if (t.group_id) {
        return groupStatuses[t.group_id] === 'completed';
      } else {
        return t.status === 'completed';
      }
    });

    // グループ化された大会情報を生成
    const groupedTournaments = (tournaments: Tournament[]) => {
      const grouped: Record<string, { group: { group_id: number; group_name: string | null; group_description: string | null; group_color: string | null; display_order: number }, tournaments: Tournament[] }> = {};
      const ungrouped: Tournament[] = [];

      tournaments.forEach(tournament => {
        if (tournament.group_id) {
          const groupKey = tournament.group_id.toString();
          if (!grouped[groupKey]) {
            grouped[groupKey] = {
              group: {
                group_id: tournament.group_id!,
                group_name: tournament.group_name || '',
                group_description: tournament.group_description || '',
                group_color: tournament.group_color || '#3B82F6',
                display_order: 0
              },
              tournaments: []
            };
          }
          grouped[groupKey].tournaments.push(tournament);
        } else {
          ungrouped.push(tournament);
        }
      });

      // グループ内の大会を順序でソート
      Object.values(grouped).forEach(group => {
        group.tournaments.sort((a, b) => (a.group_order || 0) - (b.group_order || 0));
      });

      return { grouped, ungrouped };
    };

    const beforeRecruitmentGrouped = groupedTournaments(planning);
    const recruitingGrouped = groupedTournaments(recruiting);
    const beforeEventGrouped = groupedTournaments(before_event);
    const ongoingGrouped = groupedTournaments(ongoing);
    const completedGrouped = groupedTournaments(completed);

    return NextResponse.json({
      success: true,
      data: {
        planning,
        recruiting,
        before_event,
        ongoing,
        completed,
        total: tournamentsWithTimes.length,
        // グループ化された情報も含める
        grouped: {
          planning: beforeRecruitmentGrouped,
          recruiting: recruitingGrouped,
          before_event: beforeEventGrouped,
          ongoing: ongoingGrouped,
          completed: completedGrouped
        }
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
