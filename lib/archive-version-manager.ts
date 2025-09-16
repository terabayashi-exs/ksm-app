// lib/archive-version-manager.ts
import { ARCHIVE_VERSIONS, getVersionInfo, VersionInfo } from '@/config/archive-versions';
import { db } from '@/lib/db';

export class ArchiveVersionManager {
  
  /**
   * 現在のアーカイブUIバージョンを取得
   */
  static getCurrentVersion(): string {
    return ARCHIVE_VERSIONS.CURRENT;
  }
  
  /**
   * 大会のアーカイブバージョンを記録
   */
  static async recordArchiveVersion(tournamentId: number, archivedBy: string): Promise<void> {
    const currentVersion = this.getCurrentVersion();
    
    await db.execute(`
      UPDATE t_tournaments 
      SET archive_ui_version = ?, 
          archived_at = datetime('now', '+9 hours'),
          archived_by = ?
      WHERE tournament_id = ?
    `, [currentVersion, archivedBy, tournamentId]);
  }
  
  /**
   * 大会のアーカイブUIバージョンを取得
   */
  static async getArchiveUIVersion(tournamentId: number): Promise<string> {
    const result = await db.execute(`
      SELECT archive_ui_version, archived_at 
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);
    
    if (result.rows.length === 0) {
      return ARCHIVE_VERSIONS.DEFAULT_FALLBACK;
    }
    
    const version = result.rows[0].archive_ui_version;
    return (version as string) || this.inferVersionFromDate(result.rows[0].archived_at as string | null);
  }
  
  /**
   * アーカイブ日付からバージョンを推測（後方互換性のため）
   */
  private static inferVersionFromDate(archivedAt: string | null): string {
    if (!archivedAt) return ARCHIVE_VERSIONS.DEFAULT_FALLBACK;
    
    const archiveDate = new Date(archivedAt);
    
    // バージョン履歴を新しい順にソートして判定
    const sortedVersions = [...ARCHIVE_VERSIONS.VERSION_HISTORY]
      .sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime());
    
    for (const versionInfo of sortedVersions) {
      if (archiveDate >= new Date(versionInfo.release_date)) {
        return versionInfo.version;
      }
    }
    
    return ARCHIVE_VERSIONS.DEFAULT_FALLBACK;
  }
  
  /**
   * バージョン情報を取得
   */
  static getVersionInfo(version: string) {
    return getVersionInfo(version);
  }
  
  /**
   * 大会のアーカイブ情報を取得
   */
  static async getArchiveInfo(tournamentId: number): Promise<{
    isArchived: boolean;
    uiVersion: string | null;
    archivedAt: string | null;
    archivedBy: string | null;
    versionInfo?: VersionInfo;
  }> {
    const result = await db.execute(`
      SELECT 
        is_archived,
        archive_ui_version, 
        archived_at,
        archived_by
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);
    
    if (result.rows.length === 0) {
      return {
        isArchived: false,
        uiVersion: null,
        archivedAt: null,
        archivedBy: null
      };
    }
    
    const row = result.rows[0];
    const versionInfo = row.archive_ui_version ? getVersionInfo(row.archive_ui_version as string) : undefined;
    
    return {
      isArchived: Boolean(row.is_archived),
      uiVersion: row.archive_ui_version as string | null,
      archivedAt: row.archived_at as string | null,
      archivedBy: row.archived_by as string | null,
      versionInfo
    };
  }
}