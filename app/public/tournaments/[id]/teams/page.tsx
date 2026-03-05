// app/public/tournaments/[id]/teams/page.tsx
// 参加チームタブ（全データSSR）
import { getBannersForTab } from '@/lib/sponsor-banner-loader';
import { getSimpleTournamentTeams } from '@/lib/tournament-teams-simple';
import TabContentWithSidebarSSR from '@/components/public/TabContentWithSidebarSSR';
import TournamentTeams from '@/components/features/tournament/TournamentTeams';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TournamentTeamsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  const [banners, teamsData] = await Promise.all([
    getBannersForTab(tournamentId, 'teams'),
    getSimpleTournamentTeams(tournamentId),
  ]);

  return (
    <TabContentWithSidebarSSR banners={banners}>
      <TournamentTeams
        tournamentId={tournamentId}
        initialTeamsData={teamsData}
      />
    </TabContentWithSidebarSSR>
  );
}
