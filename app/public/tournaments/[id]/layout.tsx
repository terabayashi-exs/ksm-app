// app/public/tournaments/[id]/layout.tsx
import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import DivisionSwitcher from '@/components/features/tournament/DivisionSwitcher';
import TournamentTabNav from '@/components/public/TournamentTabNav';
import { getTournamentWithGroupInfo } from '@/lib/tournament-detail';
import { ArrowLeft, Home, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TournamentPhase } from '@/lib/types/tournament-phases';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

function getPhaseList(tournament: { phases?: { phases: TournamentPhase[] } | null }): TournamentPhase[] {
  if (tournament.phases?.phases && tournament.phases.phases.length > 0) {
    return [...tournament.phases.phases].sort((a, b) => a.order - b.order);
  }
  return [
    { id: 'preliminary', order: 1, name: '予選', format_type: 'league' as const },
    { id: 'final', order: 2, name: '決勝', format_type: 'tournament' as const },
  ];
}

export default async function TournamentDetailLayout({ children, params }: LayoutProps) {
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  if (isNaN(tournamentId)) {
    throw new Error('有効な大会IDを指定してください');
  }

  const data = await getTournamentWithGroupInfo(tournamentId);
  const { tournament, group, sibling_divisions } = data;

  if (tournament.is_archived) {
    redirect(`/public/tournaments/${resolvedParams.id}/archived`);
  }

  const phaseList = getPhaseList(tournament);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* パンくずリスト */}
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-6 no-print">
          <Link href="/" className="hover:text-foreground flex items-center">
            <Home className="h-4 w-4" />
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/tournaments" className="hover:text-foreground">
            大会一覧
          </Link>
          {group && (
            <>
              <ChevronRight className="h-4 w-4" />
              <Link href={`/public/tournaments/groups/${group.group_id}`} className="hover:text-foreground">
                {group.group_name}
              </Link>
            </>
          )}
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">{tournament.tournament_name}</span>
        </nav>

        {/* ナビゲーションボタン */}
        <div className="flex items-center gap-3 mb-6 no-print">
          {group ? (
            <Button variant="outline" asChild>
              <Link href={`/public/tournaments/groups/${group.group_id}`} className="flex items-center">
                <ArrowLeft className="h-4 w-4 mr-2" />
                大会トップに戻る
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link href="/" className="flex items-center text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4 mr-2" />
                TOPページに戻る
              </Link>
            </Button>
          )}
        </div>

        {/* ページヘッダー */}
        <div className="mb-8 no-print">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground mb-2">{tournament.tournament_name}</h1>
              <p className="text-muted-foreground">部門の詳細情報をご覧いただけます</p>
            </div>
            <div className="sm:ml-4">
              <DivisionSwitcher
                currentDivisionId={tournament.tournament_id}
                currentDivisionName={tournament.tournament_name}
                siblingDivisions={sibling_divisions}
              />
            </div>
          </div>
        </div>

        {/* タブナビゲーション */}
        <TournamentTabNav
          tournamentId={tournament.tournament_id}
          phases={phaseList}
        />

        {/* タブコンテンツ */}
        {children}
      </div>

      <Footer />
    </div>
  );
}
