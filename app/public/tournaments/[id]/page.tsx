// app/public/tournaments/[id]/page.tsx
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import BackButton from '@/components/ui/back-button';
import TournamentSchedule from '@/components/features/tournament/TournamentSchedule';
import TournamentStandings from '@/components/features/tournament/TournamentStandings';
import TournamentResults from '@/components/features/tournament/TournamentResults';
import TournamentTeams from '@/components/features/tournament/TournamentTeams';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Calendar, MapPin, Trophy, Users, Clock, Target, Award, BarChart3, FileText, ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Tournament } from '@/lib/types';
import { getTournamentById } from '@/lib/tournament-detail';
import { checkTournamentPdfFiles } from '@/lib/pdf-utils';

interface PageProps {
  params: Promise<{ id: string }>;
}

// 大会詳細データを取得する関数
async function getTournamentDetail(id: string): Promise<Tournament> {
  const tournamentId = parseInt(id);
  
  if (isNaN(tournamentId)) {
    throw new Error('有効な大会IDを指定してください');
  }

  const tournament = await getTournamentById(tournamentId);
  
  // アーカイブされた大会の場合は専用ページにリダイレクト
  if (tournament.is_archived) {
    throw new Error('ARCHIVED_TOURNAMENT');
  }

  return tournament;
}

