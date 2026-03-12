// app/api/tournaments/[id]/match-overrides/[overrideId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { checkAndPromoteOnOverrideChange } from '@/lib/tournament-promotion';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string; overrideId: string }>;
}

/**
 * PUT: オーバーライド更新
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック（管理者権限必須）
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);
    const overrideId = parseInt(resolvedParams.overrideId);

    if (isNaN(tournamentId) || isNaN(overrideId)) {
      return NextResponse.json(
        { success: false, error: '有効なIDを指定してください' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { team1_source_override, team2_source_override, override_reason } = body;

    // バリデーション
    if (!team1_source_override && !team2_source_override) {
      return NextResponse.json(
        { success: false, error: '少なくとも1つのオーバーライドが必要です' },
        { status: 400 }
      );
    }

    // オーバーライド存在確認（match_codeも取得）
    const checkResult = await db.execute(`
      SELECT override_id, match_code FROM t_tournament_match_overrides
      WHERE override_id = ? AND tournament_id = ?
    `, [overrideId, tournamentId]);

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'オーバーライドが見つかりません' },
        { status: 404 }
      );
    }

    const matchCode = String(checkResult.rows[0].match_code);

    // オーバーライド更新
    await db.execute(`
      UPDATE t_tournament_match_overrides
      SET
        team1_source_override = ?,
        team2_source_override = ?,
        override_reason = ?,
        overridden_by = ?,
        overridden_at = datetime('now', '+9 hours'),
        updated_at = datetime('now', '+9 hours')
      WHERE override_id = ? AND tournament_id = ?
    `, [
      team1_source_override || null,
      team2_source_override || null,
      override_reason || null,
      session.user.email || session.user.id,
      overrideId,
      tournamentId
    ]);

    console.log(`[MATCH_OVERRIDE] Updated override ${overrideId} for tournament ${tournamentId}`);

    // オーバーライド変更後の自動進出処理チェック
    try {
      await checkAndPromoteOnOverrideChange(tournamentId, [matchCode]);
    } catch (promoteError) {
      console.error(`[MATCH_OVERRIDE] 自動進出処理でエラーが発生しましたが、オーバーライド設定は完了しました:`, promoteError);
      // エラーが発生してもオーバーライド設定は成功とする
    }

    return NextResponse.json({
      success: true,
      message: 'オーバーライドを更新しました'
    });

  } catch (error) {
    console.error('オーバーライド更新エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'オーバーライドの更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: オーバーライド削除（個別）
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック（管理者権限必須）
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);
    const overrideId = parseInt(resolvedParams.overrideId);

    if (isNaN(tournamentId) || isNaN(overrideId)) {
      return NextResponse.json(
        { success: false, error: '有効なIDを指定してください' },
        { status: 400 }
      );
    }

    // オーバーライド存在確認（match_codeも取得）
    const checkResult = await db.execute(`
      SELECT override_id, match_code FROM t_tournament_match_overrides
      WHERE override_id = ? AND tournament_id = ?
    `, [overrideId, tournamentId]);

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'オーバーライドが見つかりません' },
        { status: 404 }
      );
    }

    const matchCode = String(checkResult.rows[0].match_code);

    // オーバーライド削除
    await db.execute(`
      DELETE FROM t_tournament_match_overrides
      WHERE override_id = ? AND tournament_id = ?
    `, [overrideId, tournamentId]);

    console.log(`[MATCH_OVERRIDE] Deleted override ${overrideId} for tournament ${tournamentId}`);

    // オーバーライド削除後の自動進出処理チェック（元の条件に戻る）
    try {
      await checkAndPromoteOnOverrideChange(tournamentId, [matchCode]);
    } catch (promoteError) {
      console.error(`[MATCH_OVERRIDE] 自動進出処理でエラーが発生しましたが、オーバーライド削除は完了しました:`, promoteError);
      // エラーが発生してもオーバーライド削除は成功とする
    }

    return NextResponse.json({
      success: true,
      message: 'オーバーライドを削除しました'
    });

  } catch (error) {
    console.error('オーバーライド削除エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'オーバーライドの削除に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
