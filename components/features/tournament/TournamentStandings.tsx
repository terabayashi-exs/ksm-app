'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Medal, Award, TrendingUp, Users, Target, Hash, RefreshCw } from 'lucide-react';
import { useSession } from 'next-auth/react';

// 多競技対応の型定義
interface SportConfig {
  sport_code: string;
  score_label: string;
  score_against_label: string;
  difference_label: string;
  supports_pk: boolean;
}

interface SoccerScoreData {
  regular_goals_for: number;
  regular_goals_against: number;
  pk_goals_for?: number;
  pk_goals_against?: number;
  is_pk_game: boolean;
}

interface MultiSportTeamStanding extends TeamStanding {
  scores_for: number;
  scores_against: number;
  score_difference: number;
  soccer_data?: SoccerScoreData;
  sport_config?: SportConfig;
}

interface TeamStanding {
  tournament_team_id: number; // 一意のID（PRIMARY KEY） - 同一team_idの複数参加を区別
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
  position_note?: string; // テンプレートベース順位説明
}

interface BlockStanding {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  teams: TeamStanding[];
  remarks?: string | null;
}

interface TournamentStandingsProps {
  tournamentId: number;
}

export default function TournamentStandings({ tournamentId }: TournamentStandingsProps) {
  const { data: session } = useSession();
  const [standings, setStandings] = useState<BlockStanding[]>([]);
  const [totalMatches, setTotalMatches] = useState<number>(0);
  const [totalTeams, setTotalTeams] = useState<number>(0);
  const [sportConfig, setSportConfig] = useState<SportConfig | null>(null);
  const [preliminaryFormatType, setPreliminaryFormatType] = useState<string | null>(null);
  const [finalFormatType, setFinalFormatType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateMessage, setRecalculateMessage] = useState<string | null>(null);

  // 順位表データの取得
  useEffect(() => {
    const fetchStandings = async () => {
      setLoading(true);
      setError(null);
      try {
        // 大会情報を取得してフォーマットタイプを取得
        const tournamentResponse = await fetch(`/api/tournaments/${tournamentId}`, {
          cache: 'no-store'
        });

        if (!tournamentResponse.ok) {
          throw new Error('大会情報の取得に失敗しました');
        }

        const tournamentData = await tournamentResponse.json();

        if (tournamentData.success && tournamentData.data) {
          const tournament = tournamentData.data;
          setPreliminaryFormatType(tournament.preliminary_format_type || null);
          setFinalFormatType(tournament.final_format_type || null);
        }

        // 順位表データを取得
        const response = await fetch(`/api/tournaments/${tournamentId}/standings`, {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success) {
          setStandings(result.data);
          setTotalMatches(result.total_matches || 0);
          setTotalTeams(result.total_teams || 0);

          // 拡張APIから競技種別設定を直接取得
          if (result.sport_config) {
            setSportConfig(result.sport_config);
          } else {
            // フォールバック: PK選手権設定
            setSportConfig({
              sport_code: 'pk_championship',
              score_label: '得点',
              score_against_label: '失点',
              difference_label: '得失点差',
              supports_pk: false
            });
          }
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

  // 順位表の再計算
  const handleRecalculate = async () => {
    if (!session) {
      setRecalculateMessage('ログインが必要です');
      return;
    }

    setRecalculating(true);
    setRecalculateMessage(null);

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/recalculate-standings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        setRecalculateMessage(result.message);

        // 順位表を再取得
        const standingsResponse = await fetch(`/api/tournaments/${tournamentId}/standings`, {
          cache: 'no-store'
        });

        if (standingsResponse.ok) {
          const standingsData = await standingsResponse.json();
          if (standingsData.success) {
            setStandings(standingsData.data);
            setTotalMatches(standingsData.total_matches || 0);
            setTotalTeams(standingsData.total_teams || 0);
          }
        }

        // 3秒後にメッセージを消す
        setTimeout(() => {
          setRecalculateMessage(null);
        }, 3000);
      } else {
        setRecalculateMessage(`エラー: ${result.error}`);
      }
    } catch (error) {
      console.error('順位表再計算エラー:', error);
      setRecalculateMessage(`エラー: ${error instanceof Error ? error.message : '再計算に失敗しました'}`);
    } finally {
      setRecalculating(false);
    }
  };

  // ブロック分類関数（日程・結果ページと同じロジック）
  const getBlockKey = (phase: string, blockName: string, displayRoundName?: string, matchCode?: string): string => {
    if (phase === 'preliminary') {
      if (blockName) {
        return `予選${blockName}ブロック`;
      }
      // match_codeから推測（フォールバック）
      if (matchCode) {
        const blockMatch = matchCode.match(/([ABCD])\d+/);
        if (blockMatch) {
          return `予選${blockMatch[1]}ブロック`;
        }
      }
      return '予選リーグ';
    } else if (phase === 'final') {
      // block_nameを優先的に使用（1位リーグ、2位リーグなどが入っている）
      if (blockName && blockName !== 'final' && blockName !== 'default') {
        return blockName;
      }
      // フォールバック1: display_round_name
      if (displayRoundName && displayRoundName !== 'final') {
        return displayRoundName;
      }
      // 最終フォールバック
      return '決勝トーナメント';
    } else {
      return phase || 'その他';
    }
  };

  // ブロック色の取得（日程・結果ページと同じスタイル）
  const getBlockColor = (blockKey: string): string => {
    if (blockKey.includes('予選A')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
    if (blockKey.includes('予選B')) return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
    if (blockKey.includes('予選C')) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
    if (blockKey.includes('予選D')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
    if (blockKey.includes('予選')) return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    if (blockKey.includes('1位リーグ')) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
    if (blockKey.includes('2位リーグ')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
    if (blockKey.includes('3位リーグ')) return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
    if (blockKey.includes('リーグ')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
    if (blockKey.includes('決勝')) return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  };

  // フォーマットタイプに基づいた表示判定（リーグ戦形式かどうか）
  const isLeagueFormat = (phase: string): boolean => {
    if (phase === 'preliminary') {
      return preliminaryFormatType === 'league';
    } else if (phase === 'final') {
      return finalFormatType === 'league';
    }
    // phaseが 'preliminary' でも 'final' でもない場合はfalseを返す
    console.warn(`[TournamentStandings] Unexpected phase value: "${phase}"`);
    return false;
  };

  // トーナメント形式かどうかの判定
  const isTournamentFormat = (phase: string): boolean => {
    if (phase === 'preliminary') {
      return preliminaryFormatType === 'tournament';
    } else if (phase === 'final') {
      return finalFormatType === 'tournament';
    }
    // phaseが 'preliminary' でも 'final' でもない場合はfalseを返す
    console.warn(`[TournamentStandings] Unexpected phase value: "${phase}"`);
    return false;
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
        return 'bg-yellow-50 border-l-4 border-yellow-400 dark:bg-yellow-950/20 dark:border-yellow-500';
      case 2:
        return 'bg-gray-50 border-l-4 border-gray-400 dark:bg-gray-800 dark:border-gray-500';
      case 3:
        return 'bg-amber-50 border-l-4 border-amber-400 dark:bg-amber-950/20 dark:border-amber-500';
      default:
        return 'hover:bg-gray-50 dark:hover:bg-gray-800';
    }
  };

  // 多競技対応：スコア表示フォーマット（現在は順位表で直接処理）

  // 多競技対応：列ヘッダーラベル
  const getScoreLabels = () => {
    if (!sportConfig) {
      return {
        scoreFor: '得点',
        scoreAgainst: '失点',
        scoreDifference: '得失点差'
      };
    }
    
    return {
      scoreFor: sportConfig.score_label,
      scoreAgainst: sportConfig.score_against_label,
      scoreDifference: sportConfig.difference_label
    };
  };

  const scoreLabels = getScoreLabels();

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <TrendingUp className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600 dark:text-gray-300">順位表を読み込み中...</p>
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
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">順位表</h3>
          <p className="text-gray-600 dark:text-gray-300">まだ試合結果がないため、順位表を表示できません。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 概要統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-blue-600" />
              順位表概要
            </div>
            {session && (
              <Button
                onClick={handleRecalculate}
                disabled={recalculating}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
                {recalculating ? '再計算中...' : '順位表を再計算'}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* 再計算メッセージ */}
          {recalculateMessage && (
            <div className={`mb-4 p-3 rounded-lg ${
              recalculateMessage.includes('エラー')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {recalculateMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{standings.length}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">ブロック数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {totalTeams}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {totalMatches}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">実施済み試合数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別順位表 / トーナメント形式の場合はフェーズ統合順位表 */}
      {(() => {
        // トーナメント形式の場合、フェーズごとに統合
        const standingsToDisplay: BlockStanding[] = [];

        // フェーズごとにグループ化
        const phaseGroups = new Map<string, BlockStanding[]>();
        standings.forEach(block => {
          if (!phaseGroups.has(block.phase)) {
            phaseGroups.set(block.phase, []);
          }
          phaseGroups.get(block.phase)!.push(block);
        });

        // 各フェーズを処理
        phaseGroups.forEach((blocks, phase) => {
          if (isTournamentFormat(phase)) {
            // トーナメント形式：フェーズ内の全ブロックを統合
            // 1. 全チームを収集
            const teamMap = new Map<number, TeamStanding>();

            blocks.forEach(block => {
              block.teams.forEach(team => {
                const existingTeam = teamMap.get(team.tournament_team_id);

                if (!existingTeam) {
                  // 初めて見るチーム：そのまま登録
                  teamMap.set(team.tournament_team_id, team);
                } else {
                  // 既存チーム：より有効な順位を選択
                  // 順位が設定されている（position > 0）方を優先
                  // 両方設定されている場合は、より小さい順位（上位）を優先
                  if (team.position > 0 && (existingTeam.position === 0 || team.position < existingTeam.position)) {
                    teamMap.set(team.tournament_team_id, team);
                  }
                }
              });
            });

            // 2. 順位でソート
            const sortedTeams = Array.from(teamMap.values()).sort((a, b) => {
              // position=0は未確定扱いで最後に
              if (a.position === 0 && b.position === 0) return 0;
              if (a.position === 0) return 1;
              if (b.position === 0) return -1;
              return a.position - b.position;
            });

            // 統合された順位表を作成
            standingsToDisplay.push({
              match_block_id: blocks[0].match_block_id, // 代表ID
              phase: phase,
              display_round_name: phase === 'preliminary' ? '予選トーナメント' : '決勝トーナメント',
              block_name: '', // 統合のためブロック名なし
              teams: sortedTeams,
              remarks: blocks[0].remarks,
            });
          } else {
            // リーグ形式：従来通りブロック別に表示
            standingsToDisplay.push(...blocks);
          }
        });

        return standingsToDisplay;
      })().map((block) => (
        <Card key={block.match_block_id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                {(() => {
                  // display_round_nameが日本語の場合はそれを使用、英語の場合はgetBlockKeyで変換
                  const isJapaneseDisplayName = block.display_round_name &&
                    (block.display_round_name.includes('予選') || block.display_round_name.includes('決勝'));
                  const blockKey = isJapaneseDisplayName
                    ? block.display_round_name
                    : getBlockKey(block.phase, block.block_name, block.display_round_name);
                  return (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey)}`}>
                      {blockKey}
                    </span>
                  );
                })()}
                <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  {block.teams.length}チーム
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* トーナメント形式でチームがない場合の表示 */}
            {isTournamentFormat(block.phase) && block.teams.length === 0 ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-300">
                <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">順位未確定</p>
                <p className="text-sm">試合結果が確定次第、順位が表示されます。</p>
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[700px] md:min-w-0">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-gray-800">
                    <th className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-sm md:text-base min-w-[50px] md:min-w-[60px]">順位</th>
                    <th className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-sm md:text-base min-w-[90px] md:min-w-[120px]">チーム名</th>
                    {isLeagueFormat(block.phase) && (
                      <>
                        <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                          <span className="md:hidden">点</span>
                          <span className="hidden md:inline">勝点</span>
                        </th>
                        <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                          <span className="md:hidden">試</span>
                          <span className="hidden md:inline">試合数</span>
                        </th>
                        <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-xs md:text-base min-w-[30px] md:min-w-[50px]">勝</th>
                        <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-xs md:text-base min-w-[30px] md:min-w-[50px]">分</th>
                        <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-xs md:text-base min-w-[30px] md:min-w-[50px]">敗</th>
                        <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                          <span className="md:hidden">得</span>
                          <span className="hidden md:inline">総{scoreLabels.scoreFor}</span>
                        </th>
                        <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                          <span className="md:hidden">失</span>
                          <span className="hidden md:inline">総{scoreLabels.scoreAgainst}</span>
                        </th>
                        <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                          <span className="md:hidden">差</span>
                          <span className="hidden md:inline">{scoreLabels.scoreDifference}</span>
                        </th>
                      </>
                    )}
                    {isTournamentFormat(block.phase) && (
                      <th className="text-center py-2 md:py-3 px-2 md:px-3 font-medium text-gray-700 dark:text-gray-200 text-sm md:text-base min-w-[80px] md:min-w-[100px]">備考</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {block.teams.map((team, teamIndex) => (
                    <tr
                      key={`${block.block_name}-${team.tournament_team_id || team.team_id}-${teamIndex}`} 
                      className={`border-b transition-colors ${
                        team.position === 0 
                          ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600' 
                          : team.position > 0 
                            ? getPositionBgColor(team.position) 
                            : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="py-2 md:py-3 px-2 md:px-3">
                        <div className="flex items-center">
                          <span className="hidden md:inline-block mr-2">
                            {/* トーナメント形式ではmatches_playedに関わらず順位を表示 */}
                            {isTournamentFormat(block.phase) ? (
                              team.position > 0 ? getPositionIcon(team.position) : <Hash className="h-4 w-4 text-gray-400" />
                            ) : (
                              team.matches_played === 0 ? <span className="text-gray-400">-</span> : team.position > 0 ? getPositionIcon(team.position) : <Hash className="h-4 w-4 text-gray-400" />
                            )}
                          </span>
                          <span className="font-bold text-base md:text-lg">
                            {/* トーナメント形式ではmatches_playedに関わらず順位を表示 */}
                            {isTournamentFormat(block.phase) ? (
                              team.position > 0 ? team.position : '-'
                            ) : (
                              team.matches_played === 0 ? '-' : team.position
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 md:py-3 px-2 md:px-3">
                        <div>
                          {/* モバイルでは略称優先、デスクトップでは正式名称 */}
                          <div className="font-medium text-gray-900 dark:text-gray-100 text-sm md:text-base">
                            <span className="md:hidden">
                              {(team.team_omission || team.team_name).substring(0, 6)}
                            </span>
                            <span className="hidden md:inline">
                              {team.team_name}
                            </span>
                          </div>
                          {team.team_omission && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 hidden md:block">({team.team_omission})</div>
                          )}
                        </div>
                      </td>
                      {isLeagueFormat(block.phase) && (
                        <>
                          <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                            <span className="font-bold text-sm md:text-lg text-blue-600">{team.points || 0}</span>
                          </td>
                          <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                            <span className="text-xs md:text-base">{team.matches_played || 0}</span>
                          </td>
                          <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                            <span className="text-green-600 font-medium text-xs md:text-base">{team.wins || 0}</span>
                          </td>
                          <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                            <span className="text-yellow-600 font-medium text-xs md:text-base">{team.draws || 0}</span>
                          </td>
                          <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                            <span className="text-red-600 font-medium text-xs md:text-base">{team.losses || 0}</span>
                          </td>
                          <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                            <div className="font-medium text-xs md:text-base">
                              {(() => {
                                const multiSportTeam = team as MultiSportTeamStanding;
                                // サッカーでPK戦情報がある場合の特別表示
                                if (sportConfig?.supports_pk && multiSportTeam.soccer_data?.is_pk_game) {
                                  const soccerData = multiSportTeam.soccer_data;
                                  return (
                                    <div className="text-center">
                                      <div>{soccerData.regular_goals_for || 0}</div>
                                      {soccerData.pk_goals_for !== undefined && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                          +PK{soccerData.pk_goals_for}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                return multiSportTeam.scores_for || team.goals_for || 0;
                              })()}
                            </div>
                          </td>
                          <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                            <div className="font-medium text-xs md:text-base">
                              {(() => {
                                const multiSportTeam = team as MultiSportTeamStanding;
                                // サッカーでPK戦情報がある場合の特別表示
                                if (sportConfig?.supports_pk && multiSportTeam.soccer_data?.is_pk_game) {
                                  const soccerData = multiSportTeam.soccer_data;
                                  return (
                                    <div className="text-center">
                                      <div>{soccerData.regular_goals_against || 0}</div>
                                      {soccerData.pk_goals_against !== undefined && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                          +PK{soccerData.pk_goals_against}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                return multiSportTeam.scores_against || team.goals_against || 0;
                              })()}
                            </div>
                          </td>
                          <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                            {(() => {
                              const multiSportTeam = team as MultiSportTeamStanding;
                              const scoreDiff = multiSportTeam.score_difference || team.goal_difference || 0;
                              return (
                                <span
                                  className={`font-bold text-xs md:text-base ${
                                    scoreDiff > 0
                                      ? 'text-green-600'
                                      : scoreDiff < 0
                                      ? 'text-red-600'
                                      : 'text-gray-600 dark:text-gray-300'
                                  }`}
                                >
                                  {(scoreDiff > 0 ? '+' : '') + scoreDiff}
                                </span>
                              );
                            })()}
                          </td>
                        </>
                      )}
                      {isTournamentFormat(block.phase) && (
                        <td className="py-2 md:py-3 px-2 md:px-3 text-center">
                          <span className="text-xs md:text-sm text-gray-600 dark:text-gray-300">
                            {team.position_note || (() => {
                              // フォールバック: テンプレートベース順位説明がない場合のレガシー表示
                              switch (team.position) {
                                case 1: return '優勝';
                                case 2: return '準優勝';
                                case 3: return '3位';
                                case 4: return '4位';
                                case 5: return (
                                  <>
                                    <span className="md:hidden">準々敗退</span>
                                    <span className="hidden md:inline">準々決勝敗退</span>
                                  </>
                                );
                                case 9: return (
                                  <>
                                    <span className="md:hidden">ベスト16</span>
                                    <span className="hidden md:inline">ベスト16</span>
                                  </>
                                );
                                case 17: return (
                                  <>
                                    <span className="md:hidden">ベスト32</span>
                                    <span className="hidden md:inline">ベスト32</span>
                                  </>
                                );
                                case 25: return (
                                  <>
                                    <span className="md:hidden">1回戦敗退</span>
                                    <span className="hidden md:inline">1回戦敗退</span>
                                  </>
                                );
                                case 0: return '順位未確定';
                                default: return `${team.position}位`;
                              }
                            })()}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}

            {/* 備考表示 */}
            {block.remarks && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <div className="text-yellow-600 mr-2 mt-0.5">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-yellow-800">順位決定の備考</p>
                      <p className="text-sm text-yellow-700 mt-1">{block.remarks}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}