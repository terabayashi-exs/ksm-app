'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Users, Calendar, Target, Award, Hash, Medal, MessageSquare } from 'lucide-react';
import { BlockResults, getResultColor } from '@/lib/match-results-calculator';

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

interface TournamentResultsProps {
  tournamentId: number;
}

export default function TournamentResults({ tournamentId }: TournamentResultsProps) {
  const [results, setResults] = useState<BlockResults[]>([]);
  const [standings, setStandings] = useState<BlockStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 戦績表データと順位表データの取得
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 戦績表データと順位表データを並列取得
        const [resultsResponse, standingsResponse] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}/results`, { cache: 'no-store' }),
          fetch(`/api/tournaments/${tournamentId}/standings`, { cache: 'no-store' })
        ]);

        if (!resultsResponse.ok) {
          throw new Error(`Results API: HTTP ${resultsResponse.status}: ${resultsResponse.statusText}`);
        }

        if (!standingsResponse.ok) {
          throw new Error(`Standings API: HTTP ${standingsResponse.status}: ${standingsResponse.statusText}`);
        }

        const [resultsData, standingsData] = await Promise.all([
          resultsResponse.json(),
          standingsResponse.json()
        ]);

        if (resultsData.success) {
          setResults(resultsData.data);
        } else {
          console.error('Results API Error:', resultsData);
          setError(resultsData.error || '戦績表データの取得に失敗しました');
          return;
        }

        if (standingsData.success) {
          setStandings(standingsData.data);
        } else {
          console.error('Standings API Error:', standingsData);
          // 順位表データが取得できなくても戦績表は表示する
          setStandings([]);
        }
      } catch (err) {
        console.error('データ取得エラー:', err);
        setError(`データの取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId]);

  // ブロック色の取得（順位表と同じスタイル）
  const getBlockColor = (blockName: string): string => {
    if (blockName.includes('A')) return 'bg-blue-100 text-blue-800';
    if (blockName.includes('B')) return 'bg-green-100 text-green-800';
    if (blockName.includes('C')) return 'bg-yellow-100 text-yellow-800';
    if (blockName.includes('D')) return 'bg-purple-100 text-purple-800';
    if (blockName.includes('決勝')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  // 予選リーグかどうかの判定
  const isPreliminaryPhase = (phase: string): boolean => {
    return phase === 'preliminary' || phase.includes('予選') || phase.includes('リーグ');
  };

  // 特定ブロックの順位表データを取得
  const getStandingsForBlock = (blockId: number): TeamStanding[] => {
    const blockStanding = standings.find(s => s.match_block_id === blockId);
    return blockStanding ? blockStanding.teams : [];
  };

  // チーム順位情報を取得
  const getTeamStanding = (teamId: string, blockId: number): TeamStanding | undefined => {
    const blockTeams = getStandingsForBlock(blockId);
    return blockTeams.find((team: TeamStanding) => team.team_id === teamId);
  };

  // 順位アイコンの取得（順位表コンポーネントと同じ）
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

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Award className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">戦績表を読み込み中...</p>
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

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Award className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">戦績表</h3>
          <p className="text-gray-600">まだ試合結果がないため、戦績表を表示できません。</p>
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
            <Award className="h-5 w-5 mr-2 text-blue-600" />
            戦績表概要
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{results.length}</div>
              <div className="text-sm text-gray-600">ブロック数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {results.reduce((sum, block) => sum + block.teams.length, 0)}
              </div>
              <div className="text-sm text-gray-600">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {results.reduce((sum, block) => 
                  sum + block.matches.filter(match => 
                    match.is_confirmed && 
                    match.team1_goals !== null && 
                    match.team2_goals !== null
                  ).length, 0
                )}
              </div>
              <div className="text-sm text-gray-600">実施済み試合数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別戦績表 */}
      {results
        .filter(block => isPreliminaryPhase(block.phase)) // 予選リーグのみ表示
        .map((block) => (
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
            {block.teams.length > 0 ? (
              <div className="overflow-x-auto">
                {/* 統合された戦績表（順位表情報 + 対戦結果） */}
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr>
                      <th className="border border-gray-300 p-3 bg-gray-100 text-sm font-medium text-gray-700 min-w-[90px]">
                        チーム
                      </th>
                      {/* 対戦結果の列ヘッダー（チーム略称を縦書き表示） */}
                      {block.teams.map((opponent) => (
                        <th 
                          key={opponent.team_id}
                          className="border border-gray-300 p-2 bg-green-50 text-sm font-medium text-gray-700 min-w-[70px] max-w-[90px]"
                        >
                          <div 
                            className="flex flex-col items-center justify-center h-20 overflow-hidden"
                            style={{ 
                              fontSize: '13px',
                              fontWeight: '500',
                              lineHeight: '1.1'
                            }}
                            title={opponent.team_name}
                          >
                            {(opponent.team_omission || opponent.team_name).split('').map((char, index) => (
                              <span key={index} className="block leading-tight">{char}</span>
                            ))}
                          </div>
                        </th>
                      ))}
                      {/* 予選リーグの場合は順位表の列を追加 */}
                      {isPreliminaryPhase(block.phase) && (
                        <>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[55px]">
                            順位
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[55px]">
                            勝点
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[50px]">
                            試合数
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[45px]">
                            勝
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[45px]">
                            分
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[45px]">
                            敗
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[50px]">
                            得点
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[50px]">
                            失点
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[55px]">
                            得失差
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {block.teams.map((team) => {
                      const teamStanding = getTeamStanding(team.team_id, block.match_block_id);
                      
                      return (
                        <tr key={team.team_id}>
                          {/* チーム名（略称優先） */}
                          <td className="border border-gray-300 p-3 bg-gray-50 font-medium text-sm">
                            <div 
                              className="truncate max-w-[80px]" 
                              title={team.team_name}
                            >
                              {team.team_omission || team.team_name}
                            </div>
                          </td>
                          
                          {/* 対戦結果 */}
                          {block.teams.map((opponent) => (
                            <td 
                              key={opponent.team_id}
                              className="border border-gray-300 p-2 text-center bg-green-50"
                            >
                              {team.team_id === opponent.team_id ? (
                                <div className="w-full h-10 bg-gray-200 flex items-center justify-center">
                                  <span className="text-gray-500 text-sm">-</span>
                                </div>
                              ) : (
                                <div 
                                  className={`w-full h-10 flex items-center justify-center text-sm font-medium rounded ${
                                    getResultColor(block.match_matrix[team.team_id]?.[opponent.team_id]?.result || null)
                                  }`}
                                  title={`vs ${opponent.team_name} (${block.match_matrix[team.team_id]?.[opponent.team_id]?.match_code || ''})`}
                                >
                                  {block.match_matrix[team.team_id]?.[opponent.team_id]?.score || '-'}
                                </div>
                              )}
                            </td>
                          ))}
                          
                          {/* 予選リーグの場合は順位表の情報を表示 */}
                          {isPreliminaryPhase(block.phase) && (
                            <>
                              {/* 順位 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <div className="flex items-center justify-center">
                                  {teamStanding ? (
                                    <>
                                      {getPositionIcon(teamStanding.position)}
                                      <span className="ml-1 font-bold text-base">
                                        {teamStanding.position > 0 ? teamStanding.position : '-'}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-gray-400 text-sm">-</span>
                                  )}
                                </div>
                              </td>
                              
                              {/* 勝点 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-bold text-base text-blue-600">
                                  {teamStanding?.points || 0}
                                </span>
                              </td>
                              
                              {/* 試合数 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-sm">{teamStanding?.matches_played || 0}</span>
                              </td>
                              
                              {/* 勝利 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-green-600 font-medium text-sm">
                                  {teamStanding?.wins || 0}
                                </span>
                              </td>
                              
                              {/* 引分 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-yellow-600 font-medium text-sm">
                                  {teamStanding?.draws || 0}
                                </span>
                              </td>
                              
                              {/* 敗北 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-red-600 font-medium text-sm">
                                  {teamStanding?.losses || 0}
                                </span>
                              </td>
                              
                              {/* 総得点 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-medium text-sm">
                                  {teamStanding?.goals_for || 0}
                                </span>
                              </td>
                              
                              {/* 総失点 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-medium text-sm">
                                  {teamStanding?.goals_against || 0}
                                </span>
                              </td>
                              
                              {/* 得失差 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span 
                                  className={`font-bold text-sm ${
                                    (teamStanding?.goal_difference || 0) > 0 
                                      ? 'text-green-600' 
                                      : (teamStanding?.goal_difference || 0) < 0 
                                      ? 'text-red-600' 
                                      : 'text-gray-600'
                                  }`}
                                >
                                  {teamStanding ? (
                                    `${(teamStanding.goal_difference || 0) > 0 ? '+' : ''}${teamStanding.goal_difference || 0}`
                                  ) : '0'}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* 凡例 */}
                <div className="mt-4 space-y-3">
                  {/* 列の説明 */}
                  <div className="flex flex-wrap gap-6 text-xs text-gray-600">
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-blue-50 border border-blue-200 rounded mr-2"></div>
                      順位表情報
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-green-50 border border-green-200 rounded mr-2"></div>
                      対戦結果
                    </div>
                  </div>
                  
                  {/* 対戦結果の凡例 */}
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-green-50 text-green-600 rounded mr-2 flex items-center justify-center text-xs">
                        〇
                      </div>
                      勝利
                    </div>
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-red-50 text-red-600 rounded mr-2 flex items-center justify-center text-xs">
                        ●
                      </div>
                      敗北
                    </div>
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-blue-50 text-blue-600 rounded mr-2 flex items-center justify-center text-xs">
                        △
                      </div>
                      引分
                    </div>
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-gray-100 text-gray-600 rounded mr-2 flex items-center justify-center text-xs font-medium">
                        A1
                      </div>
                      未実施（試合コード表示）
                    </div>
                  </div>

                  {/* 注意書き */}
                  <div className="text-xs text-gray-500">
                    ※ 対戦結果：縦のチーム名が横のチーム名に対する結果を表示
                  </div>
                </div>

                {/* ブロック備考 */}
                {block.remarks && (
                  <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-medium text-amber-800 mb-1">
                          {block.block_name}ブロック 備考
                        </h4>
                        <p className="text-sm text-amber-700 whitespace-pre-wrap">
                          {block.remarks}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                このブロックには参加チームがありません
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* トーナメント戦の場合の注意書き */}
      {results.some(block => !isPreliminaryPhase(block.phase)) && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center text-blue-800">
              <Calendar className="h-4 w-4 mr-2" />
              <span className="text-sm">
                決勝トーナメントの戦績表は、リーグ戦形式ではないため表示されません。
                日程・結果タブで試合結果をご確認ください。
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}