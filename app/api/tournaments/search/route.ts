// app/api/tournaments/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { 
  calculateTournamentStatus, 
  formatTournamentPeriod, 
  type TournamentStatus
} from '@/lib/tournament-status';

export async function GET(request: NextRequest) {
  try {
    // まずデータベース接続をテスト
    try {
      await db.execute('SELECT 1');
    } catch (dbError) {
      console.error('データベース接続エラー:', dbError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'データベースに接続できませんでした',
          details: dbError instanceof Error ? dbError.message : 'Database connection failed'
        },
        { status: 500 }
      );
    }

    const session = await auth();
    const teamId = session?.user?.role === 'team' ? session.user.teamId : undefined;

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const day = searchParams.get('day');
    const tournamentName = searchParams.get('tournament_name');
    const statusFilter = searchParams.get('status') as TournamentStatus | null;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    // シンプルなクエリから始める
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
        t.team_count,
        t.visibility,
        COALESCE(v.venue_name, '未設定') as venue_name,
        COALESCE(f.format_name, '未設定') as format_name,
        0 as registered_teams
        ${teamId ? ', 0 as is_joined' : ', 0 as is_joined'}
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
    `;

    const params: (string | number)[] = [];
    
    const conditions: string[] = [];

    // 公開されている大会のみ（文字列値'open'をチェック）
    conditions.push("t.visibility = 'open'");

    // 大会名の部分検索
    if (tournamentName) {
      conditions.push('t.tournament_name LIKE ?');
      params.push(`%${tournamentName}%`);
    }

    // 日付検索の実装
    if (year || month || day) {
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

    // ORDER BY を追加（GROUP BYは不要）
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
    
    // デバッグ: クエリと結果を確認
    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          tournaments: [],
          pagination: {
            total: 0,
            limit: limit ? parseInt(limit) : null,
            offset: offset ? parseInt(offset) : 0,
            hasMore: false
          }
        },
        debug: { 
          query: query.replace(/\s+/g, ' ').trim(),
          params,
          rowCount: result.rows.length
        }
      });
    }
    
    // 結果の整形（動的ステータス計算付き）
    const allTournaments = result.rows.map(row => {
      const tournamentData = {
        status: String(row.status),
        tournament_dates: String(row.tournament_dates),
        recruitment_start_date: row.recruitment_start_date as string | null,
        recruitment_end_date: row.recruitment_end_date as string | null
      };

      const calculatedStatus = calculateTournamentStatus(tournamentData);
      const tournamentPeriod = formatTournamentPeriod(String(row.tournament_dates));

      // tournament_datesからevent_start_dateとevent_end_dateを計算
      let eventStartDate = '';
      let eventEndDate = '';
      
      if (row.tournament_dates) {
        try {
          const dates = JSON.parse(row.tournament_dates as string);
          const dateValues = Object.values(dates) as string[];
          const sortedDates = dateValues.filter(Boolean).sort();
          eventStartDate = sortedDates[0] || '';
          eventEndDate = sortedDates[sortedDates.length - 1] || '';
        } catch (error) {
          console.error('Error parsing tournament_dates:', error);
        }
      }

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        status: calculatedStatus, // 動的ステータスを使用
        format_name: row.format_name as string,
        venue_name: row.venue_name as string,
        team_count: Number(row.team_count),
        is_public: row.visibility === 'open', // visibility='open'の場合にtrueを返す
        recruitment_start_date: row.recruitment_start_date as string,
        recruitment_end_date: row.recruitment_end_date as string,
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
        tournament_period: tournamentPeriod,
        created_at: String(row.created_at),
        is_joined: Boolean(row.is_joined)
      };
    });

    // ステータスフィルタリング（動的ステータスベース）
    const tournaments = statusFilter 
      ? allTournaments.filter(tournament => tournament.status === statusFilter)
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
    console.error('一般用大会検索エラー:', error);
    
    // より詳細なエラー情報を提供
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error details:', { error, errorMessage });
    
    return NextResponse.json(
      { 
        success: false, 
        error: '大会データの取得に失敗しました',
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}