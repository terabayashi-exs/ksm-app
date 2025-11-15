// app/api/admin/blob-statistics/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { TournamentBlobArchiver } from '@/lib/tournament-blob-archiver';
import { getArchivedTournamentsList } from '@/lib/tournament-json-archiver';
import { BlobStorage } from '@/lib/blob-storage';

/**
 * Blob Storage統計情報取得API（管理者用）
 */
export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    console.log('📊 Blob統計情報を取得中...');

    const stats = {
      timestamp: new Date().toISOString(),
      blob_status: {
        enabled: !!process.env.BLOB_READ_WRITE_TOKEN,
        health: { healthy: false, latency_ms: 0, error: undefined as string | undefined }
      },
      archives: {
        blob_count: 0,
        database_count: 0,
        total_size_kb: 0,
        blob_only: [] as Array<{ tournament_id: number; tournament_name: string }>,
        database_only: [] as Array<{ tournament_id: number; tournament_name: string }>,
        matched: 0
      },
      performance: {
        blob_avg_latency_ms: 0,
        database_avg_latency_ms: 0,
        improvement_percent: 0
      },
      storage_breakdown: {
        total_files: 0,
        index_size_kb: 0,
        average_archive_size_kb: 0,
        largest_archive: { tournament_id: 0, size_kb: 0, name: '' },
        smallest_archive: { tournament_id: 0, size_kb: 0, name: '' }
      }
    };

    // 1. Blob Storageヘルスチェック
    if (stats.blob_status.enabled) {
      try {
        const healthResult = await BlobStorage.healthCheck();
        stats.blob_status.health = {
          healthy: healthResult.healthy,
          latency_ms: healthResult.latency_ms,
          error: healthResult.error
        };
        console.log(`💚 Blob health check: ${stats.blob_status.health.healthy ? 'OK' : 'NG'} (${stats.blob_status.health.latency_ms}ms)`);
      } catch (error) {
        stats.blob_status.health.error = error instanceof Error ? error.message : 'Health check failed';
        console.log(`💔 Blob health check failed:`, error);
      }
    }

    // 2. アーカイブ統計を取得
    let blobArchives: Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      file_size?: number;
    }> = [];
    let dbArchives: Array<{
      tournament_id: number;
      tournament_name: string;
    }> = [];

    try {
      // Blobアーカイブ
      if (stats.blob_status.enabled) {
        const blobStart = performance.now();
        blobArchives = await TournamentBlobArchiver.getArchiveIndex();
        const blobDuration = performance.now() - blobStart;
        stats.performance.blob_avg_latency_ms = Math.round(blobDuration);
        
        console.log(`📦 Blob archives: ${blobArchives.length}件 (${Math.round(blobDuration)}ms)`);
      }

      // データベースアーカイブ
      const dbStart = performance.now();
      const dbArchivesList = await getArchivedTournamentsList();
      dbArchives = dbArchivesList.map(archive => ({
        tournament_id: archive.tournament_id as number,
        tournament_name: archive.tournament_name as string
      }));
      const dbDuration = performance.now() - dbStart;
      stats.performance.database_avg_latency_ms = Math.round(dbDuration);
      
      console.log(`💾 Database archives: ${dbArchives.length}件 (${Math.round(dbDuration)}ms)`);

      // パフォーマンス比較
      if (stats.performance.blob_avg_latency_ms > 0 && stats.performance.database_avg_latency_ms > 0) {
        const improvement = ((stats.performance.database_avg_latency_ms - stats.performance.blob_avg_latency_ms) / stats.performance.database_avg_latency_ms) * 100;
        stats.performance.improvement_percent = Math.round(improvement);
      }

    } catch (error) {
      console.error('アーカイブ統計取得エラー:', error);
    }

    // 3. アーカイブ分析
    stats.archives.blob_count = blobArchives.length;
    stats.archives.database_count = dbArchives.length;

    // IDの突合
    const blobIds = new Set(blobArchives.map(a => a.tournament_id));
    const dbIds = new Set(dbArchives.map(a => a.tournament_id));

    stats.archives.blob_only = blobArchives
      .filter(a => !dbIds.has(a.tournament_id))
      .map(a => ({ tournament_id: a.tournament_id, tournament_name: a.tournament_name }));

    stats.archives.database_only = dbArchives
      .filter(a => !blobIds.has(a.tournament_id))
      .map(a => ({ tournament_id: a.tournament_id, tournament_name: a.tournament_name }));

    stats.archives.matched = blobArchives.filter(a => dbIds.has(a.tournament_id)).length;

    // 4. ストレージ分析（Blobのみ）
    if (blobArchives.length > 0) {
      const sizes = blobArchives
        .filter(a => a.file_size)
        .map(a => ({ 
          tournament_id: a.tournament_id, 
          tournament_name: a.tournament_name,
          size_kb: Math.round((a.file_size || 0) / 1024) 
        }));

      if (sizes.length > 0) {
        stats.archives.total_size_kb = sizes.reduce((sum, s) => sum + s.size_kb, 0);
        stats.storage_breakdown.average_archive_size_kb = Math.round(stats.archives.total_size_kb / sizes.length);
        
        sizes.sort((a, b) => b.size_kb - a.size_kb);
        stats.storage_breakdown.largest_archive = {
          tournament_id: sizes[0].tournament_id,
          size_kb: sizes[0].size_kb,
          name: sizes[0].tournament_name
        };
        stats.storage_breakdown.smallest_archive = {
          tournament_id: sizes[sizes.length - 1].tournament_id,
          size_kb: sizes[sizes.length - 1].size_kb,
          name: sizes[sizes.length - 1].tournament_name
        };
      }

      // インデックスファイルサイズ
      try {
        const indexFiles = await BlobStorage.list({ prefix: 'tournaments/index.json' });
        stats.storage_breakdown.total_files = indexFiles.length + blobArchives.length;
      } catch (error) {
        console.warn('インデックスファイル統計取得エラー:', error);
      }
    }

    console.log(`✅ 統計情報取得完了`);
    console.log(`  Blob: ${stats.archives.blob_count}件, DB: ${stats.archives.database_count}件`);
    console.log(`  一致: ${stats.archives.matched}件, Blobのみ: ${stats.archives.blob_only.length}件, DBのみ: ${stats.archives.database_only.length}件`);

    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Blob統計情報取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'Blob統計情報取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

