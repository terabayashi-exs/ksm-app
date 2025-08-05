'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Users, Calendar, Target, Award } from 'lucide-react';
import { BlockResults, getResultColor } from '@/lib/match-results-calculator';

interface TournamentResultsProps {
  tournamentId: number;
}

export default function TournamentResults({ tournamentId }: TournamentResultsProps) {
  const [results, setResults] = useState<BlockResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 戦績表データの取得
  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/results`, {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success) {
          setResults(result.data);
        } else {
          console.error('API Error Details:', result);
          setError(result.error || '戦績表データの取得に失敗しました');
        }
      } catch (err) {
        console.error('戦績表データ取得エラー:', err);
        setError(`戦績表データの取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
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
                {results.reduce((sum, block) => sum + block.matches.length, 0)}
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
                {/* 星取表 */}
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr>
                      <th className="border border-gray-300 p-2 bg-gray-100 text-xs font-medium text-gray-700 min-w-[80px]">
                        チーム
                      </th>
                      {block.teams.map((opponent) => (
                        <th 
                          key={opponent.team_id}
                          className="border border-gray-300 p-1 bg-gray-100 text-xs font-medium text-gray-700 min-w-[60px] max-w-[80px]"
                        >
                          <div 
                            className="transform -rotate-90 origin-center whitespace-nowrap overflow-hidden text-ellipsis"
                            style={{ 
                              height: '60px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px'
                            }}
                            title={opponent.team_name}
                          >
                            {opponent.display_name}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.teams.map((team) => (
                      <tr key={team.team_id}>
                        <td className="border border-gray-300 p-2 bg-gray-50 font-medium text-sm">
                          <div 
                            className="truncate max-w-[70px]" 
                            title={team.team_name}
                          >
                            {team.display_name}
                          </div>
                        </td>
                        {block.teams.map((opponent) => (
                          <td 
                            key={opponent.team_id}
                            className="border border-gray-300 p-1 text-center"
                          >
                            {team.team_id === opponent.team_id ? (
                              <div className="w-full h-8 bg-gray-200 flex items-center justify-center">
                                <span className="text-gray-500 text-xs">-</span>
                              </div>
                            ) : (
                              <div 
                                className={`w-full h-8 flex items-center justify-center text-xs font-medium rounded ${
                                  getResultColor(block.match_matrix[team.team_id]?.[opponent.team_id]?.result || null)
                                }`}
                                title={`vs ${opponent.team_name} (${block.match_matrix[team.team_id]?.[opponent.team_id]?.match_code || ''})`}
                              >
                                {block.match_matrix[team.team_id]?.[opponent.team_id]?.score || '-'}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 凡例 */}
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-green-50 text-green-600 rounded mr-2 flex items-center justify-center">
                      〇
                    </div>
                    勝利
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-red-50 text-red-600 rounded mr-2 flex items-center justify-center">
                      ●
                    </div>
                    敗北
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-blue-50 text-blue-600 rounded mr-2 flex items-center justify-center">
                      △
                    </div>
                    引分
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-gray-50 text-gray-400 rounded mr-2 flex items-center justify-center">
                      -
                    </div>
                    未実施
                  </div>
                </div>

                {/* 注意書き */}
                <div className="mt-2 text-xs text-gray-500">
                  ※ 表の見方：縦のチーム名が横のチーム名に対する結果を表示
                </div>
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