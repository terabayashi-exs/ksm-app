// app/api/venues/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET() {
  try {
    const result = await db.execute(`
      SELECT 
        venue_id,
        venue_name,
        address,
        available_courts,
        is_active,
        created_at,
        updated_at
      FROM m_venues
      ORDER BY created_at DESC
    `);

    const venues = result.rows.map(row => ({
      venue_id: Number(row.venue_id),
      venue_name: String(row.venue_name),
      address: String(row.address),
      available_courts: Number(row.available_courts),
      is_active: Boolean(row.is_active),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    }));

    return NextResponse.json({
      success: true,
      data: venues
    });

  } catch (error) {
    console.error('会場一覧取得エラー:', error);
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

// 新規会場の作成
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { venue_name, address, available_courts, is_active } = body;

    // バリデーション
    if (!venue_name || !venue_name.trim()) {
      return NextResponse.json(
        { success: false, error: '会場名を入力してください' },
        { status: 400 }
      );
    }

    if (!address || !address.trim()) {
      return NextResponse.json(
        { success: false, error: '住所を入力してください' },
        { status: 400 }
      );
    }

    if (!available_courts || available_courts < 1) {
      return NextResponse.json(
        { success: false, error: '利用可能コート数は1以上で入力してください' },
        { status: 400 }
      );
    }

    // 同名会場の重複チェック
    const existingVenue = await db.execute(`
      SELECT venue_id FROM m_venues WHERE venue_name = ?
    `, [venue_name.trim()]);

    if (existingVenue.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: '同じ名前の会場が既に登録されています' },
        { status: 400 }
      );
    }

    // 会場を作成
    const result = await db.execute(`
      INSERT INTO m_venues (venue_name, address, available_courts, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      venue_name.trim(),
      address.trim(),
      Number(available_courts),
      Boolean(is_active) ? 1 : 0
    ]);

    return NextResponse.json({
      success: true,
      data: {
        venue_id: Number(result.lastInsertRowid),
        venue_name: venue_name.trim(),
        address: address.trim(),
        available_courts: Number(available_courts),
        is_active: Boolean(is_active)
      },
      message: '会場が正常に作成されました'
    });

  } catch (error) {
    console.error('会場作成エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '会場の作成に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}