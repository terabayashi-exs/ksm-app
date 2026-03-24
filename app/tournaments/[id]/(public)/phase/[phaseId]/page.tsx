// app/tournaments/[id]/phase/[phaseId]/page.tsx
// フェーズタブ（予選戦績表 / 決勝トーナメント表）（SSR）
import { getBannersForTab } from '@/lib/sponsor-banner-loader';
import { getTournamentWithGroupInfo } from '@/lib/tournament-detail';
import { getTournamentBracketData } from '@/lib/tournament-bracket-data';
import TabContentWithSidebarSSR from '@/components/public/TabContentWithSidebarSSR';
import TournamentPhaseView from '@/components/features/tournament/TournamentPhaseView';
import type { TournamentPhase } from '@/lib/types/tournament-phases';

interface PageProps {
  params: Promise<{ id: string; phaseId: string }>;
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
