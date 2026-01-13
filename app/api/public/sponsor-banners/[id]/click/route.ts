// app/api/public/sponsor-banners/[id]/click/route.ts
// バナークリック計測API

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// クリック数をカウント
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bannerId = id;

    // クリック数を+1
    await db.execute({
      sql: 'UPDATE t_sponsor_banners SET click_count = click_count + 1 WHERE banner_id = ?',
      args: [bannerId],
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('クリック計測エラー:', error);
    // エラーでもクライアントには成功を返す（計測失敗でユーザー体験を損なわないため）
    return NextResponse.json({
      success: true,
    });
  }
}
