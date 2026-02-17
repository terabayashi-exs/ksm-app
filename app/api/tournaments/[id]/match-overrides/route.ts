// app/api/tournaments/[id]/match-overrides/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { checkAndPromoteOnOverrideChange } from '@/lib/tournament-promotion';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: 大会のオーバーライド一覧取得
 */
export async function GET(
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

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // 大会存在確認
    const tournamentCheck = await db.execute(`
      SELECT tournament_id FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    // オーバーライド一覧取得（元の条件も含めて）
    const overridesResult = await db.execute(`
      SELECT
        mo.override_id,
        mo.tournament_id,
        mo.match_code,
        mo.team1_source_override,
        mo.team2_source_override,
        mo.override_reason,
        mo.overridden_by,
        mo.overridden_at,
        mt.team1_source as original_team1_source,
        mt.team2_source as original_team2_source,
        mt.team1_display_name as original_team1_display_name,
        mt.team2_display_name as original_team2_display_name,
        mt.round_name
      FROM t_tournament_match_overrides mo
      INNER JOIN m_match_templates mt ON mt.match_code = mo.match_code
      INNER JOIN t_tournaments t ON t.tournament_id = mo.tournament_id AND t.format_id = mt.format_id
      WHERE mo.tournament_id = ?
      ORDER BY mo.match_code
    `, [tournamentId]);

    const overrides = overridesResult.rows.map(row => ({
      override_id: Number(row.override_id),
      tournament_id: Number(row.tournament_id),
      match_code: String(row.match_code),
      team1_source_override: row.team1_source_override ? String(row.team1_source_override) : null,
      team2_source_override: row.team2_source_override ? String(row.team2_source_override) : null,
      override_reason: row.override_reason ? String(row.override_reason) : null,
      overridden_by: row.overridden_by ? String(row.overridden_by) : null,
      overridden_at: row.overridden_at ? String(row.overridden_at) : null,
      original_team1_source: row.original_team1_source ? String(row.original_team1_source) : null,
      original_team2_source: row.original_team2_source ? String(row.original_team2_source) : null,
      original_team1_display_name: row.original_team1_display_name ? String(row.original_team1_display_name) : null,
      original_team2_display_name: row.original_team2_display_name ? String(row.original_team2_display_name) : null,
      round_name: row.round_name ? String(row.round_name) : null
    }));

    return NextResponse.json({
      success: true,
      data: overrides
    });

  } catch (error) {
    console.error('オーバーライド一覧取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'オーバーライド一覧の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST: オーバーライド新規作成
 */
export async function POST(
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

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { match_code, team1_source_override, team2_source_override, override_reason } = body;

    // バリデーション
    if (!match_code) {
      return NextResponse.json(
        { success: false, error: '試合コードは必須です' },
        { status: 400 }
      );
    }

    if (!team1_source_override && !team2_source_override) {
      return NextResponse.json(
        { success: false, error: '少なくとも1つのオーバーライドが必要です' },
        { status: 400 }
      );
    }

    // 試合テンプレート存在確認（選出条件が設定されている試合のみ対象）
    const templateCheck = await db.execute(`
      SELECT mt.match_code
      FROM m_match_templates mt
      INNER JOIN t_tournaments t ON t.format_id = mt.format_id
      WHERE t.tournament_id = ? AND mt.match_code = ?
        AND (mt.team1_source IS NOT NULL OR mt.team2_source IS NOT NULL)
    `, [tournamentId, match_code]);

    if (templateCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '指定された試合コードが見つかりません、または選出条件が設定されていません' },
        { status: 404 }
      );
    }

    // オーバーライド作成（UNIQUE制約により同じtournament_id + match_codeは重複不可）
    const insertResult = await db.execute(`
      INSERT INTO t_tournament_match_overrides
        (tournament_id, match_code, team1_source_override, team2_source_override, override_reason, overridden_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      tournamentId,
      match_code,
      team1_source_override || null,
      team2_source_override || null,
      override_reason || null,
      session.user.email || session.user.id
    ]);

    console.log(`[MATCH_OVERRIDE] Created override for tournament ${tournamentId}, match ${match_code}`);
    console.log(`[MATCH_OVERRIDE] team1_source_override: ${team1_source_override}, team2_source_override: ${team2_source_override}`);

    // オーバーライド変更後の自動進出処理チェック
    try {
      await checkAndPromoteOnOverrideChange(tournamentId, [match_code]);
    } catch (promoteError) {
      console.error(`[MATCH_OVERRIDE] 自動進出処理でエラーが発生しましたが、オーバーライド設定は完了しました:`, promoteError);
      // エラーが発生してもオーバーライド設定は成功とする
    }

    return NextResponse.json({
      success: true,
      message: 'オーバーライドを作成しました',
      override_id: Number(insertResult.lastInsertRowid)
    });

  } catch (error) {
    console.error('オーバーライド作成エラー:', error);

    // UNIQUE制約違反のエラーチェック
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return NextResponse.json(
        {
          success: false,
          error: 'この試合には既にオーバーライドが設定されています。更新する場合はPUTリクエストを使用してください。'
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'オーバーライドの作成に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: オーバーライド全削除（大会単位）
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

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // 大会のオーバーライドを全削除
    await db.execute(`
      DELETE FROM t_tournament_match_overrides
      WHERE tournament_id = ?
    `, [tournamentId]);

    console.log(`[MATCH_OVERRIDE] Deleted all overrides for tournament ${tournamentId}`);

    return NextResponse.json({
      success: true,
      message: 'オーバーライドを全て削除しました'
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
