// app/api/venues/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 個別会場の取得
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const resolvedParams = await params;
    const venueId = parseInt(resolvedParams.id);

    if (isNaN(venueId)) {
      return NextResponse.json(
        { success: false, error: '有効な会場IDを指定してください' },
        { status: 400 }
      );
    }

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
      WHERE venue_id = ?
    `, [venueId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '会場が見つかりません' },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const venue = {
      venue_id: Number(row.venue_id),
      venue_name: String(row.venue_name),
      address: String(row.address),
      available_courts: Number(row.available_courts),
      is_active: Boolean(row.is_active),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    };

    return NextResponse.json({
      success: true,
      data: venue
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

// 会場の更新
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const venueId = parseInt(resolvedParams.id);

    if (isNaN(venueId)) {
      return NextResponse.json(
        { success: false, error: '有効な会場IDを指定してください' },
        { status: 400 }
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

    // 会場の存在確認
    const existingVenue = await db.execute(`
      SELECT venue_id FROM m_venues WHERE venue_id = ?
    `, [venueId]);

    if (existingVenue.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '会場が見つかりません' },
        { status: 404 }
      );
    }

    // 同名会場の重複チェック（自分以外）
    const duplicateVenue = await db.execute(`
      SELECT venue_id FROM m_venues WHERE venue_name = ? AND venue_id != ?
    `, [venue_name.trim(), venueId]);

    if (duplicateVenue.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: '同じ名前の会場が既に登録されています' },
        { status: 400 }
      );
    }

    // 会場を更新
    await db.execute(`
      UPDATE m_venues 
      SET venue_name = ?, address = ?, available_courts = ?, is_active = ?, updated_at = datetime('now', '+9 hours')
      WHERE venue_id = ?
    `, [
      venue_name.trim(),
      address.trim(),
      Number(available_courts),
      Boolean(is_active) ? 1 : 0,
      venueId
    ]);

    return NextResponse.json({
      success: true,
      message: '会場が正常に更新されました'
    });

  } catch (error) {
    console.error('会場更新エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '会場の更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// 会場の削除
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const venueId = parseInt(resolvedParams.id);

    if (isNaN(venueId)) {
      return NextResponse.json(
        { success: false, error: '有効な会場IDを指定してください' },
        { status: 400 }
      );
    }

    // 会場の存在確認
    const existingVenue = await db.execute(`
      SELECT venue_id, venue_name FROM m_venues WHERE venue_id = ?
    `, [venueId]);

    if (existingVenue.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '会場が見つかりません' },
        { status: 404 }
      );
    }

    // 使用中の大会がないかチェック
    const usedInTournaments = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status
      FROM t_tournaments 
      WHERE venue_id = ?
      ORDER BY created_at DESC
    `, [venueId]);

    if (usedInTournaments.rows.length > 0) {
      const tournamentNames = usedInTournaments.rows
        .slice(0, 3) // 最大3件まで表示
        .map(row => `「${row.tournament_name}」`)
        .join('、');
      
      const remainingCount = usedInTournaments.rows.length - 3;
      const additionalText = remainingCount > 0 ? `他${remainingCount}件` : '';
      
      const errorMessage = usedInTournaments.rows.length === 1
        ? `この会場は大会${tournamentNames}で使用されているため削除できません。先に大会を削除してから会場を削除してください。`
        : `この会場は${usedInTournaments.rows.length}件の大会（${tournamentNames}${additionalText}）で使用されているため削除できません。先に関連する大会を削除してから会場を削除してください。`;

      return NextResponse.json(
        { 
          success: false, 
          error: errorMessage,
          usedTournaments: usedInTournaments.rows.map(row => ({
            tournament_id: Number(row.tournament_id),
            tournament_name: String(row.tournament_name),
            status: String(row.status)
          }))
        },
        { status: 400 }
      );
    }

    // 会場を削除
    await db.execute(`
      DELETE FROM m_venues WHERE venue_id = ?
    `, [venueId]);

    return NextResponse.json({
      success: true,
      message: '会場が正常に削除されました'
    });

  } catch (error) {
    console.error('会場削除エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '会場の削除に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}