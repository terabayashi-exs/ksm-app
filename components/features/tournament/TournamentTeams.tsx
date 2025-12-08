'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Hash, ChevronDown, ChevronRight } from 'lucide-react';
import { 
  SimpleTournamentTeamsData, 
  SimpleTournamentTeam
} from '@/lib/tournament-teams-simple';

// 基本的なヘルパー関数をローカルで定義
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
  const [expandedTeams, setExpandedTeams] = useState<Set<number>>(new Set());
  const [teamPlayers, setTeamPlayers] = useState<Record<number, Array<{player_name: string; jersey_number?: number; position?: string}>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canViewPlayers, setCanViewPlayers] = useState(false);

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
          setCanViewPlayers(result.canViewPlayers || false);
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
  const toggleTeamExpansion = async (tournamentTeamId: number) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(tournamentTeamId)) {
      newExpanded.delete(tournamentTeamId);
    } else {
      newExpanded.add(tournamentTeamId);

      // 選手情報閲覧権限がある場合のみ選手データを取得
      if (canViewPlayers && !teamPlayers[tournamentTeamId]) {
        try {
          const response = await fetch(`/api/tournaments/${tournamentId}/teams/${tournamentTeamId}/players`);
          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              setTeamPlayers(prev => ({
                ...prev,
                [tournamentTeamId]: result.data
              }));
            }
          }
        } catch (error) {
          console.error(`選手データの取得に失敗: ${tournamentTeamId}`, error);
        }
      }
    }
    setExpandedTeams(newExpanded);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Users className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-muted-foreground">参加チーム情報を読み込み中...</p>
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
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">参加チーム</h3>
          <p className="text-muted-foreground">まだ参加チームが登録されていません。</p>
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
            <Users className="h-5 w-5 mr-2 text-blue-600" />
            参加チーム概要
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{teamsData.total_teams}</div>
              <div className="text-sm text-muted-foreground">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{teamsData.total_players}</div>
              <div className="text-sm text-muted-foreground">参加選手数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* チーム一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2 text-blue-600" />
            参加チーム一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {teamsData.teams.map((team) => {
                const teamStatus = getTeamStatus(team);
                const isExpanded = expandedTeams.has(team.tournament_team_id);

                return (
                  <div key={team.tournament_team_id} className="border rounded-lg">
                    {/* チーム基本情報 */}
                    <div
                      className="p-4 cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => toggleTeamExpansion(team.tournament_team_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-foreground">
                              {team.display_name}
                            </h3>
                            {team.team_omission && team.team_omission !== team.team_name && (
                              <p className="text-sm text-muted-foreground">({team.team_name})</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${teamStatus.statusColor}`}>
                            {teamStatus.statusText}
                          </span>
                          {team.block_position && (
                            <span className="text-sm text-muted-foreground">
                              #{team.block_position}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 展開時の詳細情報 */}
                    {isExpanded && (
                      <div className="border-t bg-muted">
                        <div className="p-4 space-y-4">
                          {/* ブロック情報 */}
                          {team.assigned_block && (
                            <div className="text-sm text-muted-foreground">
                              所属ブロック: {team.assigned_block}
                            </div>
                          )}

                          {/* 選手一覧 */}
                          {canViewPlayers ? (
                            teamPlayers[team.tournament_team_id] && teamPlayers[team.tournament_team_id].length > 0 ? (
                              <div>
                                <h4 className="font-medium text-muted-foreground mb-3 flex items-center">
                                  <Users className="h-4 w-4 mr-1" />
                                  参加選手一覧
                                </h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b bg-white">
                                        <th className="text-left py-2 px-3 font-medium">背番号</th>
                                        <th className="text-left py-2 px-3 font-medium">選手名</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {teamPlayers[team.tournament_team_id]?.map((player, index) => (
                                        <tr key={`${team.tournament_team_id}-${index}`} className="border-b">
                                          <td className="py-2 px-3">
                                            {player.jersey_number ? (
                                              <span className="flex items-center">
                                                <Hash className="h-3 w-3 mr-1 text-muted-foreground" />
                                                {player.jersey_number}
                                              </span>
                                            ) : (
                                              <span className="text-muted-foreground">-</span>
                                            )}
                                          </td>
                                          <td className="py-2 px-3 font-medium">{player.player_name}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-6 text-muted-foreground">
                                <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                <p>このチームにはまだ選手が登録されていません</p>
                              </div>
                            )
                          ) : (
                            <div className="text-center py-6 bg-yellow-50 rounded-lg border border-yellow-200">
                              <Users className="h-8 w-8 mx-auto mb-2 text-yellow-600" />
                              <p className="font-medium text-yellow-800">選手情報は非公開です</p>
                              <p className="text-sm text-yellow-700 mt-1">
                                大会運営者のみ閲覧可能です
                              </p>
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
    </div>
  );
}