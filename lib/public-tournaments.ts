// lib/public-tournaments.ts
// TOPページ用: 公開大会をグループ化して取得するサーバーサイド関数

import { db } from '@/lib/db';
import { calculateTournamentStatus } from '@/lib/tournament-status';

export interface PublicDivision {
  tournament_id: number;
  tournament_name: string;
  format_id: number;
  format_name: string | null;
  venue_id: number;
  venue_name: string | null;
  team_count: number;
  registered_teams: number;
  applied_count: number;
  status: string;
  recruitment_start_date: string | null;
  recruitment_end_date: string | null;
  event_start_date: string;
  event_end_date: string;
  logo_blob_url: string | null;
  organization_name: string | null;
  is_joined: boolean;
}

export interface PublicGroup {
  group_id: number;
  group_name: string;
  organizer: string | null;
  venue_id: number | null;
  venue_name: string | null;
  venue_address: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  recruitment_start_date: string | null;
  recruitment_end_date: string | null;
  event_description: string | null;
  division_count: number;
}

export interface GroupedTournament {
  group: PublicGroup;
  divisions: PublicDivision[];
}

export interface CategorizedTournaments {
  recruiting: GroupedTournament[];
  before_event: GroupedTournament[];
  ongoing: GroupedTournament[];
  completed: GroupedTournament[];
}

export async function fetchGroupedPublicTournaments(teamId?: string): Promise<CategorizedTournaments> {
  // 大会グループ一覧を取得
  const groupsResult = await db.execute(`
    SELECT
      tg.group_id,
      tg.group_name,
      tg.organizer,
      tg.venue_id,
      tg.event_start_date,
      tg.event_end_date,
      tg.recruitment_start_date,
      tg.recruitment_end_date,
      tg.visibility,
      tg.event_description,
      v.venue_name,
      v.address as venue_address,
      COUNT(DISTINCT t.tournament_id) as division_count
    FROM t_tournament_groups tg
    LEFT JOIN m_venues v ON tg.venue_id = v.venue_id
    LEFT JOIN t_tournaments t ON tg.group_id = t.group_id
    WHERE tg.visibility = 'open'
    GROUP BY tg.group_id
    ORDER BY tg.created_at DESC
  `);

  // 各大会グループの所属部門を取得
  const groupedData = await Promise.all(groupsResult.rows.map(async (groupRow) => {
    const groupId = Number(groupRow.group_id);

    const divisionsQuery = `
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
        v.venue_name,
        t.format_name,
        lu.logo_blob_url,
        lu.organization_name,
        COUNT(DISTINCT CASE
          WHEN tt.participation_status = 'confirmed' AND tt.withdrawal_status = 'active'
          THEN tt.tournament_team_id
        END) as registered_teams,
        (SELECT COUNT(*) FROM t_tournament_teams tt2 WHERE tt2.tournament_id = t.tournament_id AND (tt2.withdrawal_status = 'active' OR tt2.withdrawal_status IS NULL)) as applied_count,
        ${teamId ? 'CASE WHEN utt.team_id IS NOT NULL THEN 1 ELSE 0 END as is_joined' : '0 as is_joined'}
      FROM t_tournaments t
      LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
      LEFT JOIN m_login_users lu ON tg.login_user_id = lu.login_user_id
      LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id
      ${teamId ? 'LEFT JOIN t_tournament_teams utt ON t.tournament_id = utt.tournament_id AND utt.team_id = ?' : ''}
      WHERE t.group_id = ?
        AND t.visibility = 'open'
      GROUP BY t.tournament_id
      ORDER BY t.created_at DESC
    `;

    const divisionsResult = await db.execute(
      divisionsQuery,
      teamId ? [teamId, groupId] : [groupId]
    );

    // ステータス計算
    const divisions: PublicDivision[] = await Promise.all(divisionsResult.rows.map(async (divRow) => {
      let eventStartDate = '';
      let eventEndDate = '';

      if (divRow.tournament_dates) {
        try {
          const dates = JSON.parse(divRow.tournament_dates as string);
          const dateValues = Object.values(dates) as string[];
          const sortedDates = dateValues.sort();
          eventStartDate = sortedDates[0] || '';
          eventEndDate = sortedDates[sortedDates.length - 1] || '';
        } catch (error) {
          console.error('Error parsing tournament_dates:', error);
        }
      }

      const calculatedStatus = await calculateTournamentStatus({
        status: (divRow.status as string) || 'planning',
        recruitment_start_date: divRow.recruitment_start_date as string | null,
        recruitment_end_date: divRow.recruitment_end_date as string | null,
        tournament_dates: (divRow.tournament_dates as string) || '{}',
        public_start_date: divRow.public_start_date as string | null
      }, Number(divRow.tournament_id));

      return {
        tournament_id: Number(divRow.tournament_id),
        tournament_name: String(divRow.tournament_name),
        format_id: Number(divRow.format_id),
        format_name: divRow.format_name as string | null,
        venue_id: Number(divRow.venue_id),
        venue_name: divRow.venue_name as string | null,
        team_count: Number(divRow.team_count),
        registered_teams: Number(divRow.registered_teams),
        applied_count: Number(divRow.applied_count) || 0,
        status: calculatedStatus,
        recruitment_start_date: divRow.recruitment_start_date as string | null,
        recruitment_end_date: divRow.recruitment_end_date as string | null,
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
        logo_blob_url: divRow.logo_blob_url as string | null,
        organization_name: divRow.organization_name as string | null,
        is_joined: Boolean(divRow.is_joined)
      };
    }));

    return {
      group: {
        group_id: Number(groupRow.group_id),
        group_name: String(groupRow.group_name),
        organizer: groupRow.organizer as string | null,
        venue_id: groupRow.venue_id ? Number(groupRow.venue_id) : null,
        venue_name: groupRow.venue_name as string | null,
        venue_address: groupRow.venue_address as string | null,
        event_start_date: groupRow.event_start_date as string | null,
        event_end_date: groupRow.event_end_date as string | null,
        recruitment_start_date: groupRow.recruitment_start_date as string | null,
        recruitment_end_date: groupRow.recruitment_end_date as string | null,
        event_description: groupRow.event_description as string | null,
        division_count: Number(groupRow.division_count)
      },
      divisions: divisions
    };
  }));

  // planningの部門を除外
  const publicGroupedData = groupedData.map(group => ({
    ...group,
    divisions: group.divisions.filter(div => div.status !== 'planning')
  })).filter(group => group.divisions.length > 0);

  // ステータス別にグループ化
  const categorizedData: CategorizedTournaments = {
    recruiting: [],
    before_event: [],
    ongoing: [],
    completed: []
  };

  publicGroupedData.forEach(group => {
    const hasOngoing = group.divisions.some(div => div.status === 'ongoing');
    const hasRecruiting = group.divisions.some(div => div.status === 'recruiting');
    const hasBeforeEvent = group.divisions.some(div => div.status === 'before_event');

    if (hasOngoing) {
      categorizedData.ongoing.push(group);
    } else if (hasBeforeEvent) {
      categorizedData.before_event.push(group);
    } else if (hasRecruiting) {
      categorizedData.recruiting.push(group);
    } else {
      categorizedData.completed.push(group);
    }
  });

  return categorizedData;
}
