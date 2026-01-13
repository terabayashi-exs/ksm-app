// app/api/public/sponsor-banners/route.ts
// 公開用スポンサーバナー取得API

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// バナー一覧取得（公開用）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournament_id');
    const position = searchParams.get('position');
    const tab = searchParams.get('tab');

    if (!tournamentId) {
      return NextResponse.json(
        { error: 'tournament_idが必要です' },
        { status: 400 }
      );
    }

    // 基本クエリ
    let sql = `
      SELECT
        banner_id,
        tournament_id,
        banner_name,
        banner_url,
        image_blob_url,
        display_position,
        target_tab,
        display_order,
        is_active,
        start_date,
        end_date,
        click_count
      FROM t_sponsor_banners
      WHERE tournament_id = ?
        AND is_active = 1
    `;

    const args: (string | number)[] = [tournamentId];

    // 表示位置でフィルタリング
    if (position) {
      sql += ' AND display_position = ?';
      args.push(position);
    }

    // ターゲットタブでフィルタリング
    if (tab) {
      sql += ' AND (target_tab = ? OR target_tab = ?)';
      args.push(tab);
      args.push('all');
    }

    sql += ' ORDER BY display_order, banner_id';

    const result = await db.execute({
      sql,
      args,
    });

    return NextResponse.json({
      banners: result.rows,
    });
  } catch (error) {
    console.error('バナー取得エラー:', error);
    return NextResponse.json(
      { error: 'バナーの取得に失敗しました' },
      { status: 500 }
    );
  }
}
