'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ArrowLeft, Edit, Plus, Calendar, MapPin, Users } from 'lucide-react';

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
  visibility: string;
  event_description: string | null;
  created_at: string;
  updated_at: string;
  divisions: Division[];
}

interface Division {
  tournament_id: number;
  tournament_name: string;
  format_id: number;
  format_name: string;
  team_count: number;
  court_count: number;
  tournament_dates: string;
  match_duration_minutes: number;
  break_duration_minutes: number;
  status: string;
  visibility: string;
  registered_teams: number;
  created_at: string;
}

export default function TournamentGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [group, setGroup] = useState<TournamentGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);

  // paramsを解決
  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  // 大会データ取得
  useEffect(() => {
    if (!resolvedParams) return;

    const fetchGroup = async () => {
      try {
        const response = await fetch(`/api/tournament-groups/${resolvedParams.id}`);
        const data = await response.json();

        if (data.success) {
          setGroup(data.data);
        } else {
          setError(data.error || '大会の取得に失敗しました');
        }
      } catch (err) {
        console.error('大会取得エラー:', err);
        setError('大会の取得中にエラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [resolvedParams]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP');
  };

  const formatDateRange = (startDate: string | null, endDate: string | null) => {
    if (!startDate && !endDate) return '-';
    if (!endDate) return formatDate(startDate);
    if (startDate === endDate) return formatDate(startDate);
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    return `${start} 〜 ${end}`;
  };

  if (loading || !resolvedParams) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error || '大会が見つかりません'}</p>
            <Button
              className="mt-4"
              onClick={() => router.push('/admin/tournament-groups')}
            >
              大会一覧に戻る
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/tournament-groups" className="flex items-center">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  大会一覧に戻る
                </Link>
              </Button>
              <div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-3xl font-bold text-foreground">{group.group_name}</h1>
                  <Badge variant={group.visibility === 'open' ? 'default' : 'secondary'}>
                    {group.visibility === 'open' ? '公開' : '非公開'}
                  </Badge>
                </div>
                {group.organizer && (
                  <p className="text-sm text-muted-foreground mt-1">
                    主催: {group.organizer}
                  </p>
                )}
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/admin/tournament-groups/${group.group_id}/edit`}>
                <Edit className="w-4 h-4 mr-2" />
                大会情報を編集
              </Link>
            </Button>
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
                <div>
                  <div className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                    <Calendar className="w-4 h-4 mr-2" />
                    大会期間
                  </div>
                  <p className="text-sm">
                    {formatDateRange(group.event_start_date, group.event_end_date)}
                  </p>
                </div>

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

                {/* 説明 */}
                {group.event_description && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">説明</div>
                    <p className="text-sm">{group.event_description}</p>
                  </div>
                )}

                {/* 作成日・更新日 */}
                <div className="text-xs text-muted-foreground border-t pt-2 space-y-1">
                  <div>作成日: {formatDate(group.created_at)}</div>
                  <div>更新日: {formatDate(group.updated_at)}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 所属部門一覧 */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>所属部門 ({group.divisions.length})</CardTitle>
                  <Button asChild>
                    <Link href={`/admin/tournaments/create-new?group_id=${group.group_id}${group.venue_id ? `&venue_id=${group.venue_id}` : ''}`}>
                      <Plus className="w-4 h-4 mr-2" />
                      部門を追加
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {group.divisions.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">
                      この大会にはまだ部門が作成されていません
                    </p>
                    <Button asChild>
                      <Link href={`/admin/tournaments/create-new?group_id=${group.group_id}${group.venue_id ? `&venue_id=${group.venue_id}` : ''}`}>
                        <Plus className="w-4 h-4 mr-2" />
                        最初の部門を作成
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {group.divisions.map((division) => (
                      <Card
                        key={division.tournament_id}
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => router.push(`/admin/tournaments/${division.tournament_id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2 flex-1">
                              <div>
                                <h4 className="font-bold text-foreground">{division.tournament_name}</h4>
                                <p className="text-sm text-muted-foreground">{division.format_name}</p>
                              </div>
                              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                                <span>{division.registered_teams}/{division.team_count}チーム</span>
                                <span>{division.court_count}コート</span>
                                <Badge variant={division.visibility === 'open' ? 'default' : 'secondary'}>
                                  {division.visibility === 'open' ? '公開' : '非公開'}
                                </Badge>
                              </div>
                            </div>
                            <div className="ml-4">
                              <Button size="sm" variant="outline" asChild>
                                <Link href={`/admin/tournaments/${division.tournament_id}`}>
                                  詳細
                                </Link>
                              </Button>
                            </div>
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
    </div>
  );
}
