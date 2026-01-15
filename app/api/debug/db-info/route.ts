import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // 現在の環境情報を取得
    const env = {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[0] + '@...' : 'undefined',
      DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN ? 'exists' : 'undefined'
    };

    // データベースの接続テスト
    const result = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        tournament_dates,
        recruitment_start_date,
        recruitment_end_date,
        created_at,
        updated_at
      FROM t_tournaments
      ORDER BY tournament_id
    `);

    // 現在の日時でステータス判定
    const tournaments = result.rows.map((t: Record<string, unknown>) => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // 募集日程の確認
      const recruitmentStart = t.recruitment_start_date && typeof t.recruitment_start_date === 'string'
        ? new Date(t.recruitment_start_date) 
        : null;
      const recruitmentEnd = t.recruitment_end_date && typeof t.recruitment_end_date === 'string'
        ? new Date(t.recruitment_end_date) 
        : null;

      // 大会日程の確認
      let tournamentStartDate = null;
      let tournamentEndDate = null;

      if (t.tournament_dates && typeof t.tournament_dates === 'string') {
        try {
          const tournamentDates = JSON.parse(t.tournament_dates);
          const dates = Object.values(tournamentDates)
            .filter(date => date && typeof date === 'string')
            .map(date => new Date(date as string))
            .sort((a, b) => a.getTime() - b.getTime());
          
          if (dates.length > 0) {
            tournamentStartDate = dates[0];
            tournamentEndDate = dates[dates.length - 1];
          }
        } catch (error) {
          console.warn('tournament_datesのJSON解析に失敗:', t.tournament_dates, error);
        }
      }

      // DBのstatusが'completed'の場合は終了とする
      if (t.status === 'completed') {
        return { ...t, calculated_status: 'completed' };
      }

      // 1. 募集前：募集開始日が未来の場合
      if (recruitmentStart && today < recruitmentStart) {
        return { ...t, calculated_status: 'planning' };
      }

      // 2. 募集中：募集開始日 <= 現在 <= 募集終了日
      if (recruitmentStart && recruitmentEnd && 
          today >= recruitmentStart && today <= recruitmentEnd) {
        return { ...t, calculated_status: 'recruiting' };
      }

      // 3. 開催前：募集終了日 < 現在 < 大会開始日
      if (recruitmentEnd && tournamentStartDate && 
          today > recruitmentEnd && today < tournamentStartDate) {
        return { ...t, calculated_status: 'before_event' };
      }

      // 4. 開催中：大会期間中
      if (tournamentStartDate && tournamentEndDate && 
          today >= tournamentStartDate && today <= tournamentEndDate) {
        return { ...t, calculated_status: 'ongoing' };
      }

      // 5. 終了：大会期間終了後
      if (tournamentEndDate && today > tournamentEndDate) {
        return { ...t, calculated_status: 'completed' };
      }

      // デフォルト：判定できない場合は募集前とする
      return { ...t, calculated_status: 'planning' };
    });

    return NextResponse.json({
      success: true,
      env,
      tournament_count: tournaments.length,
      current_time: new Date().toISOString(),
      tournaments
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'missing',
        DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN ? 'configured' : 'missing'
      }
    });
  }
}