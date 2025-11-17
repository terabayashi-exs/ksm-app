// app/tournaments/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { Calendar, MapPin, Users, ChevronRight, Search, X } from 'lucide-react';
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
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status'); // 'ongoing', 'recruiting', 'completed' or null

  // 全大会データ（フィルタリング前）
  const [allTournamentGroups, setAllTournamentGroups] = useState<TournamentGroup[]>([]);
  // 表示用の大会データ（フィルタリング後）
  const [tournamentGroups, setTournamentGroups] = useState<TournamentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 検索条件
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchStatus, setSearchStatus] = useState<string>('all');
  const [searchVenue, setSearchVenue] = useState('all');

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const response = await fetch('/api/tournaments/public-grouped');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || '大会データの取得に失敗しました');
        }

        if (data.success) {
          // 新しいAPI構造: data.data = { ongoing: [...], recruiting: [...], completed: [...] }
          const categorizedData = data.data;

          // statusFilterに基づいてデータをフィルタリング
          let filteredGroups: TournamentGroup[] = [];

          if (statusFilter === 'ongoing') {
            filteredGroups = categorizedData.ongoing || [];
            setSearchStatus('ongoing');
          } else if (statusFilter === 'recruiting') {
            filteredGroups = categorizedData.recruiting || [];
            setSearchStatus('recruiting');
          } else if (statusFilter === 'before_event') {
            filteredGroups = categorizedData.before_event || [];
            setSearchStatus('before_event');
          } else if (statusFilter === 'completed') {
            filteredGroups = categorizedData.completed || [];
            setSearchStatus('completed');
          } else {
            // フィルターがない場合は全ての大会を表示（ongoing → before_event → recruiting → completed の順）
            filteredGroups = [
              ...(categorizedData.ongoing || []),
              ...(categorizedData.recruiting || []),
              ...(categorizedData.before_event || []),
              ...(categorizedData.completed || [])
            ];
            setSearchStatus('all');
          }

          // 全データと表示データの両方を設定
          setAllTournamentGroups(filteredGroups);
          setTournamentGroups(filteredGroups);
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
  }, [statusFilter]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP');
  };

  const formatDateRange = (startDate: string | null, endDate: string | null) => {
    if (!startDate && !endDate) return '-';
    if (!endDate || startDate === endDate) return formatDate(startDate);
    return `${formatDate(startDate)} 〜 ${formatDate(endDate)}`;
  };

  // 会場名リストを取得（ユニークな会場名のみ）
  const getVenueList = () => {
    const venues = new Set<string>();
    allTournamentGroups.forEach(group => {
      if (group.group.venue_name) {
        venues.add(group.group.venue_name);
      }
    });
    return Array.from(venues).sort();
  };

  // 検索実行
  const handleSearch = () => {
    let filtered = [...allTournamentGroups];

    // キーワードでフィルタリング（大会名、主催者、会場名で検索）
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(group =>
        group.group.group_name.toLowerCase().includes(keyword) ||
        (group.group.organizer && group.group.organizer.toLowerCase().includes(keyword)) ||
        (group.group.venue_name && group.group.venue_name.toLowerCase().includes(keyword)) ||
        group.divisions.some(div => div.tournament_name.toLowerCase().includes(keyword))
      );
    }

    // ステータスでフィルタリング
    if (searchStatus !== 'all') {
      filtered = filtered.filter(group =>
        group.divisions.some(div => div.status === searchStatus)
      );
    }

    // 会場でフィルタリング
    if (searchVenue !== 'all') {
      filtered = filtered.filter(group =>
        group.group.venue_name === searchVenue
      );
    }

    setTournamentGroups(filtered);
  };

  // 検索条件クリア
  const handleClearSearch = () => {
    setSearchKeyword('');
    setSearchStatus('all');
    setSearchVenue('all');
    setTournamentGroups(allTournamentGroups);
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

  // ステータスに応じたタイトルを取得
  const getPageTitle = () => {
    switch (statusFilter) {
      case 'ongoing':
        return '開催中の大会';
      case 'recruiting':
        return '募集中の大会';
      case 'before_event':
        return '開催前の大会';
      case 'completed':
        return '完了した大会';
      default:
        return '大会一覧';
    }
  };

  const getPageDescription = () => {
    switch (statusFilter) {
      case 'ongoing':
        return '現在開催中の大会を確認できます';
      case 'recruiting':
        return '参加チームを募集中の大会を確認できます';
      case 'before_event':
        return '募集は終了し、開催を待っている大会を確認できます';
      case 'completed':
        return '終了した大会の結果を確認できます';
      default:
        return '参加可能な大会や開催中の大会を探してみましょう';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{getPageTitle()}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {getPageDescription()}
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

        {/* 検索フォーム */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Search className="h-5 w-5 mr-2" />
              大会を検索
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* キーワード検索 */}
              <div className="space-y-2">
                <Label htmlFor="keyword">キーワード</Label>
                <Input
                  id="keyword"
                  placeholder="大会名、主催者、会場名で検索"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                />
              </div>

              {/* ステータス */}
              <div className="space-y-2">
                <Label htmlFor="status">ステータス</Label>
                <Select value={searchStatus} onValueChange={setSearchStatus}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="ステータスを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="ongoing">開催中</SelectItem>
                    <SelectItem value="recruiting">募集中</SelectItem>
                    <SelectItem value="before_event">開催前</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 会場名 */}
              <div className="space-y-2">
                <Label htmlFor="venue">会場名</Label>
                <Select value={searchVenue} onValueChange={setSearchVenue}>
                  <SelectTrigger id="venue">
                    <SelectValue placeholder="会場を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    {getVenueList().map((venue) => (
                      <SelectItem key={venue} value={venue}>
                        {venue}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ボタンエリア */}
            <div className="flex gap-3">
              <Button onClick={handleSearch} className="flex items-center">
                <Search className="h-4 w-4 mr-2" />
                検索
              </Button>
              <Button onClick={handleClearSearch} variant="outline" className="flex items-center">
                <X className="h-4 w-4 mr-2" />
                クリア
              </Button>
            </div>

            {/* 検索結果件数 */}
            {tournamentGroups.length !== allTournamentGroups.length && (
              <div className="mt-4 text-sm text-muted-foreground">
                {tournamentGroups.length}件の大会が見つかりました（全{allTournamentGroups.length}件中）
              </div>
            )}
          </CardContent>
        </Card>

        {/* 大会一覧 */}
        {tournamentGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <p className="text-muted-foreground">
                  {allTournamentGroups.length === 0
                    ? '現在公開中の大会はありません。'
                    : '検索条件に一致する大会が見つかりませんでした。'}
                </p>
                {allTournamentGroups.length > 0 && (
                  <Button onClick={handleClearSearch} variant="outline" className="mt-4">
                    検索条件をクリア
                  </Button>
                )}
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
