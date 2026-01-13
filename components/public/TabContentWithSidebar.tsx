// components/public/TabContentWithSidebar.tsx
// タブコンテンツとサイドバーを持つレイアウトコンポーネント

'use client';

import { ReactNode } from 'react';
import SponsorBanners from '@/components/public/SponsorBanners';
import { useSidebarBanners } from '@/hooks/useSidebarBanners';

interface TabContentWithSidebarProps {
  tournamentId: number;
  targetTab: 'overview' | 'schedule' | 'preliminary' | 'final' | 'standings' | 'teams';
  children: ReactNode;
}

export default function TabContentWithSidebar({
  tournamentId,
  targetTab,
  children,
}: TabContentWithSidebarProps) {
  // サイドバーバナーの有無を判定
  const { hasBanners, loading } = useSidebarBanners(tournamentId, targetTab);

  // ローディング中は2カラムレイアウト（ちらつき防止）
  const showSidebar = loading || hasBanners;

  return (
    <>
      {/* タブ上部バナー */}
      <SponsorBanners tournamentId={tournamentId} position="top" targetTab={targetTab} />

      {/* メインコンテンツとサイドバー */}
      <div className={showSidebar ? 'grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-6' : ''}>
        {/* メインコンテンツ */}
        <div className="min-w-0">
          {children}
        </div>

        {/* サイドバー（バナーがある場合のみ表示） */}
        {showSidebar && (
          <aside className="hidden lg:block space-y-4">
            <SponsorBanners tournamentId={tournamentId} position="sidebar" targetTab={targetTab} />
          </aside>
        )}
      </div>

      {/* タブ下部バナー */}
      <SponsorBanners tournamentId={tournamentId} position="bottom" targetTab={targetTab} />
    </>
  );
}
