// app/tournaments/[id]/teams/page.tsx
// 参加チームタブ（全データSSR）
import type { Metadata } from 'next';
import { getTournamentNameForMetadata } from '@/lib/metadata-helpers';
import { getBannersForTab } from '@/lib/sponsor-banner-loader';
import { getSimpleTournamentTeams } from '@/lib/tournament-teams-simple';
import TabContentWithSidebarSSR from '@/components/public/TabContentWithSidebarSSR';
import TournamentTeams from '@/components/features/tournament/TournamentTeams';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const name = await getTournamentNameForMetadata(id);
  return { title: name ? `参加チーム - ${name}` : '参加チーム' };
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
