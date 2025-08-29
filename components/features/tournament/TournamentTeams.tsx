'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Hash, ChevronDown, ChevronRight } from 'lucide-react';
import { 
  SimpleTournamentTeamsData, 
  SimpleTournamentTeam
} from '@/lib/tournament-teams-simple';

// 基本的なヘルパー関数をローカルで定義
const groupTeamsByBlock = (teams: SimpleTournamentTeam[]): Record<string, SimpleTournamentTeam[]> => {
  const grouped: Record<string, SimpleTournamentTeam[]> = {};
  teams.forEach(team => {
    const blockName = team.assigned_block || '未分類';
    if (!grouped[blockName]) {
      grouped[blockName] = [];
    }
    grouped[blockName].push(team);
  });
  return grouped;
};

const getTeamStatus = (team: SimpleTournamentTeam) => {
  if (team.player_count === 0) {
    return {
      status: 'empty',
      statusText: '選手未登録',
      statusColor: 'text-red-600 bg-red-50'
    };
  } else if (team.player_count < 5) {
    return {
      status: 'incomplete',
      statusText: `選手${team.player_count}名`,
      statusColor: 'text-yellow-600 bg-yellow-50'
    };
  } else {
    return {
      status: 'complete',
      statusText: `選手${team.player_count}名`,
      statusColor: 'text-green-600 bg-green-50'
    };
  }
};

interface TournamentTeamsProps {
  tournamentId: number;
}

export default function TournamentTeams({ tournamentId }: TournamentTeamsProps) {
  const [teamsData, setTeamsData] = useState<SimpleTournamentTeamsData | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [teamPlayers, setTeamPlayers] = useState<Record<string, Array<{player_name: string; jersey_number?: number; position?: string}>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 参加チームデータの取得
  useEffect(() => {
    const fetchTeams = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/teams`, {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success) {
          setTeamsData(result.data);
        } else {
          console.error('API Error Details:', result);
          setError(result.error || '参加チーム情報の取得に失敗しました');
        }
      } catch (err) {
        console.error('参加チーム情報取得エラー:', err);
        setError(`参加チーム情報の取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, [tournamentId]);

  // チーム展開の切り替え
  const toggleTeamExpansion = async (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
      
      // 選手データを取得（まだ取得していない場合）
      if (!teamPlayers[teamId]) {
        try {
          const response = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}/players`);
          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              setTeamPlayers(prev => ({
                ...prev,
                [teamId]: result.data
              }));
            }
          }
        } catch (error) {
          console.error(`選手データの取得に失敗: ${teamId}`, error);
        }
      }
    }
    setExpandedTeams(newExpanded);
  };

  // ブロック分類関数（他のページと統一）
  const getBlockKey = (blockName: string): string => {
    // blockNameが既に「予選Aブロック」形式の場合はそのまま返す
    if (blockName.includes('予選') || blockName.includes('決勝')) {
      return blockName;
    }
    
    // 単純なブロック名（A, B, C, D）の場合
    if (['A', 'B', 'C', 'D'].includes(blockName)) {
      return `予選${blockName}ブロック`;
    }
    
    return blockName;
  };

  // ブロック色の取得
  const getBlockColor = (blockKey: string): string => {
    if (blockKey.includes('予選A')) return 'bg-blue-100 text-blue-800';
    if (blockKey.includes('予選B')) return 'bg-green-100 text-green-800';
    if (blockKey.includes('予選C')) return 'bg-yellow-100 text-yellow-800';
    if (blockKey.includes('予選D')) return 'bg-purple-100 text-purple-800';
    if (blockKey.includes('予選')) return 'bg-gray-100 text-gray-800';
    if (blockKey.includes('決勝')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Users className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">参加チーム情報を読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="text-center py-12">
          <Users className="h-8 w-8 mx-auto text-red-600 mb-4" />
          <p className="text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!teamsData || teamsData.teams.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">参加チーム</h3>
          <p className="text-gray-600">まだ参加チームが登録されていません。</p>
        </CardContent>
      </Card>
    );
  }

  const teamsByBlock = groupTeamsByBlock(teamsData.teams);

  return (
    <div className="space-y-6">
      {/* 概要統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2 text-blue-600" />
            参加チーム概要
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{teamsData.total_teams}</div>
              <div className="text-sm text-gray-600">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{teamsData.total_players}</div>
              <div className="text-sm text-gray-600">参加選手数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別チーム一覧 */}
      {Object.entries(teamsByBlock).map(([blockName, teams]) => (
        <Card key={blockName}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                {(() => {
                  const blockKey = getBlockKey(blockName);
                  return (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey)}`}>
                      {blockKey}
                    </span>
                  );
                })()}
                <span className="text-sm text-gray-600 flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  {teams.length}チーム
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teams.map((team) => {
                const teamStatus = getTeamStatus(team);
                const isExpanded = expandedTeams.has(team.team_id);

                return (
                  <div key={team.team_id} className="border rounded-lg">
                    {/* チーム基本情報 */}
                    <div 
                      className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleTeamExpansion(team.team_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-500" />
                            )}
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                              {team.display_name}
                            </h3>
                            {team.team_omission && team.team_omission !== team.team_name && (
                              <p className="text-sm text-gray-600">({team.team_name})</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${teamStatus.statusColor}`}>
                            {teamStatus.statusText}
                          </span>
                          {team.block_position && (
                            <span className="text-sm text-gray-500">
                              #{team.block_position}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 展開時の詳細情報 */}
                    {isExpanded && (
                      <div className="border-t bg-gray-50">
                        <div className="p-4 space-y-4">
                          {/* ブロック情報 */}
                          {team.assigned_block && (
                            <div className="text-sm text-gray-600">
                              所属ブロック: {team.assigned_block}
                            </div>
                          )}

                          {/* 選手一覧 */}
                          {teamPlayers[team.team_id] && teamPlayers[team.team_id].length > 0 ? (
                            <div>
                              <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                                <Users className="h-4 w-4 mr-1" />
                                参加選手一覧
                              </h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-white">
                                      <th className="text-left py-2 px-3 font-medium">背番号</th>
                                      <th className="text-left py-2 px-3 font-medium">選手名</th>
                                      <th className="text-left py-2 px-3 font-medium">状態</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {teamPlayers[team.team_id]?.map((player, index) => (
                                      <tr key={`${team.team_id}-${index}`} className="border-b">
                                        <td className="py-2 px-3">
                                          {player.jersey_number ? (
                                            <span className="flex items-center">
                                              <Hash className="h-3 w-3 mr-1 text-gray-400" />
                                              {player.jersey_number}
                                            </span>
                                          ) : (
                                            <span className="text-gray-400">-</span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 font-medium">{player.player_name}</td>
                                        <td className="py-2 px-3">
                                          <span className="px-2 py-1 rounded-full text-xs text-green-600 bg-green-50">
                                            出場
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-6 text-gray-500">
                              <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                              <p>このチームにはまだ選手が登録されていません</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}