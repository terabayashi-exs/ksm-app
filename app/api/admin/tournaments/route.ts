// app/api/admin/tournaments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { 
  calculateTournamentStatusSync, 
  formatTournamentPeriod, 
  type TournamentStatus,
  type TournamentWithStatus 
} from '@/lib/tournament-status';

export async function GET(request: NextRequest) {
  try {
    // 認証チェック（管理者のみ）
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const isAdmin = userId === 'admin';

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const day = searchParams.get('day');
    const tournamentName = searchParams.get('tournament_name');
    const statusFilter = searchParams.get('status') as TournamentStatus | null;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    let query = `
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.status,
        t.tournament_dates,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        t.is_archived,
        t.team_count,
        t.group_id,
        v.venue_name,
        f.format_name,
        COUNT(DISTINCT CASE
          WHEN tt.participation_status = 'confirmed' AND tt.withdrawal_status = 'active'
          THEN tt.tournament_team_id
        END) as current_registered_teams,
        COUNT(DISTINCT ml.match_id) as match_count,
        COUNT(DISTINCT mf.match_id) as results_count
      FROM t_tournaments t
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id
      LEFT JOIN t_match_blocks mb ON t.tournament_id = mb.tournament_id
      LEFT JOIN t_matches_live ml ON mb.match_block_id = ml.match_block_id
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
    `;

    const params: (string | number)[] = [];
    const conditions: string[] = [];

    // 作成者フィルタリング（adminユーザー以外は自分が作成した大会のみ）
    if (!isAdmin) {
      conditions.push('tg.admin_login_id = ?');
      params.push(userId);
    }

    // 大会名の部分検索
    if (tournamentName) {
      conditions.push('t.tournament_name LIKE ?');
      params.push(`%${tournamentName}%`);
    }

    // 日付検索の実装
    if (year || month || day) {
      // tournament_datesはJSONで保存されているため、日付で検索する場合は
      // JSONから実際の日付を取得して比較する必要がある
      let dateCondition = '';
      
      if (year && month && day) {
        // 年月日が全て指定されている場合：その日に開催される大会
        const targetDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        dateCondition = `JSON_EXTRACT(t.tournament_dates, '$."1"') = ? OR JSON_EXTRACT(t.tournament_dates, '$."2"') = ? OR JSON_EXTRACT(t.tournament_dates, '$."3"') = ?`;
        params.push(targetDate, targetDate, targetDate);
      } else if (year && month) {
        // 年月が指定されている場合：その月に開催される大会
        const startDate = `${year}-${month.padStart(2, '0')}-01`;
        const endDate = `${year}-${month.padStart(2, '0')}-31`;
        dateCondition = `
          (JSON_EXTRACT(t.tournament_dates, '$."1"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."1"') <= ?) OR
          (JSON_EXTRACT(t.tournament_dates, '$."2"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."2"') <= ?) OR
          (JSON_EXTRACT(t.tournament_dates, '$."3"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."3"') <= ?)
        `;
        params.push(startDate, endDate, startDate, endDate, startDate, endDate);
      } else if (year) {
        // 年のみが指定されている場合：その年に開催される大会
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        dateCondition = `
          (JSON_EXTRACT(t.tournament_dates, '$."1"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."1"') <= ?) OR
          (JSON_EXTRACT(t.tournament_dates, '$."2"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."2"') <= ?) OR
          (JSON_EXTRACT(t.tournament_dates, '$."3"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."3"') <= ?)
        `;
        params.push(startDate, endDate, startDate, endDate, startDate, endDate);
      }

      if (dateCondition) {
        conditions.push(`(${dateCondition})`);
      }
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    // GROUP BY と ORDER BY を追加
    query += ' GROUP BY t.tournament_id, t.tournament_name, t.status, t.tournament_dates, t.recruitment_start_date, t.recruitment_end_date, t.created_at, t.updated_at, t.is_archived, t.team_count, t.group_id, v.venue_name, f.format_name';
    query += ' ORDER BY t.created_at DESC';

    // ページネーション
    if (limit) {
      query += ' LIMIT ?';
      params.push(parseInt(limit));
      
      if (offset) {
        query += ' OFFSET ?';
        params.push(parseInt(offset));
      }
    }

    const result = await db.execute(query, params);
    
    // 結果の整形（動的ステータス計算付き）
    const allTournaments: TournamentWithStatus[] = result.rows.map(row => {
      const tournamentData = {
        status: String(row.status),
        tournament_dates: String(row.tournament_dates),
        recruitment_start_date: row.recruitment_start_date as string | null,
        recruitment_end_date: row.recruitment_end_date as string | null
      };

      const calculatedStatus = calculateTournamentStatusSync(tournamentData);
      const tournamentPeriod = formatTournamentPeriod(String(row.tournament_dates));
      
      // アーカイブ済みの場合はt_tournamentsのteam_countを使用、そうでなければ実際の登録チーム数
      const displayTeamCount = Boolean(row.is_archived) 
        ? Number(row.team_count) 
        : Number(row.current_registered_teams);

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        status: String(row.status),
        tournament_dates: String(row.tournament_dates),
        recruitment_start_date: row.recruitment_start_date as string | null,
        recruitment_end_date: row.recruitment_end_date as string | null,
        tournament_period: tournamentPeriod,
        venue_name: row.venue_name as string,
        format_name: row.format_name as string,
        registered_teams: displayTeamCount,
        match_count: Number(row.match_count || 0),
        results_count: Number(row.results_count || 0),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        is_archived: Boolean(row.is_archived),
        calculated_status: calculatedStatus
      };
    });

    // ステータスフィルタリング（動的ステータスベース）
    const tournaments = statusFilter 
      ? allTournaments.filter(tournament => tournament.calculated_status === statusFilter)
      : allTournaments;

    // 総件数はフィルタリング後の結果から計算
    const total = tournaments.length;

    return NextResponse.json({
      success: true,
      data: {
        tournaments,
        pagination: {
          total,
          limit: limit ? parseInt(limit) : null,
          offset: offset ? parseInt(offset) : 0,
          hasMore: limit ? total > (parseInt(offset || '0') + tournaments.length) : false
        }
      }
    });

  } catch (error) {
    console.error('管理者用大会検索エラー:', error);
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