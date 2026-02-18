// lib/dashboard-data.ts
// 大会ダッシュボード用データ取得ロジック（Server Component / API Route 両方から利用可能）
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';
import { calculateTournamentStatus } from '@/lib/tournament-status';

export interface GroupedTournamentData {
  grouped: Record<string, {
    group: {
      group_id: number;
      group_name: string | null;
      group_description: string | null;
      group_color: string | null;
      display_order: number;
    };
    tournaments: Tournament[];
  }>;
  ungrouped: Tournament[];
}

export interface TournamentDashboardData {
  planning: Tournament[];
  recruiting: Tournament[];
  before_event: Tournament[];
  ongoing: Tournament[];
  completed: Tournament[];
  total: number;
  grouped: {
    planning: GroupedTournamentData;
    recruiting: GroupedTournamentData;
    before_event: GroupedTournamentData;
    ongoing: GroupedTournamentData;
    completed: GroupedTournamentData;
  };
}

const TOURNAMENT_SELECT_FIELDS = `
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
`;

const TOURNAMENT_JOINS = `
  LEFT JOIN m_venues v ON t.venue_id = v.venue_id
  LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
  LEFT JOIN m_administrators a ON t.created_by = a.admin_login_id
  LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
`;

/**
 * ユーザーの大会フィルタ条件を生成
 * 新プロバイダー（login_user_id）と旧プロバイダー（admin_login_id）の両方に対応
 */
function buildUserCondition(sessionId: string, isAdmin: boolean): { condition: string; params: (string | number)[] } {
  if (isAdmin) {
    return { condition: '1=1', params: [] };
  }

  const loginUserId = Number(sessionId);
  const isNewProvider = !isNaN(loginUserId) && loginUserId > 0;

  if (isNewProvider) {
    // 新プロバイダー: t_tournament_groups.login_user_id で絞り込む（優先）
    // login_user_id が NULL の場合は admin_login_id 経由でも照合（移行期対応）
    const condition = `
      EXISTS (
        SELECT 1 FROM t_tournament_groups tg2
        WHERE tg2.group_id = t.group_id
          AND (
            tg2.login_user_id = ?
            OR (
              tg2.login_user_id IS NULL
              AND tg2.admin_login_id IS NOT NULL
              AND tg2.admin_login_id = (
                SELECT a2.admin_login_id FROM m_administrators a2
                INNER JOIN m_login_users u ON a2.email = u.email
                WHERE u.login_user_id = ? LIMIT 1
              )
            )
          )
      )`;
    return { condition, params: [loginUserId, loginUserId] };
  } else {
    // 旧プロバイダー: created_by で絞り込み
    return { condition: 't.created_by = ?', params: [sessionId] };
  }
}

/**
 * 試合時刻データを全大会分まとめて一括取得（N+1を回避）
 */
async function fetchAllMatchTimes(tournamentIds: number[]): Promise<Map<number, { startTime: string; endTime: string }>> {
  const result = new Map<number, { startTime: string; endTime: string }>();
  if (tournamentIds.length === 0) return result;

  const placeholders = tournamentIds.map(() => '?').join(', ');
  const matchTimesResult = await db.execute(`
    SELECT
      mb.tournament_id,
      MIN(ml.start_time) as earliest_start,
      MAX(ml.start_time) as latest_start,
      t.match_duration_minutes
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    JOIN t_tournaments t ON mb.tournament_id = t.tournament_id
    WHERE mb.tournament_id IN (${placeholders})
      AND ml.start_time IS NOT NULL
      AND ml.start_time != ''
    GROUP BY mb.tournament_id, t.match_duration_minutes
  `, tournamentIds);

  for (const row of matchTimesResult.rows) {
    const tid = Number(row.tournament_id);
    const startTime = String(row.earliest_start || '');
    let endTime = '';

    if (row.latest_start) {
      const latestStartTime = String(row.latest_start);
      const matchDuration = Number(row.match_duration_minutes) || 15;
      const [hours, minutes] = latestStartTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + matchDuration;
      const endHours = Math.floor(totalMinutes / 60);
      const endMinutes = totalMinutes % 60;
      endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
    }

    result.set(tid, { startTime, endTime });
  }

  return result;
}

