// app/api/tournaments/[id]/recalculate-standings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getTournamentSportCode } from '@/lib/sport-standings-calculator';
import { calculateBlockStandings, calculateMultiSportBlockStandings } from '@/lib/standings-calculator';
import { validateFinalTournamentPromotions, autoFixPromotionIssues } from '@/lib/tournament-promotion';

/**
 * 大会の全ブロックの順位表を強制的に再計算するAPI
 * 認証されたユーザー（チーム代表者や管理者）が実行可能
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 認証確認（管理者でなくても認証済みユーザーならOK）
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    console.log(`[RECALCULATE_STANDINGS] 順位表再計算開始: Tournament ${tournamentId}, User: ${session.user.email}`);

    // 大会の存在確認
    const tournamentCheck = await db.execute({
      sql: 'SELECT tournament_id, tournament_name FROM t_tournaments WHERE tournament_id = ?',
      args: [tournamentId]
    });

    if (!tournamentCheck.rows || tournamentCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const tournamentName = tournamentCheck.rows[0].tournament_name as string;

    // 全ブロックを取得
    const blocks = await db.execute({
      sql: `
        SELECT match_block_id, phase, block_name, display_round_name
        FROM t_match_blocks
        WHERE tournament_id = ?
        ORDER BY match_block_id
      `,
      args: [tournamentId]
    });

    if (!blocks.rows || blocks.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ブロックが見つかりません' },
        { status: 404 }
      );
    }

    console.log(`[RECALCULATE_STANDINGS] 対象ブロック数: ${blocks.rows.length}`);

    // フォーマットタイプを取得
    const formatResult = await db.execute({
      sql: `
        SELECT f.preliminary_format_type, f.final_format_type
        FROM t_tournaments t
        JOIN m_tournament_formats f ON t.format_id = f.format_id
        WHERE t.tournament_id = ?
      `,
      args: [tournamentId]
    });

    const preliminaryFormatType = formatResult.rows[0]?.preliminary_format_type as string;
    const finalFormatType = formatResult.rows[0]?.final_format_type as string;

    // 競技種別を取得
    const sportCode = await getTournamentSportCode(tournamentId);
    console.log(`[RECALCULATE_STANDINGS] 競技種別: ${sportCode}`);

    const results: Array<{
      block_name: string;
      phase: string;
      status: 'success' | 'skipped' | 'error';
      message: string;
      teams_count?: number;
    }> = [];

    // 各ブロックの順位表を再計算
    for (const block of blocks.rows) {
      const blockId = block.match_block_id as number;
      const blockName = block.block_name as string;
      const phase = block.phase as string;

      console.log(`[RECALCULATE_STANDINGS] ブロック ${blockName} (${phase}) を処理中...`);

      try {
        // 現在のフェーズに応じたフォーマットタイプを取得
        const currentFormatType = phase === 'final' ? finalFormatType : preliminaryFormatType;

        // トーナメント形式の場合は専用の処理
        if (currentFormatType === 'tournament') {
          console.log(`[RECALCULATE_STANDINGS] ${blockName}はトーナメント形式のためスキップ`);
          results.push({
            block_name: blockName,
            phase,
            status: 'skipped',
            message: 'トーナメント形式は自動計算対象外です'
          });
          continue;
        }

        // リーグ形式の場合は順位表を計算
        let blockStandings;

        if (sportCode === 'soccer') {
          console.log(`[RECALCULATE_STANDINGS] サッカー競技用計算を使用`);
          const multiSportStandings = await calculateMultiSportBlockStandings(blockId, tournamentId);

          // 従来形式に変換
          blockStandings = multiSportStandings.map(team => ({
            tournament_team_id: team.tournament_team_id,
            team_id: team.team_id,
            team_name: team.team_name,
            team_omission: team.team_omission,
            position: team.position,
            points: team.points,
            matches_played: team.matches_played,
            wins: team.wins,
            draws: team.draws,
            losses: team.losses,
            goals_for: team.scores_for,
            goals_against: team.scores_against,
            goal_difference: team.score_difference
          }));
        } else {
          console.log(`[RECALCULATE_STANDINGS] 標準計算を使用`);
          blockStandings = await calculateBlockStandings(blockId, tournamentId);
        }

        // team_rankingsを更新
        await db.execute({
          sql: `
            UPDATE t_match_blocks
            SET team_rankings = ?, updated_at = datetime('now', '+9 hours')
            WHERE match_block_id = ?
          `,
          args: [JSON.stringify(blockStandings), blockId]
        });

        console.log(`[RECALCULATE_STANDINGS] ブロック ${blockName} 更新完了: ${blockStandings.length}チーム`);

        results.push({
          block_name: blockName,
          phase,
          status: 'success',
          message: '順位表を再計算しました',
          teams_count: blockStandings.length
        });

      } catch (error) {
        console.error(`[RECALCULATE_STANDINGS] ブロック ${blockName} でエラー:`, error);

        results.push({
          block_name: blockName,
          phase,
          status: 'error',
          message: error instanceof Error ? error.message : '計算中にエラーが発生しました'
        });
      }
    }

    // 成功・失敗の集計
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    console.log(`[RECALCULATE_STANDINGS] 完了: 成功=${successCount}, エラー=${errorCount}, スキップ=${skippedCount}`);

    // 決勝トーナメント進出条件の検証と自動修正
    let validationResult;
    let autoFixResult;
    try {
      console.log(`[RECALCULATE_STANDINGS] 決勝トーナメント進出条件チェック開始...`);
      validationResult = await validateFinalTournamentPromotions(tournamentId);

      if (!validationResult.isValid && validationResult.issues.length > 0) {
        console.log(`[RECALCULATE_STANDINGS] ${validationResult.issues.length}件の問題を検出、自動修正を実行...`);
        autoFixResult = await autoFixPromotionIssues(tournamentId, validationResult.issues);

        console.log(`[RECALCULATE_STANDINGS] 自動修正完了: 成功=${autoFixResult.fixedCount}件, 失敗=${autoFixResult.failedCount}件`);
      } else {
        console.log(`[RECALCULATE_STANDINGS] 決勝トーナメント進出条件: 問題なし`);
      }
    } catch (validationError) {
      console.error(`[RECALCULATE_STANDINGS] 進出条件チェックでエラー:`, validationError);
      // チェックエラーは致命的ではないため処理は継続
    }

    // レスポンス作成
    const response: {
      success: boolean;
      message: string;
      tournament_name: string;
      results: typeof results;
      summary: {
        total_blocks: number;
        success: number;
        error: number;
        skipped: number;
      };
      promotion_validation?: {
        checked: boolean;
        is_valid: boolean;
        issues_found: number;
        auto_fixed: number;
        fix_failed: number;
        details: typeof validationResult;
      };
    } = {
      success: true,
      message: `順位表の再計算が完了しました（成功: ${successCount}件, エラー: ${errorCount}件, スキップ: ${skippedCount}件）`,
      tournament_name: tournamentName,
      results,
      summary: {
        total_blocks: blocks.rows.length,
        success: successCount,
        error: errorCount,
        skipped: skippedCount
      }
    };

    // 進出条件チェック結果を追加
    if (validationResult) {
      response.promotion_validation = {
        checked: true,
        is_valid: validationResult.isValid,
        issues_found: validationResult.issues.length,
        auto_fixed: autoFixResult?.fixedCount || 0,
        fix_failed: autoFixResult?.failedCount || 0,
        details: validationResult
      };

      // 問題が検出された場合はメッセージを更新
      if (!validationResult.isValid) {
        const fixedMsg = autoFixResult?.fixedCount
          ? ` ${autoFixResult.fixedCount}件の進出条件を自動修正しました。`
          : '';
        response.message += fixedMsg;
      }
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('[RECALCULATE_STANDINGS] エラー:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '順位表の再計算に失敗しました',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}
