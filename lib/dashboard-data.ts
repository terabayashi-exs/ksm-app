// lib/dashboard-data.ts
// 大会ダッシュボード用データ取得ロジック（Server Component / API Route 両方から利用可能）
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';
import { calculateTournamentStatus } from '@/lib/tournament-status';

// ─── チームダッシュボード用 ────────────────────────────────────────────────────

export interface TeamDashboardItem {
  team_id: string;
  team_name: string;
  team_omission: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  prefecture_id: number | null;
  is_active: boolean;
  member_role: string;
  joined_at: string;
  player_count: number;
  manager_count: number;
}

/**
 * ログインユーザーが所属するチーム一覧をサーバーサイドで取得
 * @param loginUserId - m_login_users.login_user_id
 */
export async function fetchTeamData(loginUserId: number): Promise<TeamDashboardItem[]> {
  if (!loginUserId || loginUserId === 0) return [];

  const result = await db.execute(`
    SELECT
      t.team_id,
      t.team_name,
      t.team_omission,
      t.contact_person,
      t.contact_email,
      t.contact_phone,
      t.prefecture_id,
      t.is_active,
      tm.member_role,
      tm.created_at AS joined_at,
      (
        SELECT COUNT(*)
        FROM m_players p
        WHERE p.current_team_id = t.team_id AND p.is_active = 1
      ) AS player_count,
      (
        SELECT COUNT(*)
        FROM m_team_members tm2
        WHERE tm2.team_id = t.team_id AND tm2.is_active = 1
      ) AS manager_count
    FROM m_team_members tm
    JOIN m_teams t ON tm.team_id = t.team_id
    WHERE tm.login_user_id = ? AND tm.is_active = 1 AND t.is_active = 1
    ORDER BY tm.member_role DESC, tm.created_at ASC
  `, [loginUserId]);

  return result.rows.map(row => ({
    team_id: String(row.team_id),
    team_name: String(row.team_name),
    team_omission: row.team_omission ? String(row.team_omission) : null,
    contact_person: row.contact_person ? String(row.contact_person) : null,
    contact_email: row.contact_email ? String(row.contact_email) : null,
    contact_phone: row.contact_phone ? String(row.contact_phone) : null,
    prefecture_id: row.prefecture_id ? Number(row.prefecture_id) : null,
    is_active: Number(row.is_active) === 1,
    member_role: String(row.member_role),
    joined_at: String(row.joined_at),
    player_count: Number(row.player_count) || 0,
    manager_count: Number(row.manager_count) || 0,
  }));
}

// ─── チーム詳細データ（担当者・招待）────────────────────────────────────────
// APIレスポンスと完全一致させる

export interface TeamManager {
  login_user_id: number;
  display_name: string;
  email: string;
  member_role: 'primary' | 'secondary';
  joined_at?: string; // 省略可能（サーバー側データにのみ含まれる）
}

export interface TeamInvitation {
  id: number;
  invited_email: string;
  status: string;
  expires_at: string;
  accepted_at?: string | null; // 省略可能（サーバー側データにのみ含まれる）
  created_at?: string; // 省略可能（サーバー側データにのみ含まれる）
  invited_by_name?: string | null; // 省略可能（サーバー側データにのみ含まれる）
}

export interface TeamDetailData {
  managers: TeamManager[];
  invitations: TeamInvitation[];
}

/**
 * チームの担当者と招待情報をサーバーサイドで取得（パフォーマンス改善）
 * @param loginUserId - m_login_users.login_user_id
 * @param teamId - チームID
 */
