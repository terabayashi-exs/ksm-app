// app/api/teams/tournaments/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { calculateTournamentStatus } from '@/lib/tournament-status';

export async function GET() {
  try {
    console.log('GET /api/teams/tournaments - Request received');
    
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'team') {
      console.log('Authentication failed - no session or wrong role');
      return NextResponse.json(
        { success: false, error: 'チーム権限が必要です' },
        { status: 401 }
      );
    }

    const teamId = session.user.teamId;
    if (!teamId) {
      console.log('No team ID found in session');
      return NextResponse.json(
        { success: false, error: 'チームIDが見つかりません' },
        { status: 400 }
      );
    }
    
    console.log('Fetching tournaments for team:', teamId);

    // 参加可能な大会を取得（公開済み、募集期間中、未参加）
    const availableTournamentsResult = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.status,
        t.visibility,
        t.group_id,
        t.group_order,
        t.team_count,
        f.format_name,
        v.venue_name,
        t.tournament_dates,
        g.group_name,
        g.event_description as group_description,
        (SELECT COUNT(*) FROM t_tournament_teams tt WHERE tt.tournament_id = t.tournament_id AND (tt.withdrawal_status = 'active' OR tt.withdrawal_status IS NULL)) as applied_count
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
      WHERE t.visibility = 'open'
        AND (t.public_start_date IS NULL OR t.public_start_date <= date('now'))
        AND (t.recruitment_start_date IS NULL OR t.recruitment_start_date <= date('now'))
        AND (t.recruitment_end_date IS NULL OR t.recruitment_end_date >= date('now'))
        AND t.tournament_id NOT IN (
          SELECT tournament_id
          FROM t_tournament_teams
          WHERE team_id = ?
        )
      ORDER BY t.group_order, t.recruitment_end_date ASC
    `, [teamId]);

    // 申し込み済の大会を取得（複数チーム参加対応）
    const joinedTournamentsResult = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.status,
        t.visibility,
        t.group_id,
        t.group_order,
        t.team_count,
        f.format_name,
        v.venue_name,
        t.tournament_dates,
        g.group_name,
        g.event_description as group_description,
        tt.tournament_team_id,
        tt.team_name as tournament_team_name,
        tt.team_omission as tournament_team_omission,
        tt.assigned_block,
        tt.block_position,
        tt.created_at as joined_at,
        tt.withdrawal_status,
        tt.withdrawal_reason,
        tt.withdrawal_requested_at,
        tt.withdrawal_processed_at,
        (SELECT COUNT(*) FROM t_tournament_players tp WHERE tp.tournament_id = tt.tournament_id AND tp.team_id = tt.team_id AND tp.tournament_team_id = tt.tournament_team_id) as player_count,
        (SELECT COUNT(*) FROM t_tournament_teams tt2 WHERE tt2.tournament_id = t.tournament_id AND (tt2.withdrawal_status = 'active' OR tt2.withdrawal_status IS NULL)) as applied_count
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
      INNER JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id
      WHERE tt.team_id = ?
      ORDER BY t.group_order, t.tournament_id DESC, tt.created_at DESC
    `, [teamId]);

    // データベースの行オブジェクトをプレーンオブジェクトに変換し、動的ステータスを計算
    const availableTournamentsRaw = await Promise.all(availableTournamentsResult.rows.map(async (row) => {
      const calculatedStatus = await calculateTournamentStatus({
        status: String(row.status),
        tournament_dates: row.tournament_dates ? String(row.tournament_dates) : '{}',
        recruitment_start_date: row.recruitment_start_date ? String(row.recruitment_start_date) : null,
        recruitment_end_date: row.recruitment_end_date ? String(row.recruitment_end_date) : null,
        public_start_date: null
      }, Number(row.tournament_id));

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        recruitment_start_date: row.recruitment_start_date ? String(row.recruitment_start_date) : null,
        recruitment_end_date: row.recruitment_end_date ? String(row.recruitment_end_date) : null,
        status: calculatedStatus,
        visibility: String(row.visibility),
        group_id: row.group_id ? Number(row.group_id) : null,
        group_order: row.group_order ? Number(row.group_order) : null,
        group_name: row.group_name ? String(row.group_name) : null,
        group_description: row.group_description ? String(row.group_description) : null,
        format_name: row.format_name ? String(row.format_name) : null,
        venue_name: row.venue_name ? String(row.venue_name) : null,
        tournament_dates: row.tournament_dates ? String(row.tournament_dates) : null,
        event_start_date: null, // tournament_datesをパースする場合は後で追加
        team_count: Number(row.team_count) || 0,
        applied_count: Number(row.applied_count) || 0
      };
    }));

    // 募集前（before_recruitment）の大会を除外
    const availableTournaments = availableTournamentsRaw.filter(tournament =>
      tournament.status !== 'before_recruitment'
    );

    // 複数チーム参加データを整理し、動的ステータスを計算
    const joinedTournamentTeams = await Promise.all(joinedTournamentsResult.rows.map(async (row) => {
      const calculatedStatus = await calculateTournamentStatus({
        status: String(row.status),
        tournament_dates: row.tournament_dates ? String(row.tournament_dates) : '{}',
        recruitment_start_date: row.recruitment_start_date ? String(row.recruitment_start_date) : null,
        recruitment_end_date: row.recruitment_end_date ? String(row.recruitment_end_date) : null,
        public_start_date: null
      }, Number(row.tournament_id));

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        recruitment_start_date: row.recruitment_start_date ? String(row.recruitment_start_date) : null,
        recruitment_end_date: row.recruitment_end_date ? String(row.recruitment_end_date) : null,
        status: calculatedStatus,
        visibility: String(row.visibility),
        group_id: row.group_id ? Number(row.group_id) : null,
        group_order: row.group_order ? Number(row.group_order) : null,
        group_name: row.group_name ? String(row.group_name) : null,
        group_description: row.group_description ? String(row.group_description) : null,
        format_name: row.format_name ? String(row.format_name) : null,
        venue_name: row.venue_name ? String(row.venue_name) : null,
        tournament_dates: row.tournament_dates ? String(row.tournament_dates) : null,
        tournament_team_id: Number(row.tournament_team_id),
        tournament_team_name: String(row.tournament_team_name),
        tournament_team_omission: String(row.tournament_team_omission),
        assigned_block: row.assigned_block ? String(row.assigned_block) : null,
        block_position: row.block_position ? Number(row.block_position) : null,
        joined_at: row.joined_at ? String(row.joined_at) : null,
        withdrawal_status: row.withdrawal_status ? String(row.withdrawal_status) : 'active',
        withdrawal_reason: row.withdrawal_reason ? String(row.withdrawal_reason) : null,
        withdrawal_requested_at: row.withdrawal_requested_at ? String(row.withdrawal_requested_at) : null,
        withdrawal_processed_at: row.withdrawal_processed_at ? String(row.withdrawal_processed_at) : null,
        player_count: Number(row.player_count),
        event_start_date: null,
        team_count: Number(row.team_count) || 0,
        applied_count: Number(row.applied_count) || 0
      };
    }));

    // 大会ごとにグループ化
    const tournamentGroups = new Map();
    joinedTournamentTeams.forEach(team => {
      const tournamentId = team.tournament_id;
      if (!tournamentGroups.has(tournamentId)) {
        tournamentGroups.set(tournamentId, {
          tournament_id: team.tournament_id,
          tournament_name: team.tournament_name,
          recruitment_start_date: team.recruitment_start_date,
          recruitment_end_date: team.recruitment_end_date,
          status: team.status,
          visibility: team.visibility,
          group_id: team.group_id,
          group_order: team.group_order,
          group_name: team.group_name,
          group_description: team.group_description,
          format_name: team.format_name,
          venue_name: team.venue_name,
          tournament_dates: team.tournament_dates,
          event_start_date: null,
          team_count: team.team_count,
          applied_count: team.applied_count,
          teams: []
        });
      }
      
      tournamentGroups.get(tournamentId).teams.push({
        tournament_team_id: team.tournament_team_id,
        tournament_team_name: team.tournament_team_name,
        tournament_team_omission: team.tournament_team_omission,
        assigned_block: team.assigned_block,
        block_position: team.block_position,
        joined_at: team.joined_at,
        withdrawal_status: team.withdrawal_status,
        withdrawal_reason: team.withdrawal_reason,
        withdrawal_requested_at: team.withdrawal_requested_at,
        withdrawal_processed_at: team.withdrawal_processed_at,
        player_count: team.player_count
      });
    });

    const joinedTournaments = Array.from(tournamentGroups.values());

    console.log('Available tournaments:', availableTournaments.length);
    console.log('Joined tournaments:', joinedTournaments.length);

    return NextResponse.json({
      success: true,
      data: {
        available: availableTournaments,
        joined: joinedTournaments
      }
    });

  } catch (error) {
    console.error('Team tournaments fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '大会情報の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}