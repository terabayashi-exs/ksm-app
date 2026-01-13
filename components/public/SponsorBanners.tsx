'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  type SponsorBanner,
  type BannerPosition,
  type TargetTab,
  isBannerDisplayable,
  sortBannersByDisplayOrder,
} from '@/lib/sponsor-banner-specs';

interface SponsorBannersProps {
  tournamentId: number;
  position: BannerPosition;
  targetTab: TargetTab;
}

export default function SponsorBanners({ tournamentId, position, targetTab }: SponsorBannersProps) {
  const [banners, setBanners] = useState<SponsorBanner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const response = await fetch(`/api/public/sponsor-banners?tournament_id=${tournamentId}&position=${position}&tab=${targetTab}`);

        if (!response.ok) {
          throw new Error('バナーの取得に失敗しました');
        }

        const data = await response.json();

        // 表示可能なバナーのみフィルタリング
        const displayableBanners = data.banners.filter((banner: SponsorBanner) =>
          isBannerDisplayable(banner)
        );

        setBanners(sortBannersByDisplayOrder(displayableBanners));
      } catch (error) {
        console.error('バナー取得エラー:', error);
        setBanners([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBanners();
  }, [tournamentId, position, targetTab]);

  // バナークリック時の処理
  const handleBannerClick = async (banner: SponsorBanner) => {
    // クリック数をカウント（非同期、結果は待たない）
    fetch(`/api/public/sponsor-banners/${banner.banner_id}/click`, {
      method: 'POST',
    }).catch((error) => {
      console.error('クリック計測エラー:', error);
    });

    // URLが設定されている場合は新しいタブで開く
    if (banner.banner_url) {
      window.open(banner.banner_url, '_blank', 'noopener,noreferrer');
    }
  };

  if (loading || banners.length === 0) {
    return null;
  }

  // 表示位置に応じたスタイリング
  const getContainerClass = () => {
    switch (position) {
      case 'top':
        return 'mb-6';
      case 'bottom':
        return 'mt-8';
      case 'sidebar':
        return 'space-y-4';
      default:
        return '';
    }
  };

  const getBannerClass = () => {
    switch (position) {
      case 'top':
      case 'bottom':
        return 'w-full max-w-4xl mx-auto';
      case 'sidebar':
        return 'w-full';
      default:
        return '';
    }
  };

  return (
    <div className={getContainerClass()}>
      {position === 'sidebar' ? (
        // サイドバー: 縦に並べる
        <div className="space-y-4">
          {banners.map((banner) => (
            <div
              key={banner.banner_id}
              className={`${getBannerClass()} ${banner.banner_url ? 'cursor-pointer' : ''}`}
              onClick={() => handleBannerClick(banner)}
              role={banner.banner_url ? 'button' : undefined}
              tabIndex={banner.banner_url ? 0 : undefined}
              onKeyDown={(e) => {
                if (banner.banner_url && (e.key === 'Enter' || e.key === ' ')) {
                  handleBannerClick(banner);
                }
              }}
            >
              <div className="relative w-full bg-gray-100 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="relative w-full" style={{ paddingBottom: '200%' }}>
                  <Image
                    src={banner.image_blob_url}
                    alt={banner.banner_name}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 300px"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // トップ・ボトム: 横スクロールまたはグリッド
        <div className="flex flex-col gap-4">
          {banners.map((banner) => (
            <div
              key={banner.banner_id}
              className={`${getBannerClass()} ${banner.banner_url ? 'cursor-pointer' : ''}`}
              onClick={() => handleBannerClick(banner)}
              role={banner.banner_url ? 'button' : undefined}
              tabIndex={banner.banner_url ? 0 : undefined}
              onKeyDown={(e) => {
                if (banner.banner_url && (e.key === 'Enter' || e.key === ' ')) {
                  handleBannerClick(banner);
                }
              }}
            >
              <div className="relative w-full bg-gray-100 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="relative w-full" style={{ paddingBottom: '16.67%' }}>
                  <Image
                    src={banner.image_blob_url}
                    alt={banner.banner_name}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 1200px"
                    priority={position === 'top'}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
