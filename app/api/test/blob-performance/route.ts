// app/api/test/blob-performance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { TournamentBlobArchiver } from '@/lib/tournament-blob-archiver';
import { getArchivedTournamentsList } from '@/lib/tournament-json-archiver';

/**
 * Blob vs Database パフォーマンステスト用エンドポイント
 */

export async function GET(_request: NextRequest) {
  try {
    console.log('🚀 Blob vs Database パフォーマンステスト開始...');

    const results = {
      timestamp: new Date().toISOString(),
      environment: {
        hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
        tokenPreview: process.env.BLOB_READ_WRITE_TOKEN 
          ? process.env.BLOB_READ_WRITE_TOKEN.substring(0, 20) + '...' 
          : 'not set'
      },
      tests: {
        archive_list: {
          blob: { success: false, duration_ms: 0, count: 0, error: null as string | null },
          database: { success: false, duration_ms: 0, count: 0, error: null as string | null },
          improvement: 0
        },
        individual_archive: {
          blob: { success: false, duration_ms: 0, tournament_id: null as number | null, error: null as string | null },
          database: { success: false, duration_ms: 0, tournament_id: null as number | null, error: null as string | null },
          improvement: 0
        }
      }
    };

    // 1. アーカイブ一覧取得のパフォーマンステスト
    console.log('📋 アーカイブ一覧取得テスト...');

    // Blob版テスト
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blobStart = performance.now();
        const blobArchives = await TournamentBlobArchiver.getArchiveIndex();
        const blobEnd = performance.now();
        
        results.tests.archive_list.blob = {
          success: true,
          duration_ms: Math.round(blobEnd - blobStart),
          count: blobArchives.length,
          error: null
        };
        
        console.log(`  📦 Blob: ${results.tests.archive_list.blob.duration_ms}ms (${blobArchives.length}件)`);
      } catch (error) {
        results.tests.archive_list.blob.error = error instanceof Error ? error.message : 'Unknown error';
        results.tests.archive_list.blob.success = false;
        console.log(`  ❌ Blob エラー: ${results.tests.archive_list.blob.error}`);
      }
    }

    // Database版テスト
    try {
      const dbStart = performance.now();
      const dbArchives = await getArchivedTournamentsList();
      const dbEnd = performance.now();
      
      results.tests.archive_list.database = {
        success: true,
        duration_ms: Math.round(dbEnd - dbStart),
        count: dbArchives.length,
        error: null
      };
      
      console.log(`  💾 Database: ${results.tests.archive_list.database.duration_ms}ms (${dbArchives.length}件)`);
    } catch (error) {
      results.tests.archive_list.database.error = error instanceof Error ? error.message : 'Unknown error';
      results.tests.archive_list.database.success = false;
      console.log(`  ❌ Database エラー: ${results.tests.archive_list.database.error}`);
    }

    // 改善率計算（一覧取得）
    if (results.tests.archive_list.blob.success && results.tests.archive_list.database.success) {
      const improvement = ((results.tests.archive_list.database.duration_ms - results.tests.archive_list.blob.duration_ms) / results.tests.archive_list.database.duration_ms) * 100;
      results.tests.archive_list.improvement = Math.round(improvement);
      console.log(`  📈 改善率: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
    }

    // 2. 個別アーカイブ取得のパフォーマンステスト
    console.log('📄 個別アーカイブ取得テスト...');

    // テスト対象のアーカイブIDを取得
    let testTournamentId: number | null = null;
    
    if (results.tests.archive_list.blob.success && results.tests.archive_list.blob.count > 0) {
      const blobArchives = await TournamentBlobArchiver.getArchiveIndex();
      testTournamentId = blobArchives[0]?.tournament_id;
    } else if (results.tests.archive_list.database.success && results.tests.archive_list.database.count > 0) {
      const dbArchives = await getArchivedTournamentsList();
      testTournamentId = dbArchives[0]?.tournament_id as number;
    }

    if (testTournamentId) {
      console.log(`  🎯 テスト対象: 大会ID ${testTournamentId}`);

      // Blob版テスト
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const blobStart = performance.now();
          const blobArchive = await TournamentBlobArchiver.getArchivedTournament(testTournamentId);
          const blobEnd = performance.now();
          
          results.tests.individual_archive.blob = {
            success: !!blobArchive,
            duration_ms: Math.round(blobEnd - blobStart),
            tournament_id: testTournamentId,
            error: blobArchive ? null : 'Archive not found'
          };
          
          console.log(`  📦 Blob: ${results.tests.individual_archive.blob.duration_ms}ms`);
        } catch (error) {
          results.tests.individual_archive.blob.error = error instanceof Error ? error.message : 'Unknown error';
          results.tests.individual_archive.blob.success = false;
          console.log(`  ❌ Blob エラー: ${results.tests.individual_archive.blob.error}`);
        }
      }

      // Database版テスト（従来のAPIを使用）
      try {
        const dbStart = performance.now();
        const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/tournaments/${testTournamentId}/archived-view?test=db`, {
          cache: 'no-store'
        });
        const dbEnd = performance.now();
        
        if (response.ok) {
          const data = await response.json();
          results.tests.individual_archive.database = {
            success: data.success,
            duration_ms: Math.round(dbEnd - dbStart),
            tournament_id: testTournamentId,
            error: data.success ? null : data.error
          };
          
          console.log(`  💾 Database: ${results.tests.individual_archive.database.duration_ms}ms`);
        } else {
          results.tests.individual_archive.database.error = `HTTP ${response.status}`;
        }
      } catch (error) {
        results.tests.individual_archive.database.error = error instanceof Error ? error.message : 'Unknown error';
        results.tests.individual_archive.database.success = false;
        console.log(`  ❌ Database エラー: ${results.tests.individual_archive.database.error}`);
      }

      // 改善率計算（個別取得）
      if (results.tests.individual_archive.blob.success && results.tests.individual_archive.database.success) {
        const improvement = ((results.tests.individual_archive.database.duration_ms - results.tests.individual_archive.blob.duration_ms) / results.tests.individual_archive.database.duration_ms) * 100;
        results.tests.individual_archive.improvement = Math.round(improvement);
        console.log(`  📈 改善率: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
      }
    } else {
      console.log('  ⚠️ テスト用アーカイブが見つかりません');
    }

    // 3. 結果サマリー
    console.log('\n📊 パフォーマンステスト結果:');
    console.log(`  一覧取得: Database ${results.tests.archive_list.database.duration_ms}ms → Blob ${results.tests.archive_list.blob.duration_ms}ms (${results.tests.archive_list.improvement}% 改善)`);
    console.log(`  個別取得: Database ${results.tests.individual_archive.database.duration_ms}ms → Blob ${results.tests.individual_archive.blob.duration_ms}ms (${results.tests.individual_archive.improvement}% 改善)`);

    return NextResponse.json({
      success: true,
      message: 'パフォーマンステストが完了しました',
      ...results
    });

  } catch (error) {
    console.error('❌ パフォーマンステストエラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'パフォーマンステスト中にエラーが発生しました'
      },
      { status: 500 }
    );
  }
}

/**
 * ストレステスト（多数のリクエストを並列実行）
 */
export async function POST(request: NextRequest) {
  try {
    const { concurrent_requests = 10, test_type = 'archive_list' } = await request.json();

    console.log(`🔥 ストレステスト開始: ${concurrent_requests}並列リクエスト (${test_type})`);

    const results = {
      test_type,
      concurrent_requests,
      blob: { success: 0, failed: 0, total_duration_ms: 0, avg_duration_ms: 0, errors: [] as Array<string | null> },
      database: { success: 0, failed: 0, total_duration_ms: 0, avg_duration_ms: 0, errors: [] as Array<string | null> }
    };

    // テスト関数
    const testFunction = async (useBlob: boolean) => {
      const start = performance.now();
      try {
        if (test_type === 'archive_list') {
          if (useBlob) {
            await TournamentBlobArchiver.getArchiveIndex();
          } else {
            await getArchivedTournamentsList();
          }
        }
        const end = performance.now();
        return { success: true, duration: end - start, error: null };
      } catch (error) {
        const end = performance.now();
        return { 
          success: false, 
          duration: end - start, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    };

    // Blob並列テスト
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      console.log('📦 Blob ストレステスト実行中...');
      const blobPromises = Array(concurrent_requests).fill(0).map(() => testFunction(true));
      const blobResults = await Promise.all(blobPromises);
      
      blobResults.forEach(result => {
        if (result.success) {
          results.blob.success++;
        } else {
          results.blob.failed++;
          results.blob.errors.push(result.error);
        }
        results.blob.total_duration_ms += result.duration;
      });
      
      results.blob.avg_duration_ms = Math.round(results.blob.total_duration_ms / concurrent_requests);
    }

    // Database並列テスト
    console.log('💾 Database ストレステスト実行中...');
    const dbPromises = Array(concurrent_requests).fill(0).map(() => testFunction(false));
    const dbResults = await Promise.all(dbPromises);
    
    dbResults.forEach(result => {
      if (result.success) {
        results.database.success++;
      } else {
        results.database.failed++;
        results.database.errors.push(result.error);
      }
      results.database.total_duration_ms += result.duration;
    });
    
    results.database.avg_duration_ms = Math.round(results.database.total_duration_ms / concurrent_requests);

    console.log(`✅ ストレステスト完了`);
    console.log(`  Blob: ${results.blob.success}成功 / ${results.blob.failed}失敗 (平均${results.blob.avg_duration_ms}ms)`);
    console.log(`  Database: ${results.database.success}成功 / ${results.database.failed}失敗 (平均${results.database.avg_duration_ms}ms)`);

    return NextResponse.json({
      success: true,
      message: 'ストレステストが完了しました',
      results
    });

  } catch (error) {
    console.error('❌ ストレステストエラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'ストレステスト中にエラーが発生しました'
      },
      { status: 500 }
    );
  }
}