// app/tournaments/[id]/layout.tsx
import { ReactNode } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ShareButton from '@/components/public/ShareButton';
import TournamentTabNav from '@/components/public/TournamentTabNav';
import { getTournamentWithGroupInfo } from '@/lib/tournament-detail';
import { Home, ChevronRight, FileText } from 'lucide-react';
import { db } from '@/lib/db';
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

  const [data, publicFilesResult, noticesResult, sportCodeResult] = await Promise.all([
    getTournamentWithGroupInfo(tournamentId),
    db.execute(
      `SELECT COUNT(*) as count FROM t_tournament_files WHERE tournament_id = ? AND is_public = 1`,
      [tournamentId]
    ).catch(() => ({ rows: [{ count: 0 }] })),
    db.execute(
      `SELECT COUNT(*) as count FROM t_tournament_notices WHERE tournament_id = ? AND is_active = 1`,
      [tournamentId]
    ).catch(() => ({ rows: [{ count: 0 }] })),
    db.execute(
      `SELECT st.sport_code FROM t_tournaments t
       JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
       WHERE t.tournament_id = ?`,
      [tournamentId]
    ).catch(() => ({ rows: [] })),
  ]);
  const { tournament, group } = data;
  const hasPublicFiles = Number(publicFilesResult.rows[0]?.count ?? 0) > 0;
  const hasNotices = Number(noticesResult.rows[0]?.count ?? 0) > 0;
  const sportCode = sportCodeResult.rows.length > 0 ? String(sportCodeResult.rows[0].sport_code) : '';

  // アーカイブ済みの場合: archived/page.tsx が独自レイアウトを持つので
  // layout のUI（タブ等）はスキップして children をそのまま返す
  if (tournament.is_archived) {
    return <>{children}</>;
  }

  const phaseList = getPhaseList(tournament).filter(p => p.is_visible !== false);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* パンくずリスト */}
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6 no-print">
          <Link
            href="/"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          {group && (
            <>
              <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <Link
                href={`/tournaments/groups/${group.group_id}`}
                className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
              >
                {group.group_name} Top
              </Link>
            </>
          )}
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            {tournament.tournament_name}
          </span>
        </nav>

        {/* ページヘッダー */}
        <div className="mb-8 no-print">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{tournament.tournament_name}</h1>
            <div className="shrink-0">
              <ShareButton tournamentName={tournament.tournament_name} />
            </div>
          </div>
          {group && (
            <p className="text-gray-500 mt-1">（{group.group_name}）</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {hasNotices && (
              <Link
                href={`/tournaments/${tournament.tournament_id}#tournament-notices`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-medium hover:bg-amber-200 transition-colors"
              >
                お知らせあり
              </Link>
            )}
            {hasPublicFiles && (
              <Link
                href={`/tournaments/${tournament.tournament_id}#public-files`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200 transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                大会資料あり
              </Link>
            )}
          </div>
        </div>

        {/* タブナビゲーション */}
        <TournamentTabNav
          tournamentId={tournament.tournament_id}
          phases={phaseList}
          sportCode={sportCode}
        />

        {/* タブコンテンツ */}
        {children}
      </div>

      <Footer />
    </div>
  );
}
