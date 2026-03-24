// app/tournaments/[id]/teams/page.tsx
// 参加チームタブ（全データSSR）
import { getBannersForTab } from '@/lib/sponsor-banner-loader';
import { getSimpleTournamentTeams } from '@/lib/tournament-teams-simple';
import TabContentWithSidebarSSR from '@/components/public/TabContentWithSidebarSSR';
import TournamentTeams from '@/components/features/tournament/TournamentTeams';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TournamentTeamsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  const [banners, teamsData, session, tournamentResult] = await Promise.all([
    getBannersForTab(tournamentId, 'teams'),
    getSimpleTournamentTeams(tournamentId),
    auth(),
    db.execute({
      sql: 'SELECT show_players_public FROM t_tournaments WHERE tournament_id = ?',
      args: [tournamentId]
    }),
  ]);

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'operator';
  const showPlayersPublic = tournamentResult.rows.length > 0
    ? Number(tournamentResult.rows[0].show_players_public) === 1
    : false;
  const canViewPlayers = isAdmin || showPlayersPublic;

  return (
    <TabContentWithSidebarSSR banners={banners}>
      <TournamentTeams
        tournamentId={tournamentId}
        initialTeamsData={teamsData}
        initialCanViewPlayers={canViewPlayers}
      />
    </TabContentWithSidebarSSR>
  );
}
