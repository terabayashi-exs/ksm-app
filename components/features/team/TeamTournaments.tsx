// components/features/team/TeamTournaments.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { MapPin, Users, Trophy, Clock, CheckCircle, XCircle } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface TournamentTeam {
  tournament_team_id: number;
  tournament_team_name: string;
  tournament_team_omission: string;
  assigned_block: string | null;
  block_position: number | null;
  joined_at: string | null;
  withdrawal_status: string;
  withdrawal_reason?: string | null;
  withdrawal_requested_at?: string | null;
  withdrawal_processed_at?: string | null;
  player_count: number;
}

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  recruitment_start_date: string | null;
  recruitment_end_date: string | null;
  status: string;
  visibility: string;
  format_name: string | null;
  venue_name: string | null;
  tournament_dates: string | null;
  event_start_date: string | null;
  teams?: TournamentTeam[]; // 複数チーム参加対応
  // 後方互換性のため保持
  assigned_block?: string | null;
  block_position?: number | null;
  joined_at?: string | null;
}

interface TournamentsData {
  available: Tournament[];
  joined: Tournament[];
}

export default function TeamTournaments() {
  const [tournaments, setTournaments] = useState<TournamentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/teams/tournaments');
      const result = await response.json();

      if (result.success) {
        setTournaments(result.data);
      } else {
        setError(result.error || '大会情報の取得に失敗しました');
      }
    } catch (error) {
      console.error('Tournament fetch error:', error);
      setError('大会情報の取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ongoing':
        return <Badge className="bg-green-100 text-green-800">進行中</Badge>;
      case 'completed':
        return <Badge className="bg-muted text-muted-foreground">完了</Badge>;
      case 'planning':
        return <Badge className="bg-blue-100 text-blue-800">開催予定</Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-800">準備中</Badge>;
    }
  };

  const getWithdrawalStatusBadge = (withdrawalStatus: string) => {
    switch (withdrawalStatus) {
      case 'withdrawal_requested':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            辞退申請中
          </Badge>
        );
      case 'withdrawal_approved':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            辞退承認済み
          </Badge>
        );
      case 'withdrawal_rejected':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            辞退却下
          </Badge>
        );
      default:
        return null;
    }
  };

  const TournamentCard = ({ tournament, isJoined = false }: { tournament: Tournament; isJoined?: boolean }) => {
    const teamCount = tournament.teams?.length || 0;
    const hasMultipleTeams = teamCount > 1;
    
    return (
      <Card key={tournament.tournament_id} className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            {getStatusBadge(tournament.status)}
            {isJoined && (
              <div className="flex items-center space-x-2">
                {hasMultipleTeams && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {teamCount}チーム参加
                  </span>
                )}
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 flex items-center">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  参加済み
                </span>
              </div>
            )}
          </div>
          <CardTitle className="text-lg">{tournament.tournament_name}</CardTitle>
          {tournament.format_name && (
            <p className="text-sm text-muted-foreground">{tournament.format_name}</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground mb-4">
            {tournament.venue_name && (
              <div className="flex items-center">
                <MapPin className="h-4 w-4 mr-2" />
                {tournament.venue_name}
              </div>
            )}
            {tournament.recruitment_start_date && tournament.recruitment_end_date && (
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                募集期間: {formatDate(tournament.recruitment_start_date)} 〜 {formatDate(tournament.recruitment_end_date)}
              </div>
            )}
            
            {/* 複数チーム参加情報の表示 */}
            {isJoined && tournament.teams && tournament.teams.length > 0 && (
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  参加チーム一覧
                </h4>
                <div className="space-y-2">
                  {tournament.teams.map((team) => (
                    <div key={team.tournament_team_id} className="p-3 border border-border rounded-md bg-card">
                      {/* チーム情報 */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2 flex-1">
                          <span className="font-medium text-foreground">
                            {team.tournament_team_name}
                          </span>
                          <span className="text-muted-foreground">
                            ({team.tournament_team_omission})
                          </span>
                          {team.assigned_block && (
                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                              {team.assigned_block}ブロック
                            </span>
                          )}
                          {getWithdrawalStatusBadge(team.withdrawal_status)}
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <span>{team.player_count}人</span>
                        </div>
                      </div>
                      
                      {/* アクションボタン */}
                      <div className="flex items-center space-x-2">
                        {team.withdrawal_status === 'withdrawal_approved' ? (
                          <span className="text-xs text-muted-foreground px-3 py-1 bg-muted rounded">
                            辞退済み
                          </span>
                        ) : (
                          <>
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/tournaments/${tournament.tournament_id}/join?team=${team.tournament_team_id}`}>
                                編集
                              </Link>
                            </Button>
                            {/* 辞退申請ボタン */}
                            {team.withdrawal_status === 'active' && tournament.status !== 'completed' && (
                              <Button asChild size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                                <Link href={`/tournaments/${tournament.tournament_id}/withdrawal`}>
                                  辞退申請
                                </Link>
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        
        <div className="space-y-2">
          <Button asChild variant="outline" className="w-full">
            <Link href={`/public/tournaments/${tournament.tournament_id}`}>
              詳細を見る
            </Link>
          </Button>
          {!isJoined && (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/tournaments/${tournament.tournament_id}/join`}>
                大会に参加する
              </Link>
            </Button>
          )}
          {isJoined && (
            <>
              <div className="text-sm text-muted-foreground p-2 bg-blue-50 rounded-md">
                <p className="font-medium">📝 選手変更は各チーム別に行います</p>
                <p className="text-xs mt-1">上記のチーム一覧から個別に編集してください</p>
              </div>
              
              {/* 参加中のチームがある場合のみ新規追加ボタンを表示 */}
              {tournament.teams && tournament.teams.some(team => team.withdrawal_status === 'active') && (
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/tournaments/${tournament.tournament_id}/join?mode=new`}>
                    参加チームを追加する
                  </Link>
                </Button>
              )}
              
              {/* 全チーム辞退済みの場合の表示 */}
              {tournament.teams && tournament.teams.every(team => team.withdrawal_status === 'withdrawal_approved') && (
                <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md border border-border">
                  <p className="font-medium text-red-600">⚠️ 全チーム辞退済み</p>
                  <p className="text-xs mt-1">この大会から全ての参加チームが辞退済みです</p>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-muted-foreground">大会情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchTournaments} variant="outline">
            再試行
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!tournaments) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">大会情報が見つかりません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* 申し込み済の大会 */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center">
          <CheckCircle className="h-6 w-6 mr-2 text-green-600" />
          申し込み済の大会
        </h2>
        
        {tournaments.joined.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.joined.map((tournament) => (
              <TournamentCard key={tournament.tournament_id} tournament={tournament} isJoined={true} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                参加申し込みした大会はありません
              </h3>
              <p className="text-muted-foreground mb-4">
                まだ大会に参加申し込みをしていません。下記の参加可能な大会から申し込みできます。
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 参加可能な大会 */}
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center">
            <Trophy className="h-6 w-6 mr-2 text-blue-600" />
            参加可能な大会
          </h2>
        </div>
        
        {tournaments.available.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.available.map((tournament) => (
              <TournamentCard key={tournament.tournament_id} tournament={tournament} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                参加可能な大会はありません
              </h3>
              <p className="text-muted-foreground mb-4">
                現在募集中の大会がないか、既にすべての大会に参加済みです。
              </p>
              <Button asChild variant="outline">
                <Link href="/tournaments">大会一覧を確認する</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}