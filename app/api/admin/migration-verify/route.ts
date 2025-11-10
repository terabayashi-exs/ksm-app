// app/api/admin/migration-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { TournamentBlobArchiver } from '@/lib/tournament-blob-archiver';
import { BlobStorage } from '@/lib/blob-storage';

/**
 * 移行データ検証API
 */

interface VerificationResult {
  tournament_id: number;
  tournament_name: string;
  status: 'verified' | 'failed' | 'missing_db' | 'missing_blob';
  checks: {
    data_exists: { db: boolean; blob: boolean };
    structure_valid: { db: boolean; blob: boolean };
    content_match: boolean;
    size_match: boolean;
  };
  details: {
    db_size_bytes?: number;
    blob_size_bytes?: number;
    size_diff_percent?: number;
    content_errors?: string[];
    missing_fields?: string[];
    extra_fields?: string[];
  };
  recommendations?: string[];
}

interface VerificationSummary {
  total_checked: number;
  verified_count: number;
  failed_count: number;
  missing_db_count: number;
  missing_blob_count: number;
  critical_issues: number;
  execution_time_ms: number;
  overall_status: 'healthy' | 'warning' | 'critical';
}

/**
 * データ検証実行API
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

    const { 
      tournament_ids = [], 
      check_type = 'all',  // 'all', 'selective', 'failed_only'
      deep_check = true     // 詳細な内容チェックを実行するか
    } = await request.json();

    console.log(`🔍 データ検証開始: type=${check_type}, deep=${deep_check}`);
    const startTime = performance.now();

    const results: VerificationResult[] = [];
    let targetTournaments: Array<{
      tournament_id: number;
      tournament_name: string;
      source: string;
    }> = [];

    // 1. 検証対象の決定
    if (check_type === 'all') {
      // 全アーカイブを対象
      const dbResult = await db.execute(`
        SELECT tournament_id, tournament_name, archived_at
        FROM t_archived_tournament_json
        ORDER BY archived_at DESC
      `);
      targetTournaments = (dbResult.rows as unknown as Array<{
        tournament_id: number;
        tournament_name: string;
      }>).map(row => ({
        tournament_id: row.tournament_id,
        tournament_name: row.tournament_name,
        source: 'database'
      }));

      // Blobのみに存在するアーカイブも追加
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blobArchives = await TournamentBlobArchiver.getArchiveIndex();
        const dbIds = new Set(targetTournaments.map(t => t.tournament_id));
        
        for (const blobArchive of blobArchives) {
          if (!dbIds.has(blobArchive.tournament_id)) {
            targetTournaments.push({
              tournament_id: blobArchive.tournament_id,
              tournament_name: blobArchive.tournament_name,
              source: 'blob_only'
            });
          }
        }
      }
    } else if (check_type === 'selective' && Array.isArray(tournament_ids)) {
      if (tournament_ids.length === 0) {
        return NextResponse.json(
          { success: false, error: '検証対象のtournament_idsが指定されていません' },
          { status: 400 }
        );
      }
      
      targetTournaments = tournament_ids.map(id => ({
        tournament_id: id,
        tournament_name: `Tournament ${id}`,
        source: 'selective'
      }));
    }

    console.log(`📊 検証対象: ${targetTournaments.length}件`);

    // 2. 各アーカイブを検証
    for (let i = 0; i < targetTournaments.length; i++) {
      const tournament = targetTournaments[i];
      const progress = `[${i + 1}/${targetTournaments.length}]`;
      
      console.log(`${progress} 検証中: ${tournament.tournament_name} (ID: ${tournament.tournament_id})`);

      const verificationResult: VerificationResult = {
        tournament_id: tournament.tournament_id,
        tournament_name: tournament.tournament_name,
        status: 'verified',
        checks: {
          data_exists: { db: false, blob: false },
          structure_valid: { db: false, blob: false },
          content_match: false,
          size_match: false
        },
        details: {},
        recommendations: []
      };

      try {
        // データベースデータの存在・構造チェック
        let dbData: {
          tournament: Record<string, unknown>;
          teams: unknown[];
          matches: unknown[];
          standings: unknown[];
          results: unknown[];
          pdf_info: Record<string, unknown>;
          metadata: Record<string, unknown>;
        } | null = null;
        try {
          const dbResult = await db.execute(`
            SELECT 
              tournament_data, teams_data, matches_data, standings_data,
              results_data, pdf_info_data, metadata,
              LENGTH(tournament_data) + LENGTH(teams_data) + LENGTH(matches_data) + 
              LENGTH(standings_data) + COALESCE(LENGTH(results_data), 0) + 
              COALESCE(LENGTH(pdf_info_data), 0) as total_size
            FROM t_archived_tournament_json 
            WHERE tournament_id = ?
          `, [tournament.tournament_id]);
          
          if (dbResult.rows.length > 0) {
            const row = dbResult.rows[0];
            verificationResult.checks.data_exists.db = true;
            verificationResult.details.db_size_bytes = row.total_size as number;
            
            // JSONパース可能性チェック
            try {
              dbData = {
                tournament: JSON.parse(row.tournament_data as string),
                teams: JSON.parse(row.teams_data as string),
                matches: JSON.parse(row.matches_data as string),
                standings: JSON.parse(row.standings_data as string),
                results: JSON.parse((row.results_data as string) || '[]'),
                pdf_info: JSON.parse((row.pdf_info_data as string) || '{}'),
                metadata: JSON.parse((row.metadata as string) || '{}')
              };
              verificationResult.checks.structure_valid.db = true;
            } catch (parseError) {
              console.warn(`  ⚠️ DB JSON Parse Error:`, parseError);
              verificationResult.details.content_errors = verificationResult.details.content_errors || [];
              verificationResult.details.content_errors.push('Database JSON parse failed');
            }
          }
        } catch (dbError) {
          console.warn(`  ⚠️ DB Access Error:`, dbError);
        }

        // Blobデータの存在・構造チェック
        let blobData: {
          tournament: Record<string, unknown>;
          teams: unknown[];
          matches: unknown[];
          standings: unknown[];
          results: unknown[];
          pdf_info: Record<string, unknown>;
          metadata: Record<string, unknown>;
        } | null = null;
        try {
          const blobResult = await TournamentBlobArchiver.getArchivedTournament(tournament.tournament_id);
          
          if (blobResult) {
            verificationResult.checks.data_exists.blob = true;
            verificationResult.checks.structure_valid.blob = true;
            blobData = blobResult;
            
            // Blobファイルサイズを取得
            try {
              const blobPath = `tournaments/${tournament.tournament_id}/archive.json`;
              const response = await BlobStorage.get(blobPath);
              const content = await response.text();
              verificationResult.details.blob_size_bytes = Buffer.byteLength(content, 'utf8');
            } catch (sizeError) {
              console.warn(`  ⚠️ Blob Size Error:`, sizeError);
            }
          }
        } catch (blobError) {
          console.warn(`  ⚠️ Blob Access Error:`, blobError);
        }

        // データ整合性検証
        if (dbData && blobData) {
          // サイズ比較
          if (verificationResult.details.db_size_bytes && verificationResult.details.blob_size_bytes) {
            const sizeDiff = Math.abs(verificationResult.details.db_size_bytes - verificationResult.details.blob_size_bytes);
            const sizeDiffPercent = (sizeDiff / verificationResult.details.db_size_bytes) * 100;
            verificationResult.details.size_diff_percent = Math.round(sizeDiffPercent * 100) / 100;
            // DB(個別JSON文字列)とBlob(統合オブジェクト)の構造的差異を許容
            verificationResult.checks.size_match = sizeDiffPercent < 200; // 構造差による大きなサイズ差も許容
          }

          // 詳細内容チェック（deep_check有効時）
          if (deep_check) {
            const contentComparison = await compareArchiveContent(dbData, blobData);
            verificationResult.checks.content_match = contentComparison.matches;
            
            if (contentComparison.missing_fields.length > 0) {
              verificationResult.details.missing_fields = contentComparison.missing_fields;
            }
            if (contentComparison.extra_fields.length > 0) {
              verificationResult.details.extra_fields = contentComparison.extra_fields;
            }
            if (contentComparison.errors.length > 0) {
              verificationResult.details.content_errors = contentComparison.errors;
            }
          } else {
            // 簡易チェック（主要フィールドのみ）
            verificationResult.checks.content_match = 
              !!dbData.tournament && !!blobData.tournament &&
              !!dbData.teams && !!blobData.teams &&
              !!dbData.matches && !!blobData.matches;
          }
        }

        // ステータス判定
        if (!verificationResult.checks.data_exists.db && !verificationResult.checks.data_exists.blob) {
          verificationResult.status = 'failed';
          verificationResult.recommendations?.push('データベースとBlobの両方にデータが存在しません');
        } else if (!verificationResult.checks.data_exists.db) {
          verificationResult.status = 'missing_db';
          verificationResult.recommendations?.push('データベースにアーカイブが存在しません');
        } else if (!verificationResult.checks.data_exists.blob) {
          verificationResult.status = 'missing_blob';
          verificationResult.recommendations?.push('Blobストレージにアーカイブが存在しません。移行が必要です');
        } else if (!verificationResult.checks.structure_valid.db || !verificationResult.checks.structure_valid.blob) {
          verificationResult.status = 'failed';
          verificationResult.recommendations?.push('データ構造に問題があります');
        } else if (deep_check && !verificationResult.checks.content_match) {
          verificationResult.status = 'failed';
          verificationResult.recommendations?.push('データの内容に不整合があります');
        } else if (deep_check && !verificationResult.checks.size_match) {
          // サイズ不一致は警告として処理（失敗ではない）
          verificationResult.recommendations?.push(`サイズ差異: ${verificationResult.details.size_diff_percent}%（DBとBlobの構造差によるもの）`);
        }

        console.log(`  ✅ 検証完了: ${verificationResult.status}`);

      } catch (error) {
        console.error(`  ❌ 検証エラー:`, error);
        verificationResult.status = 'failed';
        verificationResult.details.content_errors = [
          error instanceof Error ? error.message : 'Unknown verification error'
        ];
      }

      results.push(verificationResult);

      // API制限回避のため短時間待機
      if (i < targetTournaments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // 3. 検証結果サマリー
    const summary: VerificationSummary = {
      total_checked: results.length,
      verified_count: results.filter(r => r.status === 'verified').length,
      failed_count: results.filter(r => r.status === 'failed').length,
      missing_db_count: results.filter(r => r.status === 'missing_db').length,
      missing_blob_count: results.filter(r => r.status === 'missing_blob').length,
      critical_issues: results.filter(r => 
        r.status === 'failed' || 
        (r.details.content_errors && r.details.content_errors.length > 0)
      ).length,
      execution_time_ms: Math.round(performance.now() - startTime),
      overall_status: 'healthy'
    };

    // 全体ステータス判定
    if (summary.critical_issues > 0) {
      summary.overall_status = 'critical';
    } else if (summary.missing_blob_count > 0 || summary.missing_db_count > 0) {
      summary.overall_status = 'warning';
    }

    console.log('📋 検証結果サマリー');
    console.log(`✅ 正常: ${summary.verified_count}件`);
    console.log(`❌ 失敗: ${summary.failed_count}件`);
    console.log(`📊 DB不在: ${summary.missing_db_count}件`);
    console.log(`📦 Blob不在: ${summary.missing_blob_count}件`);
    console.log(`⚠️ 重大問題: ${summary.critical_issues}件`);
    console.log(`⏱️ 実行時間: ${(summary.execution_time_ms / 1000).toFixed(2)}秒`);

    return NextResponse.json({
      success: true,
      message: `検証完了: ${summary.verified_count}件正常, ${summary.failed_count + summary.missing_db_count + summary.missing_blob_count}件問題`,
      data: {
        summary,
        results: results.sort((a, b) => {
          // 問題のあるもの順でソート
          const statusOrder = { 'failed': 0, 'missing_blob': 1, 'missing_db': 2, 'verified': 3 };
          return statusOrder[a.status] - statusOrder[b.status];
        })
      }
    });

  } catch (error) {
    console.error('🔥 検証処理中にエラーが発生しました:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '検証処理中にエラーが発生しました' 
      },
      { status: 500 }
    );
  }
}

/**
 * 検証状況確認API（GET）
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

    console.log('🔍 検証可能性チェック開始...');

    const status = {
      blob_available: !!process.env.BLOB_READ_WRITE_TOKEN,
      blob_health: { healthy: false, latency_ms: 0, error: undefined as string | undefined },
      candidates: {
        total_db_archives: 0,
        total_blob_archives: 0,
        verification_candidates: 0,
        estimated_time_minutes: 0
      },
      last_verification: null as string | null,
      recommendations: [] as string[]
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

    // アーカイブ統計
    try {
      const dbResult = await db.execute(`
        SELECT COUNT(*) as count FROM t_archived_tournament_json
      `);
      status.candidates.total_db_archives = dbResult.rows[0]?.count as number || 0;

      if (status.blob_available) {
        const blobArchives = await TournamentBlobArchiver.getArchiveIndex();
        status.candidates.total_blob_archives = blobArchives.length;
      }

      // 検証候補数（DB + Blob の重複排除）
      status.candidates.verification_candidates = Math.max(
        status.candidates.total_db_archives,
        status.candidates.total_blob_archives
      );

      // 検証時間予測（1件あたり約3秒と仮定）
      status.candidates.estimated_time_minutes = Math.round(
        status.candidates.verification_candidates * 3 / 60
      );

    } catch (error) {
      console.warn('統計取得エラー:', error);
    }

    // 推奨事項の生成
    if (!status.blob_available) {
      status.recommendations.push('Blob Storageが利用できません。環境変数を確認してください。');
    } else if (!status.blob_health.healthy) {
      status.recommendations.push('Blob Storageの接続に問題があります。');
    } else if (status.candidates.verification_candidates > 0) {
      status.recommendations.push(`${status.candidates.verification_candidates}件のアーカイブを検証できます。`);
    } else {
      status.recommendations.push('検証対象のアーカイブがありません。');
    }

    console.log(`✅ チェック完了: ${status.candidates.verification_candidates}件の検証候補`);

    return NextResponse.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('検証可能性チェックエラー:', error);
    return NextResponse.json(
      { success: false, error: '検証可能性チェック中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

/**
 * アーカイブ内容の詳細比較
 */
