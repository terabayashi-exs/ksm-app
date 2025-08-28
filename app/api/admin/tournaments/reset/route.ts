import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// テスト用大会IDの定数
const TEST_TOURNAMENT_IDS = [9, 10, 11];

interface ResetRequest {
  tournament_ids: number[];
  reset_level: 'level1' | 'level2' | 'level3';
  confirm_password?: string;
}

interface ResetResult {
  success: boolean;
  message: string;
  details?: {
    tournaments_reset: number[];
    matches_reset: number;
    results_cleared: number;
    level_applied: string;
  };
  error?: string;
}

/**
 * テスト大会リセット機能
 * POST /api/admin/tournaments/reset
 */
export async function POST(request: NextRequest): Promise<NextResponse<ResetResult>> {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({
        success: false,
        message: '管理者権限が必要です',
        error: 'UNAUTHORIZED'
      }, { status: 401 });
    }

    const body: ResetRequest = await request.json();
    const { tournament_ids, reset_level } = body;

    // バリデーション
    if (!tournament_ids || !Array.isArray(tournament_ids) || tournament_ids.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'tournament_ids が必要です',
        error: 'INVALID_REQUEST'
      }, { status: 400 });
    }

    if (!reset_level || !['level1', 'level2', 'level3'].includes(reset_level)) {
      return NextResponse.json({
        success: false,
        message: 'reset_level は level1, level2, level3 のいずれかである必要があります',
        error: 'INVALID_REQUEST'
      }, { status: 400 });
    }

    // 安全チェック: テスト用大会IDのみ許可
    const invalidIds = tournament_ids.filter(id => !TEST_TOURNAMENT_IDS.includes(id));
    if (invalidIds.length > 0) {
      return NextResponse.json({
        success: false,
        message: `許可されていない大会ID: ${invalidIds.join(', ')}. テスト用大会ID（${TEST_TOURNAMENT_IDS.join(', ')}）のみ許可されています`,
        error: 'FORBIDDEN_TOURNAMENT_IDS'
      }, { status: 403 });
    }

    // リセット実行
    const result = await executeReset(tournament_ids, reset_level);

    // 操作ログ記録
    console.log(`[TOURNAMENT_RESET] User: ${session.user.email}, Tournament IDs: [${tournament_ids.join(', ')}], Level: ${reset_level}, Time: ${new Date().toISOString()}`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('[TOURNAMENT_RESET_ERROR]', error);
    return NextResponse.json({
      success: false,
      message: 'リセット処理中にエラーが発生しました',
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
    }, { status: 500 });
  }
}

/**
 * リセット処理実行
 */
