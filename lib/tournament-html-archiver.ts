/**
 * HTML形式の大会アーカイバー
 * データ収集 → HTML生成 → Blob保存
 */

import type { BracketMatch, SportScoreConfig } from "@/lib/tournament-bracket/types";
import { generateArchiveHtml } from "./archive-html/generate-archive-html";
import { ArchiveVersionManager } from "./archive-version-manager";
import { BlobStorage } from "./blob-storage";
import { db } from "./db";
import { TournamentBlobArchiver } from "./tournament-blob-archiver";

export class TournamentHtmlArchiver {
  /**
   * 大会データをHTML形式でアーカイブし、Blobに保存
   */
  static async archiveTournamentAsHtml(
    tournamentId: number,
    archivedBy: string,
  ): Promise<{
    success: boolean;
    error?: string;
    data?: {
      tournament_id: number;
      tournament_name: string;
      file_size: number;
      archived_at: string;
      html_url: string;
    };
  }> {
    try {
      console.log(`🎯 大会ID ${tournamentId} のHTMLアーカイブを開始...`);

      // 1. 既存のデータ収集ロジックを再利用
      const archiveData = await TournamentBlobArchiver.collectTournamentData(tournamentId);
      if (!archiveData) {
        return { success: false, error: "大会データの収集に失敗しました" };
      }

      // 2. ブラケットデータを追加取得（finalフェーズ）
      const bracketData: Record<string, BracketMatch[]> = {};
      let sportConfig: SportScoreConfig | undefined;
      try {
        const { getTournamentBracketData } = await import("@/lib/tournament-bracket-data");

        // 各フェーズのブラケットデータ取得を試行
        const phases = [
          ...new Set(
            (archiveData.matches as Array<{ phase?: string }>)
              .map((m) => m.phase)
              .filter((p): p is string => !!p),
          ),
        ];

        for (const phase of phases) {
          try {
            const result = await getTournamentBracketData(tournamentId, phase);
            if (result.data.length > 0) {
              // Group by block_name
              for (const match of result.data) {
                const blockKey = match.block_name || phase;
                if (!bracketData[blockKey]) bracketData[blockKey] = [];
                bracketData[blockKey].push(match);
              }
              sportConfig = result.sport_config;
            }
          } catch {
            // Phase may not have bracket data - skip silently
            console.log(`📋 ブラケットデータなし: phase=${phase}`);
          }
        }
      } catch (error) {
        console.warn("⚠️ ブラケットデータ取得スキップ:", error);
      }

      // 3. 添付ファイル情報を取得
      let files: Array<{
        file_id: number;
        file_title: string;
        file_description?: string;
        original_filename: string;
        blob_url: string;
        external_url?: string;
        link_type: string;
        file_size: number;
      }> = [];
      try {
        const filesResult = await db.execute(
          `
          SELECT file_id, file_title, file_description, original_filename,
                 blob_url, external_url, link_type, file_size
          FROM t_tournament_files
          WHERE tournament_id = ? AND is_public = 1
          ORDER BY upload_order
        `,
          [tournamentId],
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        files = filesResult.rows as any[];
      } catch {
        console.warn("⚠️ 添付ファイル取得スキップ");
      }

      // 4. archivedBy のdisplay_name解決
      let archivedByDisplayName = archivedBy;
      try {
        const userResult = await db.execute(
          "SELECT display_name FROM m_login_users WHERE login_user_id = ?",
          [archivedBy],
        );
        if (userResult.rows.length > 0 && userResult.rows[0].display_name) {
          archivedByDisplayName = userResult.rows[0].display_name as string;
        }
      } catch {
        // フォールバック: そのまま使用
      }

      // 5. HTML生成
      const currentTime = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = archiveData as any;
      const tournament = d.tournament;

      const html = generateArchiveHtml({
        tournament: {
          tournament_id: tournamentId,
          tournament_name: tournament.tournament_name,
          team_count: tournament.team_count,
          court_count: tournament.court_count,
          match_duration_minutes: tournament.match_duration_minutes,
          break_duration_minutes: tournament.break_duration_minutes,
          tournament_dates: tournament.tournament_dates,
          recruitment_start_date: tournament.recruitment_start_date,
          recruitment_end_date: tournament.recruitment_end_date,
          format_name: tournament.format_name,
          venue_name: tournament.venue_name,
          status: tournament.status,
        },
        teams: d.teams,
        matches: d.matches,
        standings: d.standings,
        results: d.results,
        bracketData,
        sportConfig,
        files,
        metadata: archiveData.metadata,
        archivedAt: currentTime,
        archivedBy: archivedByDisplayName,
      });

      // 4. Blob保存
      const htmlPath = `tournaments/${tournamentId}/archive.html`;
      const fileSize = Buffer.byteLength(html, "utf8");

      await BlobStorage.put(htmlPath, html, {
        contentType: "text/html; charset=utf-8",
        cacheControlMaxAge: 31536000, // 1 year
      });

      // 5. DBフラグ更新
      const currentVersion = ArchiveVersionManager.getCurrentVersion();
      await db.execute(
        `
        UPDATE t_tournaments
        SET is_archived = 1,
            archive_ui_version = ?,
            archived_at = datetime('now', '+9 hours'),
            archived_by = ?
        WHERE tournament_id = ?
      `,
        [currentVersion, archivedBy, tournamentId],
      );

      console.log(`✅ HTMLアーカイブ完了: ${tournament.tournament_name}`);
      console.log(`   保存先: ${htmlPath}`);
      console.log(`   HTMLサイズ: ${(fileSize / 1024).toFixed(2)} KB`);

      return {
        success: true,
        data: {
          tournament_id: tournamentId,
          tournament_name: tournament.tournament_name as string,
          file_size: fileSize,
          archived_at: currentTime,
          html_url: htmlPath,
        },
      };
    } catch (error) {
      console.error(`🔥 HTMLアーカイブエラー (大会ID: ${tournamentId}):`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "HTMLアーカイブ処理中にエラーが発生しました",
      };
    }
  }

  /**
   * BlobからアーカイブHTMLを取得
   */
  static async getArchivedHtml(tournamentId: number): Promise<string | null> {
    try {
      const htmlPath = `tournaments/${tournamentId}/archive.html`;
      const result = await BlobStorage.get(htmlPath);
      if (!result) return null;

      const text = await result.text();
      console.log(`✅ HTMLアーカイブ取得成功: 大会ID ${tournamentId}`);
      return text;
    } catch (error) {
      console.error(`❌ HTMLアーカイブ取得失敗: 大会ID ${tournamentId}`, error);
      return null;
    }
  }

  /**
   * Blob上のHTMLアーカイブを削除
   */
  static async deleteHtmlArchive(tournamentId: number): Promise<void> {
    try {
      const htmlPath = `tournaments/${tournamentId}/archive.html`;
      await BlobStorage.delete(htmlPath);
      console.log(`✅ HTMLアーカイブ削除: 大会ID ${tournamentId}`);
    } catch (error) {
      console.error(`❌ HTMLアーカイブ削除失敗: 大会ID ${tournamentId}`, error);
    }
  }
}
