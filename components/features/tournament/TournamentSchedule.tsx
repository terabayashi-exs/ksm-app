'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, MapPin, Trophy, Users, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { formatDateOnly } from '@/lib/utils';
import { parseTotalScore } from '@/lib/score-parser';
import MatchNewsArea from './MatchNewsArea';

interface MatchData {
  match_id: number;
  match_block_id: number;
  tournament_date: string;
  match_number: number;
  match_code: string;
  team1_tournament_team_id?: number | null;
  team2_tournament_team_id?: number | null;
  team1_display_name: string;
  team2_display_name: string;
  court_number: number | null;
  court_name?: string | null;
  venue_name?: string | null;
  start_time: string | null;
  phase: string;
  display_round_name: string;
  block_name: string | null;
  match_type: string;
  block_order: number;
  team1_goals: number | null;
  team2_goals: number | null;
  team1_pk_goals?: number | null; // PK戦スコア（追加）
  team2_pk_goals?: number | null; // PK戦スコア（追加）
  winner_tournament_team_id?: number | null;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: string;
  result_status: string;
  remarks: string | null;
  has_result: boolean;
  cancellation_type: string | null;
  round_name: string | null;
  matchday?: number | null;
  live_team1_scores?: string | null;
  live_team2_scores?: string | null;
}

interface TournamentScheduleProps {
  tournamentId: number;
  initialMatches?: MatchData[];
}

interface TeamOption {
  tournament_team_id: number;
  display_name: string;
}

