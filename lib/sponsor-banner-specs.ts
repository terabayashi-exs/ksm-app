/**
 * スポンサーバナーの仕様定義
 * Banner specifications for sponsor advertisements
 */

/**
 * バナー表示位置
 * - top: タブ上部（タブメニューの直下）
 * - bottom: ページ下部（コンテンツの最後）
 * - sidebar: サイドバー（PC表示時のみ、右側）
 */
export const BANNER_POSITIONS = {
  TOP: 'top',
  BOTTOM: 'bottom',
  SIDEBAR: 'sidebar',
} as const;

export type BannerPosition = (typeof BANNER_POSITIONS)[keyof typeof BANNER_POSITIONS];

/**
 * ターゲットタブ
 * - all: 全タブ共通で表示
 * - overview: 概要タブ
 * - schedule: 日程・結果タブ
 * - preliminary: 予選タブ
 * - final: 決勝タブ
 * - standings: 順位表タブ
 * - teams: 参加チームタブ
 */
export const TARGET_TABS = {
  ALL: 'all',
  OVERVIEW: 'overview',
  SCHEDULE: 'schedule',
  PRELIMINARY: 'preliminary',
  FINAL: 'final',
  STANDINGS: 'standings',
  TEAMS: 'teams',
} as const;

export type TargetTab = (typeof TARGET_TABS)[keyof typeof TARGET_TABS];

/**
 * バナーサイズ種別
 * - large: 大バナー（1200×200px）- タブ上部・サイドバー・タブ下部
 * - small: 小バナー（250×64px）- タブ上部・タブ下部のみ
 */
export const BANNER_SIZES = {
  LARGE: 'large',
  SMALL: 'small',
} as const;

export type BannerSize = (typeof BANNER_SIZES)[keyof typeof BANNER_SIZES];

/**
 * 推奨バナーサイズ（IAB標準準拠）
 */
export const BANNER_SIZE_SPECS = {
  // 大バナー
  large: {
    [BANNER_POSITIONS.TOP]: {
      width: 1200,
      height: 200,
      aspectRatio: '6:1',
      description: '大バナー（タブ上部用）',
    },
    [BANNER_POSITIONS.BOTTOM]: {
      width: 1200,
      height: 200,
      aspectRatio: '6:1',
      description: '大バナー（ページ下部用）',
    },
    [BANNER_POSITIONS.SIDEBAR]: {
      width: 300,
      height: 600,
      aspectRatio: '1:2',
      description: '大バナー（サイドバー用）',
    },
  },
  // 小バナー
  small: {
    [BANNER_POSITIONS.TOP]: {
      width: 250,
      height: 64,
      aspectRatio: '3.9:1',
      description: '小バナー（タブ上部用）',
    },
    [BANNER_POSITIONS.BOTTOM]: {
      width: 250,
      height: 64,
      aspectRatio: '3.9:1',
      description: '小バナー（ページ下部用）',
    },
  },
} as const;

/**
 * 最大ファイルサイズ（5MB）
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * 対応画像形式
 */
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

/**
 * バナーデータ型定義
 */
export interface SponsorBanner {
  banner_id: number;
  tournament_id: number;
  banner_name: string;
  banner_url: string | null;
  image_blob_url: string;
  image_filename: string | null;
  file_size: number | null;
  display_position: BannerPosition;
  target_tab: TargetTab;
  banner_size: BannerSize;
  display_order: number;
  is_active: 0 | 1;
  start_date: string | null;
  end_date: string | null;
  click_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * バナー新規作成用の入力型
 */
export interface CreateSponsorBannerInput {
  tournament_id: number;
  banner_name: string;
  banner_url?: string;
  image_blob_url: string;
  image_filename?: string;
  file_size?: number;
  display_position: BannerPosition;
  target_tab?: TargetTab;
  banner_size?: BannerSize;
  display_order?: number;
  is_active?: 0 | 1;
  start_date?: string;
  end_date?: string;
}

/**
 * バナー更新用の入力型
 */
export interface UpdateSponsorBannerInput {
  banner_name?: string;
  banner_url?: string;
  image_blob_url?: string;
  image_filename?: string;
  file_size?: number;
  display_position?: BannerPosition;
  target_tab?: TargetTab;
  banner_size?: BannerSize;
  display_order?: number;
  is_active?: 0 | 1;
  start_date?: string;
  end_date?: string;
}

/**
 * 表示フィルタリング条件
 */
export interface BannerDisplayFilter {
  tournament_id: number;
  target_tab: TargetTab;
  display_position: BannerPosition;
  banner_size?: BannerSize;
  current_date?: string; // ISO 8601形式（YYYY-MM-DD）
}

/**
 * バナーが現在表示可能かチェック
 */
export function isBannerDisplayable(banner: SponsorBanner, currentDate: Date = new Date()): boolean {
  // 非アクティブの場合は表示しない
  if (banner.is_active === 0) {
    return false;
  }

  const now = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD形式に変換

  // 開始日が設定されている場合、現在日付が開始日以降かチェック
  if (banner.start_date && banner.start_date > now) {
    return false;
  }

  // 終了日が設定されている場合、現在日付が終了日以前かチェック
  if (banner.end_date && banner.end_date < now) {
    return false;
  }

  return true;
}

/**
 * バナーを表示順にソート
 */
export function sortBannersByDisplayOrder(banners: SponsorBanner[]): SponsorBanner[] {
  return [...banners].sort((a, b) => {
    // display_order昇順、同じ場合はbanner_id昇順
    if (a.display_order !== b.display_order) {
      return a.display_order - b.display_order;
    }
    return a.banner_id - b.banner_id;
  });
}

/**
 * 表示位置のラベルを取得
 */
export function getPositionLabel(position: BannerPosition): string {
  const labels: Record<BannerPosition, string> = {
    top: 'タブ上部',
    bottom: 'ページ下部',
    sidebar: 'サイドバー',
  };
  return labels[position];
}

/**
 * ターゲットタブのラベルを取得
 */
export function getTargetTabLabel(tab: TargetTab): string {
  const labels: Record<TargetTab, string> = {
    all: '全タブ共通',
    overview: '概要',
    schedule: '日程・結果',
    preliminary: '予選',
    final: '決勝',
    standings: '順位表',
    teams: '参加チーム',
  };
  return labels[tab];
}

/**
 * バナーサイズのラベルを取得
 */
export function getBannerSizeLabel(size: BannerSize): string {
  const labels: Record<BannerSize, string> = {
    large: '大バナー',
    small: '小バナー',
  };
  return labels[size];
}

/**
 * バナーサイズに応じた推奨サイズテキストを取得
 */
export function getRecommendedSizeText(size: BannerSize, position: BannerPosition): string | null {
  const sizeSpecs = BANNER_SIZE_SPECS[size];
  if (!sizeSpecs) return null;

  const specs = sizeSpecs[position as keyof typeof sizeSpecs];
  if (!specs) return null;

  return `${specs.width}×${specs.height}px`;
}

/**
 * 小バナーが指定位置に配置可能かチェック
 * 小バナーはサイドバーに配置できない
 */
export function isPositionValidForSize(size: BannerSize, position: BannerPosition): boolean {
  if (size === BANNER_SIZES.SMALL && position === BANNER_POSITIONS.SIDEBAR) {
    return false;
  }
  return true;
}
