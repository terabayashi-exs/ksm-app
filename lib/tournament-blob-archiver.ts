// lib/tournament-blob-archiver.ts
import { BlobStorage } from './blob-storage';
import { db } from './db';
import { ArchiveVersionManager } from './archive-version-manager';
import { parseTotalScore } from './score-parser';

/**
 * アーカイブインデックスの型定義
 */
export interface ArchiveIndex {
  version: string;
  updated_at: string;
  total_archives: number;
  archives: ArchiveEntry[];
}

export interface ArchiveEntry {
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
}

/**
 * アーカイブファイルの型定義
 */
export interface TournamentArchive {
  version: string;
  archived_at: string;
  archived_by: string;
  tournament: Record<string, unknown>;
  teams: Array<Record<string, unknown>>;
  matches: Array<Record<string, unknown>>;
  standings: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  pdf_info: {
    bracketPdfExists: boolean;
    resultsPdfExists: boolean;
  };
  metadata: {
    total_teams: number;
    total_matches: number;
    completed_matches: number;
    blocks_count: number;
    archive_ui_version: string;
    file_size?: number;
  };
}

/**
 * Blob ベースの大会アーカイブ管理クラス
 */
export class TournamentBlobArchiver {
  private static readonly INDEX_PATH = 'tournaments/index.json';
  private static readonly ARCHIVE_VERSION = '1.0';

  /**
   * 大会データをBlobにアーカイブ
   */
  static async archiveTournament(
    tournamentId: number,
    archivedBy: string
  ): Promise<{
    success: boolean;
    error?: string;
    data?: {
      tournament_id: number;
      tournament_name: string;
      file_size: number;
      archived_at: string;
      blob_url: string;
    };
  }> {
    try {
      console.log(`🎯 大会ID ${tournamentId} のBlobアーカイブを開始...`);

      // 1. 大会データを収集（既存のロジックを使用）
      const archiveData = await this.collectTournamentData(tournamentId);
      
      if (!archiveData) {
        return {
          success: false,
          error: '大会データの収集に失敗しました'
        };
      }

      // 2. アーカイブオブジェクトを構築
      const currentTime = new Date().toISOString();
      const currentVersion = ArchiveVersionManager.getCurrentVersion();
      
      const archive: TournamentArchive = {
        version: this.ARCHIVE_VERSION,
        archived_at: currentTime,
        archived_by: archivedBy,
        tournament: archiveData.tournament as unknown as Record<string, unknown>,
        teams: archiveData.teams as unknown as Array<Record<string, unknown>>,
        matches: archiveData.matches as unknown as Array<Record<string, unknown>>,
        standings: archiveData.standings as unknown as Array<Record<string, unknown>>,
        results: archiveData.results as unknown as Array<Record<string, unknown>>,
        pdf_info: archiveData.pdf_info as { bracketPdfExists: boolean; resultsPdfExists: boolean },
        metadata: {
          ...archiveData.metadata,
          archive_ui_version: currentVersion,
        }
      };

      // 3. Blobに保存
      const archivePath = `tournaments/${tournamentId}/archive.json`;
      const jsonString = JSON.stringify(archive, null, 2);
      const fileSize = Buffer.byteLength(jsonString, 'utf8');
      
      archive.metadata.file_size = fileSize;
      
      await BlobStorage.putJson(archivePath, archive as unknown as Record<string, unknown>);

      // 4. インデックスを更新
      console.log(`📋 インデックス更新を開始: ${archiveData.tournament.tournament_name}`);
      await this.updateIndex({
        tournament_id: tournamentId,
        tournament_name: archiveData.tournament.tournament_name,
        archived_at: currentTime,
        archived_by: archivedBy,
        file_size: fileSize,
        blob_url: archivePath,
        metadata: {
          total_teams: archiveData.metadata.total_teams,
          total_matches: archiveData.metadata.total_matches,
          archive_ui_version: currentVersion
        }
      });
      console.log(`✅ インデックス更新完了: ${archiveData.tournament.tournament_name}`);

      // 5. データベースのアーカイブフラグを更新
      await db.execute(`
        UPDATE t_tournaments 
        SET is_archived = 1,
            archive_ui_version = ?,
            archived_at = datetime('now', '+9 hours'),
            archived_by = ?
        WHERE tournament_id = ?
      `, [currentVersion, archivedBy, tournamentId]);

      console.log(`✅ Blobアーカイブ完了: ${archiveData.tournament.tournament_name}`);
      console.log(`   保存先: ${archivePath}`);
      console.log(`   データサイズ: ${(fileSize / 1024).toFixed(2)} KB`);

      return {
        success: true,
        data: {
          tournament_id: tournamentId,
          tournament_name: archiveData.tournament.tournament_name,
          file_size: fileSize,
          archived_at: currentTime,
          blob_url: archivePath
        }
      };

    } catch (error) {
      console.error(`🔥 Blobアーカイブエラー (大会ID: ${tournamentId}):`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'アーカイブ処理中にエラーが発生しました'
      };
    }
  }

