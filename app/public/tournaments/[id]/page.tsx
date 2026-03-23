// app/public/tournaments/[id]/page.tsx
// 概要タブ（SSR）
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Calendar, MapPin, Trophy, Users, Clock, Target, BarChart3, FileText, ExternalLink } from 'lucide-react';
import { formatDateOnly } from '@/lib/utils';
import { getTournamentWithGroupInfo } from '@/lib/tournament-detail';
import { checkTournamentPdfFiles } from '@/lib/pdf-utils';
import { getBannersForTab } from '@/lib/sponsor-banner-loader';
import TabContentWithSidebarSSR from '@/components/public/TabContentWithSidebarSSR';
import PublicFilesList from '@/components/features/tournament/PublicFilesList';
import type { Tournament } from '@/lib/types';
import { parseVenueIds } from '@/lib/types';
import { db } from '@/lib/db';

interface VenueInfo {
  venue_id: number;
  venue_name: string;
  google_maps_url: string | null;
}

async function getVenuesForTournament(venueIdJson: string | null): Promise<VenueInfo[]> {
  const venueIds = parseVenueIds(venueIdJson);
  if (venueIds.length === 0) return [];
  try {
    const placeholders = venueIds.map(() => '?').join(',');
    const result = await db.execute(
      `SELECT venue_id, venue_name, google_maps_url FROM m_venues WHERE venue_id IN (${placeholders})`,
      venueIds
    );
    return (result.rows || []).map(r => ({
      venue_id: Number(r.venue_id),
      venue_name: String(r.venue_name),
      google_maps_url: r.google_maps_url ? String(r.google_maps_url) : null,
    }));
  } catch {
    return [];
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TournamentOverviewPage({ params }: PageProps) {
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  const [data, pdfFiles, banners] = await Promise.all([
    getTournamentWithGroupInfo(tournamentId),
    checkTournamentPdfFiles(tournamentId),
    getBannersForTab(tournamentId, 'overview'),
  ]);

  const { tournament } = data;

  // アーカイブ済みの場合はアーカイブページにリダイレクト
  if (tournament.is_archived) {
    redirect(`/public/tournaments/${resolvedParams.id}/archived`);
  }
  const { bracketPdfExists, resultsPdfExists } = pdfFiles;

  const venues = await getVenuesForTournament(tournament.venue_id);

  return (
    <TabContentWithSidebarSSR banners={banners}>
      <TournamentOverview
        tournament={tournament}
        bracketPdfExists={bracketPdfExists}
        resultsPdfExists={resultsPdfExists}
        venues={venues}
      />
    </TabContentWithSidebarSSR>
  );
}

function TournamentOverview({
  tournament,
  bracketPdfExists,
  resultsPdfExists,
  venues,
}: {
  tournament: Tournament;
  bracketPdfExists: boolean;
  resultsPdfExists: boolean;
  venues: VenueInfo[];
}) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ongoing':
        return <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">開催中</span>;
      case 'completed':
        return <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-50 text-gray-900">完了</span>;
      case 'planning':
      default:
        return <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">開催予定</span>;
    }
  };

  const tournamentDates = tournament.tournament_dates ? JSON.parse(tournament.tournament_dates) : {};
  // 有効な日付のみフィルタリング（空文字列や不正な値を除外）
  const dateEntries = Object.entries(tournamentDates)
    .filter(([, date]) => date && typeof date === 'string' && (date as string).trim() !== '' && !isNaN(new Date(date as string).getTime()))
    .sort(([a], [b]) => Number(a) - Number(b));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trophy className="h-5 w-5 mr-2 text-primary" />
            大会基本情報
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <h4 className="font-medium text-gray-500 mb-2">大会名</h4>
              <p className="text-lg font-semibold">{tournament.tournament_name}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-500 mb-2">ステータス</h4>
              {getStatusBadge(tournament.status)}
            </div>
            <div>
              <h4 className="font-medium text-gray-500 mb-2">大会形式</h4>
              {tournament.phases?.phases && tournament.phases.phases.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tournament.phases.phases
                    .sort((a, b) => a.order - b.order)
                    .map((phase) => (
                      <span key={phase.id} className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {phase.display_name || phase.name}
                      </span>
                    ))}
                </div>
              ) : (
                <p className="text-gray-900">{tournament.format_name || '未設定'}</p>
              )}
            </div>
            <div>
              <h4 className="font-medium text-gray-500 mb-2 flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                会場
              </h4>
              {venues.length > 0 ? (
                <div className="space-y-1">
                  {venues.map(v => (
                    <div key={v.venue_id}>
                      {v.google_maps_url ? (
                        <a
                          href={v.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {v.venue_name}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <p className="text-gray-900">{v.venue_name}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-900">未設定</p>
              )}
            </div>
            <div>
              <h4 className="font-medium text-gray-500 mb-2 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                参加チーム数
              </h4>
              <p className="text-gray-900">{tournament.team_count}チーム</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-500 mb-2">コート数</h4>
              <p className="text-gray-900">{tournament.court_count}コート</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {(bracketPdfExists || resultsPdfExists) && (
        <div className={`grid grid-cols-1 ${bracketPdfExists && resultsPdfExists ? 'lg:grid-cols-2' : ''} gap-6`}>
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
                  </div>
                  <div className="flex justify-center">
                    <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Link href={`/public/tournaments/${tournament.tournament_id}/bracket-pdf`} className="flex items-center gap-2">
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
          {resultsPdfExists && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-primary" />
                  結果表（PDF版）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex-1">
                    <h4 className="font-medium text-primary mb-1">PDFで結果表を表示</h4>
                    <p className="text-sm text-primary">
                      手動作成された結果表をPDF形式でご覧いただけます。順位・戦績の確認に最適です。
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <Button asChild className="bg-primary hover:bg-primary/90">
                      <Link href={`/public/tournaments/${tournament.tournament_id}/results-pdf`} className="flex items-center gap-2">
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

      <PublicFilesList
        tournamentId={tournament.tournament_id}
        showTitle={true}
        layout="card"
      />

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
                <div key={dayNumber} className="flex items-center p-3 bg-gray-50/50 rounded-lg">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold mr-3">
                    {dayNumber}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">第{dayNumber}日</p>
                    <p className="font-medium text-gray-900">{formatDateOnly(date as string)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="h-5 w-5 mr-2 text-purple-600" />
            試合設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-center p-4 bg-primary/5 rounded-lg">
              <p className="text-2xl font-bold text-primary">{tournament.match_duration_minutes}</p>
              <p className="text-sm text-gray-500">試合時間（分）</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{tournament.break_duration_minutes}</p>
              <p className="text-sm text-gray-500">休憩時間（分）</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {tournament.recruitment_start_date && tournament.recruitment_end_date && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Target className="h-5 w-5 mr-2 text-orange-600" />
              募集期間
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div>
                <p className="text-sm text-orange-700">開始</p>
                <p className="font-medium text-orange-800">{formatDateOnly(tournament.recruitment_start_date)}</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-0.5 bg-orange-300"></div>
              </div>
              <div>
                <p className="text-sm text-orange-700">終了</p>
                <p className="font-medium text-orange-800">{formatDateOnly(tournament.recruitment_end_date)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