async function compareArchiveContent(
  dbData: { tournament?: Record<string, unknown>; teams?: unknown[]; matches?: unknown[] }, 
  blobData: { tournament?: Record<string, unknown>; teams?: unknown[]; matches?: unknown[] }
): Promise<{
  matches: boolean;
  missing_fields: string[];
  extra_fields: string[];
  errors: string[];
}> {
  const result = {
    matches: true,
    missing_fields: [] as string[],
    extra_fields: [] as string[],
    errors: [] as string[]
  };

  try {
    const requiredFields = ['tournament', 'teams', 'matches', 'standings'];
    
    // 必須フィールドのチェック
    for (const field of requiredFields) {
      if (!(dbData as Record<string, unknown>)[field]) {
        result.missing_fields.push(`db.${field}`);
        result.matches = false;
      }
      if (!(blobData as Record<string, unknown>)[field]) {
        result.missing_fields.push(`blob.${field}`);
        result.matches = false;
      }
    }

    // 詳細内容比較（基本的な構造のみ）
    if (dbData.tournament && blobData.tournament) {
      if (dbData.tournament.tournament_id !== blobData.tournament.tournament_id) {
        result.errors.push('Tournament ID mismatch');
        result.matches = false;
      }
      if (dbData.tournament.tournament_name !== blobData.tournament.tournament_name) {
        result.errors.push('Tournament name mismatch');
        result.matches = false;
      }
    }

    if (dbData.teams && blobData.teams) {
      if (Array.isArray(dbData.teams) && Array.isArray(blobData.teams)) {
        if (dbData.teams.length !== blobData.teams.length) {
          result.errors.push(`Team count mismatch: DB(${dbData.teams.length}) vs Blob(${blobData.teams.length})`);
          result.matches = false;
        }
      }
    }

    if (dbData.matches && blobData.matches) {
      if (Array.isArray(dbData.matches) && Array.isArray(blobData.matches)) {
        if (dbData.matches.length !== blobData.matches.length) {
          result.errors.push(`Match count mismatch: DB(${dbData.matches.length}) vs Blob(${blobData.matches.length})`);
          result.matches = false;
        }
      }
    }

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Content comparison failed');
    result.matches = false;
  }

  return result;
}