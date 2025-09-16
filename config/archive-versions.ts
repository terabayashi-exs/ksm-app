// config/archive-versions.ts
export const ARCHIVE_VERSIONS = {
  CURRENT: '1.0',                    // 現在の最新バージョン
  DEFAULT_FALLBACK: '1.0',           // フォールバック用
  
  VERSION_HISTORY: [
    {
      version: '1.0',
      release_date: '2025-01-15',
      description: '初期リリース - 5タブ構成（概要・日程結果・戦績表・順位表・参加チーム）',
      features: ['overview', 'schedule', 'results', 'standings', 'teams'],
      component_path: 'v1.0'
    }
  ]
} as const;

// 型定義
export interface VersionInfo {
  version: string;
  release_date: string;
  description: string;
  features: readonly string[];
  component_path: string;
}

// バージョン取得関数
export function getCurrentArchiveVersion(): string {
  return ARCHIVE_VERSIONS.CURRENT;
}

export function getVersionInfo(version: string): VersionInfo | undefined {
  return ARCHIVE_VERSIONS.VERSION_HISTORY.find(v => v.version === version);
}

export function getAllVersions(): VersionInfo[] {
  return [...ARCHIVE_VERSIONS.VERSION_HISTORY];
}

export function isValidVersion(version: string): boolean {
  return ARCHIVE_VERSIONS.VERSION_HISTORY.some(v => v.version === version);
}