// 大会概要タブのコンテンツ
function TournamentOverview({ 
  tournament, 
  bracketPdfExists, 
  resultsPdfExists 
}: { 
  tournament: Tournament;
  bracketPdfExists: boolean;
  resultsPdfExists: boolean;
}) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ongoing':
        return <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">進行中</span>;
      case 'completed':
        return <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">完了</span>;
      case 'planning':
      default:
        return <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">開催予定</span>;
    }
  };

  // 開催日程をパース
  const tournamentDates = tournament.tournament_dates ? JSON.parse(tournament.tournament_dates) : {};
  const dateEntries = Object.entries(tournamentDates).sort(([a], [b]) => Number(a) - Number(b));

  return (
    <div className="space-y-6">
      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trophy className="h-5 w-5 mr-2 text-blue-600" />
            大会基本情報
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">大会名</h4>
              <p className="text-lg font-semibold">{tournament.tournament_name}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">ステータス</h4>
              {getStatusBadge(tournament.status)}
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">フォーマット</h4>
              <p className="text-gray-900">{tournament.format_name || '未設定'}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                会場
              </h4>
              <p className="text-gray-900">{tournament.venue_name || '未設定'}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                参加チーム数
              </h4>
              <p className="text-gray-900">{tournament.team_count}チーム</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">コート数</h4>
              <p className="text-gray-900">{tournament.court_count}コート</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PDF ダウンロードエリア - 存在するPDFのみ表示 */}
      {(bracketPdfExists || resultsPdfExists) && (
        <div className={`grid grid-cols-1 ${bracketPdfExists && resultsPdfExists ? 'lg:grid-cols-2' : ''} gap-6`}>
          {/* PDF トーナメント表リンク */}
          {bracketPdfExists && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-green-600" />
                  トーナメント表（PDF版）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-3 p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex-1">
                    <h4 className="font-medium text-green-800 mb-1">PDFでトーナメント表を表示</h4>
                    <p className="text-sm text-green-700">
                      手動作成されたトーナメント表をPDF形式でご覧いただけます。印刷や詳細確認に最適です。
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      ※ 最新の試合結果は「日程・結果」ページをご確認ください
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <Button asChild className="bg-green-600 hover:bg-green-700">
                      <Link 
                        href={`/public/tournaments/${tournament.tournament_id}/bracket-pdf`}
                        className="flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        PDF表示
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PDF 結果表リンク */}
          {resultsPdfExists && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
                  結果表（PDF版）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-800 mb-1">PDFで結果表を表示</h4>
                    <p className="text-sm text-blue-700">
                      手動作成された結果表をPDF形式でご覧いただけます。順位・戦績の確認に最適です。
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      ※ 最新の順位・戦績は「順位表」「戦績表」ページをご確認ください
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <Button asChild className="bg-blue-600 hover:bg-blue-700">
                      <Link 
                        href={`/public/tournaments/${tournament.tournament_id}/results-pdf`}
                        className="flex items-center gap-2"
                      >
                        <BarChart3 className="h-4 w-4" />
                        PDF表示
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 開催日程 */}
      {dateEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-green-600" />
              開催日程
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dateEntries.map(([dayNumber, date]) => (
                <div key={dayNumber} className="flex items-center p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                    {dayNumber}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">第{dayNumber}日</p>
                    <p className="font-medium">{formatDate(date as string)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 試合設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="h-5 w-5 mr-2 text-purple-600" />
            試合設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{tournament.match_duration_minutes}</p>
              <p className="text-sm text-gray-600">試合時間（分）</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{tournament.break_duration_minutes}</p>
              <p className="text-sm text-gray-600">休憩時間（分）</p>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600">{tournament.win_points}</p>
              <p className="text-sm text-gray-600">勝利時獲得ポイント</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-600">{tournament.draw_points}</p>
              <p className="text-sm text-gray-600">引分時獲得ポイント</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 募集期間 */}
      {tournament.recruitment_start_date && tournament.recruitment_end_date && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Target className="h-5 w-5 mr-2 text-orange-600" />
              募集期間
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">開始</p>
                <p className="font-medium">{formatDate(tournament.recruitment_start_date)}</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-0.5 bg-orange-300"></div>
              </div>
              <div>
                <p className="text-sm text-gray-600">終了</p>
                <p className="font-medium">{formatDate(tournament.recruitment_end_date)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 日程・結果タブ
function ScheduleResults({ tournament }: { tournament: Tournament }) {
  return <TournamentSchedule tournamentId={tournament.tournament_id} />;
}


// 戦績表タブ
function Results({ tournament }: { tournament: Tournament }) {
  return <TournamentResults tournamentId={tournament.tournament_id} />;
}

// 順位表タブ
function Standings({ tournament }: { tournament: Tournament }) {
  return <TournamentStandings tournamentId={tournament.tournament_id} />;
}

// 参加チームタブ
function Teams({ tournament }: { tournament: Tournament }) {
  return <TournamentTeams tournamentId={tournament.tournament_id} />;
}

// ローディングコンポーネント
function TournamentDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded mb-6"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// メインコンポーネント
async function TournamentDetailContent({ params }: PageProps) {
  const resolvedParams = await params;
  
  try {
    const tournament = await getTournamentDetail(resolvedParams.id);
    
    // PDFファイルの存在チェック
    const { bracketPdfExists, resultsPdfExists } = await checkTournamentPdfFiles(tournament.tournament_id);

    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* ナビゲーション */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <BackButton />
              <Button variant="ghost" asChild>
                <Link href="/" className="flex items-center text-gray-600 hover:text-gray-900">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  TOPページに戻る
                </Link>
              </Button>
            </div>
          </div>

          {/* ページヘッダー */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{tournament.tournament_name}</h1>
            <p className="text-gray-600">大会の詳細情報をご覧いただけます</p>
          </div>

          {/* タブナビゲーション */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full mb-8 grid-cols-3 grid-rows-2 gap-1 h-auto sm:grid-cols-5 sm:grid-rows-1">
              <TabsTrigger value="overview" className="flex items-center justify-center py-3 text-xs sm:text-sm">
                <Trophy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline sm:inline">大会</span>概要
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex items-center justify-center py-3 text-xs sm:text-sm">
                <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline sm:inline">日程・</span>結果
              </TabsTrigger>
              <TabsTrigger value="results" className="flex items-center justify-center py-3 text-xs sm:text-sm">
                <Award className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                戦績表
              </TabsTrigger>
              <TabsTrigger value="standings" className="flex items-center justify-center py-3 text-xs sm:text-sm">
                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                順位表
              </TabsTrigger>
              <TabsTrigger value="teams" className="flex items-center justify-center py-3 text-xs sm:text-sm">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline sm:inline">参加</span>チーム
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <TournamentOverview 
                tournament={tournament} 
                bracketPdfExists={bracketPdfExists} 
                resultsPdfExists={resultsPdfExists} 
              />
            </TabsContent>

            <TabsContent value="schedule">
              <ScheduleResults tournament={tournament} />
            </TabsContent>

            <TabsContent value="results">
              <Results tournament={tournament} />
            </TabsContent>

            <TabsContent value="standings">
              <Standings tournament={tournament} />
            </TabsContent>

            <TabsContent value="teams">
              <Teams tournament={tournament} />
            </TabsContent>
          </Tabs>
        </div>

        <Footer />
      </div>
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'ARCHIVED_TOURNAMENT') {
      // アーカイブされた大会の場合は専用ページにリダイレクト
      redirect(`/public/tournaments/${resolvedParams.id}/archived`);
    }
    
    // その他のエラーの場合はエラーページを表示
    throw error;
  }
}

export default function TournamentDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<TournamentDetailLoading />}>
      <TournamentDetailContent params={params} />
    </Suspense>
  );
}