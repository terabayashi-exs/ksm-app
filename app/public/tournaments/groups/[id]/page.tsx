// app/public/tournaments/groups/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, MapPin, Users, Trophy } from 'lucide-react';
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
}

interface TournamentGroup {
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
}

export default function TournamentGroupPage() {
  const params = useParams();
  const groupId = params.id as string;

  const [group, setGroup] = useState<TournamentGroup | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGroupData = async () => {
      try {
        const response = await fetch(`/api/tournaments/public-groups/${groupId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || '大会データの取得に失敗しました');
        }

        if (data.success) {
          setGroup(data.data.group);
          setDivisions(data.data.divisions);
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

    fetchGroupData();
  }, [groupId]);

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

  if (error || !group) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error || '大会が見つかりません'}</p>
            <Button
              className="mt-4"
              asChild
            >
              <Link href="/tournaments">大会一覧に戻る</Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ページヘッダー */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center gap-4 mb-4">
              <Button variant="outline" asChild>
                <Link href="/tournaments" className="flex items-center">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  大会一覧に戻る
                </Link>
              </Button>
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{group.group_name}</h1>
            {group.organizer && (
              <p className="text-sm text-muted-foreground">
                主催: {group.organizer}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 大会基本情報 */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>大会情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 会場 */}
                {group.venue_name && (
                  <div>
                    <div className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                      <MapPin className="w-4 h-4 mr-2" />
                      会場
                    </div>
                    <p className="text-sm">{group.venue_name}</p>
                    {group.venue_address && (
                      <p className="text-xs text-muted-foreground mt-1">{group.venue_address}</p>
                    )}
                  </div>
                )}

                {/* 大会期間 */}
                {(group.event_start_date || group.event_end_date) && (
                  <div>
                    <div className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                      <Calendar className="w-4 h-4 mr-2" />
                      大会期間
                    </div>
                    <p className="text-sm">
                      {formatDateRange(group.event_start_date, group.event_end_date)}
                    </p>
                  </div>
                )}

                {/* 募集期間 */}
                {(group.recruitment_start_date || group.recruitment_end_date) && (
                  <div>
                    <div className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                      <Users className="w-4 h-4 mr-2" />
                      募集期間
                    </div>
                    <p className="text-sm">
                      {formatDateRange(group.recruitment_start_date, group.recruitment_end_date)}
                    </p>
                  </div>
                )}

                {/* 部門数 */}
                <div>
                  <div className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                    <Trophy className="w-4 h-4 mr-2" />
                    部門数
                  </div>
                  <p className="text-sm">{group.division_count}部門</p>
                </div>

                {/* 説明 */}
                {group.event_description && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">説明</div>
                    <p className="text-sm whitespace-pre-wrap">{group.event_description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 所属部門一覧 */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>所属部門 ({divisions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {divisions.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">
                      現在公開中の部門はありません。
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {divisions.map((division) => (
                      <Card
                        key={division.tournament_id}
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => window.location.href = `/public/tournaments/${division.tournament_id}`}
                      >
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            {/* 部門名とステータス */}
                            <div className="flex items-start justify-between">
                              <h3 className="font-bold text-lg text-foreground">
                                {division.tournament_name}
                              </h3>
                              <Badge className={getStatusColor(division.status)}>
                                {getStatusLabel(division.status)}
                              </Badge>
                            </div>

                            {/* フォーマット */}
                            <p className="text-sm text-muted-foreground">
                              {division.format_name}
                            </p>

                            {/* 会場（大会と異なる場合のみ表示） */}
                            {division.venue_name && division.venue_name !== group.venue_name && (
                              <div className="flex items-center text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 mr-1" />
                                {division.venue_name}
                              </div>
                            )}

                            {/* チーム数 */}
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {division.registered_teams}/{division.team_count}チーム
                              </span>
                              <Button size="sm" variant="outline" asChild>
                                <Link href={`/public/tournaments/${division.tournament_id}`}>
                                  詳細を見る
                                </Link>
                              </Button>
                            </div>

                            {/* 大会期間（大会と異なる場合のみ表示） */}
                            {division.event_start_date &&
                             division.event_end_date &&
                             (division.event_start_date !== group.event_start_date ||
                              division.event_end_date !== group.event_end_date) && (
                              <div className="flex items-center text-xs text-muted-foreground pt-2 border-t">
                                <Calendar className="h-3 w-3 mr-1" />
                                {formatDateRange(division.event_start_date, division.event_end_date)}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