  /**
   * アーカイブされた大会データを取得
   */
  static async getArchivedTournament(tournamentId: number): Promise<TournamentArchive | null> {
    try {
      const archivePath = `tournaments/${tournamentId}/archive.json`;
      const archive = await BlobStorage.getJson<TournamentArchive>(archivePath);
      
      console.log(`✅ アーカイブ取得成功: 大会ID ${tournamentId}`);
      return archive;
    } catch (error) {
      console.error(`❌ アーカイブ取得失敗: 大会ID ${tournamentId}`, error);
      return null;
    }
  }

  /**
   * アーカイブ一覧を取得（リトライ機能付き）
   */
  static async getArchiveIndex(retryCount = 0): Promise<ArchiveEntry[]> {
    const maxRetries = 3;
    
    try {
      const index = await BlobStorage.getJson<ArchiveIndex>(this.INDEX_PATH);
      console.log(`📋 インデックス取得成功: ${index.archives?.length || 0}件のアーカイブ`);
      return index.archives || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('404') || errorMessage.includes('does not exist')) {
        // 404エラーの場合、リトライを試行（ログなし）
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 500; // 指数バックオフ: 500ms, 1s, 2s
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.getArchiveIndex(retryCount + 1);
        } else {
          console.log('📄 インデックスファイル未存在（最終確認後）');
        }
      } else {
        console.warn('⚠️ インデックス取得エラー:', errorMessage);
      }
      return [];
    }
  }

  /**
   * インデックスを更新
   */
  static async updateIndex(newEntry: ArchiveEntry): Promise<void> {
    // デフォルトのArchiveIndex構造を定義
    const defaultIndex: ArchiveIndex = {
      version: this.ARCHIVE_VERSION,
      updated_at: new Date().toISOString(),
      total_archives: 0,
      archives: []
    };

    await BlobStorage.updateJsonWithLock<ArchiveIndex>(
      this.INDEX_PATH,
      (current) => {
        console.log(`    📝 現在のインデックス状態:`, current);
        
        // current が空の場合や不正な場合は初期化
        if (!current || !current.version || !Array.isArray(current.archives)) {
          console.log(`    🆕 インデックス初期化中...`);
          current = {
            version: this.ARCHIVE_VERSION,
            updated_at: new Date().toISOString(),
            total_archives: 0,
            archives: []
          };
        }

        console.log(`    🔍 エントリ追加前の件数: ${current.archives.length}`);
        console.log(`    🔍 追加するエントリID: ${newEntry.tournament_id}`);

        // 既存のエントリを更新または新規追加
        const existingIndex = current.archives.findIndex(
          a => a.tournament_id === newEntry.tournament_id
        );

        if (existingIndex >= 0) {
          console.log(`    🔄 既存エントリを更新: インデックス ${existingIndex}`);
          current.archives[existingIndex] = newEntry;
        } else {
          console.log(`    ➕ 新規エントリを追加`);
          current.archives.push(newEntry);
        }

        // ソート（新しい順）
        current.archives.sort((a, b) => 
          new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime()
        );

        // メタデータ更新
        current.updated_at = new Date().toISOString();
        current.total_archives = current.archives.length;

        console.log(`    ✅ 更新後の件数: ${current.total_archives}`);
        console.log(`    📋 更新後のアーカイブIDs: [${current.archives.map(a => a.tournament_id).join(', ')}]`);

        return current;
      },
      {
        maxRetries: 5,
        defaultValue: defaultIndex
      }
    );
  }

  /**
   * 大会データを収集（既存のロジックを流用）
   */
  static async collectTournamentData(tournamentId: number) {
    try {
      // 1. 大会基本情報（アーカイブフラグに関係なく生データを取得）
      const { getRawTournamentById } = await import('@/lib/tournament-detail');
      const tournament = await getRawTournamentById(tournamentId);
      if (!tournament) {
        return null;
      }

      // 2. 参加チーム情報
      const teamsResult = await db.execute(`
        SELECT 
          tt.team_id,
          tt.team_name,
          tt.team_omission,
          tt.assigned_block,
          tt.block_position,
          tt.withdrawal_status,
          (SELECT COUNT(*) FROM t_tournament_players tp 
           WHERE tp.team_id = tt.team_id AND tp.tournament_id = tt.tournament_id) as player_count,
          t.contact_person,
          t.contact_email
        FROM t_tournament_teams tt
        LEFT JOIN m_teams t ON tt.team_id = t.team_id
        WHERE tt.tournament_id = ?
        ORDER BY tt.assigned_block, tt.block_position
      `, [tournamentId]);

      // 2.1. 各チームの選手情報を取得
      const teamsWithPlayers = await Promise.all(
        teamsResult.rows.map(async (team: Record<string, unknown>) => {
          const playersResult = await db.execute(`
            SELECT 
              mp.player_name,
              tp.jersey_number
            FROM t_tournament_players tp
            LEFT JOIN m_players mp ON tp.player_id = mp.player_id
            WHERE tp.team_id = ? AND tp.tournament_id = ?
            ORDER BY tp.jersey_number
          `, [team.team_id as string, tournamentId]);

          return {
            ...team,
            players: playersResult.rows.map((player: Record<string, unknown>) => ({
              player_name: player.player_name,
              jersey_number: player.jersey_number
            }))
          };
        })
      );

      // 3. 試合データ
      const matchesResult = await db.execute(`
        SELECT 
          ml.match_id,
          ml.match_block_id,
          ml.tournament_date,
          ml.match_number,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.court_number,
          ml.start_time,
          mb.phase,
          mb.display_round_name,
          mb.block_name,
          mb.match_type,
          mb.block_order,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          COALESCE(mf.is_draw, 0) as is_draw,
          COALESCE(mf.is_walkover, 0) as is_walkover,
          ml.match_status,
          ml.result_status,
          ml.remarks,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as has_result
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
        ORDER BY ml.tournament_date, ml.match_number
      `, [tournamentId]);

      // 4. 順位表データ
      const standingsResult = await db.execute(`
        SELECT 
          mb.block_name,
          mb.phase,
          mb.team_rankings,
          mb.remarks
        FROM t_match_blocks mb
        WHERE mb.tournament_id = ?
        ORDER BY 
          CASE mb.phase 
            WHEN 'preliminary' THEN 1
            WHEN 'final' THEN 2 
          END,
          mb.block_name
      `, [tournamentId]);

      // 5. 戦績表データ
      const resultsResult = await db.execute(`
        SELECT
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(tt1.team_name, ml.team1_display_name) as team1_name,
          COALESCE(tt2.team_name, ml.team2_display_name) as team2_name,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover,
          mb.block_name
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
        LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mf.match_id IS NOT NULL
        ORDER BY ml.match_code
      `, [tournamentId]);

      // 6. PDF情報
      const { checkTournamentBracketPdfExists, checkTournamentResultsPdfExists } = await import('@/lib/pdf-utils');
      const bracketPdfExists = await checkTournamentBracketPdfExists(tournamentId);
      const resultsPdfExists = await checkTournamentResultsPdfExists(tournamentId);

      // データをまとめて返す
      // スコアの計算処理を追加
      const processedMatches = matchesResult.rows.map(match => {
        const calculateGoals = (scores: string | null): number => {
          return parseTotalScore(scores);
        };

        return {
          ...match,
          team1_goals: calculateGoals(match.team1_scores as string | null),
          team2_goals: calculateGoals(match.team2_scores as string | null)
        };
      });

      return {
        tournament,
        teams: teamsWithPlayers,
        matches: processedMatches,
        standings: standingsResult.rows.map(row => ({
          ...row,
          team_rankings: row.team_rankings ? JSON.parse(row.team_rankings as string) : []
        })),
        results: resultsResult.rows,
        pdf_info: {
          bracketPdfExists,
          resultsPdfExists
        },
        metadata: {
          total_teams: teamsWithPlayers.length,
          total_matches: processedMatches.length,
          completed_matches: matchesResult.rows.filter(m => m.has_result === 1).length,
          blocks_count: new Set(standingsResult.rows.map((s: Record<string, unknown>) => s.block_name)).size
        }
      };

    } catch (error) {
      console.error('大会データ収集エラー:', error);
      return null;
    }
  }

  /**
   * 特定の大会アーカイブを削除
   */
  static async deleteArchive(tournamentId: number): Promise<boolean> {
    try {
      // 1. アーカイブファイルを削除
      const archivePath = `tournaments/${tournamentId}/archive.json`;
      await BlobStorage.delete(archivePath);

      // 2. インデックスから削除
      const defaultIndex: ArchiveIndex = {
        version: this.ARCHIVE_VERSION,
        updated_at: new Date().toISOString(),
        total_archives: 0,
        archives: []
      };

      await BlobStorage.updateJsonWithLock<ArchiveIndex>(
        this.INDEX_PATH,
        (current) => {
          // current が空の場合や不正な場合は初期化
          if (!current || !current.version || !Array.isArray(current.archives)) {
            current = {
              version: this.ARCHIVE_VERSION,
              updated_at: new Date().toISOString(),
              total_archives: 0,
              archives: []
            };
          }

          current.archives = current.archives.filter(
            a => a.tournament_id !== tournamentId
          );
          current.updated_at = new Date().toISOString();
          current.total_archives = current.archives.length;
          return current;
        },
        {
          maxRetries: 5,
          defaultValue: defaultIndex
        }
      );

      // 3. DBフラグを更新
      await db.execute(`
        UPDATE t_tournaments 
        SET is_archived = 0,
            archive_ui_version = NULL,
            archived_at = NULL,
            archived_by = NULL
        WHERE tournament_id = ?
      `, [tournamentId]);

      console.log(`✅ アーカイブ削除完了: 大会ID ${tournamentId}`);
      return true;
    } catch (error) {
      console.error(`❌ アーカイブ削除失敗: 大会ID ${tournamentId}`, error);
      return false;
    }
  }
}