export default function TournamentSchedule({ tournamentId, initialMatches }: TournamentScheduleProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'operator';
  const [matches, setMatches] = useState<MatchData[]>(initialMatches || []);
  const [loading, setLoading] = useState(!initialMatches);
  const [error, setError] = useState<string | null>(null);
  const [filterTeamId, setFilterTeamId] = useState<string>('all');
  const [confirmedTeams, setConfirmedTeams] = useState<TeamOption[]>([]);

  // 試合データの取得（initialMatchesが提供されていない場合のみ）
  useEffect(() => {
    if (initialMatches) return;

    const fetchMatches = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/public-matches`, {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success) {
          setMatches(result.data);
        } else {
          console.error('API Error Details:', result);
          setError(result.error || '試合データの取得に失敗しました');
        }
      } catch (err) {
        console.error('試合データ取得エラー:', err);
        setError(`試合データの取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, [tournamentId, initialMatches]);

  // 参加確定チーム一覧を取得（辞退チーム除外）
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/teams`);
        const result = await response.json();
        if (result.success && result.data?.teams) {
          const teams: TeamOption[] = result.data.teams.map((t: { tournament_team_id: number; display_name?: string; team_name?: string }) => ({
            tournament_team_id: t.tournament_team_id,
            display_name: t.display_name || t.team_name || '',
          }));
          teams.sort((a, b) => a.display_name.localeCompare(b.display_name, 'ja'));
          setConfirmedTeams(teams);
        }
      } catch (err) {
        console.error('チーム一覧取得エラー:', err);
      }
    };
    fetchTeams();
  }, [tournamentId]);

  // チームが試合に割り当て済みかどうか（フィルター表示条件）
  const hasAssignedTeams = useMemo(() => {
    return matches.some(m => m.team1_tournament_team_id || m.team2_tournament_team_id);
  }, [matches]);

  // フィルタリングされた試合一覧
  const filteredMatches = useMemo(() => {
    if (filterTeamId === 'all') return matches;
    const teamId = parseInt(filterTeamId);
    return matches.filter(m =>
      m.team1_tournament_team_id === teamId || m.team2_tournament_team_id === teamId
    );
  }, [matches, filterTeamId]);

  // リーグ戦モード判定（matchdayが設定されている試合があるか）
  const isLeagueMode = useMemo(() => {
    return matches.some(m => m.matchday != null && m.matchday > 0);
  }, [matches]);

  // 試合結果の表示
  const getMatchResult = (match: MatchData) => {
    // 確定済みの試合結果がない場合
    if (!match.has_result) {
      // 管理者・運営者の場合、進行中・完了の試合にライブスコアを表示
      if (isAdmin && (match.match_status === 'ongoing' || match.match_status === 'completed') && match.live_team1_scores && match.live_team2_scores) {
        try {
          const t1 = parseTotalScore(match.live_team1_scores);
          const t2 = parseTotalScore(match.live_team2_scores);
          const statusLabel = match.match_status === 'ongoing' ? '試合中' : '確定待ち';
          const colorClass = match.match_status === 'ongoing' ? 'text-orange-600 animate-pulse' : 'text-purple-600';
          const iconEl = match.match_status === 'ongoing'
            ? <Clock className="h-4 w-4 text-orange-500" />
            : <AlertTriangle className="h-4 w-4 text-purple-500" />;
          return {
            status: match.match_status === 'ongoing' ? 'ongoing' : 'completed_unconfirmed',
            display: (
              <span className={`${colorClass} text-sm font-medium`}>
                {t1} - {t2}
                <span className="text-xs ml-1">({statusLabel})</span>
              </span>
            ),
            icon: iconEl
          };
        } catch {
          // パース失敗時はフォールスルー
        }
      }

      // 試合状態に応じて表示を変更
      switch (match.match_status) {
        case 'ongoing':
          return {
            status: 'ongoing',
            display: <span className="text-orange-600 text-sm font-medium animate-pulse">試合中</span>,
            icon: <Clock className="h-4 w-4 text-orange-500" />
          };
        case 'completed':
          return {
            status: 'completed_unconfirmed',
            display: <span className="text-purple-600 text-sm font-medium">試合完了</span>,
            icon: <AlertTriangle className="h-4 w-4 text-purple-500" />
          };
        case 'cancelled':
          // 中止の種別に応じた表示
          let cancelLabel = '中止';
          if (match.cancellation_type === 'no_count') {
            cancelLabel = '中止';
          } else if (match.cancellation_type === 'no_show_both') {
            cancelLabel = '中止（両者不参加）';
          } else if (match.cancellation_type === 'no_show_team1') {
            cancelLabel = '中止（不戦勝）';
          } else if (match.cancellation_type === 'no_show_team2') {
            cancelLabel = '中止（不戦勝）';
          }

          return {
            status: 'cancelled',
            display: <span className="text-red-600 text-sm font-medium">{cancelLabel}</span>,
            icon: <XCircle className="h-4 w-4 text-red-500" />
          };
        default:
          return {
            status: 'scheduled',
            display: <span className="text-muted-foreground text-sm">未実施</span>,
            icon: <Clock className="h-4 w-4 text-muted-foreground" />
          };
      }
    }

    if (match.is_walkover) {
      const walkoverScore = `${match.team1_goals ?? 0} - ${match.team2_goals ?? 0}`;
      // 不戦引き分けの場合（両チーム不参加）
      if (match.is_draw) {
        return {
          status: 'walkover_draw',
          display: <span className="text-blue-600 text-sm font-medium">不戦引分 {walkoverScore}</span>,
          icon: <AlertTriangle className="h-4 w-4 text-blue-500" />
        };
      }
      // 通常の不戦勝（片方チーム不参加）
      // 勝者を判定してwinnerプロパティを追加
      const winnerIsTeam1 = match.winner_tournament_team_id === match.team1_tournament_team_id;

      return {
        status: 'walkover',
        display: <span className="text-orange-600 text-sm font-medium">不戦勝 {walkoverScore}</span>,
        icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
        winner: winnerIsTeam1 ? 'team1' : 'team2'
      };
    }

    // PK戦を考慮したスコア表示の生成
    const getScoreDisplay = () => {
      const hasPkGoals = (match.team1_pk_goals !== null && match.team1_pk_goals !== undefined) || 
                        (match.team2_pk_goals !== null && match.team2_pk_goals !== undefined);
      
      if (hasPkGoals && (match.team1_pk_goals || 0) > 0 || (match.team2_pk_goals || 0) > 0) {
        return `${match.team1_goals} - ${match.team2_goals} (PK ${match.team1_pk_goals || 0}-${match.team2_pk_goals || 0})`;
      }
      
      return `${match.team1_goals} - ${match.team2_goals}`;
    };

    if (match.is_draw) {
      return {
        status: 'draw',
        display: (
          <span className="text-blue-600 text-sm font-medium">
            {getScoreDisplay()}
          </span>
        ),
        icon: <Users className="h-4 w-4 text-blue-500" />
      };
    }

    // 勝敗がついている場合
    const winnerIsTeam1 = match.winner_tournament_team_id === match.team1_tournament_team_id;
    return {
      status: 'completed',
      display: (
        <span className="text-green-600 text-sm font-medium">
          {getScoreDisplay()}
        </span>
      ),
      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
      winner: winnerIsTeam1 ? 'team1' : 'team2'
    };
  };

  // 時刻フォーマット
  const formatTime = (timeStr: string | null): string => {
    if (!timeStr) return '--:--';
    return timeStr.substring(0, 5); // HH:MM形式に変換
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-muted-foreground">スケジュールを読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="text-center py-12">
          <XCircle className="h-8 w-8 mx-auto text-red-600 mb-4" />
          <p className="text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (matches.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">試合スケジュール</h3>
          <p className="text-muted-foreground">まだ試合スケジュールが作成されていません。</p>
        </CardContent>
      </Card>
    );
  }


  // 概要情報カードコンポーネント
  const OverviewCard = ({ filteredMatches }: { filteredMatches: MatchData[] }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Trophy className="h-5 w-5 mr-2 text-blue-600" />
          スケジュール概要
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredMatches.length}</div>
            <div className="text-sm text-muted-foreground">試合数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Object.keys(filteredMatches.reduce((acc, match) => {
                acc[match.tournament_date] = true;
                return acc;
              }, {} as Record<string, boolean>)).length}
            </div>
            <div className="text-sm text-muted-foreground">開催日数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {filteredMatches.filter(m => m.has_result).length}
            </div>
            <div className="text-sm text-muted-foreground">実施済み</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // 日程別スケジュール表示コンポーネント（時間順）
  const ScheduleByDate = ({ filteredMatches }: { filteredMatches: MatchData[] }) => {
    const filteredMatchesByDate = filteredMatches.reduce((acc, match) => {
      const date = match.tournament_date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(match);
      return acc;
    }, {} as Record<string, MatchData[]>);

    const sortedFilteredDates = Object.keys(filteredMatchesByDate).sort();

    return (
      <>
        {sortedFilteredDates.map((date) => {
          const dayMatches = filteredMatchesByDate[date];

          // 時間順にソート（時間未設定は末尾）
          const sortedMatches = [...dayMatches].sort((a, b) => {
            const timeA = a.start_time || '99:99';
            const timeB = b.start_time || '99:99';
            if (timeA !== timeB) return timeA.localeCompare(timeB);
            return a.match_code.localeCompare(b.match_code, undefined, { numeric: true });
          });

          return (
            <div key={date} className="space-y-4">
              {/* 開催日ヘッダー */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Calendar className="h-5 w-5 mr-2" />
                      開催日: {formatDateOnly(date)}
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 mr-1" />
                      {dayMatches.length}試合
                    </div>
                  </CardTitle>
                </CardHeader>
              </Card>

              {/* 時間順試合表示 */}
              <Card>
                <CardContent className="pt-4">
                  <table className="w-full border-collapse table-fixed">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-1.5 font-medium w-[3.5rem]">時間</th>
                        <th className="text-left py-3 px-1.5 font-medium w-[3rem]">試合</th>
                        <th className="text-left py-3 px-1.5 font-medium">対戦</th>
                        <th className="text-right py-3 px-1.5 font-medium">結果</th>
                        <th className="text-right py-3 px-1.5 font-medium w-[4.5rem]">コート</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMatches.map((match) => {
                        const result = getMatchResult(match);

                        return (
                          <tr key={match.match_id} className="border-b hover:bg-muted">
                            <td className="py-2 px-1.5 whitespace-nowrap">
                              <span className="text-sm">{formatTime(match.start_time)}</span>
                            </td>
                            <td className="py-2 px-1.5 whitespace-nowrap">
                              <div className="text-sm font-medium">{match.match_code}</div>
                            </td>
                            <td className="py-2 px-1.5">
                              <div className="text-sm space-y-0.5">
                                <div className={`${result.winner === 'team1' ? 'font-bold text-green-600' : ''}`}>
                                  {match.team1_display_name}
                                </div>
                                <div className="text-xs text-muted-foreground">vs</div>
                                <div className={`${result.winner === 'team2' ? 'font-bold text-green-600' : ''}`}>
                                  {match.team2_display_name}
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-1.5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end space-x-1">
                                <div className="hidden md:inline">{result.icon}</div>
                                <div className="text-sm">{result.display}</div>
                              </div>
                              {match.remarks && !match.is_walkover && (
                                <div className="text-xs text-muted-foreground mt-1 hidden md:block text-right">
                                  {match.remarks}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-1.5 whitespace-nowrap text-right">
                              {match.court_number ? (
                                <div className="flex items-center justify-end text-sm">
                                  <MapPin className="h-3 w-3 mr-1 text-muted-foreground hidden md:inline" />
                                  <span>{match.court_name || match.court_number}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </>
    );
  };

  // 節別スケジュール表示コンポーネント（リーグ戦用・試合コード順）
  const ScheduleByMatchday = ({ filteredMatches: fm }: { filteredMatches: MatchData[] }) => {
    // 節ごとにグループ化
    const matchesByMatchday = fm.reduce((acc, match) => {
      const md = match.matchday ?? 0;
      if (!acc[md]) acc[md] = [];
      acc[md].push(match);
      return acc;
    }, {} as Record<number, MatchData[]>);

    const sortedMatchdays = Object.keys(matchesByMatchday).map(Number).sort((a, b) => a - b);

    // 日付の短縮フォーマット（M/d）
    const formatShortDate = (dateStr: string): string => {
      if (!dateStr || dateStr === '2024-01-01') return '-';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    return (
      <>
        {sortedMatchdays.map((matchday) => {
          const mdMatches = matchesByMatchday[matchday];

          // 試合コード順にソート
          const sortedMatches = [...mdMatches].sort((a, b) =>
            a.match_code.localeCompare(b.match_code, undefined, { numeric: true })
          );

          return (
            <Card key={matchday}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Trophy className="h-5 w-5 mr-2 text-primary" />
                    第{matchday}節
                  </div>
                  <span className="text-sm text-muted-foreground font-normal">
                    {mdMatches.length}試合
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full border-collapse table-fixed">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-1.5 font-medium w-[3rem]">日程</th>
                      <th className="text-left py-3 px-1.5 font-medium w-[3.5rem]">時間</th>
                      <th className="text-left py-3 px-1.5 font-medium w-[3rem]">試合</th>
                      <th className="text-left py-3 px-1.5 font-medium">対戦</th>
                      <th className="text-right py-3 px-1.5 font-medium">結果</th>
                      <th className="text-right py-3 px-1.5 font-medium w-[5.5rem]">会場</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMatches.map((match) => {
                      const result = getMatchResult(match);

                      return (
                        <tr key={match.match_id} className="border-b hover:bg-muted">
                          <td className="py-2 px-1.5 whitespace-nowrap">
                            <span className="text-sm">{formatShortDate(match.tournament_date)}</span>
                          </td>
                          <td className="py-2 px-1.5 whitespace-nowrap">
                            <span className="text-sm">{formatTime(match.start_time)}</span>
                          </td>
                          <td className="py-2 px-1.5 whitespace-nowrap">
                            <div className="text-sm font-medium">{match.match_code}</div>
                          </td>
                          <td className="py-2 px-1.5">
                            <div className="text-sm space-y-0.5">
                              <div className={`${result.winner === 'team1' ? 'font-bold text-green-600' : ''}`}>
                                {match.team1_display_name}
                              </div>
                              <div className="text-xs text-muted-foreground">vs</div>
                              <div className={`${result.winner === 'team2' ? 'font-bold text-green-600' : ''}`}>
                                {match.team2_display_name}
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-1.5 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <div className="hidden md:inline">{result.icon}</div>
                              <div className="text-sm">{result.display}</div>
                            </div>
                            {match.remarks && !match.is_walkover && (
                              <div className="text-xs text-muted-foreground mt-1 hidden md:block text-right">
                                {match.remarks}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-1.5 whitespace-nowrap text-right">
                            {(match.venue_name || match.court_name) ? (
                              <div className="text-sm text-right">
                                <div className="flex items-center justify-end">
                                  <MapPin className="h-3 w-3 mr-1 text-muted-foreground hidden md:inline" />
                                  <span>{match.venue_name || `コート${match.court_number}`}</span>
                                </div>
                                {match.court_name && (
                                  <div className="text-xs text-muted-foreground">{match.court_name}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* 試合速報エリア */}
      <MatchNewsArea tournamentId={tournamentId} />

      {/* チームフィルター（チームが割り当て済みで確定チームがある場合のみ表示） */}
      {hasAssignedTeams && confirmedTeams.length > 0 && (
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={filterTeamId} onValueChange={setFilterTeamId}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="チームで絞り込み" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての試合</SelectItem>
              {confirmedTeams.map((team) => (
                <SelectItem key={team.tournament_team_id} value={team.tournament_team_id.toString()}>
                  {team.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterTeamId !== 'all' && (
            <span className="text-sm text-muted-foreground shrink-0">
              {filteredMatches.length}試合
            </span>
          )}
        </div>
      )}

      <OverviewCard filteredMatches={filteredMatches} />
      {isLeagueMode ? (
        <ScheduleByMatchday filteredMatches={filteredMatches} />
      ) : (
        <ScheduleByDate filteredMatches={filteredMatches} />
      )}
    </div>
  );
}