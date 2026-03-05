// components/public/TabContentWithSidebarSSR.tsx
// SSR対応のタブコンテンツ＋サイドバーレイアウト

import { ReactNode } from 'react';
import SponsorBannersSSR from '@/components/public/SponsorBannersSSR';
import { type BannersByPosition } from '@/lib/sponsor-banner-loader';

interface TabContentWithSidebarSSRProps {
  banners: BannersByPosition;
  children: ReactNode;
}

export default function TabContentWithSidebarSSR({
  banners,
  children,
}: TabContentWithSidebarSSRProps) {
  const hasSidebar = banners.sidebar.length > 0;

  return (
    <>
      {/* タブ上部バナー */}
      <div className="space-y-4">
        <SponsorBannersSSR banners={banners.top_large} position="top" size="large" />
        <SponsorBannersSSR banners={banners.top_small} position="top" size="small" />
      </div>

      {/* メインコンテンツとサイドバー */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
        <div className="min-w-0">
          {children}
        </div>
        <aside
          className="hidden lg:block space-y-4"
          style={{ width: hasSidebar ? '200px' : '0px' }}
        >
          {hasSidebar && (
            <SponsorBannersSSR banners={banners.sidebar} position="sidebar" size="large" />
          )}
        </aside>
      </div>

      {/* タブ下部バナー */}
      <div className="space-y-4">
        <SponsorBannersSSR banners={banners.bottom_large} position="bottom" size="large" />
        <SponsorBannersSSR banners={banners.bottom_small} position="bottom" size="small" />
      </div>
    </>
  );
}
