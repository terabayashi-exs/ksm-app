// app/public/tournaments/[id]/schedule/page.tsx
// 日程・結果タブ（全データSSR）
import { getBannersForTab } from '@/lib/sponsor-banner-loader';
import { getTournamentPublicMatches } from '@/lib/tournament-public-matches';
import TabContentWithSidebarSSR from '@/components/public/TabContentWithSidebarSSR';
import TournamentSchedule from '@/components/features/tournament/TournamentSchedule';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TournamentSchedulePage({ params }: PageProps) {
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  const [banners, matches] = await Promise.all([
    getBannersForTab(tournamentId, 'schedule'),
    getTournamentPublicMatches(tournamentId),
  ]);

  return (
    <TabContentWithSidebarSSR banners={banners}>
      <TournamentSchedule
        tournamentId={tournamentId}
        initialMatches={matches || []}
      />
    </TabContentWithSidebarSSR>
  );
}