function groupTournaments(tournaments: Tournament[]): GroupedTournamentData {
  const grouped: GroupedTournamentData['grouped'] = {};
  const ungrouped: Tournament[] = [];

  tournaments.forEach(tournament => {
    if (tournament.group_id) {
      const groupKey = tournament.group_id.toString();
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          group: {
            group_id: tournament.group_id,
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

  Object.values(grouped).forEach(group => {
    group.tournaments.sort((a, b) => (a.group_order || 0) - (b.group_order || 0));
  });

  return { grouped, ungrouped };
}

/**
 * 大会ダッシュボードデータを取得
 * @param sessionId - セッションユーザーID（新プロバイダーは数値文字列、旧プロバイダーは admin_login_id）
 * @param isAdmin - true の場合全大会を返す（admin ユーザー）
 */
export async function fetchDashboardData(sessionId: string, isAdmin: boolean): Promise<TournamentDashboardData> {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

  const { condition, params } = buildUserCondition(sessionId, isAdmin);

  // アクティブな大会（completed 以外）を取得
  const activeResult = await db.execute(`
    SELECT ${TOURNAMENT_SELECT_FIELDS}
    FROM t_tournaments t
    ${TOURNAMENT_JOINS}
    WHERE t.status != 'completed'
      AND ${condition}
    ORDER BY
      CASE t.status
        WHEN 'ongoing' THEN 1
        WHEN 'planning' THEN 2
        ELSE 3
      END,
      t.group_order,
      t.created_at DESC
  `, params);

  // 完了した大会を取得（1年以内）
  const completedResult = await db.execute(`
    SELECT ${TOURNAMENT_SELECT_FIELDS}
    FROM t_tournaments t
    ${TOURNAMENT_JOINS}
    WHERE t.status = 'completed'
      AND ${condition}
    ORDER BY t.group_order, t.created_at DESC
  `, params);

  // 完了大会から1年以上経過したものを除外
  const filteredCompletedRows = completedResult.rows.filter(row => {
    if (row.tournament_dates) {
      try {
        const dates = JSON.parse(row.tournament_dates as string);
        const dateValues = Object.values(dates) as string[];
        const latestDate = dateValues.sort().pop();
        if (latestDate && latestDate >= oneYearAgoStr) return true;
      } catch {
        // parse error → 除外
      }
    }
    return false;
  });

  const allRows = [...activeResult.rows, ...filteredCompletedRows];
  const tournamentIds = allRows.map(r => Number(r.tournament_id));

  // 試合時刻を一括取得（N+1解消）
  const matchTimesMap = await fetchAllMatchTimes(tournamentIds);

  // 動的ステータスを並列計算
  const tournamentsWithTimes: Tournament[] = await Promise.all(allRows.map(async (row) => {
    let eventStartDate = '';
    let eventEndDate = '';

    if (row.tournament_dates) {
      try {
        const dates = JSON.parse(row.tournament_dates as string);
        const sortedDates = (Object.values(dates) as string[]).sort();
        eventStartDate = sortedDates[0] || '';
        eventEndDate = sortedDates[sortedDates.length - 1] || '';
      } catch {
        // ignore
      }
    }

    const tid = Number(row.tournament_id);
    const { startTime = '', endTime = '' } = matchTimesMap.get(tid) ?? {};

    const calculatedStatus = await calculateTournamentStatus({
      status: (row.status as string) || 'planning',
      recruitment_start_date: row.recruitment_start_date as string | null,
      recruitment_end_date: row.recruitment_end_date as string | null,
      tournament_dates: (row.tournament_dates as string) || '{}',
      public_start_date: row.public_start_date as string | null,
    }, tid);

    return {
      tournament_id: tid,
      tournament_name: String(row.tournament_name),
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
      group_order: Number(row.group_order) || 0,
      category_name: row.tournament_name as string,
      group_name: row.group_name as string | null,
      group_description: row.group_description as string | null,
      group_color: row.group_color as string | null,
      confirmed_count: Number(row.confirmed_count) || 0,
      waitlisted_count: Number(row.waitlisted_count) || 0,
      applied_count: Number(row.applied_count) || 0,
      withdrawal_requested_count: Number(row.withdrawal_requested_count) || 0,
      cancelled_count: Number(row.cancelled_count) || 0,
    } as Tournament;
  }));

  // グループステータスを決定
  const groupStatuses: Record<number, 'planning' | 'recruiting' | 'before_event' | 'ongoing' | 'completed'> = {};
  tournamentsWithTimes.forEach(t => {
    if (t.group_id && !groupStatuses[t.group_id]) {
      const group = tournamentsWithTimes.filter(x => x.group_id === t.group_id);
      if (group.some(x => x.status === 'ongoing')) groupStatuses[t.group_id] = 'ongoing';
      else if (group.some(x => x.status === 'before_event')) groupStatuses[t.group_id] = 'before_event';
      else if (group.some(x => x.status === 'recruiting')) groupStatuses[t.group_id] = 'recruiting';
      else if (group.some(x => x.status === 'planning')) groupStatuses[t.group_id] = 'planning';
      else if (group.every(x => x.status === 'completed')) groupStatuses[t.group_id] = 'completed';
      else groupStatuses[t.group_id] = 'planning';
    }
  });

  const filterByStatus = (status: string) =>
    tournamentsWithTimes.filter(t => t.group_id ? groupStatuses[t.group_id] === status : t.status === status);

  const planning = filterByStatus('planning');
  const recruiting = filterByStatus('recruiting');
  const before_event = filterByStatus('before_event');
  const ongoing = filterByStatus('ongoing');
  const completed = filterByStatus('completed');

  return {
    planning,
    recruiting,
    before_event,
    ongoing,
    completed,
    total: tournamentsWithTimes.length,
    grouped: {
      planning: groupTournaments(planning),
      recruiting: groupTournaments(recruiting),
      before_event: groupTournaments(before_event),
      ongoing: groupTournaments(ongoing),
      completed: groupTournaments(completed),
    },
  };
}
