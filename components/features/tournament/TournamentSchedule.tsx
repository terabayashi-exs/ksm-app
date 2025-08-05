'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, MapPin, Trophy, Users, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { formatDateOnly } from '@/lib/utils';

interface MatchData {
  match_id: number;
  match_block_id: number;
  tournament_date: string;
  match_number: number;
  match_code: string;
  team1_id: string | null;
  team2_id: string | null;
  team1_display_name: string;
  team2_display_name: string;
  court_number: number | null;
  start_time: string | null;
  phase: string;
  display_round_name: string;
  block_name: string | null;
  match_type: string;
  block_order: number;
  team1_goals: number | null;
  team2_goals: number | null;
  winner_team_id: string | null;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: string;
  result_status: string;
  remarks: string | null;
  has_result: boolean;
}

interface TournamentScheduleProps {
  tournamentId: number;
}

export default function TournamentSchedule({ tournamentId }: TournamentScheduleProps) {
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 試合データの取得
  useEffect(() => {
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
  }, [tournamentId]);

  // 日付別にマッチをグループ化
  const matchesByDate = matches.reduce((acc, match) => {
    const date = match.tournament_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(match);
    return acc;
  }, {} as Record<string, MatchData[]>);

  // ブロック分類関数
  const getBlockKey = (match: MatchData): string => {
    if (match.phase === 'preliminary') {
      if (match.block_name) {
        return `予選${match.block_name}ブロック`;
      }
      const blockMatch = match.match_code.match(/([ABCD])\d+/);
      if (blockMatch) {
        return `予選${blockMatch[1]}ブロック`;
      }
      return '予選リーグ';
    } else if (match.phase === 'final') {
      return '決勝トーナメント';
    } else {
      return match.phase || 'その他';
    }
  };

  const getBlockColor = (blockKey: string): string => {
    if (blockKey.includes('予選A')) return 'bg-blue-100 text-blue-800';
    if (blockKey.includes('予選B')) return 'bg-green-100 text-green-800';
    if (blockKey.includes('予選C')) return 'bg-yellow-100 text-yellow-800';
    if (blockKey.includes('予選D')) return 'bg-purple-100 text-purple-800';
    if (blockKey.includes('予選')) return 'bg-gray-100 text-gray-800';
    if (blockKey.includes('決勝')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  // 試合結果の表示
  const getMatchResult = (match: MatchData) => {
    if (!match.has_result) {
      return {
        status: 'scheduled',
        display: <span className="text-gray-500 text-sm">未実施</span>,
        icon: <Clock className="h-4 w-4 text-gray-400" />
      };
    }

    if (match.is_walkover) {
      return {
        status: 'walkover',
        display: <span className="text-orange-600 text-sm font-medium">不戦勝</span>,
        icon: <AlertTriangle className="h-4 w-4 text-orange-500" />
      };
    }

    if (match.is_draw) {
      return {
        status: 'draw',
        display: (
          <span className="text-blue-600 text-sm font-medium">
            {match.team1_goals} - {match.team2_goals} (引分)
          </span>
        ),
        icon: <Users className="h-4 w-4 text-blue-500" />
      };
    }

    // 勝敗がついている場合
    const winnerIsTeam1 = match.winner_team_id === match.team1_id;
    return {
      status: 'completed',
      display: (
        <span className="text-green-600 text-sm font-medium">
          {match.team1_goals} - {match.team2_goals}
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
          <p className="text-gray-600">スケジュールを読み込み中...</p>
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
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">試合スケジュール</h3>
          <p className="text-gray-600">まだ試合スケジュールが作成されていません。</p>
        </CardContent>
      </Card>
    );
  }

  const sortedDates = Object.keys(matchesByDate).sort();

  return (
    <div className="space-y-6">
      {/* 概要情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trophy className="h-5 w-5 mr-2 text-blue-600" />
            スケジュール概要
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{matches.length}</div>
              <div className="text-sm text-gray-600">総試合数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{sortedDates.length}</div>
              <div className="text-sm text-gray-600">開催日数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {matches.filter(m => m.has_result).length}
              </div>
              <div className="text-sm text-gray-600">実施済み試合</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {Math.max(...matches.map(m => m.court_number || 0), 0)}
              </div>
              <div className="text-sm text-gray-600">使用コート数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 日程別スケジュール */}
      {sortedDates.map((date, dateIndex) => {
        const dayMatches = matchesByDate[date];
        
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
                    開催日 {dateIndex + 1}: {formatDateOnly(date)}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Clock className="h-4 w-4 mr-1" />
                    {dayMatches.length}試合
                  </div>
                </CardTitle>
              </CardHeader>
            </Card>

            {/* ブロック別試合表示 */}
            {Object.entries(matchesByBlock).map(([blockKey, blockMatches]) => (
              <Card key={blockKey}>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey)}`}>
                      {blockKey}
                    </span>
                    <span className="text-sm text-gray-600">
                      {blockMatches.length}試合
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-3 font-medium">時間</th>
                          <th className="text-left py-3 px-3 font-medium">試合</th>
                          <th className="text-left py-3 px-3 font-medium">対戦</th>
                          <th className="text-left py-3 px-3 font-medium">結果</th>
                          <th className="text-left py-3 px-3 font-medium">コート</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blockMatches
                          .sort((a, b) => {
                            const timeA = a.start_time || '00:00';
                            const timeB = b.start_time || '00:00';
                            return timeA.localeCompare(timeB);
                          })
                          .map((match) => {
                            const result = getMatchResult(match);
                            
                            return (
                              <tr key={match.match_id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-3">
                                  <div className="flex items-center text-sm">
                                    <Clock className="h-3 w-3 mr-1 text-gray-400" />
                                    {formatTime(match.start_time)}
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-medium">{match.match_code}</div>
                                  <div className="text-xs text-gray-600">{match.match_type}</div>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="space-y-1">
                                    <div className={`text-sm ${result.winner === 'team1' ? 'font-bold text-green-600' : ''}`}>
                                      {match.team1_display_name}
                                    </div>
                                    <div className="text-xs text-gray-400">vs</div>
                                    <div className={`text-sm ${result.winner === 'team2' ? 'font-bold text-green-600' : ''}`}>
                                      {match.team2_display_name}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center space-x-2">
                                    {result.icon}
                                    {result.display}
                                  </div>
                                  {match.remarks && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {match.remarks}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  {match.court_number ? (
                                    <div className="flex items-center text-sm">
                                      <MapPin className="h-3 w-3 mr-1 text-gray-400" />
                                      コート {match.court_number}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-sm">-</span>
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
    </div>
  );
}