// app/api/venues/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Venue } from '@/lib/types';

export async function GET() {
  try {
    const result = await db.execute(`
      SELECT 
        venue_id,
        venue_name,
        address,
        available_courts as court_count,
        is_active
      FROM m_venues
      WHERE is_active = 1
      ORDER BY venue_name ASC
    `);

    const venues = result.rows.map(row => ({
      venue_id: Number(row.venue_id),
      venue_name: String(row.venue_name),
      address: row.address as string | undefined,
      court_count: Number(row.court_count),
      is_active: Boolean(row.is_active)
    })) as Venue[];

    return NextResponse.json({
      success: true,
      data: venues
    });

  } catch (error) {
    console.error('会場取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '会場データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}