/**
 * スポンサーバナーのサーバーサイド取得関数
 */
import { db } from '@/lib/db';
import {
  type SponsorBanner,
  type TargetTab,
  isBannerDisplayable,
  sortBannersByDisplayOrder,
} from '@/lib/sponsor-banner-specs';

export interface BannersByPosition {
  top_large: SponsorBanner[];
  top_small: SponsorBanner[];
  sidebar: SponsorBanner[];
  bottom_large: SponsorBanner[];
  bottom_small: SponsorBanner[];
}

/**
 * 指定した部門・タブに表示するバナーを一括取得（SSR用）
 */
export async function getBannersForTab(
  tournamentId: number,
  targetTab: TargetTab
): Promise<BannersByPosition> {
  try {
    const result = await db.execute({
      sql: `
        SELECT
          banner_id, tournament_id, banner_name, banner_url,
          image_blob_url, display_position, target_tab,
          banner_size, display_order, is_active, start_date,
          end_date, click_count
        FROM t_sponsor_banners
        WHERE tournament_id = ?
          AND is_active = 1
          AND (target_tab = ? OR target_tab = 'all')
        ORDER BY display_order, banner_id
      `,
      args: [tournamentId, targetTab],
    });

    const allBanners = (result.rows as unknown as SponsorBanner[]).filter(b =>
      isBannerDisplayable(b)
    );

    return {
      top_large: sortBannersByDisplayOrder(
        allBanners.filter(b => b.display_position === 'top' && b.banner_size === 'large')
      ),
      top_small: sortBannersByDisplayOrder(
        allBanners.filter(b => b.display_position === 'top' && b.banner_size === 'small')
      ),
      sidebar: sortBannersByDisplayOrder(
        allBanners.filter(b => b.display_position === 'sidebar')
      ),
      bottom_large: sortBannersByDisplayOrder(
        allBanners.filter(b => b.display_position === 'bottom' && b.banner_size === 'large')
      ),
      bottom_small: sortBannersByDisplayOrder(
        allBanners.filter(b => b.display_position === 'bottom' && b.banner_size === 'small')
      ),
    };
  } catch (error) {
    console.error('バナー取得エラー:', error);
    return {
      top_large: [],
      top_small: [],
      sidebar: [],
      bottom_large: [],
      bottom_small: [],
    };
  }
}

/**
 * サイドバーバナーが存在するかチェック（SSR用）
 */
export function hasSidebarBanners(banners: BannersByPosition): boolean {
  return banners.sidebar.length > 0;
}