/**
 * 一括操作実行API
 */
export async function POST(request: Request) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const { action, tournament_ids } = await request.json();

    console.log(`🔧 一括操作実行: ${action} (対象: ${tournament_ids?.length || 0}件)`);

    const results = {
      action,
      total: tournament_ids?.length || 0,
      success: 0,
      failed: 0,
      errors: [] as Array<{ tournament_id?: number; error: string }>
    };

    switch (action) {
      case 'delete_blob_archives':
        // Blobアーカイブの一括削除
        if (!Array.isArray(tournament_ids)) {
          throw new Error('tournament_ids is required');
        }

        for (const tournamentId of tournament_ids) {
          try {
            const success = await TournamentBlobArchiver.deleteArchive(tournamentId);
            if (success) {
              results.success++;
              console.log(`  ✅ 削除成功: 大会ID ${tournamentId}`);
            } else {
              results.failed++;
              results.errors.push({ tournament_id: tournamentId, error: 'Delete operation failed' });
              console.log(`  ❌ 削除失敗: 大会ID ${tournamentId}`);
            }
          } catch (error) {
            results.failed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.errors.push({ tournament_id: tournamentId, error: errorMessage });
            console.error(`  ❌ 削除エラー (大会ID ${tournamentId}):`, error);
          }
        }
        break;

      case 'rebuild_index':
        // インデックス再構築
        try {
          // 全Blobアーカイブを取得してインデックスを再構築する処理
          // 実装は複雑になるため、ここでは基本的な処理のみ
          console.log('🔄 インデックス再構築は現在サポートされていません');
          throw new Error('インデックス再構築機能は未実装です');
        } catch (error) {
          results.failed = 1;
          results.errors.push({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    console.log(`✅ 一括操作完了: ${results.success}成功 / ${results.failed}失敗`);

    return NextResponse.json({
      success: true,
      message: `一括操作が完了しました: ${results.success}件成功, ${results.failed}件失敗`,
      data: results
    });

  } catch (error) {
    console.error('一括操作エラー:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '一括操作中にエラーが発生しました' },
      { status: 500 }
    );
  }
}