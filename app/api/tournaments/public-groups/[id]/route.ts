import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateTournamentStatus } from '@/lib/tournament-status';

// GET /api/tournaments/public-groups/[id] - 公開大会グループの詳細取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const groupId = parseInt(resolvedParams.id);

    if (isNaN(groupId)) {
      return NextResponse.json(
        { error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // 大会グループ基本情報取得（公開のみ）
    const groupResult = await db.execute(`
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
        tg.created_at,
        v.venue_name,
        v.address as venue_address,
        COUNT(DISTINCT t.tournament_id) as division_count
      FROM t_tournament_groups tg
      LEFT JOIN m_venues v ON tg.venue_id = v.venue_id
      LEFT JOIN t_tournaments t ON tg.group_id = t.group_id
      WHERE tg.group_id = ? AND tg.visibility = 'open'
      GROUP BY tg.group_id
    `, [groupId]);

    if (groupResult.rows.length === 0) {
      return NextResponse.json(
        { error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const groupRow = groupResult.rows[0];

    // 所属部門一覧取得（公開のみ）
    const divisionsResult = await db.execute(`
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
        v.venue_name,
        f.format_name,
        COUNT(DISTINCT CASE
          WHEN tt.participation_status = 'confirmed' AND tt.withdrawal_status = 'active'
          THEN tt.tournament_team_id
        END) as registered_teams
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id
      WHERE t.group_id = ?
        AND t.visibility = 'open'
        AND t.public_start_date <= date('now')
      GROUP BY t.tournament_id
      ORDER BY t.created_at DESC
    `, [groupId]);

    // 各部門のステータスを計算
    const divisions = await Promise.all(divisionsResult.rows.map(async (divRow) => {
      // tournament_datesからevent_start_dateとevent_end_dateを計算
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
        tournament_dates: (divRow.tournament_dates as string) || '{}'
      }, Number(divRow.tournament_id));

      return {
        tournament_id: Number(divRow.tournament_id),
        tournament_name: String(divRow.tournament_name),
        format_id: Number(divRow.format_id),
        format_name: divRow.format_name as string,
        venue_id: Number(divRow.venue_id),
        venue_name: divRow.venue_name as string,
        team_count: Number(divRow.team_count),
        registered_teams: Number(divRow.registered_teams),
        status: calculatedStatus,
        recruitment_start_date: divRow.recruitment_start_date as string,
        recruitment_end_date: divRow.recruitment_end_date as string,
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
      };
    }));

    return NextResponse.json({
      success: true,
      data: {
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
          division_count: Number(groupRow.division_count),
        },
        divisions: divisions
      }
    });

  } catch (error) {
    console.error('公開大会グループ取得エラー:', error);
    return NextResponse.json(
      { error: '大会グループの取得に失敗しました' },
      { status: 500 }
    );
  }
}
