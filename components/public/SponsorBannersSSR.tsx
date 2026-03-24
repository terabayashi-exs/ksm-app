'use client';

import Image from 'next/image';
import { type SponsorBanner, BANNER_SIZES } from '@/lib/sponsor-banner-specs';

interface SponsorBannersSSRProps {
  banners: SponsorBanner[];
  position: 'top' | 'bottom' | 'sidebar';
  size?: 'large' | 'small';
}

/**
 * SSRでデータ取得済みのバナーを表示するコンポーネント
 * クリックトラッキングのみクライアントサイドで実行
 */
export default function SponsorBannersSSR({ banners, position, size }: SponsorBannersSSRProps) {
  if (banners.length === 0) return null;

  const handleBannerClick = (banner: SponsorBanner) => {
    fetch(`/api/sponsor-banners/${banner.banner_id}/click`, {
      method: 'POST',
    }).catch(() => {});
    if (banner.banner_url) {
      window.open(banner.banner_url, '_blank', 'noopener,noreferrer');
    }
  };

  const getBannerClass = () => {
    if (position === 'sidebar') return 'w-full';
    return 'w-full max-w-4xl mx-auto';
  };

  const isSmallBanner = size === BANNER_SIZES.SMALL;

  const renderBannerItem = (banner: SponsorBanner) => (
    <div
      key={banner.banner_id}
      className={`${position !== 'sidebar' ? getBannerClass() : ''} ${banner.banner_url ? 'cursor-pointer' : ''}`}
      onClick={() => handleBannerClick(banner)}
      role={banner.banner_url ? 'button' : undefined}
      tabIndex={banner.banner_url ? 0 : undefined}
      onKeyDown={(e) => {
        if (banner.banner_url && (e.key === 'Enter' || e.key === ' ')) {
          handleBannerClick(banner);
        }
      }}
    >
      <div className="relative w-full bg-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div
          className="relative w-full"
          style={{
            paddingBottom: position === 'sidebar' ? '200%' : isSmallBanner ? '25.6%' : '16.67%',
          }}
        >
          <Image
            src={banner.image_blob_url}
            alt={banner.banner_name}
            fill
            className="object-contain"
            sizes={
              position === 'sidebar'
                ? '(max-width: 768px) 100vw, 300px'
                : isSmallBanner
                  ? '(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16.6vw'
                  : '(max-width: 768px) 100vw, 1200px'
            }
            priority={position === 'top' && !isSmallBanner}
          />
        </div>
      </div>
    </div>
  );

  if (position === 'sidebar') {
    return <div className="space-y-4">{banners.map(renderBannerItem)}</div>;
  }

  if (isSmallBanner) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {banners.map(renderBannerItem)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {banners.map(renderBannerItem)}
    </div>
  );
}
