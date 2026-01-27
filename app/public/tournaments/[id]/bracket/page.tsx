import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-64 bg-muted rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="h-64 bg-muted rounded"></div>
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
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ナビゲーション */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <BackButton />
            <Button variant="ghost" asChild>
              <Link href={`/public/tournaments/${tournament.tournament_id}`} className="flex items-center text-muted-foreground hover:text-foreground">
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
              <h1 className="text-3xl font-bold text-foreground">{tournament.tournament_name}</h1>
              <p className="text-muted-foreground">トーナメント表</p>
            </div>
          </div>
          <div className="flex items-center space-x-6 text-sm text-muted-foreground">
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

        {/* 操作ガイドと注意事項 */}
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                </div>
                <div className="text-sm text-green-700">
                  <p className="font-medium mb-1">PDF出力方法</p>
                  <ul className="list-disc list-inside space-y-1 text-green-600">
                    <li>「PDF出力（印刷）」ボタンをクリック</li>
                    <li>印刷ダイアログで「送信先」を「PDFに保存」を選択</li>
                    <li>用紙サイズを「A4」、向きを「横」に設定</li>
                    <li>「詳細設定」で「背景のグラフィック」をオンにする</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-2 w-2 bg-blue-400 rounded-full"></div>
                </div>
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">トーナメント表の見方</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-600">
                    <li>実線は勝利チームの勝ち上がり、点線は敗者の進出先（3位決定戦）</li>
                    <li>太字は勝利チーム、数字は得点を表示</li>
                    <li>［T1］などは試合コードを表示</li>
                    <li>各ブロック上位2チームが決勝トーナメントに進出</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
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