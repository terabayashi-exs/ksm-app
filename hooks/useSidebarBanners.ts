// hooks/useSidebarBanners.ts
// サイドバーバナーの有無を判定するカスタムフック

'use client';

import { useEffect, useState } from 'react';
import { type SponsorBanner, isBannerDisplayable } from '@/lib/sponsor-banner-specs';
import { type TargetTab } from '@/lib/sponsor-banner-specs';

export function useSidebarBanners(tournamentId: number, targetTab: TargetTab) {
  const [hasBanners, setHasBanners] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const response = await fetch(
          `/api/public/sponsor-banners?tournament_id=${tournamentId}&position=sidebar&tab=${targetTab}`
        );

        if (!response.ok) {
          setHasBanners(false);
          return;
        }

        const data = await response.json();

        // 表示可能なバナーがあるかチェック
        const displayableBanners = data.banners.filter((banner: SponsorBanner) =>
          isBannerDisplayable(banner)
        );

        setHasBanners(displayableBanners.length > 0);
      } catch (error) {
        console.error('バナー取得エラー:', error);
        setHasBanners(false);
      } finally {
        setLoading(false);
      }
    };

    fetchBanners();
  }, [tournamentId, targetTab]);

  return { hasBanners, loading };
}