export async function fetchTeamDetailData(loginUserId: number, teamId: string): Promise<TeamDetailData | null> {
  if (!loginUserId || loginUserId === 0) return null;

  // 権限チェック: このユーザーがこのチームのメンバーか確認
  const memberCheck = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, loginUserId]
  );

  if (memberCheck.rows.length === 0) return null;

  // 担当者と招待を並列取得（APIレスポンスと同じ形式で返す）
  const [managersResult, invitationsResult] = await Promise.all([
    db.execute(`
      SELECT
        tm.login_user_id,
        u.display_name,
        u.email,
        tm.member_role,
        tm.created_at AS joined_at
      FROM m_team_members tm
      JOIN m_login_users u ON tm.login_user_id = u.login_user_id
      WHERE tm.team_id = ? AND tm.is_active = 1
      ORDER BY tm.member_role DESC, tm.created_at ASC
    `, [teamId]),

    db.execute(`
      SELECT
        id,
        invited_email,
        status,
        expires_at
      FROM t_team_invitations
      WHERE team_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `, [teamId])
  ]);

  return {
    managers: managersResult.rows.map(row => ({
      login_user_id: Number(row.login_user_id),
      display_name: String(row.display_name),
      email: String(row.email),
      member_role: String(row.member_role) as 'primary' | 'secondary',
      joined_at: String(row.joined_at),
    })),
    invitations: invitationsResult.rows.map(row => ({
      id: Number(row.id),
      invited_email: String(row.invited_email),
      status: String(row.status),
      expires_at: String(row.expires_at),
    })),
  };
}

export interface GroupedTournamentData {
  grouped: Record<string, {
    group: {
      group_id: number;
      group_name: string | null;
      group_description: string | null;
      group_color: string | null;
      display_order: number;
      logo_blob_url: string | null;
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
  a.logo_blob_url,
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
  LEFT JOIN m_venues v ON t.venue_id = v.venue_id
  LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
  LEFT JOIN m_login_users a ON g.login_user_id = a.login_user_id
`;

/**
 * ユーザーの大会フィルタ条件を生成
 * login_user_id のみを使用（m_administrators削除に対応）
 */
function buildUserCondition(sessionId: string, isAdmin: boolean): { condition: string; params: (string | number)[] } {
  if (isAdmin) {
    return { condition: '1=1', params: [] };
  }

  const loginUserId = Number(sessionId);
  const isNewProvider = !isNaN(loginUserId) && loginUserId > 0;

  if (isNewProvider) {
    // login_user_id で絞り込む（グループに所属する大会 OR 自分が作成した大会）
    const condition = `
      (
        EXISTS (
          SELECT 1 FROM t_tournament_groups tg2
          WHERE tg2.group_id = t.group_id
            AND tg2.login_user_id = ?
        )
        OR (
          t.group_id IS NULL AND t.created_by = ?
        )
      )`;
    return { condition, params: [loginUserId, String(loginUserId)] };
  } else {
    // 旧形式のセッションID（後方互換、実質的に使用されない想定）
    return { condition: '1=0', params: [] };
  }
}

/**
 * 運営者用の大会フィルタ条件を生成
 * t_operator_tournament_access テーブルに基づいて権限がある大会のみを取得
 * （m_operators テーブルは削除予定のため使用しない）
 */
function buildOperatorCondition(loginUserId: number): { condition: string; params: number[] } {
  const condition = `
    EXISTS (
      SELECT 1 FROM t_operator_tournament_access ota
      WHERE ota.operator_id = ?
        AND ota.tournament_id = t.tournament_id
    )`;
  return { condition, params: [loginUserId] };
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
            display_order: 0,
            logo_blob_url: tournament.logo_blob_url || null
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
 * 運営者用の大会ダッシュボードデータを取得
 * @param loginUserId - m_login_users.login_user_id
 */
export async function fetchOperatorDashboardData(loginUserId: number): Promise<TournamentDashboardData> {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

  const { condition, params } = buildOperatorCondition(loginUserId);

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

  // 運営者の権限情報を一括取得（N+1解消）
  const permissionsMap = new Map<number, Record<string, boolean>>();
  if (tournamentIds.length > 0) {
    const placeholders = tournamentIds.map(() => '?').join(', ');
    const permissionsResult = await db.execute(`
      SELECT
        tournament_id,
        permissions
      FROM t_operator_tournament_access
      WHERE operator_id = ?
        AND tournament_id IN (${placeholders})
    `, [loginUserId, ...tournamentIds]);

    for (const row of permissionsResult.rows) {
      const tid = Number(row.tournament_id);
      try {
        permissionsMap.set(tid, JSON.parse(row.permissions as string) as Record<string, boolean>);
      } catch {
        // JSONパースエラーは無視
      }
    }
  }

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
      sport_type_id: row.sport_type_id ? Number(row.sport_type_id) : undefined,
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
      operator_permissions: permissionsMap.get(tid) || null,
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
      sport_type_id: row.sport_type_id ? Number(row.sport_type_id) : undefined,
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
