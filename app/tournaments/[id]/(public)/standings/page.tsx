// app/tournaments/[id]/standings/page.tsx
// 順位表タブ（全データSSR）
import type { Metadata } from 'next';
import { getTournamentNameForMetadata } from '@/lib/metadata-helpers';
import { getBannersForTab } from '@/lib/sponsor-banner-loader';
import { getTournamentStandings } from '@/lib/standings-calculator';
import { getTournamentWithGroupInfo } from '@/lib/tournament-detail';
import { db } from '@/lib/db';
import TabContentWithSidebarSSR from '@/components/public/TabContentWithSidebarSSR';
import TournamentStandings from '@/components/features/tournament/TournamentStandings';
import type { TournamentPhase } from '@/lib/types/tournament-phases';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const name = await getTournamentNameForMetadata(id);
  return { title: name ? `順位表 - ${name}` : '順位表' };
}

export default async function TournamentStandingsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  const [banners, standings, tournamentData, totalTeamsResult, totalMatchesResult] = await Promise.all([
    getBannersForTab(tournamentId, 'standings'),
    getTournamentStandings(tournamentId),
    getTournamentWithGroupInfo(tournamentId),
    db.execute({
      sql: `SELECT COUNT(DISTINCT tt.tournament_team_id) as total_teams
            FROM t_tournament_teams tt
            WHERE tt.tournament_id = ? AND tt.withdrawal_status = 'active'`,
      args: [tournamentId],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as total_matches
            FROM t_matches_final mf
            JOIN t_matches_live ml ON mf.match_id = ml.match_id
            JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
            WHERE mb.tournament_id = ?`,
      args: [tournamentId],
    }),
  ]);

  const totalTeams = (totalTeamsResult.rows[0]?.total_teams as number) || 0;
  const totalMatches = (totalMatchesResult.rows[0]?.total_matches as number) || 0;

  // phasesからformat_typeマップとnameマップを構築
  const phaseFormatMap: Record<string, string> = {};
  const phaseNameMap: Record<string, string> = {};
  const phases = tournamentData.tournament.phases?.phases as TournamentPhase[] | undefined;
  if (phases) {
    for (const p of phases) {
      if (p.id && p.format_type) phaseFormatMap[p.id] = p.format_type;
      if (p.id && p.name) phaseNameMap[p.id] = p.name;
    }
  }

  return (
    <TabContentWithSidebarSSR banners={banners}>
      <TournamentStandings
        tournamentId={tournamentId}
        initialData={{
          standings,
          totalMatches,
          totalTeams,
          phaseFormatMap,
          phaseNameMap,
        }}
      />
    </TabContentWithSidebarSSR>
  );
}
