// app/tournaments/page.tsx
'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle } from 'lucide-react';
import { 
  getStatusLabel, 
  getStatusColor, 
  type TournamentStatus
} from '@/lib/tournament-status';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  format_name: string;
  venue_name: string;
  team_count: number;
  status: TournamentStatus;
  is_public: boolean;
  recruitment_start_date: string;
  recruitment_end_date: string;
  event_start_date: string;
  event_end_date: string;
  tournament_period: string;
  created_at: string;
  created_by: string;
  logo_blob_url: string | null;
  organization_name: string | null;
  is_joined: boolean;
}

interface SearchParams {
  year: string;
  month: string;
  day: string;
  tournament_name: string;
  status: TournamentStatus | '';
}

function TournamentsContent() {
  const { data: session } = useSession();
  const urlSearchParams = useSearchParams();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // URLクエリパラメータから初期値を設定
  const [searchParams, setSearchParams] = useState<SearchParams>({
    year: urlSearchParams?.get('year') || '',
    month: urlSearchParams?.get('month') || '',
    day: urlSearchParams?.get('day') || '',
    tournament_name: urlSearchParams?.get('tournament_name') || '',
    status: (urlSearchParams?.get('status') as TournamentStatus) || ''
  });
  
  // Selectの表示用値（空文字列の場合は'all'を表示）
  const displayStatus = searchParams.status === '' ? 'all' : searchParams.status;
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false
  });

  // 大会データを取得する関数
  const fetchTournaments = useCallback(async (params: SearchParams = searchParams, offset: number = 0) => {
    setSearching(true);
    setError(null);
    
    try {
      const queryParams = new URLSearchParams();
      
      if (params.year) queryParams.set('year', params.year);
      if (params.month) queryParams.set('month', params.month);
      if (params.day) queryParams.set('day', params.day);
      if (params.tournament_name) queryParams.set('tournament_name', params.tournament_name);
      if (params.status) queryParams.set('status', params.status);
      
      queryParams.set('limit', pagination.limit.toString());
      queryParams.set('offset', offset.toString());

      const response = await fetch(`/api/tournaments/search?${queryParams}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '大会データの取得に失敗しました');
      }

      if (data.success) {
        setTournaments(data.data.tournaments);
        setPagination(data.data.pagination);
      } else {
        throw new Error(data.error || '大会データの取得に失敗しました');
      }
    } catch (err) {
      console.error('大会取得エラー:', err);
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setSearching(false);
      setLoading(false);
    }
  }, [searchParams, pagination.limit]);

  // 初回読み込み
  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  // 検索実行
  const handleSearch = () => {
    setPagination({ ...pagination, offset: 0 });
    fetchTournaments(searchParams, 0);
  };

  // 検索条件クリア
  const handleClearSearch = () => {
    const clearedParams: SearchParams = {
      year: '',
      month: '',
      day: '',
      tournament_name: '',
      status: ''
    };
    setSearchParams(clearedParams);
    setPagination({ ...pagination, offset: 0 });
    fetchTournaments(clearedParams, 0);
  };

  // ページネーション
  const handleNextPage = () => {
    const newOffset = pagination.offset + pagination.limit;
    setPagination({ ...pagination, offset: newOffset });
    fetchTournaments(searchParams, newOffset);
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, pagination.offset - pagination.limit);
    setPagination({ ...pagination, offset: newOffset });
    fetchTournaments(searchParams, newOffset);
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
              <h1 className="text-3xl font-bold text-foreground">大会を探す</h1>
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
        {/* 検索フォーム */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>検索条件</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <Label htmlFor="year">開催年</Label>
                <Input
                  id="year"
                  type="number"
                  placeholder="2025"
                  value={searchParams.year}
                  onChange={(e) => setSearchParams({ ...searchParams, year: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="month">開催月</Label>
                <Input
                  id="month"
                  type="number"
                  min="1"
                  max="12"
                  placeholder="1-12"
                  value={searchParams.month}
                  onChange={(e) => setSearchParams({ ...searchParams, month: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="day">開催日</Label>
                <Input
                  id="day"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="1-31"
                  value={searchParams.day}
                  onChange={(e) => setSearchParams({ ...searchParams, day: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="status">ステータス</Label>
                <Select value={displayStatus} onValueChange={(value) => setSearchParams({ ...searchParams, status: value === 'all' ? '' : value as TournamentStatus })}>
                  <SelectTrigger>
                    <SelectValue placeholder="全て" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    <SelectItem value="before_recruitment">募集前</SelectItem>
                    <SelectItem value="recruiting">募集中</SelectItem>
                    <SelectItem value="before_event">開催前</SelectItem>
                    <SelectItem value="ongoing">開催中</SelectItem>
                    <SelectItem value="completed">終了</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mb-4">
              <Label htmlFor="tournament_name">大会名</Label>
              <Input
                id="tournament_name"
                placeholder="大会名で検索..."
                value={searchParams.tournament_name}
                onChange={(e) => setSearchParams({ ...searchParams, tournament_name: e.target.value })}
              />
            </div>
            <div className="flex space-x-3">
              <Button 
                onClick={handleSearch} 
                disabled={searching}
                className="flex items-center"
              >
                {searching && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>}
                検索
              </Button>
              <Button variant="outline" onClick={handleClearSearch}>
                クリア
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* 結果表示 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>検索結果</span>
              <span className="text-sm font-normal text-muted-foreground">
                {pagination.total}件中 {pagination.offset + 1}-{Math.min(pagination.offset + tournaments.length, pagination.total)}件
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tournaments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">該当する大会が見つかりませんでした。</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full table-auto">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-3 text-left">大会名</th>
                        <th className="px-4 py-3 text-left">ステータス</th>
                        <th className="px-4 py-3 text-left">開催期間</th>
                        <th className="px-4 py-3 text-left">会場</th>
                        <th className="px-4 py-3 text-left">参加チーム</th>
                        <th className="px-4 py-3 text-left">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournaments.map((tournament) => (
                        <tr key={tournament.tournament_id} className="border-b hover:bg-muted/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-2">
                              {/* 管理者ロゴ */}
                              {tournament.logo_blob_url && (
                                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                                  <Image
                                    src={tournament.logo_blob_url}
                                    alt={tournament.organization_name || '主催者ロゴ'}
                                    width={32}
                                    height={32}
                                    className="object-contain"
                                  />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-foreground">{tournament.tournament_name}</p>
                                <p className="text-sm text-muted-foreground">{tournament.format_name}</p>
                              </div>
                              {tournament.is_joined && (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 flex items-center">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  参加済み
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={getStatusColor(tournament.status)}>
                              {getStatusLabel(tournament.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            {tournament.tournament_period || tournament.event_start_date}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            {tournament.venue_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            {tournament.team_count}チーム
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex space-x-2">
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/public/tournaments/${tournament.tournament_id}`}>
                                  詳細
                                </Link>
                              </Button>
                              
                              {/* 参加済みの場合は参加選手変更ボタンを表示 */}
                              {tournament.is_joined && session?.user?.role === 'team' && (
                                <Button asChild size="sm" variant="outline">
                                  <Link href={`/tournaments/${tournament.tournament_id}/teams`}>
                                    参加選手変更
                                  </Link>
                                </Button>
                              )}
                              
                              {/* 未参加かつ募集期間中の場合に参加ボタンを表示 */}
                              {!tournament.is_joined &&
                               tournament.recruitment_start_date && 
                               tournament.recruitment_end_date && 
                               new Date(tournament.recruitment_start_date) <= new Date() && 
                               new Date() <= new Date(tournament.recruitment_end_date) && (
                                <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700">
                                  <Link href={
                                    session?.user?.role === 'team' 
                                      ? `/tournaments/${tournament.tournament_id}/join`
                                      : `/auth/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournament.tournament_id}/join`)}`
                                  }>
                                    参加する
                                  </Link>
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ページネーション */}
                {pagination.total > pagination.limit && (
                  <div className="flex justify-between items-center mt-6">
                    <Button
                      variant="outline"
                      onClick={handlePrevPage}
                      disabled={pagination.offset === 0 || searching}
                    >
                      前のページ
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      ページ {Math.floor(pagination.offset / pagination.limit) + 1} / {Math.ceil(pagination.total / pagination.limit)}
                    </span>
                    <Button
                      variant="outline"
                      onClick={handleNextPage}
                      disabled={!pagination.hasMore || searching}
                    >
                      次のページ
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
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