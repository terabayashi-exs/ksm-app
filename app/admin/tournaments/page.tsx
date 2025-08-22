'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { 
  getStatusLabel, 
  getStatusColor, 
  type TournamentStatus,
  type TournamentWithStatus 
} from '@/lib/tournament-status';

interface SearchParams {
  year: string;
  month: string;
  day: string;
  tournament_name: string;
  status: TournamentStatus | '';
}

export default function AdminTournamentsList() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<TournamentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useState<SearchParams>({
    year: '',
    month: '',
    day: '',
    tournament_name: '',
    status: ''
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

      const response = await fetch(`/api/admin/tournaments?${queryParams}`);
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
    const clearedParams = {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">大会一覧</h1>
              <p className="text-sm text-gray-500 mt-1">
                大会の検索・管理を行います
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => router.push('/admin')}
              >
                ダッシュボードに戻る
              </Button>
              <Button asChild>
                <Link href="/admin/tournaments/create">新規大会作成</Link>
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
                <Select value={displayStatus} onValueChange={(value) => setSearchParams({ ...searchParams, status: value === 'all' ? '' : value })}>
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
              <span className="text-sm font-normal text-gray-500">
                {pagination.total}件中 {pagination.offset + 1}-{Math.min(pagination.offset + tournaments.length, pagination.total)}件
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tournaments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">該当する大会が見つかりませんでした。</p>
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
                        <th className="px-4 py-3 text-left">作成日</th>
                        <th className="px-4 py-3 text-left">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournaments.map((tournament) => (
                        <tr key={tournament.tournament_id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{tournament.tournament_name}</p>
                              <p className="text-sm text-gray-500">{tournament.format_name}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={getStatusColor(tournament.calculated_status)}>
                              {getStatusLabel(tournament.calculated_status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {tournament.tournament_period}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {tournament.venue_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {tournament.registered_teams}チーム
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {new Date(tournament.created_at).toLocaleDateString('ja-JP')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex space-x-2">
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/admin/tournaments/${tournament.tournament_id}`}>
                                  詳細
                                </Link>
                              </Button>
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/admin/tournaments/${tournament.tournament_id}/edit`}>
                                  編集
                                </Link>
                              </Button>
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
                    <span className="text-sm text-gray-600">
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
    </div>
  );
}