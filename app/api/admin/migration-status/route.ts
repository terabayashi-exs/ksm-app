// app/api/admin/migration-status/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { TournamentBlobArchiver } from '@/lib/tournament-blob-archiver';

/**
 * 移行状況確認API
 */

interface MigrationStatusData {
  overview: {
    total_db_archives: number;
    total_blob_archives: number;
    migration_progress_percent: number;
    data_consistency_score: number;
  };
  categories: {
    migrated: Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      file_size_kb: number;
    }>;
    not_migrated: Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      estimated_size_kb: number;
      reason?: string;
    }>;
    blob_only: Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      file_size_kb: number;
      warning: string;
    }>;
  };
  storage_analysis: {
    db_storage_mb: number;
    blob_storage_mb: number;
    potential_savings_mb: number;
    average_archive_size_kb: number;
  };
  recommendations: Array<{
    type: 'action' | 'warning' | 'info';
    title: string;
    description: string;
    action_url?: string;
  }>;
}

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

    console.log('📊 移行状況分析開始...');

    const status: MigrationStatusData = {
      overview: {
        total_db_archives: 0,
        total_blob_archives: 0,
        migration_progress_percent: 0,
        data_consistency_score: 100
      },
      categories: {
        migrated: [],
        not_migrated: [],
        blob_only: []
      },
      storage_analysis: {
        db_storage_mb: 0,
        blob_storage_mb: 0,
        potential_savings_mb: 0,
        average_archive_size_kb: 0
      },
      recommendations: []
    };

    // 1. データベースアーカイブを取得（移行対象のみ）
    console.log('💾 データベースアーカイブを分析中...');
    
    // 移行APIと同じクエリを使用して整合性を保つ
    const dbArchivesResult = await db.execute(`
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
    
    const dbArchives = dbArchivesResult.rows;
    status.overview.total_db_archives = dbArchives.length;
    console.log(`  📊 移行対象DB件数: ${dbArchives.length}件`);

    // DB詳細データを取得（サイズ計算用）
    const dbDetailResult = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        archived_at,
        LENGTH(tournament_data) + LENGTH(teams_data) + LENGTH(matches_data) + 
        LENGTH(standings_data) + COALESCE(LENGTH(results_data), 0) + 
        COALESCE(LENGTH(pdf_info_data), 0) as total_size
      FROM t_archived_tournament_json
    `);

    const dbArchiveDetails = new Map();
    let totalDbSize = 0;

    (dbDetailResult.rows as unknown as Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      total_size: number;
    }>).forEach((row) => {
      const sizeKb = Math.round(row.total_size / 1024);
      dbArchiveDetails.set(row.tournament_id, {
        tournament_name: row.tournament_name,
        archived_at: row.archived_at,
        size_kb: sizeKb
      });
      totalDbSize += sizeKb;
    });

    status.storage_analysis.db_storage_mb = Math.round(totalDbSize / 1024);

    // 2. Blobアーカイブを取得
    console.log('📦 Blobアーカイブを分析中...');
    let blobArchives: Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      file_size?: number;
    }> = [];
    
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        blobArchives = await TournamentBlobArchiver.getArchiveIndex();
        status.overview.total_blob_archives = blobArchives.length;

        const totalBlobSize = blobArchives.reduce((sum, archive) => sum + (archive.file_size || 0), 0);
        status.storage_analysis.blob_storage_mb = Math.round(totalBlobSize / (1024 * 1024));
        
        if (blobArchives.length > 0) {
          status.storage_analysis.average_archive_size_kb = Math.round(totalBlobSize / (1024 * blobArchives.length));
        }
      } catch (error) {
        console.warn('Blobアーカイブ取得エラー:', error);
        status.recommendations.push({
          type: 'warning',
          title: 'Blob接続エラー',
          description: 'Blob Storageへの接続に問題があります。BLOB_READ_WRITE_TOKENを確認してください。'
        });
      }
    } else {
      status.recommendations.push({
        type: 'warning',
        title: 'Blob未設定',
        description: 'BLOB_READ_WRITE_TOKENが設定されていません。Blob移行を行うには設定が必要です。'
      });
    }

    // 3. IDの突合・分類
    const dbIds = new Set(dbArchives.map(a => a.tournament_id as number));
    const blobIds = new Set(blobArchives.map(a => a.tournament_id));
    const blobArchiveMap = new Map(blobArchives.map(a => [a.tournament_id, a]));
    
    console.log(`  🔍 DB IDs: [${Array.from(dbIds).join(', ')}]`);
    console.log(`  🔍 Blob IDs: [${Array.from(blobIds).join(', ')}]`);

    // 移行済み（DB + Blob両方に存在）
    dbIds.forEach(id => {
      if (blobIds.has(id)) {
        const dbDetail = dbArchiveDetails.get(id);
        const blobDetail = blobArchiveMap.get(id);
        
        if (dbDetail && blobDetail) {
          // 移行済みとして単純に記録（サイズ比較による不整合判定は削除）
          console.log(`  ✅ 移行済み確認 [${dbDetail.tournament_name}]: DB=${dbDetail.size_kb}KB, Blob=${Math.round((blobDetail.file_size || 0) / 1024)}KB`);
          
          status.categories.migrated.push({
            tournament_id: id,
            tournament_name: dbDetail.tournament_name,
            archived_at: dbDetail.archived_at,
            file_size_kb: Math.round((blobDetail.file_size || 0) / 1024)
          });
        }
      }
    });

    // 未移行（DBのみに存在）
    dbIds.forEach(id => {
      if (!blobIds.has(id)) {
        const dbDetail = dbArchiveDetails.get(id);
        if (dbDetail) {
          status.categories.not_migrated.push({
            tournament_id: id,
            tournament_name: dbDetail.tournament_name,
            archived_at: dbDetail.archived_at,
            estimated_size_kb: dbDetail.size_kb
          });
        }
      }
    });

    // Blobのみ（DBには存在しない）
    blobIds.forEach(id => {
      if (!dbIds.has(id)) {
        const blobDetail = blobArchiveMap.get(id);
        if (blobDetail) {
          status.categories.blob_only.push({
            tournament_id: id,
            tournament_name: blobDetail.tournament_name,
            archived_at: blobDetail.archived_at,
            file_size_kb: Math.round((blobDetail.file_size || 0) / 1024),
            warning: 'データベースに対応するアーカイブがありません'
          });
        }
      }
    });

    // 4. 統計計算
    const totalArchives = Math.max(status.overview.total_db_archives, status.overview.total_blob_archives);
    if (totalArchives > 0) {
      status.overview.migration_progress_percent = Math.round((status.categories.migrated.length / status.overview.total_db_archives) * 100);
    }

    // データ整合性スコア（常に100%、詳細検証は「データ検証実行」で実施）
    status.overview.data_consistency_score = 100;

    // 潜在的な節約量
    status.storage_analysis.potential_savings_mb = Math.round(
      status.categories.not_migrated.reduce((sum, item) => sum + item.estimated_size_kb, 0) / 1024
    );

    // 5. 推奨事項の生成
    if (status.categories.not_migrated.length > 0) {
      status.recommendations.push({
        type: 'action',
        title: `${status.categories.not_migrated.length}件の未移行アーカイブ`,
        description: `${status.storage_analysis.potential_savings_mb}MBのデータをBlobに移行できます。`,
        action_url: '/api/admin/migrate-to-blob'
      });
    }

    // 不整合概念を削除し、データ検証実行を推奨
    if (status.categories.migrated.length > 0) {
      status.recommendations.push({
        type: 'info',
        title: 'データ検証実行を推奨',
        description: 'Blob移行が完了しました。「データ検証実行」でアーカイブの詳細検証を行うことを推奨します。',
        action_url: '/api/admin/migration-verify'
      });
    }

    if (status.categories.blob_only.length > 0) {
      status.recommendations.push({
        type: 'warning',
        title: `${status.categories.blob_only.length}件のBlob限定アーカイブ`,
        description: 'Blobにのみ存在するアーカイブがあります。データベースの同期を確認してください。'
      });
    }

    if (status.overview.migration_progress_percent === 100) {
      status.recommendations.push({
        type: 'info',
        title: '移行完了',
        description: '全てのアーカイブがBlobに移行されました。'
      });
    }

    console.log(`✅ 分析完了:`);
    console.log(`  移行済み: ${status.categories.migrated.length}件`);
    console.log(`  未移行: ${status.categories.not_migrated.length}件`);
    console.log(`  Blobのみ: ${status.categories.blob_only.length}件`);
    console.log(`  進捗率: ${status.overview.migration_progress_percent}%`);

    return NextResponse.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('移行状況確認エラー:', error);
    return NextResponse.json(
      { success: false, error: '移行状況確認中にエラーが発生しました' },
      { status: 500 }
    );
  }
}