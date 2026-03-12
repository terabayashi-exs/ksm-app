import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkTrialExpiredPermission } from '@/lib/subscription/subscription-service';

/**
 * GET /api/tournaments/[id]/courts
 * 大会のコート設定一覧を取得（t_matches_liveから集約）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const tournamentId = parseInt(id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    const result = await db.execute(`
      SELECT DISTINCT ml.court_number, ml.court_name
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND ml.court_number IS NOT NULL
      ORDER BY ml.court_number
    `, [tournamentId]);

    const courtSettings = result.rows.map(row => ({
      court_number: Number(row.court_number),
      court_name: row.court_name ? String(row.court_name) : `コート${row.court_number}`,
      display_order: Number(row.court_number),
      is_active: 1,
    }));

    return NextResponse.json({
      success: true,
      data: courtSettings
    });

  } catch (error) {
    console.error('コート設定取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'コート設定の取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tournaments/[id]/courts
 * コート名を一括保存（t_matches_liveに直接反映）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    // 期限切れチェック（編集）
    const permissionCheck = await checkTrialExpiredPermission(
      session.user.id,
      'canEdit'
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: permissionCheck.reason,
          trialExpired: true
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const tournamentId = parseInt(id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { courts } = body;

    if (!Array.isArray(courts)) {
      return NextResponse.json(
        { success: false, error: '無効なデータ形式です' },
        { status: 400 }
      );
    }

    // バリデーション
    for (const court of courts) {
      if (typeof court.court_number !== 'number' || !court.court_name || typeof court.court_name !== 'string') {
        return NextResponse.json(
          { success: false, error: 'コート番号とコート名は必須です' },
          { status: 400 }
        );
      }

      if (court.court_name.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'コート名が空です' },
          { status: 400 }
        );
      }

      if (court.court_name.length > 50) {
        return NextResponse.json(
          { success: false, error: 'コート名は50文字以内で入力してください' },
          { status: 400 }
        );
      }
    }

    // t_matches_liveのcourt_nameを直接更新
    for (const court of courts) {
      const courtName = court.court_name.trim();
      await db.execute(`
        UPDATE t_matches_live
        SET court_name = ?, updated_at = datetime('now', '+9 hours')
        WHERE court_number = ? AND match_block_id IN (
          SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
        )
      `, [courtName, court.court_number, tournamentId]);
    }

    return NextResponse.json({
      success: true,
      message: 'コート名を保存しました'
    });

  } catch (error) {
    console.error('コート名保存エラー:', error);
    return NextResponse.json(
      { success: false, error: 'コート名の保存に失敗しました' },
      { status: 500 }
    );
  }
}
