// components/features/team/TeamTournaments.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { MapPin, Users, Trophy, Clock, CheckCircle, XCircle } from 'lucide-react';
import { formatDateOnly } from '@/lib/utils';
import { getStatusLabel, type TournamentStatus } from '@/lib/tournament-status';

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
  group_id?: number | null;
  group_order?: number;
  group_name?: string | null;
  group_description?: string | null;
  format_name: string | null;
  venue_name: string | null;
  tournament_dates: string | null;
  event_start_date: string | null;
  team_count?: number;
  applied_count?: number;
  teams?: TournamentTeam[]; // 複数チーム参加対応
  // 後方互換性のため保持
  assigned_block?: string | null;
  block_position?: number | null;
  joined_at?: string | null;
}

interface TournamentGroup {
  group_id: number;
  group_name: string | null;
  group_description: string | null;
  tournaments: Tournament[];
}

interface TournamentsData {
  available: Tournament[];
  joined: Tournament[];
}

export default function TeamTournaments() {
  const [tournaments, setTournaments] = useState<TournamentsData | null>(null);
  const [availableGroups, setAvailableGroups] = useState<TournamentGroup[]>([]);
  const [availableUngrouped, setAvailableUngrouped] = useState<Tournament[]>([]);
  const [joinedGroups, setJoinedGroups] = useState<TournamentGroup[]>([]);
  const [joinedUngrouped, setJoinedUngrouped] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const fetchTournaments = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const response = await fetch('/api/teams/tournaments', { signal });
      const result = await response.json();

      if (result.success) {
        setTournaments(result.data);

        // 参加可能な大会のグループ化
        const availGrouped: Record<number, TournamentGroup> = {};
        const availUngrouped: Tournament[] = [];

        result.data.available.forEach((tournament: Tournament) => {
          if (tournament.group_id) {
            if (!availGrouped[tournament.group_id]) {
              availGrouped[tournament.group_id] = {
                group_id: tournament.group_id,
                group_name: tournament.group_name || '',
                group_description: tournament.group_description || '',
                tournaments: []
              };
            }
            availGrouped[tournament.group_id].tournaments.push(tournament);
          } else {
            availUngrouped.push(tournament);
          }
        });

        // グループ内の部門を順序でソート
        Object.values(availGrouped).forEach(group => {
          group.tournaments.sort((a, b) => (a.group_order || 0) - (b.group_order || 0));
        });

        setAvailableGroups(Object.values(availGrouped));
        setAvailableUngrouped(availUngrouped);

        // 申し込み済の大会のグループ化
        const joinedGrouped: Record<number, TournamentGroup> = {};
        const joinedUngroup: Tournament[] = [];

        result.data.joined.forEach((tournament: Tournament) => {
          if (tournament.group_id) {
            if (!joinedGrouped[tournament.group_id]) {
              joinedGrouped[tournament.group_id] = {
                group_id: tournament.group_id,
                group_name: tournament.group_name || '',
                group_description: tournament.group_description || '',
                tournaments: []
              };
            }
            joinedGrouped[tournament.group_id].tournaments.push(tournament);
          } else {
            joinedUngroup.push(tournament);
          }
        });

        // グループ内の部門を順序でソート
        Object.values(joinedGrouped).forEach(group => {
          group.tournaments.sort((a, b) => (a.group_order || 0) - (b.group_order || 0));
        });

        setJoinedGroups(Object.values(joinedGrouped));
        setJoinedUngrouped(joinedUngroup);
      } else {
        setError(result.error || '大会情報の取得に失敗しました');
      }
    } catch (error) {
      // AbortErrorの場合は無視（コンポーネントのアンマウント時）
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Fetch aborted');
        return;
      }
      console.error('Tournament fetch error:', error);
      setError('大会情報の取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchTournaments(controller.signal);

    // クリーンアップ関数：コンポーネントがアンマウントされたらfetchをキャンセル
    return () => {
      controller.abort();
    };
  }, []);

  const getStatusBadgeColor = (status: TournamentStatus): string => {
    // TOP画面と同じ色合いを使用
    switch (status) {
      case 'planning':
        return 'bg-gray-100 text-gray-800';
      case 'recruiting':
        return 'bg-blue-100 text-blue-800';
      case 'before_event':
        return 'bg-yellow-100 text-yellow-800';
      case 'ongoing':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-muted text-foreground';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getWithdrawalStatusBadge = (withdrawalStatus: string) => {
    switch (withdrawalStatus) {
      case 'withdrawal_requested':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            辞退申請中
          </span>
        );
      case 'withdrawal_approved':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-destructive/5 text-destructive border border-destructive/20 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            辞退承認済み
          </span>
        );
      case 'withdrawal_rejected':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            辞退却下
          </span>
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
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(tournament.status as TournamentStatus)}`}>
              {getStatusLabel(tournament.status as TournamentStatus)}
            </span>
            {isJoined && (
              <div className="flex items-center space-x-2">
                {hasMultipleTeams && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
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
                募集期間: {formatDateOnly(tournament.recruitment_start_date)} 〜 {formatDateOnly(tournament.recruitment_end_date)}
              </div>
            )}

            {/* 参加状況（募集中の大会のみ） */}
            {tournament.status === 'recruiting' && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2">
                  {/* 想定チーム数 */}
                  <div className="p-2 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/20 dark:border-primary/20 text-center">
                    <div className="text-xs text-primary dark:text-primary/80 font-medium mb-1">想定チーム数</div>
                    <div className="text-lg font-bold text-primary dark:text-primary/80">{tournament.team_count || 0}</div>
                  </div>
                  {/* 参加申請 */}
                  <div className="p-2 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 text-center">
                    <div className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">参加申請</div>
                    <div className="text-lg font-bold text-green-700 dark:text-green-400">{tournament.applied_count || 0}</div>
                  </div>
                </div>
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
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="font-medium text-foreground mb-1">
                            {team.tournament_team_name}
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            ({team.tournament_team_omission})
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {team.assigned_block && (
                              <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded">
                                {team.assigned_block}ブロック
                              </span>
                            )}
                            {getWithdrawalStatusBadge(team.withdrawal_status)}
                          </div>
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground ml-4">
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
                            {/* 辞退申請ボタン（開催前のみ表示） */}
                            {team.withdrawal_status === 'active' &&
                             (tournament.status === 'planning' ||
                              tournament.status === 'recruiting' ||
                              tournament.status === 'before_event') && (
                              <Button asChild size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5">
                                <Link href={`/tournaments/${tournament.tournament_id}/withdrawal?team=${team.tournament_team_id}`}>
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
          {!isJoined &&
           tournament.status !== 'ongoing' &&
           tournament.status !== 'completed' &&
           tournament.recruitment_start_date &&
           tournament.recruitment_end_date &&
           new Date(tournament.recruitment_start_date) <= new Date() &&
           new Date() <= new Date(tournament.recruitment_end_date) && (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/tournaments/${tournament.tournament_id}/join`}>
                大会に参加する
              </Link>
            </Button>
          )}
          {isJoined && (
            <>
              <div className="text-sm text-muted-foreground p-2 bg-primary/5 rounded-md">
                <p className="font-medium">📝 選手変更は各チーム別に行います</p>
                <p className="text-xs mt-1">上記のチーム一覧から個別に編集してください</p>
              </div>
              
              {/* 参加中のチームがある場合かつ募集期間中のみ新規追加ボタンを表示（開催中・完了は除外） */}
              {tournament.teams &&
               tournament.teams.some(team => team.withdrawal_status === 'active') &&
               tournament.status !== 'ongoing' &&
               tournament.status !== 'completed' &&
               tournament.recruitment_start_date &&
               tournament.recruitment_end_date &&
               new Date(tournament.recruitment_start_date) <= new Date() &&
               new Date() <= new Date(tournament.recruitment_end_date) && (
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/tournaments/${tournament.tournament_id}/join?mode=new`}>
                    参加チームを追加する
                  </Link>
                </Button>
              )}
              
              {/* 全チーム辞退済みの場合の表示 */}
              {tournament.teams && tournament.teams.every(team => team.withdrawal_status === 'withdrawal_approved') && (
                <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md border border-border">
                  <p className="font-medium text-destructive">⚠️ 全チーム辞退済み</p>
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
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">大会情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => fetchTournaments()} variant="outline">
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

        {(joinedGroups.length > 0 || joinedUngrouped.length > 0) ? (
          <div className="space-y-6">
            {/* グループ化された大会 */}
            {joinedGroups.map((group) => (
              <div key={`joined-group-${group.group_id}`} className="border-2 border-green-200 rounded-lg p-4 bg-green-50/30">
                <div className="mb-4">
                  <div className="flex items-center mb-1">
                    <Trophy className="w-5 h-5 mr-2 text-green-600" />
                    <h3 className="font-bold text-lg text-green-900">
                      {group.group_name || `グループ ${group.group_id}`}
                    </h3>
                  </div>
                  {group.group_description && (
                    <p className="text-sm text-green-700 ml-7">{group.group_description}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ml-2">
                  {group.tournaments.map((tournament) => (
                    <TournamentCard key={tournament.tournament_id} tournament={tournament} isJoined={true} />
                  ))}
                </div>
              </div>
            ))}

            {/* グループ化されていない大会 */}
            {joinedUngrouped.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {joinedUngrouped.map((tournament) => (
                  <TournamentCard key={tournament.tournament_id} tournament={tournament} isJoined={true} />
                ))}
              </div>
            )}
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
            <Trophy className="h-6 w-6 mr-2 text-primary" />
            参加可能な大会
          </h2>
        </div>

        {(availableGroups.length > 0 || availableUngrouped.length > 0) ? (
          <div className="space-y-6">
            {/* グループ化された大会 */}
            {availableGroups.map((group) => (
              <div key={`available-group-${group.group_id}`} className="border-2 border-primary/20 rounded-lg p-4 bg-primary/5">
                <div className="mb-4">
                  <div className="flex items-center mb-1">
                    <Trophy className="w-5 h-5 mr-2 text-primary" />
                    <h3 className="font-bold text-lg text-primary">
                      {group.group_name || `グループ ${group.group_id}`}
                    </h3>
                  </div>
                  {group.group_description && (
                    <p className="text-sm text-primary ml-7">{group.group_description}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ml-2">
                  {group.tournaments.map((tournament) => (
                    <TournamentCard key={tournament.tournament_id} tournament={tournament} />
                  ))}
                </div>
              </div>
            ))}

            {/* グループ化されていない大会 */}
            {availableUngrouped.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {availableUngrouped.map((tournament) => (
                  <TournamentCard key={tournament.tournament_id} tournament={tournament} />
                ))}
              </div>
            )}
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