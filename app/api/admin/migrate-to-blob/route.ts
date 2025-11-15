// app/api/admin/migrate-to-blob/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { TournamentBlobArchiver } from '@/lib/tournament-blob-archiver';
import { BlobStorage } from '@/lib/blob-storage';

/**
 * 既存DBアーカイブをBlobに移行するAPI
 */

interface MigrationResult {
  success: boolean;
  summary: {
    total_archives: number;
    migrated_success: number;
    migrated_failed: number;
    already_migrated: number;
    execution_time_ms: number;
  };
  details: {
    successful_migrations: Array<{
      tournament_id: number;
      tournament_name: string;
      file_size_kb: number;
      duration_ms: number;
    }>;
    failed_migrations: Array<{
      tournament_id: number;
      tournament_name: string;
      error: string;
      duration_ms: number;
    }>;
    skipped_migrations: Array<{
      tournament_id: number;
      tournament_name: string;
      reason: string;
    }>;
  };
  indexEntries?: Array<{
    tournament_id: number;
    tournament_name: string;
    archived_at: string;
    archived_by: string;
    file_size: number;
    blob_url: string;
    metadata: {
      total_teams: number;
      total_matches: number;
      archive_ui_version: string;
    };
  }>;
}

/**
 * 移行実行API
 */
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

    // Blob Storageの利用可能性チェック
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'BLOB_READ_WRITE_TOKEN が設定されていません' },
        { status: 400 }
      );
    }

    const { mode = 'all', tournament_ids = [], dry_run = false } = await request.json();

    console.log(`🚀 Blob移行開始: mode=${mode}, dry_run=${dry_run}`);
    const startTime = performance.now();

    const result: MigrationResult = {
      success: true,
      summary: {
        total_archives: 0,
        migrated_success: 0,
        migrated_failed: 0,
        already_migrated: 0,
        execution_time_ms: 0
      },
      details: {
        successful_migrations: [],
        failed_migrations: [],
        skipped_migrations: []
      }
    };

    // 1. 移行対象のアーカイブを取得
    let targetArchives: Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      archived_by: string;
      tournament_data: string;
      teams_data: string;
      matches_data: string;
      standings_data: string;
      results_data: string | null;
      pdf_info_data: string | null;
      metadata: string | null;
    }> = [];
    
    if (mode === 'all') {
      // 全アーカイブを対象
      const dbResult = await db.execute(`
        SELECT 
          tournament_id,
          tournament_name,
          archived_at,
          archived_by,
          tournament_data,
          teams_data,
          matches_data,
          standings_data,
          results_data,
          pdf_info_data,
          metadata
        FROM t_archived_tournament_json
        ORDER BY archived_at DESC
      `);
      targetArchives = dbResult.rows as unknown as typeof targetArchives;
    } else if (mode === 'selective' && Array.isArray(tournament_ids)) {
      // 指定されたIDのみ
      if (tournament_ids.length === 0) {
        return NextResponse.json(
          { success: false, error: '移行対象のtournament_idsが指定されていません' },
          { status: 400 }
        );
      }
      
      const placeholders = tournament_ids.map(() => '?').join(',');
      const dbResult = await db.execute(`
        SELECT 
          tournament_id,
          tournament_name,
          archived_at,
          archived_by,
          tournament_data,
          teams_data,
          matches_data,
          standings_data,
          results_data,
          pdf_info_data,
          metadata
        FROM t_archived_tournament_json
        WHERE tournament_id IN (${placeholders})
        ORDER BY archived_at DESC
      `, tournament_ids);
      targetArchives = dbResult.rows as unknown as typeof targetArchives;
    } else {
      return NextResponse.json(
        { success: false, error: '無効なmodeまたはtournament_idsです' },
        { status: 400 }
      );
    }

    result.summary.total_archives = targetArchives.length;
    console.log(`📊 移行対象: ${targetArchives.length}件のアーカイブ`);

    if (targetArchives.length === 0) {
      console.log('✅ 移行対象のアーカイブがありません');
      result.summary.execution_time_ms = Math.round(performance.now() - startTime);
      return NextResponse.json({ success: true, result });
    }

    // 2. 既にBlobに存在するアーカイブをチェック
    console.log(`🔍 既存Blobアーカイブのチェック中...`);
    const existingBlobArchives = await TournamentBlobArchiver.getArchiveIndex();
    const existingBlobIds = new Set(existingBlobArchives.map(a => a.tournament_id));
    
    console.log(`📊 既存Blobアーカイブ数: ${existingBlobArchives.length}件`);
    console.log(`📋 初期の既存BlobIDs: [${Array.from(existingBlobIds).join(', ')}]`);
    
    if (existingBlobArchives.length > 0) {
      console.log(`📝 既存アーカイブ詳細:`);
      existingBlobArchives.forEach((archive, index) => {
        console.log(`   ${index + 1}. ID ${archive.tournament_id}: ${archive.tournament_name}`);
      });
    }

    // 3. 各アーカイブを移行
    console.log(`\n📋 移行対象一覧:`);
    targetArchives.forEach((archive, index) => {
      console.log(`  ${index + 1}. ID ${archive.tournament_id}: ${archive.tournament_name}`);
    });
    console.log('');

    for (let i = 0; i < targetArchives.length; i++) {
      const archive = targetArchives[i];
      const progress = `[${i + 1}/${targetArchives.length}]`;
      const migrationStart = performance.now();
      
      console.log(`\n${progress} 処理開始: ${archive.tournament_name} (ID: ${archive.tournament_id})`);
      console.log(`🔄 ループ状態: i=${i}, 残り=${targetArchives.length - i - 1}件`);

      try {
        // 既にBlobに存在するかチェック
        console.log(`  🔍 既存チェック: ID ${archive.tournament_id} は既存Blobリストに存在？`);
        console.log(`     現在のBlobIDs: [${Array.from(existingBlobIds).join(', ')}]`);
        console.log(`     チェック結果: ${existingBlobIds.has(archive.tournament_id)}`);
        
        // デバッグ: セット状態の詳細確認
        console.log(`     🔍 セット詳細: size=${existingBlobIds.size}, type=${typeof existingBlobIds}`);
        
        if (existingBlobIds.has(archive.tournament_id)) {
          const duration = Math.round(performance.now() - migrationStart);
          console.log(`  ⏭️ スキップ: 既にBlob移行済み (${duration}ms)`);
          
          result.summary.already_migrated++;
          result.details.skipped_migrations.push({
            tournament_id: archive.tournament_id,
            tournament_name: archive.tournament_name,
            reason: '既にBlob移行済み'
          });
          continue;
        }
        
        console.log(`  ✅ 新規移行対象として処理開始`);

        if (dry_run) {
          // ドライラン: 実際の移行は行わず、処理可能性のみチェック
          const duration = Math.round(performance.now() - migrationStart);
          console.log(`  ✅ ドライラン: 移行可能 (${duration}ms)`);
          
          result.summary.migrated_success++;
          result.details.successful_migrations.push({
            tournament_id: archive.tournament_id,
            tournament_name: archive.tournament_name,
            file_size_kb: 0, // ドライランではサイズ不明
            duration_ms: duration
          });
          continue;
        }

        // DBデータをBlob形式に変換
        console.log(`  📊 データ変換開始: ${archive.tournament_name}`);
        console.log(`     - tournament_data: ${archive.tournament_data?.length || 0} 文字`);
        console.log(`     - teams_data: ${archive.teams_data?.length || 0} 文字`);
        console.log(`     - matches_data: ${archive.matches_data?.length || 0} 文字`);
        console.log(`     - standings_data: ${archive.standings_data?.length || 0} 文字`);
        
        let tournamentArchive;
        try {
          tournamentArchive = {
            version: '1.0',
            archived_at: archive.archived_at,
            archived_by: archive.archived_by,
            tournament: JSON.parse(archive.tournament_data),
            teams: JSON.parse(archive.teams_data),
            matches: JSON.parse(archive.matches_data),
            standings: JSON.parse(archive.standings_data),
            results: JSON.parse(archive.results_data || '[]'),
            pdf_info: JSON.parse(archive.pdf_info_data || '{}'),
            metadata: JSON.parse(archive.metadata || '{}')
          };
          console.log(`  ✅ JSON解析完了: ${archive.tournament_name}`);
        } catch (parseError) {
          console.error(`  ❌ JSON解析失敗: ${archive.tournament_name}`, parseError);
          throw new Error(`JSON解析失敗: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        }

        // データサイズ計算
        const jsonString = JSON.stringify(tournamentArchive, null, 2);
        const fileSize = Buffer.byteLength(jsonString, 'utf8');
        console.log(`  📏 計算済みファイルサイズ: ${(fileSize / 1024).toFixed(2)} KB`);
        
        tournamentArchive.metadata.file_size = fileSize;

        // Blobに保存
        const archivePath = `tournaments/${archive.tournament_id}/archive.json`;
        console.log(`  💾 Blob保存開始: ${archivePath}`);
        await BlobStorage.putJson(archivePath, tournamentArchive);
        console.log(`  ✅ Blob保存完了: ${archivePath}`);

        // インデックス更新用データを準備（実際の更新は後で一括実行）
        console.log(`  📋 インデックスエントリ準備: ID=${archive.tournament_id}, Name="${archive.tournament_name}"`);
        console.log(`     BlobパスURL: ${archivePath}`);
        console.log(`     ファイルサイズ: ${fileSize} bytes (${(fileSize/1024).toFixed(2)} KB)`);
        
        const indexEntry = {
          tournament_id: archive.tournament_id,
          tournament_name: archive.tournament_name,
          archived_at: archive.archived_at,
          archived_by: archive.archived_by,
          file_size: fileSize,
          blob_url: archivePath,
          metadata: {
            total_teams: tournamentArchive.metadata.total_teams || 0,
            total_matches: tournamentArchive.metadata.total_matches || 0,
            archive_ui_version: tournamentArchive.metadata.archive_ui_version || '1.0'
          }
        };
        
        console.log(`     インデックスエントリ準備完了: ${JSON.stringify(indexEntry, null, 2)}`);
        
        // 🔍 重要: ローカルセットとインデックスエントリリストを更新
        console.log(`  🔄 ローカルIDセット更新前: [${Array.from(existingBlobIds).join(', ')}]`);
        existingBlobIds.add(archive.tournament_id);
        console.log(`  🔄 ローカルIDセット更新後: [${Array.from(existingBlobIds).join(', ')}]`);
        
        // インデックス更新用データを保存
        if (!result.indexEntries) {
          result.indexEntries = [];
        }
        result.indexEntries.push(indexEntry);

        // 移行完了後の検証
        console.log(`  🔍 移行検証開始: ${archive.tournament_name}`);
        const verificationResult = await BlobStorage.exists(archivePath);
        if (!verificationResult) {
          throw new Error(`移行後の検証失敗: ${archivePath} が存在しません`);
        }
        console.log(`  ✅ 移行検証完了: ${archive.tournament_name} - Blobファイル存在確認済み`);

        const duration = Math.round(performance.now() - migrationStart);
        console.log(`  🎉 移行完全成功 (${(fileSize / 1024).toFixed(2)} KB, ${duration}ms)`);

        result.summary.migrated_success++;
        result.details.successful_migrations.push({
          tournament_id: archive.tournament_id,
          tournament_name: archive.tournament_name,
          file_size_kb: Math.round(fileSize / 1024),
          duration_ms: duration
        });

      } catch (error) {
        const duration = Math.round(performance.now() - migrationStart);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        console.error(`  💥 移行失敗詳細: ${archive.tournament_name} (ID: ${archive.tournament_id})`);
        console.error(`     エラー: ${errorMessage}`);
        console.error(`     時間: ${duration}ms`);
        if (errorStack) {
          console.error(`     スタック: ${errorStack.split('\n').slice(0, 3).join('\n')}`);
        }

        // 部分的な状態をチェック
        try {
          const archivePath = `tournaments/${archive.tournament_id}/archive.json`;
          const blobExists = await BlobStorage.exists(archivePath);
          console.error(`     Blobファイル存在: ${blobExists ? 'あり' : 'なし'}`);
        } catch (checkError) {
          console.error(`     存在チェック失敗: ${checkError}`);
        }

        result.summary.migrated_failed++;
        result.details.failed_migrations.push({
          tournament_id: archive.tournament_id,
          tournament_name: archive.tournament_name,
          error: errorMessage,
          duration_ms: duration
        });
      }

      // API制限回避とBlob競合回避のため待機
      if (i < targetArchives.length - 1) {
        console.log(`  ⏳ 次の処理まで500ms待機...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`📋 次の処理に進みます: ${i + 2}/${targetArchives.length}`);
      } else {
        console.log(`🏁 全${targetArchives.length}件の処理が完了しました`);
      }
    }

    console.log(`\n🏁 ループ処理完了: ${targetArchives.length}件すべて処理済み`);
    console.log(`📊 現在の成功カウント: ${result.summary.migrated_success}`);
    console.log(`📊 現在の失敗カウント: ${result.summary.migrated_failed}`);
    
    // 🔄 一括インデックス更新処理
    if (result.summary.migrated_success > 0 && !dry_run && result.indexEntries && result.indexEntries.length > 0) {
      console.log(`\n📋 一括インデックス更新開始: ${result.indexEntries.length}件のエントリを処理...`);
      
      try {
        // 既存のインデックスを取得
        console.log(`🔍 既存インデックス取得中...`);
        const existingIndex = await TournamentBlobArchiver.getArchiveIndex();
        console.log(`   既存件数: ${existingIndex.length}件`);
        
        // 重複を除いてマージ
        const existingIds = new Set(existingIndex.map(entry => entry.tournament_id));
        const newEntries = result.indexEntries.filter(entry => !existingIds.has(entry.tournament_id));
        console.log(`   新規エントリ: ${newEntries.length}件`);
        
        // 🔄 インデックスを直接構築（updateIndex個別呼び出しを回避）
        console.log(`   📝 インデックスを直接構築中...`);
        
        const newIndex = {
          version: '1.0',
          updated_at: new Date().toISOString(),
          total_archives: existingIndex.length + newEntries.length,
          archives: [
            ...existingIndex,
            ...newEntries
          ].sort((a, b) => 
            new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime()
          )
        };
        
        console.log(`   📊 構築されたインデックス: ${newIndex.total_archives}件`);
        console.log(`   📋 アーカイブIDs: [${newIndex.archives.map(a => a.tournament_id).join(', ')}]`);
        
        // インデックスを直接保存
        console.log(`   💾 インデックス直接保存中...`);
        await BlobStorage.putJson('tournaments/index.json', newIndex as Record<string, unknown>);
        console.log(`   ✅ インデックス直接保存完了`);
        
        console.log(`✅ 一括インデックス更新完了: ${newEntries.length}件追加`);
        
        // 2秒待機してから最終確認
        console.log('🔍 インデックス更新の最終確認中...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const finalIndex = await TournamentBlobArchiver.getArchiveIndex();
        console.log(`📋 最終確認: ${finalIndex.length}件のアーカイブがインデックスに登録されています`);
        
        const expectedCount = result.summary.migrated_success + existingIndex.length;
        if (finalIndex.length !== expectedCount) {
          console.warn(`⚠️ 不整合検出: 期待件数(${expectedCount}) != 実際の登録数(${finalIndex.length})`);
        } else {
          console.log(`✅ インデックス整合性確認: 全${finalIndex.length}件が正常に登録されています`);
        }
        
      } catch (error) {
        console.error('❌ 一括インデックス更新でエラー:', error);
        result.success = false;
      }
    }
    
    result.summary.execution_time_ms = Math.round(performance.now() - startTime);

    // 4. 移行結果レポート
    console.log('\n📋 移行結果レポート');
    console.log(`✅ 成功: ${result.summary.migrated_success}件`);
    console.log(`❌ 失敗: ${result.summary.migrated_failed}件`);
    console.log(`⏭️ スキップ: ${result.summary.already_migrated}件`);
    console.log(`⏱️ 実行時間: ${(result.summary.execution_time_ms / 1000).toFixed(2)}秒`);
    
    // 成功したアーカイブの詳細
    if (result.details.successful_migrations.length > 0) {
      console.log('\n✅ 成功した移行:');
      result.details.successful_migrations.forEach(migration => {
        console.log(`   - ID ${migration.tournament_id}: ${migration.tournament_name} (${migration.file_size_kb}KB)`);
      });
    }
    
    // 失敗したアーカイブの詳細
    if (result.details.failed_migrations.length > 0) {
      console.log('\n❌ 失敗した移行:');
      result.details.failed_migrations.forEach(migration => {
        console.log(`   - ID ${migration.tournament_id}: ${migration.tournament_name}`);
        console.log(`     エラー: ${migration.error}`);
      });
    }

    if (dry_run) {
      console.log('🧪 ドライラン完了: 実際の移行は実行されていません');
    }

    // 移行に失敗があった場合はエラーレスポンス
    if (result.summary.migrated_failed > 0) {
      result.success = false;
    }

    return NextResponse.json({
      success: result.success,
      message: dry_run 
        ? `ドライラン完了: ${result.summary.migrated_success}件移行可能, ${result.summary.migrated_failed}件エラー`
        : `移行完了: ${result.summary.migrated_success}件成功, ${result.summary.migrated_failed}件失敗`,
      data: result
    });

  } catch (error) {
    console.error('🔥 移行処理中にエラーが発生しました:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '移行処理中にエラーが発生しました' 
      },
      { status: 500 }
    );
  }
}

