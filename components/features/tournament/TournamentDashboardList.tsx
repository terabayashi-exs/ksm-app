'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tournament } from '@/lib/types';
import Link from 'next/link';
import { CalendarDays, MapPin, Users, Clock, Trophy, Trash2 } from 'lucide-react';

interface TournamentDashboardData {
  recruiting: Tournament[];
  ongoing: Tournament[];
  total: number;
}

interface ApiResponse {
  success: boolean;
  data?: TournamentDashboardData;
  error?: string;
}

export default function TournamentDashboardList() {
  const [tournaments, setTournaments] = useState<TournamentDashboardData>({
    recruiting: [],
    ongoing: [],
    total: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const response = await fetch('/api/tournaments/dashboard');
        const result: ApiResponse = await response.json();
        
        if (result.success && result.data) {
          setTournaments(result.data);
        } else {
          setError(result.error || '大会データの取得に失敗しました');
        }
      } catch (err) {
        setError('ネットワークエラーが発生しました');
        console.error('大会取得エラー:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTournaments();
  }, []);

  const handleDeleteTournament = async (tournament: Tournament) => {
    const confirmMessage = `大会「${tournament.tournament_name}」を削除してもよろしいですか？\n\n⚠️ この操作は取り消せません。関連する以下のデータも全て削除されます：\n・参加チーム情報\n・選手情報\n・試合データ\n・結果データ`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setDeleting(tournament.tournament_id);

    try {
      const response = await fetch(`/api/tournaments/${tournament.tournament_id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        // 削除成功時、リストから該当大会を除去
        setTournaments(prev => ({
          recruiting: prev.recruiting.filter(t => t.tournament_id !== tournament.tournament_id),
          ongoing: prev.ongoing.filter(t => t.tournament_id !== tournament.tournament_id),
          total: prev.total - 1
        }));
        alert(result.message || '大会を削除しました');
      } else {
        alert(`削除エラー: ${result.error}`);
      }
    } catch (err) {
      console.error('削除エラー:', err);
      alert('削除中にエラーが発生しました');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">大会データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-600 text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const TournamentCard = ({ tournament, type }: { tournament: Tournament; type: 'recruiting' | 'ongoing' }) => (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="font-semibold text-lg text-gray-900">{tournament.tournament_name}</h4>
          <div className="flex items-center text-sm text-gray-600 mt-1">
            <Trophy className="w-4 h-4 mr-1" />
            <span>{tournament.format_name || `フォーマットID: ${tournament.format_id}`}</span>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          type === 'ongoing' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-blue-100 text-blue-800'
        }`}>
          {type === 'ongoing' ? '開催中' : '募集中'}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm text-gray-600">
          <CalendarDays className="w-4 h-4 mr-2" />
          <span>
            {tournament.event_start_date ? formatDate(tournament.event_start_date) : '日程未定'}
            {tournament.event_end_date && tournament.event_end_date !== tournament.event_start_date && 
              ` - ${formatDate(tournament.event_end_date)}`
            }
          </span>
        </div>
        {tournament.start_time && tournament.end_time && (
          <div className="flex items-center text-sm text-gray-600">
            <Clock className="w-4 h-4 mr-2" />
            <span>{tournament.start_time} - {tournament.end_time}</span>
          </div>
        )}
        {(!tournament.start_time || !tournament.end_time) && tournament.status === 'planning' && (
          <div className="flex items-center text-sm text-gray-500">
            <Clock className="w-4 h-4 mr-2" />
            <span>試合時刻未設定</span>
          </div>
        )}
        <div className="flex items-center text-sm text-gray-600">
          <MapPin className="w-4 h-4 mr-2" />
          <span>{tournament.venue_name || `会場ID: ${tournament.venue_id}`}</span>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <Users className="w-4 h-4 mr-2" />
          <span>{tournament.team_count}チーム参加</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button asChild size="sm" variant="outline" className="flex-1 hover:border-blue-300 hover:bg-blue-50">
          <Link href={`/admin/tournaments/${tournament.tournament_id}`}>
            詳細
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
          <Link href={`/admin/tournaments/${tournament.tournament_id}/edit`}>
            大会編集
          </Link>
        </Button>
        {type === 'recruiting' && (
          <>
            <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
              <Link href={`/admin/tournaments/${tournament.tournament_id}/teams`}>
                チーム登録
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
              <Link href={`/admin/tournaments/${tournament.tournament_id}/draw`}>
                組合せ作成・編集
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
              <Link href={`/admin/tournaments/${tournament.tournament_id}/matches`}>
                試合管理
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
              <Link href={`/admin/tournaments/${tournament.tournament_id}/manual-rankings`}>
                手動順位設定
              </Link>
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleDeleteTournament(tournament)}
              disabled={deleting === tournament.tournament_id}
              className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              {deleting === tournament.tournament_id ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600 mr-1"></div>
                  削除中...
                </div>
              ) : (
                <div className="flex items-center">
                  <Trash2 className="w-3 h-3 mr-1" />
                  削除
                </div>
              )}
            </Button>
          </>
        )}
        {type === 'ongoing' && (
          <Button asChild size="sm" variant="default">
            <Link href={`/admin/tournaments/${tournament.tournament_id}/matches`}>
              🔴 試合管理（リアルタイム）
            </Link>
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 開催中の大会 */}
      {tournaments.ongoing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-green-700">
              <Trophy className="w-5 h-5 mr-2" />
              開催中の大会 ({tournaments.ongoing.length}件)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {tournaments.ongoing.map((tournament) => (
                <TournamentCard
                  key={tournament.tournament_id}
                  tournament={tournament}
                  type="ongoing"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 募集中の大会 */}
      {tournaments.recruiting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-blue-700">
              <CalendarDays className="w-5 h-5 mr-2" />
              募集中の大会 ({tournaments.recruiting.length}件)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {tournaments.recruiting.map((tournament) => (
                <TournamentCard
                  key={tournament.tournament_id}
                  tournament={tournament}
                  type="recruiting"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 大会がない場合 */}
      {tournaments.total === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Trophy className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              現在、募集中・開催中の大会はありません
            </h3>
            <p className="text-gray-600 mb-6">
              新しい大会を作成して参加チームの募集を開始しましょう
            </p>
            <Button asChild className="hover:bg-blue-600">
              <Link href="/admin/tournaments/create">
                新規大会作成
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}