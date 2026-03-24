// app/tournaments/[id]/phase/[phaseId]/page.tsx
// フェーズタブ（予選戦績表 / 決勝トーナメント表）（SSR）
import type { Metadata } from 'next';
import { getTournamentNameForMetadata } from '@/lib/metadata-helpers';
import { getBannersForTab } from '@/lib/sponsor-banner-loader';
import { getTournamentWithGroupInfo } from '@/lib/tournament-detail';
import { getTournamentBracketData } from '@/lib/tournament-bracket-data';
import TabContentWithSidebarSSR from '@/components/public/TabContentWithSidebarSSR';
import TournamentPhaseView from '@/components/features/tournament/TournamentPhaseView';
import type { TournamentPhase } from '@/lib/types/tournament-phases';
import { db } from '@/lib/db';

interface PageProps {
  params: Promise<{ id: string; phaseId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, phaseId } = await params;
  const name = await getTournamentNameForMetadata(id);
  // フェーズ名を取得
  let phaseName = phaseId;
  try {
    const tournamentId = parseInt(id);
    const result = await db.execute(
      `SELECT phases FROM t_tournaments WHERE tournament_id = ?`,
      [tournamentId]
    );
    if (result.rows.length > 0 && result.rows[0].phases) {
      const parsed = typeof result.rows[0].phases === 'string'
        ? JSON.parse(result.rows[0].phases as string)
        : result.rows[0].phases;
      const phase = parsed.phases?.find((p: { id: string; name: string }) => p.id === phaseId);
      if (phase) phaseName = phase.name;
    }
  } catch { /* fallback to phaseId */ }
  return { title: name ? `${phaseName} - ${name}` : phaseName };
}

export default async function TournamentPhasePage({ params }: PageProps) {
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);
  const phaseId = resolvedParams.phaseId;

  // フェーズ情報を取得してバナーのtargetTabとformat_typeを決定
  const [data, banners] = await Promise.all([
    getTournamentWithGroupInfo(tournamentId),
    getBannersForTab(tournamentId, phaseId),
  ]);

  const { tournament } = data;

  // phases JSONからフェーズの設定を取得
  let phaseName = phaseId;
  let formatType: 'league' | 'tournament' | undefined;

  if (tournament.phases?.phases) {
    const phaseConfig = (tournament.phases.phases as TournamentPhase[]).find(
      (p) => p.id === phaseId
    );
    if (phaseConfig) {
      phaseName = phaseConfig.name;
      formatType = phaseConfig.format_type;
    }
  }

  // トーナメント形式の場合はbracketデータをSSRで事前取得
  let initialBracketMatches;
  let initialBracketSportConfig;
  if (formatType === 'tournament') {
    try {
      const bracketResult = await getTournamentBracketData(tournamentId, phaseId);
      initialBracketMatches = bracketResult.data;
      initialBracketSportConfig = bracketResult.sport_config;
    } catch {
      // エラー時はクライアントサイドでリトライ
    }
  }

  return (
    <TabContentWithSidebarSSR banners={banners}>
      <TournamentPhaseView
        tournamentId={tournamentId}
        phase={phaseId}
        phaseName={phaseName}
        formatType={formatType}
        initialBracketMatches={initialBracketMatches}
        initialBracketSportConfig={initialBracketSportConfig}
      />
    </TabContentWithSidebarSSR>
  );
}