/**
 * 移行可能性チェック（GET）
 */
export async function GET(_request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    console.log('🔍 移行可能性チェック開始...');

    const status = {
      blob_available: !!process.env.BLOB_READ_WRITE_TOKEN,
      blob_health: { healthy: false, latency_ms: 0, error: undefined as string | undefined },
      database_archives: { count: 0, total_size_mb: 0 },
      blob_archives: { count: 0, total_size_mb: 0 },
      migration_candidates: { count: 0, estimated_size_mb: 0 },
      estimated_time_minutes: 0
    };

    // Blob Storageヘルスチェック
    if (status.blob_available) {
      try {
        const healthResult = await BlobStorage.healthCheck();
        status.blob_health = {
          healthy: healthResult.healthy,
          latency_ms: healthResult.latency_ms,
          error: healthResult.error
        };
      } catch (error) {
        status.blob_health.error = error instanceof Error ? error.message : 'Health check failed';
      }
    }

    // データベースアーカイブ統計
    try {
      const dbResult = await db.execute(`
        SELECT 
          COUNT(*) as count,
          SUM(LENGTH(tournament_data) + LENGTH(teams_data) + LENGTH(matches_data) + 
              LENGTH(standings_data) + COALESCE(LENGTH(results_data), 0) + 
              COALESCE(LENGTH(pdf_info_data), 0)) as total_size
        FROM t_archived_tournament_json
      `);
      
      if (dbResult.rows.length > 0) {
        status.database_archives.count = dbResult.rows[0].count as number;
        status.database_archives.total_size_mb = Math.round((dbResult.rows[0].total_size as number) / (1024 * 1024));
      }
    } catch (error) {
      console.warn('データベース統計取得エラー:', error);
    }

    // Blobアーカイブ統計
    if (status.blob_available) {
      try {
        const blobArchives = await TournamentBlobArchiver.getArchiveIndex();
        status.blob_archives.count = blobArchives.length;
        status.blob_archives.total_size_mb = Math.round(
          blobArchives.reduce((sum, a) => sum + (a.file_size || 0), 0) / (1024 * 1024)
        );
      } catch (error) {
        console.warn('Blob統計取得エラー:', error);
      }
    }

    // 移行候補の計算
    status.migration_candidates.count = Math.max(0, status.database_archives.count - status.blob_archives.count);
    status.migration_candidates.estimated_size_mb = Math.round(
      status.migration_candidates.count * (status.database_archives.total_size_mb / Math.max(1, status.database_archives.count))
    );

    // 移行時間予測（1件あたり約5秒と仮定）
    status.estimated_time_minutes = Math.round(status.migration_candidates.count * 5 / 60);

    console.log(`✅ チェック完了: ${status.migration_candidates.count}件の移行候補`);

    return NextResponse.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('移行可能性チェックエラー:', error);
    return NextResponse.json(
      { success: false, error: '移行可能性チェック中にエラーが発生しました' },
      { status: 500 }
    );
  }
}