async function executeReset(tournament_ids: number[], reset_level: string): Promise<ResetResult> {
  const tournamentIdList = tournament_ids.join(', ');
  let matchesReset = 0;
  let resultsCleared = 0;

  try {
    if (reset_level === 'level1') {
      // Level 1: 試合結果のみリセット（チーム振り分けは維持）
      
      // 1. 確定済み試合結果を削除
      const deleteFinalized = await db.execute(`
        DELETE FROM t_matches_final 
        WHERE match_id IN (
          SELECT ml.match_id 
          FROM t_matches_live ml 
          JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
          WHERE mb.tournament_id IN (${tournamentIdList})
        )
      `);
      
      resultsCleared = deleteFinalized.rowsAffected || 0;

      // 2. 試合状態を初期化
      const resetMatches = await db.execute(`
        UPDATE t_matches_live SET
          team1_scores = '[]',
          team2_scores = '[]', 
          winner_team_id = NULL,
          is_draw = 0,
          is_walkover = 0,
          match_status = 'scheduled',
          result_status = 'none',
          confirmed_by = NULL,
          remarks = NULL,
          updated_at = datetime('now', '+9 hours')
        WHERE match_block_id IN (
          SELECT mb.match_block_id 
          FROM t_match_blocks mb 
          WHERE mb.tournament_id IN (${tournamentIdList})
        )
      `);

      matchesReset = resetMatches.rowsAffected || 0;

      // 3. ブロック順位表をクリア
      await db.execute(`
        UPDATE t_match_blocks SET
          team_rankings = NULL,
          updated_at = datetime('now', '+9 hours')
        WHERE tournament_id IN (${tournamentIdList})
      `);

      // 4. 試合状態履歴を削除
      await db.execute(`
        DELETE FROM t_match_status 
        WHERE match_id IN (
          SELECT ml.match_id 
          FROM t_matches_live ml 
          JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
          WHERE mb.tournament_id IN (${tournamentIdList})
        )
      `);

    } else if (reset_level === 'level2') {
      // Level 2: 組み合わせもリセット（チーム振り分けクリア）
      
      // Level 1の処理を実行
      const level1Result = await executeReset(tournament_ids, 'level1');
      matchesReset = level1Result.details?.matches_reset || 0;
      resultsCleared = level1Result.details?.results_cleared || 0;

      // 追加: チーム振り分けをクリア
      await db.execute(`
        UPDATE t_tournament_teams SET
          assigned_block = NULL,
          block_position = NULL,
          updated_at = datetime('now', '+9 hours')
        WHERE tournament_id IN (${tournamentIdList})
      `);

      // 試合のチーム割り当てをクリア
      await db.execute(`
        UPDATE t_matches_live SET
          team1_id = NULL,
          team2_id = NULL,
          updated_at = datetime('now', '+9 hours')
        WHERE match_block_id IN (
          SELECT mb.match_block_id 
          FROM t_match_blocks mb 
          WHERE mb.tournament_id IN (${tournamentIdList})
        )
      `);

    } else if (reset_level === 'level3') {
      // Level 3: 完全リセット（危険）
      
      // Level 2の処理を実行
      const level2Result = await executeReset(tournament_ids, 'level2');
      matchesReset = level2Result.details?.matches_reset || 0;
      resultsCleared = level2Result.details?.results_cleared || 0;

      // 追加: 試合スケジュール削除
      await db.execute(`
        DELETE FROM t_matches_live 
        WHERE match_block_id IN (
          SELECT mb.match_block_id 
          FROM t_match_blocks mb 
          WHERE mb.tournament_id IN (${tournamentIdList})
        )
      `);

      // ブロック削除
      await db.execute(`
        DELETE FROM t_match_blocks 
        WHERE tournament_id IN (${tournamentIdList})
      `);
    }

    return {
      success: true,
      message: `${getLevelDescription(reset_level)}が完了しました`,
      details: {
        tournaments_reset: tournament_ids,
        matches_reset: matchesReset,
        results_cleared: resultsCleared,
        level_applied: reset_level
      }
    };

  } catch (error) {
    console.error('[RESET_EXECUTION_ERROR]', error);
    throw new Error(`リセット処理の実行中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * レベル説明取得
 */
function getLevelDescription(level: string): string {
  switch (level) {
    case 'level1':
      return '試合結果リセット';
    case 'level2':
      return '組み合わせリセット';
    case 'level3':
      return '完全リセット';
    default:
      return 'リセット';
  }
}

/**
 * 大会情報取得（GET リクエスト）
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    // テスト大会の情報を取得
    const tournamentsResult = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        (SELECT COUNT(*) FROM t_tournament_teams WHERE tournament_id = t.tournament_id) as team_count,
        (SELECT COUNT(*) FROM t_matches_live ml JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id WHERE mb.tournament_id = t.tournament_id) as match_count,
        (SELECT COUNT(*) FROM t_matches_final mf JOIN t_matches_live ml ON mf.match_id = ml.match_id JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id WHERE mb.tournament_id = t.tournament_id) as results_count
      FROM t_tournaments t
      WHERE tournament_id IN (${TEST_TOURNAMENT_IDS.join(', ')})
      ORDER BY tournament_id
    `);

    return NextResponse.json({
      success: true,
      data: {
        test_tournaments: tournamentsResult.rows,
        allowed_levels: {
          level1: 'trial-results-only',
          level2: 'including-draw',
          level3: 'complete-reset'
        }
      }
    });

  } catch (error) {
    console.error('[GET_TEST_TOURNAMENTS_ERROR]', error);
    return NextResponse.json({
      success: false,
      error: 'データ取得中にエラーが発生しました'
    }, { status: 500 });
  }
}