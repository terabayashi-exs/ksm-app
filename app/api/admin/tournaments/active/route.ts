import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { calculateTournamentStatusSync } from '@/lib/tournament-status';

export async function GET(_request: NextRequest) {
  try {
    console.log('[ACTIVE_TOURNAMENTS] Starting API call...');
    const session = await auth();
    console.log('[ACTIVE_TOURNAMENTS] Session:', session ? { role: session.user?.role, name: session.user?.name, id: session.user?.id } : 'No session');
    
    if (!session || session.user.role !== 'admin') {
      console.log('[ACTIVE_TOURNAMENTS] Authentication failed');
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    console.log('[ACTIVE_TOURNAMENTS] Starting database query...');
    
    // アーカイブ化されていない大会データを取得
    let tournamentsResult;
    try {
      console.log('[ACTIVE_TOURNAMENTS] Querying non-archived tournaments...');
      
      // 管理者別フィルタリング: adminは全大会、その他は自分が作成した大会のみ
      const whereConditions = ['(t.is_archived IS NULL OR t.is_archived = 0)'];
      const queryParams: string[] = [];
      
      if (session.user.id !== 'admin') {
        whereConditions.push('t.created_by = ?');
        queryParams.push(session.user.id);
      }
      
      tournamentsResult = await db.execute(`
        SELECT
          t.tournament_id,
          t.tournament_name,
          t.status,
          t.created_at,
          t.recruitment_start_date,
          t.recruitment_end_date,
          t.tournament_dates,
          t.visibility,
          t.is_archived,
          t.created_by,
          t.group_id,
          t.group_order,
          v.venue_name,
          f.format_name,
          g.group_name,
          g.event_description as group_description
        FROM t_tournaments t
        LEFT JOIN m_venues v ON t.venue_id = v.venue_id
        LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
        LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY t.group_order, t.created_at DESC
        LIMIT 50
      `, queryParams);
      console.log('[ACTIVE_TOURNAMENTS] Query completed. Rows:', tournamentsResult.rows.length);
    } catch (dbError) {
      console.error('[ACTIVE_TOURNAMENTS] Database query error:', dbError);
      throw dbError;
    }

    // チーム数を取得して大会データを処理
    const tournamentsWithCounts = await Promise.all(
      tournamentsResult.rows.map(async (tournamentRow) => {
        const tournament = tournamentRow as unknown as {
          tournament_id: number;
          tournament_name: string;
          status: string;
          created_at: string;
          recruitment_start_date: string | null;
          recruitment_end_date: string | null;
          tournament_dates: string | null;
          visibility: string; // 'open' | 'closed'
          is_archived: number | null;
          created_by: string;
          group_id: number | null;
          group_order: number | null;
          venue_name: string | null;
          format_name: string | null;
          group_name: string | null;
          group_description: string | null;
        };

        // チーム数を取得
        const teamCountResult = await db.execute(`
          SELECT COUNT(*) as count 
          FROM t_tournament_teams 
          WHERE tournament_id = ?
        `, [tournament.tournament_id]);
        
        const teamCount = (teamCountResult.rows[0] as unknown as { count: number }).count || 0;

        // tournament_datesからevent_start_dateを取得
        let event_start_date = null;
        if (tournament.tournament_dates) {
          try {
            const dates = JSON.parse(tournament.tournament_dates);
            if (Array.isArray(dates) && dates.length > 0) {
              event_start_date = dates[0];
            }
          } catch (error) {
            console.error('Failed to parse tournament_dates:', tournament.tournament_dates, error);
          }
        }

        return {
          ...tournament,
          team_count: teamCount,
          event_start_date: event_start_date
        };
      })
    );
    console.log('[ACTIVE_TOURNAMENTS] Team counts calculated successfully');

    // ステータス計算機能を追加（管理者ダッシュボードと同様）

    const tournaments = tournamentsWithCounts.map((tournament) => {
      // 正しいステータス計算を適用
      const calculatedStatus = calculateTournamentStatusSync({
        status: tournament.status,
        tournament_dates: tournament.tournament_dates || '{}',
        recruitment_start_date: tournament.recruitment_start_date,
        recruitment_end_date: tournament.recruitment_end_date
      });
      
      return {
        tournament_id: tournament.tournament_id,
        tournament_name: tournament.tournament_name,
        status: tournament.status,
        calculated_status: calculatedStatus,
        team_count: tournament.team_count || 0,
        venue_name: tournament.venue_name,
        format_name: tournament.format_name,
        event_start_date: tournament.event_start_date,
        created_at: tournament.created_at,
        is_archived: tournament.is_archived || 0,
        visibility: tournament.visibility === 'open' ? 1 : 0,
        group_id: tournament.group_id,
        group_order: tournament.group_order || 0,
        group_name: tournament.group_name,
        group_description: tournament.group_description
      };
    });

    console.log('[ACTIVE_TOURNAMENTS] Processed tournaments count:', tournaments.length);
    return NextResponse.json({
      success: true,
      data: tournaments
    });

  } catch (error) {
    console.error('[ACTIVE_TOURNAMENTS] Error occurred:', error);
    console.error('[ACTIVE_TOURNAMENTS] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { 
        success: false, 
        error: 'データ取得中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}