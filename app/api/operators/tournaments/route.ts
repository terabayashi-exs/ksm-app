import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { calculateTournamentStatus } from '@/lib/tournament-status';

/**
 * GET /api/operators/tournaments
 * 運営者がアクセス可能な大会一覧を取得
 *
 * 管理者タブと同じロジックを使用し、運営者がアクセス可能な大会のみをフィルタリング
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const operatorLoginUserId = (session.user as { loginUserId?: number }).loginUserId;
    if (!operatorLoginUserId) {
      return NextResponse.json({ error: '運営者情報が見つかりません' }, { status: 404 });
    }

    // 運営者ロールを確認
    const roleResult = await db.execute({
      sql: 'SELECT role FROM m_login_user_roles WHERE login_user_id = ? AND role = ?',
      args: [operatorLoginUserId, 'operator']
    });

    if (roleResult.rows.length === 0) {
      return NextResponse.json({ error: '運営者権限がありません' }, { status: 403 });
    }

    // 管理者タブと同じクエリ（運営者アクセス可能な大会のみ）
    const TOURNAMENT_FIELDS = `
      t.tournament_id,
      t.tournament_name,
      t.category_name,
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
      t.sport_type_id,
      t.is_archived,
      t.archive_ui_version,
      t.created_by,
      t.created_at,
      t.updated_at,
      t.group_id,
      t.group_order,
      v.venue_name,
      t.format_name,
      NULL as logo_blob_url,
      a.display_name as organization_name,
      g.group_name,
      g.event_description as group_description,
      NULL as group_color,
      (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'confirmed' AND tt.withdrawal_status = 'active') as confirmed_count,
      (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'waitlisted' AND tt.withdrawal_status = 'active') as waitlisted_count,
      (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.withdrawal_status = 'active') as applied_count,
      (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.withdrawal_status = 'withdrawal_requested') as withdrawal_requested_count,
      (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND tt.participation_status = 'cancelled') as cancelled_count
    `;

    const TOURNAMENT_JOINS = `
      LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
      LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
      LEFT JOIN m_login_users a ON g.login_user_id = a.login_user_id
    `;

    // アクティブな大会を取得
    const activeResult = await db.execute({
      sql: `SELECT ${TOURNAMENT_FIELDS}
            FROM t_tournaments t
            ${TOURNAMENT_JOINS}
            WHERE t.status != 'completed'
              AND EXISTS (
                SELECT 1 FROM t_operator_tournament_access ota
                WHERE ota.tournament_id = t.tournament_id
                  AND ota.operator_id = ?
              )
            ORDER BY
              CASE t.status
                WHEN 'ongoing' THEN 1
                WHEN 'planning' THEN 2
                ELSE 3
              END,
              t.group_order,
              t.created_at DESC`,
      args: [operatorLoginUserId]
    });

    // 完了した大会を取得（開催日から1年以内）
    const completedResult = await db.execute({
      sql: `SELECT ${TOURNAMENT_FIELDS}
            FROM t_tournaments t
            ${TOURNAMENT_JOINS}
            WHERE t.status = 'completed'
              AND EXISTS (
                SELECT 1 FROM t_operator_tournament_access ota
                WHERE ota.tournament_id = t.tournament_id
                  AND ota.operator_id = ?
              )
            ORDER BY t.group_order, t.created_at DESC`,
      args: [operatorLoginUserId]
    });

    // 現在日時（JST）で1年前の日付を計算
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    // 完了した大会から開催日から1年経過したものを除外
    const filteredCompletedRows = completedResult.rows.filter(row => {
      if (!row.tournament_dates) return false;

      try {
        const dates = JSON.parse(row.tournament_dates as string);
        const dateValues = Object.values(dates) as string[];
        const sortedDates = dateValues.sort();
        const lastDate = sortedDates[sortedDates.length - 1];

        return lastDate >= oneYearAgoStr;
      } catch {
        return false;
      }
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
        const matchTimesResult = await db.execute({
          sql: `SELECT
                  MIN(start_time) as earliest_start,
                  MAX(start_time) as latest_start,
                  match_duration_minutes,
                  break_duration_minutes
                FROM t_matches_live ml
                JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
                JOIN t_tournaments t ON mb.tournament_id = t.tournament_id
                WHERE mb.tournament_id = ?
                AND ml.start_time IS NOT NULL
                AND ml.start_time != ''`,
          args: [row.tournament_id]
        });

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

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        category_name: row.category_name ? String(row.category_name) : '',
        format_id: Number(row.format_id),
        venue_id: Number(row.venue_id),
        team_count: Number(row.team_count),
        court_count: Number(row.court_count),
        tournament_dates: row.tournament_dates as string,
        match_duration_minutes: Number(row.match_duration_minutes),
        break_duration_minutes: Number(row.break_duration_minutes),
        status: calculatedStatus,
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
        group_name: row.group_name as string | null,
        group_description: row.group_description as string | null,
        group_color: row.group_color as string | null,
        group_order: row.group_order ? Number(row.group_order) : null,
        confirmed_count: Number(row.confirmed_count || 0),
        waitlisted_count: Number(row.waitlisted_count || 0),
        applied_count: Number(row.applied_count || 0),
        withdrawal_requested_count: Number(row.withdrawal_requested_count || 0),
        cancelled_count: Number(row.cancelled_count || 0),
      };
    }));

    // ステータス別に分類（管理者タブと同じロジック）
    const planning: typeof tournamentsWithTimes = [];
    const recruiting: typeof tournamentsWithTimes = [];
    const before_event: typeof tournamentsWithTimes = [];
    const ongoing: typeof tournamentsWithTimes = [];
    const completed: typeof tournamentsWithTimes = [];

    for (const tournament of tournamentsWithTimes) {
      switch (tournament.status) {
        case 'planning':
          planning.push(tournament);
          break;
        case 'recruiting':
          recruiting.push(tournament);
          break;
        case 'before_event':
          before_event.push(tournament);
          break;
        case 'ongoing':
          ongoing.push(tournament);
          break;
        case 'completed':
          completed.push(tournament);
          break;
      }
    }

    // グループ化処理（管理者タブと同じ）
    const groupByGroup = (tournaments: typeof tournamentsWithTimes) => {
      const grouped: Record<string, { group: { group_id: number; group_name: string; group_description: string; group_color: string; display_order: number }; tournaments: typeof tournamentsWithTimes }> = {};
      const ungrouped: typeof tournamentsWithTimes = [];

      for (const tournament of tournaments) {
        if (tournament.group_id) {
          const groupKey = String(tournament.group_id);
          if (!grouped[groupKey]) {
            grouped[groupKey] = {
              group: {
                group_id: tournament.group_id,
                group_name: tournament.group_name || '',
                group_description: tournament.group_description || '',
                group_color: tournament.group_color || '#3B82F6',
                display_order: tournament.group_order || 0,
              },
              tournaments: [],
            };
          }
          grouped[groupKey].tournaments.push(tournament);
        } else {
          ungrouped.push(tournament);
        }
      }

      return { grouped, ungrouped };
    };

    return NextResponse.json({
      success: true,
      data: {
        planning,
        recruiting,
        before_event,
        ongoing,
        completed,
        total: tournamentsWithTimes.length,
        grouped: {
          planning: groupByGroup(planning),
          recruiting: groupByGroup(recruiting),
          before_event: groupByGroup(before_event),
          ongoing: groupByGroup(ongoing),
          completed: groupByGroup(completed),
        },
      },
    });
  } catch (error) {
    console.error('運営者大会一覧取得エラー:', error);
    return NextResponse.json(
      { error: '大会一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
