import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import BackButton from '@/components/ui/back-button';
import TournamentBracket from '@/components/features/tournament/TournamentBracket';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import { Tournament } from '@/lib/types';
import { getTournamentById } from '@/lib/tournament-detail';

interface PageProps {
  params: Promise<{ id: string }>;
}

// 大会詳細データを取得する関数
async function getTournamentDetail(id: string): Promise<Tournament> {
  const tournamentId = parseInt(id);
  
  if (isNaN(tournamentId)) {
    throw new Error('有効な大会IDを指定してください');
  }

  return await getTournamentById(tournamentId);
}

// ローディングコンポーネント
function TournamentBracketLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// メインコンテンツコンポーネント
async function TournamentBracketContent({ params }: PageProps) {
  const resolvedParams = await params;
  const tournament = await getTournamentDetail(resolvedParams.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ナビゲーション */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <BackButton />
            <Button variant="ghost" asChild>
              <Link href={`/public/tournaments/${tournament.tournament_id}`} className="flex items-center text-gray-600 hover:text-gray-900">
                <ArrowLeft className="h-4 w-4 mr-2" />
                大会詳細に戻る
              </Link>
            </Button>
          </div>
        </div>

        {/* ページヘッダー */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Trophy className="h-8 w-8 text-yellow-600 mr-3" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{tournament.tournament_name}</h1>
              <p className="text-gray-600">トーナメント表</p>
            </div>
          </div>
          <div className="flex items-center space-x-6 text-sm text-gray-500">
            <div className="flex items-center">
              <span className="font-medium">参加チーム:</span>
              <span className="ml-1">{tournament.team_count}チーム</span>
            </div>
            <div className="flex items-center">
              <span className="font-medium">形式:</span>
              <span className="ml-1">{tournament.format_name}</span>
            </div>
          </div>
        </div>

        {/* トーナメント表 */}
        <TournamentBracket tournamentId={tournament.tournament_id} />
      </div>

      <Footer />
    </div>
  );
}

// エクスポートするメインコンポーネント
export default function TournamentBracketPage({ params }: PageProps) {
  return (
    <Suspense fallback={<TournamentBracketLoading />}>
      <TournamentBracketContent params={params} />
    </Suspense>
  );
}