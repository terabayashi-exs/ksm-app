// app/public/tournaments/[id]/schedule/page.tsx
// 日程・結果タブ（全データSSR）
import { getBannersForTab } from '@/lib/sponsor-banner-loader';
import { getTournamentPublicMatches } from '@/lib/tournament-public-matches';
import TabContentWithSidebarSSR from '@/components/public/TabContentWithSidebarSSR';
import TournamentSchedule from '@/components/features/tournament/TournamentSchedule';
import { db } from '@/lib/db';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getTournamentVenues(tournamentId: number) {
  try {
    // t_tournaments.venue_id（JSON配列）と t_matches_live.venue_id（個別試合）の両方から会場IDを収集
    const venueIds = new Set<number>();

    // 1. 部門に設定された会場
    const tournamentRow = await db.execute(`SELECT venue_id FROM t_tournaments WHERE tournament_id = ?`, [tournamentId]);
    const venueIdJson = tournamentRow.rows[0]?.venue_id;
    if (venueIdJson) {
      const venueIdStr = String(venueIdJson);
      const normalizedJson = venueIdStr.startsWith('[') ? venueIdStr : `[${venueIdStr}]`;
      try {
        const ids = JSON.parse(normalizedJson) as number[];
        ids.forEach(id => venueIds.add(id));
      } catch { /* ignore parse error */ }
    }

    // 2. 試合に設定された会場
    const matchVenueResult = await db.execute(`
      SELECT DISTINCT ml.venue_id
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND ml.venue_id IS NOT NULL
    `, [tournamentId]);
    matchVenueResult.rows.forEach(r => {
      if (r.venue_id) venueIds.add(Number(r.venue_id));
    });

    if (venueIds.size === 0) return [];

    const idList = Array.from(venueIds).join(',');
    const venueResult = await db.execute(`
      SELECT venue_id, venue_name, google_maps_url
      FROM m_venues WHERE venue_id IN (${idList})
    `);

    return venueResult.rows.map(r => ({
      venue_id: Number(r.venue_id),
      venue_name: String(r.venue_name),
      google_maps_url: r.google_maps_url ? String(r.google_maps_url) : null,
    }));
  } catch (err) {
    console.error('会場情報取得エラー:', err);
    return [];
  }
}

export default async function TournamentSchedulePage({ params }: PageProps) {
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  const [banners, matches, venues] = await Promise.all([
    getBannersForTab(tournamentId, 'schedule'),
    getTournamentPublicMatches(tournamentId),
    getTournamentVenues(tournamentId),
  ]);

  return (
    <TabContentWithSidebarSSR banners={banners}>
      <TournamentSchedule
        tournamentId={tournamentId}
        initialMatches={matches || []}
        initialVenues={venues}
      />
    </TabContentWithSidebarSSR>
  );
}
