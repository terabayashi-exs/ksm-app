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

  // バナーが確定している場合のみサイドバー幅を確保
  // 読み込み中やバナーなしの場合は幅0（レイアウトシフト防止）
  const sidebarWidth = !loading && hasBanners ? '200px' : '0px';

  return (
    <>
      {/* タブ上部バナー */}
      <div className="space-y-4">
        {/* 大バナー */}
        <SponsorBanners tournamentId={tournamentId} position="top" targetTab={targetTab} size="large" />
        {/* 小バナー */}
        <SponsorBanners tournamentId={tournamentId} position="top" targetTab={targetTab} size="small" />
      </div>

      {/* メインコンテンツとサイドバー（常に2カラムレイアウト） */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
        {/* メインコンテンツ */}
        <div className="min-w-0">
          {children}
        </div>

        {/* サイドバー（バナーがある場合のみ幅200px、大バナーのみ） */}
        <aside
          className="hidden lg:block space-y-4 transition-all duration-300"
          style={{ width: sidebarWidth }}
        >
          {hasBanners && !loading && (
            <SponsorBanners tournamentId={tournamentId} position="sidebar" targetTab={targetTab} size="large" />
          )}
        </aside>
      </div>

      {/* タブ下部バナー */}
      <div className="space-y-4">
        {/* 大バナー */}
        <SponsorBanners tournamentId={tournamentId} position="bottom" targetTab={targetTab} size="large" />
        {/* 小バナー */}
        <SponsorBanners tournamentId={tournamentId} position="bottom" targetTab={targetTab} size="small" />
      </div>
    </>
  );
}
