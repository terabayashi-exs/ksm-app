import type { Metadata } from "next";
import DisciplinaryPublicView from "@/components/public/DisciplinaryPublicView";
import TabContentWithSidebarSSR from "@/components/public/TabContentWithSidebarSSR";
import { db } from "@/lib/db";
import {
  getDisciplinarySettings,
  getDivisionDisciplinaryData,
} from "@/lib/disciplinary-calculator";
import { getTournamentNameForMetadata } from "@/lib/metadata-helpers";
import { getBannersForTab } from "@/lib/sponsor-banner-loader";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const name = await getTournamentNameForMetadata(id);
  return { title: name ? `${name} 懲罰一覧` : "懲罰一覧" };
}

export default async function DisciplinaryPage({ params }: PageProps) {
  const { id } = await params;
  const tournamentId = parseInt(id);

  // group_id取得
  const tournamentResult = await db.execute(
    `SELECT group_id FROM t_tournaments WHERE tournament_id = ?`,
    [tournamentId],
  );
  const groupId = tournamentResult.rows.length > 0 ? Number(tournamentResult.rows[0].group_id) : 0;

  const [teams, settings, banners] = await Promise.all([
    getDivisionDisciplinaryData(tournamentId),
    getDisciplinarySettings(groupId),
    getBannersForTab(tournamentId, "overview"),
  ]);

  return (
    <TabContentWithSidebarSSR banners={banners}>
      <DisciplinaryPublicView teams={teams} settings={settings} />
    </TabContentWithSidebarSSR>
  );
}
