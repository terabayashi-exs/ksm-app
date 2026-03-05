'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar, Clock, MapPin, Trophy, Users, CheckCircle, XCircle, AlertTriangle, Filter } from 'lucide-react';
import { formatDateOnly } from '@/lib/utils';
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
}

interface TournamentScheduleProps {
  tournamentId: number;
  initialMatches?: MatchData[];
}

export default function TournamentSchedule({ tournamentId, initialMatches }: TournamentScheduleProps) {
  const [matches, setMatches] = useState<MatchData[]>(initialMatches || []);
  const [loading, setLoading] = useState(!initialMatches);
  const [error, setError] = useState<string | null>(null);

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


  // ブロック分類関数（フェーズIDに依存しない動的判定）
  const getBlockKey = (match: MatchData): string => {
    // _unifiedブロックの場合はdisplay_round_nameを使用
    if (match.block_name && match.block_name.endsWith('_unified')) {
      return match.display_round_name || match.round_name || 'トーナメント';
    }
    // 1文字のブロック名（A, B, C...）は「Xブロック」形式
    if (match.block_name && match.block_name.length === 1) {
      return `${match.block_name}ブロック`;
    }
    // それ以外の意味のあるblock_name（1位リーグ等）はそのまま
    if (match.block_name && match.block_name !== 'default') {
      return match.block_name;
    }
    // display_round_nameがあればそれを使用
    if (match.display_round_name) return match.display_round_name;
    return match.phase || 'その他';
  };

  const blockColors = [
    'bg-blue-100 text-blue-800',
    'bg-green-100 text-green-800',
    'bg-yellow-100 text-yellow-800',
    'bg-purple-100 text-purple-800',
    'bg-pink-100 text-pink-800',
    'bg-indigo-100 text-indigo-800',
    'bg-rose-100 text-rose-800',
    'bg-teal-100 text-teal-800',
    'bg-cyan-100 text-cyan-800',
    'bg-lime-100 text-lime-800',
    'bg-amber-100 text-amber-800',
    'bg-sky-100 text-sky-800',
    'bg-fuchsia-100 text-fuchsia-800',
    'bg-emerald-100 text-emerald-800',
    'bg-violet-100 text-violet-800',
    'bg-red-100 text-red-800',
  ];
  const getBlockColor = (blockKey: string): string => {
    // 「Xブロック」形式からブロック文字を抽出して色分け（A～Z対応）
    const blockMatch = blockKey.match(/^([A-Z])ブロック$/);
    if (blockMatch) {
      const index = blockMatch[1].charCodeAt(0) - 'A'.charCodeAt(0);
      return blockColors[index % blockColors.length];
    }
    // X位リーグ/ブロックの色分け
    if (blockKey.includes('1位')) return 'bg-amber-100 text-amber-800';
    if (blockKey.includes('2位')) return 'bg-cyan-100 text-cyan-800';
    if (blockKey.includes('3位')) return 'bg-lime-100 text-lime-800';
    if (blockKey.includes('4位')) return 'bg-teal-100 text-teal-800';
    return 'bg-muted text-muted-foreground';
  };

  // 試合結果の表示
  const getMatchResult = (match: MatchData) => {
    // 確定済みの試合結果がない場合
    if (!match.has_result) {
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
            {getScoreDisplay()} (引分)
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

  // ブロック情報を取得
  const getAvailableBlocks = () => {
    const blocks = new Set<string>();
    matches.forEach(match => {
      blocks.add(getBlockKey(match));
    });
    return Array.from(blocks).sort((a, b) => {
      // 「Xブロック」形式のブロック同士はアルファベット順
      const blockMatchA = a.match(/^([A-Z])ブロック$/);
      const blockMatchB = b.match(/^([A-Z])ブロック$/);
      if (blockMatchA && blockMatchB) {
        return blockMatchA[1].localeCompare(blockMatchB[1]);
      }
      // ブロック形式が先、その他が後
      if (blockMatchA && !blockMatchB) return -1;
      if (!blockMatchA && blockMatchB) return 1;
      // それ以外はそのまま比較
      return a.localeCompare(b);
    });
  };

  // 指定されたブロックの試合をフィルタリング
  const getMatchesForBlock = (blockKey: string) => {
    return matches.filter(match => getBlockKey(match) === blockKey);
  };

  // ブロックタブの短縮名を取得（スマホ表示用）
  const getBlockShortName = (blockKey: string): string => {
    // 「Xブロック」形式 → アルファベットのみ
    const blockMatch = blockKey.match(/^([A-Z])ブロック$/);
    if (blockMatch) return blockMatch[1];
    // X位リーグ/ブロック → X位
    const rankMatch = blockKey.match(/^(\d+位)/);
    if (rankMatch) return rankMatch[1];
    // そのまま使用（20文字まで）
    if (blockKey.length <= 20) return blockKey;
    return blockKey.substring(0, 18) + '..';
  };

  const availableBlocks = getAvailableBlocks();

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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

  // 日程別スケジュール表示コンポーネント
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
        {sortedFilteredDates.map((date, _dateIndex) => {
          const dayMatches = filteredMatchesByDate[date];
          
          // ブロック別にマッチを分類
          const matchesByBlock = dayMatches.reduce((acc, match) => {
            const blockKey = getBlockKey(match);
            if (!acc[blockKey]) {
              acc[blockKey] = [];
            }
            acc[blockKey].push(match);
            return acc;
          }, {} as Record<string, MatchData[]>);

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

              {/* ブロック別試合表示 */}
              {Object.entries(matchesByBlock)
                .sort(([blockKeyA], [blockKeyB]) => {
                  // 「Xブロック」形式のブロック同士はアルファベット順
                  const matchA = blockKeyA.match(/^([A-Z])ブロック$/);
                  const matchB = blockKeyB.match(/^([A-Z])ブロック$/);
                  if (matchA && matchB) {
                    return matchA[1].localeCompare(matchB[1]);
                  }
                  if (matchA && !matchB) return -1;
                  if (!matchA && matchB) return 1;
                  return blockKeyA.localeCompare(blockKeyB);
                })
                .map(([blockKey, blockMatches]) => (
                <Card key={blockKey}>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey)}`}>
                        {blockKey}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {blockMatches.length}試合
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse min-w-[700px]">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium w-20">時間</th>
                            <th className="text-left py-3 px-2 font-medium w-20">試合</th>
                            <th className="text-left py-3 px-2 font-medium">対戦</th>
                            <th className="text-right py-3 px-2 font-medium w-[200px]">結果</th>
                            <th className="text-right py-3 px-2 font-medium w-[100px]">コート</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blockMatches
                            .sort((a, b) => {
                              return a.match_code.localeCompare(b.match_code, undefined, { numeric: true });
                            })
                            .map((match) => {
                              const result = getMatchResult(match);
                              
                              return (
                                <tr key={match.match_id} className="border-b hover:bg-muted">
                                  <td className="py-2 px-2">
                                    <div className="flex items-center text-xs md:text-sm">
                                      <Clock className="h-3 w-3 mr-1 text-muted-foreground" />
                                      <span className="truncate">{formatTime(match.start_time)}</span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-2">
                                    <div className="font-medium text-xs md:text-sm">{match.match_code}</div>
                                    <div className="text-xs text-muted-foreground hidden md:block">{match.match_type}</div>
                                  </td>
                                  <td className="py-2 px-2">
                                    <div className="text-xs md:text-sm">
                                      <div className="hidden md:block space-y-1">
                                        {/* デスクトップ表示: 縦並び */}
                                        <div className={`${result.winner === 'team1' ? 'font-bold text-green-600' : ''}`}>
                                          {match.team1_display_name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">vs</div>
                                        <div className={`${result.winner === 'team2' ? 'font-bold text-green-600' : ''}`}>
                                          {match.team2_display_name}
                                        </div>
                                      </div>
                                      <div className="md:hidden">
                                        {/* モバイル表示: 横並び */}
                                        <div className="flex items-center space-x-1 text-xs">
                                          <span className={`truncate max-w-[3.5rem] ${result.winner === 'team1' ? 'font-bold text-green-600' : ''}`}>
                                            {match.team1_display_name}
                                          </span>
                                          <span className="text-muted-foreground text-xs">vs</span>
                                          <span className={`truncate max-w-[3.5rem] ${result.winner === 'team2' ? 'font-bold text-green-600' : ''}`}>
                                            {match.team2_display_name}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 whitespace-nowrap text-right">
                                    <div className="flex items-center justify-end space-x-1">
                                      <div className="hidden md:inline">{result.icon}</div>
                                      <div className="text-xs md:text-sm">{result.display}</div>
                                    </div>
                                    {match.remarks && !match.is_walkover && (
                                      <div className="text-xs text-muted-foreground mt-1 hidden md:block text-right">
                                        {match.remarks}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 whitespace-nowrap text-right">
                                    {match.court_number ? (
                                      <div className="flex items-center justify-end text-xs md:text-sm">
                                        <MapPin className="h-3 w-3 mr-1 text-muted-foreground hidden md:inline" />
                                        <span className="md:hidden">
                                          {match.court_name || match.court_number}
                                        </span>
                                        <span className="hidden md:inline">
                                          {match.court_name || match.court_number}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* 試合速報エリア */}
      <MatchNewsArea tournamentId={tournamentId} />

      {/* ブロック別タブ */}
      <Tabs defaultValue="all" className="w-full">
        <div className="relative">
          <TabsList className="w-full justify-start h-auto p-1 bg-muted/50 overflow-x-auto">
            <div className="flex space-x-1 min-w-max">
              <TabsTrigger 
                value="all" 
                className="flex items-center px-3 py-2 text-xs sm:text-sm whitespace-nowrap"
              >
                <Filter className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="hidden xs:inline">全て表示</span>
                <span className="xs:hidden">全て</span>
              </TabsTrigger>
              {availableBlocks.map((blockKey) => (
                <TabsTrigger 
                  key={blockKey}
                  value={blockKey}
                  className={`flex items-center px-3 py-2 text-xs sm:text-sm whitespace-nowrap ${getBlockColor(blockKey)}`}
                >
                  <span className="hidden sm:inline">{blockKey}</span>
                  <span className="sm:hidden">{getBlockShortName(blockKey)}</span>
                  <span className="ml-1 text-xs opacity-75">
                    ({getMatchesForBlock(blockKey).length})
                  </span>
                </TabsTrigger>
              ))}
            </div>
          </TabsList>
        </div>

        {/* 全て表示タブ */}
        <TabsContent value="all" className="mt-6">
          <div className="space-y-6">
            <OverviewCard filteredMatches={matches} />
            <ScheduleByDate filteredMatches={matches} />
          </div>
        </TabsContent>

        {/* ブロック別タブ */}
        {availableBlocks.map((blockKey) => (
          <TabsContent key={blockKey} value={blockKey} className="mt-6">
            <div className="space-y-6">
              <OverviewCard filteredMatches={getMatchesForBlock(blockKey)} />
              <ScheduleByDate filteredMatches={getMatchesForBlock(blockKey)} />
            </div>
          </TabsContent>
        ))}

      </Tabs>
    </div>
  );
}