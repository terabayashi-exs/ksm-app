// app/api/announcements/route.ts
// お知らせ一覧取得API（公開済みのみ・認証不要）

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const result = await db.execute(`
      SELECT
        announcement_id,
        title,
        content,
        created_at,
        updated_at
      FROM t_announcements
      WHERE status = 'published'
      ORDER BY display_order DESC, created_at DESC
      LIMIT 5
    `);

    return NextResponse.json({
      announcements: result.rows,
    });
  } catch (error) {
    console.error('お知らせ取得エラー:', error);
    return NextResponse.json(
      { error: 'お知らせの取得に失敗しました' },
      { status: 500 }
    );
  }
}
