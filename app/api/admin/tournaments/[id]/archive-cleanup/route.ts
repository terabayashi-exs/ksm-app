// app/api/admin/tournaments/[id]/archive-cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

interface DeletionStep {
  phase: string;
  step: number;
  table: string;
  query: string;
  params: (string | number)[];
  description: string;
  expectedMinCount?: number;
}

interface DeletionResult {
  step: number;
  table: string;
  description: string;
  rowsDeleted: number;
  success: boolean;
  error?: string;
  executionTime: number;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * アーカイブ後のデータクリーンアップ専用API
 * 大会メインレコード（t_tournaments）は残して、関連データのみを削除する
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== 'admin') {
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

    // 1. 大会の存在確認
    console.log(`🔍 大会ID ${tournamentId} のアーカイブ後クリーンアップを開始`);
    
    const tournamentResult = await db.execute(`
      SELECT tournament_name, is_archived, archive_ui_version
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);
    
    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `大会ID ${tournamentId} が見つかりません` },
        { status: 404 }
      );
    }
    
    const tournament = tournamentResult.rows[0];
    
    // 2. 削除対象データの事前確認
    console.log(`📊 削除対象データの事前確認中...`);
    
    const preCheckQueries = [
      {
        name: 't_tournament_players',
        query: 'SELECT COUNT(*) as count FROM t_tournament_players WHERE tournament_id = ?'
      },
      {
        name: 't_tournament_notifications',
        query: 'SELECT COUNT(*) as count FROM t_tournament_notifications WHERE tournament_id = ?'
      },
      {
        name: 't_tournament_teams',
        query: 'SELECT COUNT(*) as count FROM t_tournament_teams WHERE tournament_id = ?'
      },
      {
        name: 't_match_blocks',
        query: 'SELECT COUNT(*) as count FROM t_match_blocks WHERE tournament_id = ?'
      },
      {
        name: 't_matches_live',
        query: `SELECT COUNT(*) as count FROM t_matches_live ml 
               JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
               WHERE mb.tournament_id = ?`
      },
      {
        name: 't_matches_final',
        query: `SELECT COUNT(*) as count FROM t_matches_final mf 
               JOIN t_matches_live ml ON mf.match_id = ml.match_id
               JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
               WHERE mb.tournament_id = ?`
      },
      {
        name: 't_match_status',
        query: `SELECT COUNT(*) as count FROM t_match_status ms 
               JOIN t_matches_live ml ON ms.match_id = ml.match_id
               JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
               WHERE mb.tournament_id = ?`
      }
    ];

    const preCheckResults: Record<string, number> = {};
    let totalRecordsToDelete = 0;

    for (const check of preCheckQueries) {
      try {
        const result = await db.execute(check.query, [tournamentId]);
        const count = Number(result.rows[0]?.count || 0);
        preCheckResults[check.name] = count;
        totalRecordsToDelete += count;
        console.log(`   - ${check.name}: ${count} 件`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`   - ${check.name}: 確認エラー (${errorMessage})`);
        preCheckResults[check.name] = 0;
      }
    }

    console.log(`📋 削除対象総レコード数: ${totalRecordsToDelete} 件`);
    console.log(`ℹ️  大会メインレコード（t_tournaments）は保持されます`);

    // 3. 関連データのみを削除する順序の定義（t_tournamentsは除外）
    const deletionSteps: DeletionStep[] = [
      // Phase 1: 最下位レイヤー（被参照されていないテーブル）
      {
        phase: 'Phase 1',
        step: 1,
        table: 't_tournament_players',
        query: 'DELETE FROM t_tournament_players WHERE tournament_id = ?',
        params: [tournamentId],
        description: '参加選手データの削除',
        expectedMinCount: 0
      },
      {
        phase: 'Phase 1',
        step: 2,
        table: 't_tournament_notifications',
        query: 'DELETE FROM t_tournament_notifications WHERE tournament_id = ?',
        params: [tournamentId],
        description: '大会通知データの削除'
      },

      // Phase 2: 試合関連テーブル（相互依存があるため慎重に順序化）
      {
        phase: 'Phase 2',
        step: 3,
        table: 't_match_status',
        query: `DELETE FROM t_match_status WHERE match_id IN (
          SELECT ml.match_id FROM t_matches_live ml 
          JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
          WHERE mb.tournament_id = ?
        )`,
        params: [tournamentId],
        description: '試合状態データの削除（第1段階）'
      },
      {
        phase: 'Phase 2',
        step: 4,
        table: 't_matches_final',
        query: `DELETE FROM t_matches_final WHERE match_id IN (
          SELECT ml.match_id FROM t_matches_live ml 
          JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
          WHERE mb.tournament_id = ?
        )`,
        params: [tournamentId],
        description: '確定済み試合結果の削除（第2段階）'
      },
      {
        phase: 'Phase 2',
        step: 5,
        table: 't_matches_live',
        query: `DELETE FROM t_matches_live WHERE match_block_id IN (
          SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
        )`,
        params: [tournamentId],
        description: '進行中試合データの削除（第3段階）'
      },

      // Phase 3: 中間レイヤー（他テーブルから参照されているテーブル）
      {
        phase: 'Phase 3',
        step: 6,
        table: 't_tournament_teams',
        query: 'DELETE FROM t_tournament_teams WHERE tournament_id = ?',
        params: [tournamentId],
        description: '参加チームデータの削除'
      },

      // Phase 4: 最上位レイヤー（最後に削除、but t_tournamentsは除外）
      {
        phase: 'Phase 4',
        step: 7,
        table: 't_match_blocks',
        query: 'DELETE FROM t_match_blocks WHERE tournament_id = ?',
        params: [tournamentId],
        description: '試合ブロックデータの削除（最終段階）'
      }

      // 注意: t_tournaments テーブルは削除しない（アーカイブ化のため）
      // 注意: t_archived_tournament_json も削除しない（アーカイブデータ保持のため）
    ];

    // 4. 段階的削除の実行
    console.log(`🗑️  関連データのみの段階的削除を開始（大会メインレコードは保持）...`);
    
    const deletionResults: DeletionResult[] = [];
    let totalDeletedRecords = 0;
    let currentPhase = '';

    for (const step of deletionSteps) {
      const startTime = Date.now();
      
      // フェーズの変更を通知
      if (currentPhase !== step.phase) {
        currentPhase = step.phase;
        console.log(`\n📋 ${step.phase}: ${step.phase === 'Phase 1' ? '最下位レイヤー削除' : 
                   step.phase === 'Phase 2' ? '試合関連データ削除' :
                   step.phase === 'Phase 3' ? '中間レイヤー削除' : 
                   step.phase === 'Phase 4' ? '最上位レイヤー削除' : 'その他'}（t_tournaments除く）`);
      }

      try {
        console.log(`🔄 Step ${step.step}: ${step.description}...`);
        
        // 削除実行
        const deleteResult = await db.execute(step.query, step.params);
        const rowsDeleted = deleteResult.rowsAffected || 0;
        const executionTime = Date.now() - startTime;
        
        console.log(`   ✅ ${step.table}: ${rowsDeleted} 件削除 (${executionTime}ms)`);
        
        // 期待値との比較
        if (step.expectedMinCount !== undefined && rowsDeleted < step.expectedMinCount) {
          console.warn(`   ⚠️  期待削除数 ${step.expectedMinCount} より少ない削除数: ${rowsDeleted}`);
        }
        
        totalDeletedRecords += rowsDeleted;
        
        deletionResults.push({
          step: step.step,
          table: step.table,
          description: step.description,
          rowsDeleted: rowsDeleted,
          success: true,
          executionTime: executionTime
        });

      } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        console.error(`   ❌ Step ${step.step} (${step.table}): 削除エラー`);
        console.error(`      エラー詳細: ${errorMessage}`);
        
        deletionResults.push({
          step: step.step,
          table: step.table,
          description: step.description,
          rowsDeleted: 0,
          success: false,
          error: errorMessage,
          executionTime: executionTime
        });

        // 重要なテーブルでエラーが発生した場合は処理を中断
        if (['t_matches_live', 't_matches_final', 't_match_blocks'].includes(step.table)) {
          console.error(`🚨 重要テーブル ${step.table} の削除に失敗しました。処理を中断します。`);
          
          return NextResponse.json({
            success: false,
            error: `重要テーブル ${step.table} の削除に失敗しました`,
            details: errorMessage,
            deletionResults: deletionResults,
            partialDeletion: true,
            totalDeletedRecords: totalDeletedRecords
          }, { status: 500 });
        }
      }
    }

    // 5. 削除後の確認
    console.log(`\n📊 削除処理完了 - 結果確認中...`);
    
    const postCheckResults: Record<string, number> = {};
    for (const check of preCheckQueries) {
      try {
        const result = await db.execute(check.query, [tournamentId]);
        const count = Number(result.rows[0]?.count || 0);
        postCheckResults[check.name] = count;
        
        if (count > 0) {
          console.warn(`   ⚠️  ${check.name}: ${count} 件が残存`);
        } else {
          console.log(`   ✅ ${check.name}: 完全削除`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`   - ${check.name}: 確認エラー (${errorMessage})`);
      }
    }

    // 6. 大会メインレコードの確認（残っているべき）
    const mainRecordResult = await db.execute(`
      SELECT tournament_name, is_archived FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);
    
    if (mainRecordResult.rows.length > 0) {
      console.log(`✅ 大会メインレコードは正しく保持されています: ${mainRecordResult.rows[0].tournament_name}`);
    } else {
      console.error(`❌ 大会メインレコードが意図せず削除されてしまいました`);
    }

    // 7. アーカイブ状態の更新
    try {
      await db.execute(`
        UPDATE t_tournaments 
        SET is_archived = 1, archived_at = datetime('now', '+9 hours')
        WHERE tournament_id = ?
      `, [tournamentId]);
      console.log(`✅ 大会レコードをアーカイブ状態に更新しました`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`⚠️  アーカイブ状態更新でエラー: ${errorMessage}`);
    }

    // 8. 結果サマリーの生成
    const successfulSteps = deletionResults.filter(r => r.success);
    const failedSteps = deletionResults.filter(r => !r.success);
    const totalExecutionTime = deletionResults.reduce((sum, r) => sum + r.executionTime, 0);
    
    const remainingRecords = Object.values(postCheckResults).reduce((sum, count) => sum + count, 0);

    console.log(`\n🎉 アーカイブ後クリーンアップ完了サマリー:`);
    console.log(`   - 成功ステップ: ${successfulSteps.length}/${deletionResults.length}`);
    console.log(`   - 削除レコード数: ${totalDeletedRecords}`);
    console.log(`   - 残存関連レコード数: ${remainingRecords}`);
    console.log(`   - 大会メインレコード: 保持`);
    console.log(`   - 総実行時間: ${totalExecutionTime}ms`);

    return NextResponse.json({
      success: true,
      message: `大会ID ${tournamentId} の関連データを削除しました（メインレコードは保持）`,
      tournamentName: tournament.tournament_name,
      deletionSummary: {
        totalSteps: deletionResults.length,
        successfulSteps: successfulSteps.length,
        failedSteps: failedSteps.length,
        totalDeletedRecords: totalDeletedRecords,
        remainingRecords: remainingRecords,
        totalExecutionTime: totalExecutionTime,
        tournamentMainDeleted: false,  // アーカイブ用なので false
        archiveCleanupMode: true
      },
      preCheckResults: preCheckResults,
      postCheckResults: postCheckResults,
      deletionResults: deletionResults,
      recommendation: 'アーカイブ後の関連データクリーンアップが正常に完了しました。大会メインレコードは保持されています。'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ アーカイブクリーンアップ処理で予期しないエラーが発生:', error);
    
    return NextResponse.json({
      success: false,
      error: 'アーカイブクリーンアップ処理中に予期しないエラーが発生しました',
      details: errorMessage
    }, { status: 500 });
  }
}