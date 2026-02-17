// app/api/tournaments/[id]/match-overrides/bulk/route.ts
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
 * POST: 進出条件の一括変更
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
    const { from_source, to_source, override_reason } = body;

    // バリデーション
    if (!from_source || !to_source) {
      return NextResponse.json(
        { success: false, error: '変更元と変更先を指定してください' },
        { status: 400 }
      );
    }

    if (from_source === to_source) {
      return NextResponse.json(
        { success: false, error: '変更元と変更先が同じです' },
        { status: 400 }
      );
    }

    // 大会のフォーマットを取得
    const tournamentResult = await db.execute(`
      SELECT format_id FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const formatId = tournamentResult.rows[0].format_id;

    // 影響を受ける試合を取得
    const templatesResult = await db.execute(`
      SELECT
        match_code,
        team1_source,
        team2_source
      FROM m_match_templates
      WHERE format_id = ?
        AND phase = 'final'
        AND (team1_source = ? OR team2_source = ?)
    `, [formatId, from_source, from_source]);

    if (templatesResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '該当する試合がありません' },
        { status: 400 }
      );
    }

    let updateCount = 0;

    // 各試合に対してオーバーライドを設定
    for (const row of templatesResult.rows) {
      const matchCode = String(row.match_code);
      const team1Source = row.team1_source ? String(row.team1_source) : null;
      const team2Source = row.team2_source ? String(row.team2_source) : null;

      // team1_sourceまたはteam2_sourceのどちらを変更するか判定
      const team1Override = team1Source === from_source ? to_source : null;
      const team2Override = team2Source === from_source ? to_source : null;

      // オーバーライドが既に存在するかチェック
      const checkResult = await db.execute(`
        SELECT override_id FROM t_tournament_match_overrides
        WHERE tournament_id = ? AND match_code = ?
      `, [tournamentId, matchCode]);

      if (checkResult.rows.length > 0) {
        // 既存のオーバーライドを更新
        const overrideId = checkResult.rows[0].override_id;
        await db.execute(`
          UPDATE t_tournament_match_overrides
          SET
            team1_source_override = CASE
              WHEN ? IS NOT NULL THEN ?
              ELSE team1_source_override
            END,
            team2_source_override = CASE
              WHEN ? IS NOT NULL THEN ?
              ELSE team2_source_override
            END,
            override_reason = ?,
            overridden_by = ?,
            overridden_at = datetime('now', '+9 hours'),
            updated_at = datetime('now', '+9 hours')
          WHERE override_id = ?
        `, [
          team1Override, team1Override,
          team2Override, team2Override,
          override_reason || `${from_source}を${to_source}に一括変更`,
          session.user.email || session.user.id,
          overrideId
        ]);
      } else {
        // 新規オーバーライドを作成
        await db.execute(`
          INSERT INTO t_tournament_match_overrides
            (tournament_id, match_code, team1_source_override, team2_source_override, override_reason, overridden_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          tournamentId,
          matchCode,
          team1Override,
          team2Override,
          override_reason || `${from_source}を${to_source}に一括変更`,
          session.user.email || session.user.id
        ]);
      }

      updateCount++;
    }

    console.log(`[BULK_OVERRIDE] Updated ${updateCount} matches for tournament ${tournamentId}: ${from_source} -> ${to_source}`);

    // 影響を受ける試合コードのリストを作成
    const affectedMatchCodes = templatesResult.rows.map(row => String(row.match_code));

    // オーバーライド変更後の自動進出処理チェック
    try {
      await checkAndPromoteOnOverrideChange(tournamentId, affectedMatchCodes);
    } catch (promoteError) {
      console.error(`[BULK_OVERRIDE] 自動進出処理でエラーが発生しましたが、オーバーライド設定は完了しました:`, promoteError);
      // エラーが発生してもオーバーライド設定は成功とする
    }

    return NextResponse.json({
      success: true,
      message: `${updateCount}件の試合の進出条件を変更しました`,
      updated_count: updateCount
    });

  } catch (error) {
    console.error('一括変更エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '一括変更に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
