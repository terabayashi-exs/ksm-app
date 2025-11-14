// app/tournaments/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { Calendar, MapPin, Users, ChevronRight } from 'lucide-react';
import {
  getStatusLabel,
  getStatusColor,
  type TournamentStatus
} from '@/lib/tournament-status';

interface Division {
  tournament_id: number;
  tournament_name: string;
  format_name: string;
  venue_name: string;
  team_count: number;
  registered_teams: number;
  status: TournamentStatus;
  recruitment_start_date: string;
  recruitment_end_date: string;
  event_start_date: string;
  event_end_date: string;
  is_joined: boolean;
}

interface TournamentGroup {
  group: {
    group_id: number;
    group_name: string;
    organizer: string | null;
    venue_id: number | null;
    venue_name: string | null;
    venue_address: string | null;
    event_start_date: string | null;
    event_end_date: string | null;
    recruitment_start_date: string | null;
    recruitment_end_date: string | null;
    event_description: string | null;
    division_count: number;
  };
  divisions: Division[];
}

function TournamentsContent() {
  const [tournamentGroups, setTournamentGroups] = useState<TournamentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const response = await fetch('/api/tournaments/public-grouped');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || '大会データの取得に失敗しました');
        }

        if (data.success) {
          setTournamentGroups(data.data);
        } else {
          throw new Error(data.error || '大会データの取得に失敗しました');
        }
      } catch (err) {
        console.error('大会取得エラー:', err);
        setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchTournaments();
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP');
  };

  const formatDateRange = (startDate: string | null, endDate: string | null) => {
    if (!startDate && !endDate) return '-';
    if (!endDate || startDate === endDate) return formatDate(startDate);
    return `${formatDate(startDate)} 〜 ${formatDate(endDate)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">読み込み中...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">開催中の大会</h1>
              <p className="text-sm text-muted-foreground mt-1">
                参加可能な大会や開催中の大会を探してみましょう
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                asChild
              >
                <Link href="/">トップページに戻る</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* 大会一覧 */}
        {tournamentGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <p className="text-muted-foreground">現在公開中の大会はありません。</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {tournamentGroups.map(({ group, divisions }) => (
              <Card key={group.group_id} className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-2xl mb-2">{group.group_name}</CardTitle>
                      {group.organizer && (
                        <p className="text-sm text-muted-foreground mb-3">
                          主催: {group.organizer}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-4 text-sm">
                        {group.venue_name && (
                          <div className="flex items-center text-muted-foreground">
                            <MapPin className="h-4 w-4 mr-1" />
                            {group.venue_name}
                          </div>
                        )}
                        {(group.event_start_date || group.event_end_date) && (
                          <div className="flex items-center text-muted-foreground">
                            <Calendar className="h-4 w-4 mr-1" />
                            {formatDateRange(group.event_start_date, group.event_end_date)}
                          </div>
                        )}
                        <div className="flex items-center text-muted-foreground">
                          <Users className="h-4 w-4 mr-1" />
                          {group.division_count}部門
                        </div>
                      </div>
                    </div>

                    <Button asChild>
                      <Link href={`/public/tournaments/groups/${group.group_id}`}>
                        大会を見る
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  {group.event_description && (
                    <p className="text-sm text-muted-foreground mb-4">
                      {group.event_description}
                    </p>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">所属部門</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {divisions.map((division) => (
                        <Card
                          key={division.tournament_id}
                          className="hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => window.location.href = `/public/tournaments/${division.tournament_id}`}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-2">
                              <div className="flex items-start justify-between">
                                <h5 className="font-medium text-foreground">{division.tournament_name}</h5>
                                <Badge className={getStatusColor(division.status)}>
                                  {getStatusLabel(division.status)}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{division.format_name}</p>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{division.registered_teams}/{division.team_count}チーム</span>
                                {division.is_joined && (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    参加済み
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

export default function TournamentsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">読み込み中...</p>
          </div>
        </div>
        <Footer />
      </div>
    }>
      <TournamentsContent />
    </Suspense>
  );
}
