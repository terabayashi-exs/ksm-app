'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Medal, Award, TrendingUp, Users, Target, Hash } from 'lucide-react';

interface TeamStanding {
  team_id: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
}

interface BlockStanding {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  teams: TeamStanding[];
}

interface TournamentStandingsProps {
  tournamentId: number;
}

export default function TournamentStandings({ tournamentId }: TournamentStandingsProps) {
  const [standings, setStandings] = useState<BlockStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 順位表データの取得
  useEffect(() => {
    const fetchStandings = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/standings`, {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success) {
          setStandings(result.data);
        } else {
          console.error('API Error Details:', result);
          setError(result.error || '順位表データの取得に失敗しました');
        }
      } catch (err) {
        console.error('順位表データ取得エラー:', err);
        setError(`順位表データの取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchStandings();
  }, [tournamentId]);

  // ブロック色の取得（日程・結果ページと同じスタイル）
  const getBlockColor = (blockName: string): string => {
    if (blockName.includes('A')) return 'bg-blue-100 text-blue-800';
    if (blockName.includes('B')) return 'bg-green-100 text-green-800';
    if (blockName.includes('C')) return 'bg-yellow-100 text-yellow-800';
    if (blockName.includes('D')) return 'bg-purple-100 text-purple-800';
    if (blockName.includes('決勝')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  // フェーズ判定（予選リーグかトーナメントか）
  const isPreliminaryPhase = (phase: string): boolean => {
    return phase === 'preliminary' || phase.includes('予選') || phase.includes('リーグ');
  };

  // 順位アイコンの取得
  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 2:
        return <Medal className="h-4 w-4 text-gray-400" />;
      case 3:
        return <Award className="h-4 w-4 text-amber-600" />;
      default:
        return <Hash className="h-4 w-4 text-gray-400" />;
    }
  };

  // 順位背景色の取得
  const getPositionBgColor = (position: number): string => {
    switch (position) {
      case 1:
        return 'bg-yellow-50 border-l-4 border-yellow-400';
      case 2:
        return 'bg-gray-50 border-l-4 border-gray-400';
      case 3:
        return 'bg-amber-50 border-l-4 border-amber-400';
      default:
        return 'hover:bg-gray-50';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <TrendingUp className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">順位表を読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="text-center py-12">
          <Target className="h-8 w-8 mx-auto text-red-600 mb-4" />
          <p className="text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (standings.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">順位表</h3>
          <p className="text-gray-600">まだ試合結果がないため、順位表を表示できません。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 概要統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trophy className="h-5 w-5 mr-2 text-blue-600" />
            順位表概要
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{standings.length}</div>
              <div className="text-sm text-gray-600">ブロック数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {standings.reduce((sum, block) => sum + block.teams.length, 0)}
              </div>
              <div className="text-sm text-gray-600">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {standings.reduce((sum, block) => sum + block.teams.reduce((teamSum, team) => teamSum + team.matches_played, 0), 0)}
              </div>
              <div className="text-sm text-gray-600">総試合数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別順位表 */}
      {standings.map((block) => (
        <Card key={block.match_block_id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(block.block_name)}`}>
                  {block.display_round_name || `${block.phase} ${block.block_name}ブロック`}
                </span>
                <span className="text-sm text-gray-600 flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  {block.teams.length}チーム
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-3 font-medium text-gray-700">順位</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-700">チーム名</th>
                    {isPreliminaryPhase(block.phase) && (
                      <>
                        <th className="text-center py-3 px-3 font-medium text-gray-700">勝点</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-700">試合数</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-700">勝利</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-700">引分</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-700">敗北</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-700">総得点</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-700">総失点</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-700">得失差</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {block.teams.map((team) => (
                    <tr 
                      key={team.team_id} 
                      className={`border-b transition-colors ${team.position > 0 ? getPositionBgColor(team.position) : 'hover:bg-gray-50'}`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center">
                          {team.position > 0 ? getPositionIcon(team.position) : <Hash className="h-4 w-4 text-gray-400" />}
                          <span className="ml-2 font-bold text-lg">{team.position > 0 ? team.position : '-'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div>
                          <div className="font-medium text-gray-900">{team.team_name}</div>
                          {team.team_omission && (
                            <div className="text-xs text-gray-500">({team.team_omission})</div>
                          )}
                        </div>
                      </td>
                      {isPreliminaryPhase(block.phase) && (
                        <>
                          <td className="py-3 px-3 text-center">
                            <span className="font-bold text-lg text-blue-600">{team.points || 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">{team.matches_played || 0}</td>
                          <td className="py-3 px-3 text-center">
                            <span className="text-green-600 font-medium">{team.wins || 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="text-yellow-600 font-medium">{team.draws || 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="text-red-600 font-medium">{team.losses || 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="font-medium">{team.goals_for || 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="font-medium">{team.goals_against || 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span 
                              className={`font-bold ${
                                (team.goal_difference || 0) > 0 
                                  ? 'text-green-600' 
                                  : (team.goal_difference || 0) < 0 
                                  ? 'text-red-600' 
                                  : 'text-gray-600'
                              }`}
                            >
                              {(team.goal_difference || 0) > 0 ? '+' : ''}{team.goal_difference || 0}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}