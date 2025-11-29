// components/features/archived/v1.0/ArchivedLayout_v1.tsx
'use client';
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar, MapPin, Trophy, Users, Clock, Target, Award, BarChart3, FileText, ExternalLink, Archive, Calendar as CalendarIcon, ChevronDown, ChevronRight, Hash, ArrowLeft } from 'lucide-react';
import { formatDate, formatDateOnly } from '@/lib/utils';
import { Tournament } from '@/lib/types';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BackButton from '@/components/ui/back-button';

// データ型定義
interface PlayerData {
  player_name: string;
  jersey_number?: number;
  position?: string;
}

interface TeamData {
  team_id: string;
  team_name: string;
  team_omission?: string;
  assigned_block?: string;
  block_position?: number;
  withdrawal_status?: string;
  player_count?: number;
  contact_person?: string;
  contact_email?: string;
  players?: PlayerData[];
}

interface MatchData {
  match_id: number;
  match_block_id: number;
  tournament_date: string;
  match_number: number;
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_display_name: string;
  team2_display_name: string;
  court_number?: number;
  start_time?: string;
  phase: string;
  display_round_name?: string;
  block_name: string;
  match_type?: string;
  block_order?: number;
  team1_goals: number;
  team2_goals: number;
  winner_team_id?: string;
  is_draw: number;
  is_walkover: number;
  match_status: string;
  result_status?: string;
  remarks?: string;
  has_result: number;
}

interface ResultData {
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_name: string;
  team2_name: string;
  team1_goals?: number;
  team2_goals?: number;
  winner_team_id?: string;
  is_draw?: number;
  is_walkover?: number;
  block_name: string;
}

interface StandingData {
  block_name: string;
  phase: string;
  team_rankings?: string;
  remarks?: string;
}

interface TeamRanking {
  team_id?: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points?: number;
  matches_played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goals_for?: number;
  goals_against?: number;
  goal_difference?: number;
}

interface PdfInfo {
  bracketPdfExists?: boolean;
  resultsPdfExists?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ArchivedData {
  tournament_id: any;
  tournament_name: any;
  tournament: any;
  teams: any;
  matches: any;
  standings: any;
  results: any;
  pdfInfo: any;
  archived_at: any;
  archived_by: any;
  metadata: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// アーカイブ用のコンポーネント（v1.0固定版）
function ArchivedTournamentSchedule_v1({ matches, teams }: { matches: MatchData[], teams: TeamData[] }) {
  
  // 日付別にマッチをグループ化
  const matchesByDate = matches.reduce((acc: Record<string, MatchData[]>, match) => {
    const date = match.tournament_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(match);
    return acc;
  }, {});

  // チーム名マップを作成
  const teamMap = new Map(teams.map(t => [t.team_id, t]));

  // チーム名表示用関数（実際のチーム名を表示する）
  const getTeamDisplayName = (teamId: string | undefined | null, displayName: string) => {
    if (!teamId) return displayName;
    const team = teamMap.get(teamId);
    return team ? team.team_name : displayName;
  };

  // ブロック分類関数（TournamentSchedule.tsxと同じロジック）
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

  // 試合結果の表示（TournamentSchedule.tsxと同じロジック）
  const getMatchResult = (match: MatchData) => {
    // 確定済みの試合結果がない場合
    if (!match.has_result) {
      // 試合状態に応じて表示を変更
      switch (match.match_status) {
        case 'ongoing':
          return {
            status: 'ongoing',
            display: <span className="text-orange-600 text-sm font-medium">試合中</span>,
            icon: <Clock className="h-4 w-4 text-orange-500" />
          };
        case 'completed':
          return {
            status: 'completed_unconfirmed',
            display: <span className="text-purple-600 text-sm font-medium">試合完了</span>,
            icon: <Target className="h-4 w-4 text-purple-500" />
          };
        case 'cancelled':
          return {
            status: 'cancelled',
            display: <span className="text-red-600 text-sm font-medium">中止</span>,
            icon: <Users className="h-4 w-4 text-red-500" />
          };
        default:
          return {
            status: 'scheduled',
            display: <span className="text-gray-500 text-sm">未実施</span>,
            icon: <Clock className="h-4 w-4 text-gray-400" />
          };
      }
    }

    if (match.is_walkover) {
      const walkoverScore = `${match.team1_goals ?? 0} - ${match.team2_goals ?? 0}`;
      return {
        status: 'walkover',
        display: <span className="text-orange-600 text-sm font-medium">不戦勝 {walkoverScore}</span>,
        icon: <Target className="h-4 w-4 text-orange-500" />
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
      icon: <Trophy className="h-4 w-4 text-green-500" />,
      winner: winnerIsTeam1 ? 'team1' : 'team2'
    };
  };

  // 時刻フォーマット
  const formatTime = (timeStr: string | null | undefined): string => {
    if (!timeStr) return '--:--';
    return timeStr.substring(0, 5); // HH:MM形式に変換
  };

  // 日付フォーマット
  const formatDateOnly = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
      });
    } catch {
      return dateStr;
    }
  };

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
                    <table className="w-full border-collapse min-w-[600px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2 font-medium w-16 md:w-20">時間</th>
                          <th className="text-left py-3 px-2 font-medium w-16 md:w-20">試合</th>
                          <th className="text-left py-3 px-2 font-medium w-32 md:w-auto">対戦</th>
                          <th className="text-left py-3 px-2 font-medium w-20 md:w-24">結果</th>
                          <th className="text-left py-3 px-2 font-medium w-16 md:w-20">コート</th>
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
                              <tr key={match.match_id} className="border-b hover:bg-gray-50">
                                <td className="py-2 px-2">
                                  <div className="flex items-center text-xs md:text-sm">
                                    <Clock className="h-3 w-3 mr-1 text-gray-400" />
                                    <span className="truncate">{formatTime(match.start_time)}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-2">
                                  <div className="font-medium text-xs md:text-sm">{match.match_code}</div>
                                  <div className="text-xs text-gray-600 hidden md:block">{match.match_type}</div>
                                </td>
                                <td className="py-2 px-2">
                                  <div className="text-xs md:text-sm">
                                    <div className="hidden md:block space-y-1">
                                      {/* デスクトップ表示: 縦並び */}
                                      <div className={`${result.winner === 'team1' ? 'font-bold text-green-600' : ''}`}>
                                        {getTeamDisplayName(match.team1_id, match.team1_display_name)}
                                      </div>
                                      <div className="text-xs text-gray-400">vs</div>
                                      <div className={`${result.winner === 'team2' ? 'font-bold text-green-600' : ''}`}>
                                        {getTeamDisplayName(match.team2_id, match.team2_display_name)}
                                      </div>
                                    </div>
                                    <div className="md:hidden">
                                      {/* モバイル表示: 横並び */}
                                      <div className="flex items-center space-x-1 text-xs">
                                        <span className={`truncate max-w-[3.5rem] ${result.winner === 'team1' ? 'font-bold text-green-600' : ''}`}>
                                          {getTeamDisplayName(match.team1_id, match.team1_display_name)}
                                        </span>
                                        <span className="text-gray-400 text-xs">vs</span>
                                        <span className={`truncate max-w-[3.5rem] ${result.winner === 'team2' ? 'font-bold text-green-600' : ''}`}>
                                          {getTeamDisplayName(match.team2_id, match.team2_display_name)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2 px-2">
                                  <div className="flex items-center space-x-1">
                                    <div className="hidden md:inline">{result.icon}</div>
                                    <div className="text-xs md:text-sm">{result.display}</div>
                                  </div>
                                  {match.remarks && (
                                    <div className="text-xs text-gray-500 mt-1 hidden md:block">
                                      {match.remarks}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-2">
                                  {match.court_number ? (
                                    <div className="flex items-center text-xs md:text-sm">
                                      <MapPin className="h-3 w-3 mr-1 text-gray-400 hidden md:inline" />
                                      <span className="md:hidden">C{match.court_number}</span>
                                      <span className="hidden md:inline">コート{match.court_number}</span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs">-</span>
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

// アーカイブ用戦績表コンポーネント（v1.0固定版 - 既存のTournamentResultsと同じ設計）
function ArchivedTournamentResults_v1({ results, teams, standings }: { results: ResultData[], teams: TeamData[], standings: StandingData[] }) {
  
  // ブロック別に結果をグループ化
  const resultsByBlock = results.reduce((acc: Record<string, ResultData[]>, result) => {
    const blockName = result.block_name;
    if (!acc[blockName]) acc[blockName] = [];
    acc[blockName].push(result);
    return acc;
  }, {});

  // チーム情報をブロック別にグループ化
  const teamsByBlock = teams.reduce((acc: Record<string, TeamData[]>, team) => {
    const blockName = team.assigned_block || '';
    if (!acc[blockName]) acc[blockName] = [];
    acc[blockName].push(team);
    return acc;
  }, {});

  // 対戦マトリックス構築
  const buildMatchMatrix = (blockResults: ResultData[], blockTeams: TeamData[]) => {
    const matrix: Record<string, Record<string, { result: 'win' | 'loss' | 'draw' | null; score: string; match_code: string }>> = {};
    
    // 初期化：全チーム同士の組み合わせをnullで初期化
    blockTeams.forEach(team => {
      matrix[team.team_id] = {};
      blockTeams.forEach(opponent => {
        if (team.team_id !== opponent.team_id) {
          matrix[team.team_id][opponent.team_id] = {
            result: null,
            score: '-',
            match_code: ''
          };
        }
      });
    });

    // 試合結果を反映
    blockResults.forEach(match => {
      const team1Id = match.team1_id;
      const team2Id = match.team2_id;
      
      // チームIDが存在するかチェック
      if (!team1Id || !team2Id || !matrix[team1Id] || !matrix[team2Id]) {
        return;
      }
      
      const team1Goals = match.team1_goals || 0;
      const team2Goals = match.team2_goals || 0;

      if (match.is_walkover) {
        // 不戦勝の場合
        const winnerId = match.winner_team_id;
        if (!winnerId) return;

        const loserId = winnerId === team1Id ? team2Id : team1Id;

        if (matrix[winnerId] && matrix[loserId]) {
          // 勝者側のスコア表示を決定
          const winnerScore = winnerId === team1Id
            ? `不戦勝\n${team1Goals}-${team2Goals}`
            : `不戦勝\n${team2Goals}-${team1Goals}`;

          // 敗者側のスコア表示を決定
          const loserScore = loserId === team1Id
            ? `不戦敗\n${team1Goals}-${team2Goals}`
            : `不戦敗\n${team2Goals}-${team1Goals}`;

          matrix[winnerId][loserId] = {
            result: 'win',
            score: winnerScore,
            match_code: match.match_code
          };

          matrix[loserId][winnerId] = {
            result: 'loss',
            score: loserScore,
            match_code: match.match_code
          };
        }
      } else if (match.is_draw) {
        // 引き分けの場合
        if (matrix[team1Id] && matrix[team2Id] && matrix[team1Id][team2Id] && matrix[team2Id][team1Id]) {
          matrix[team1Id][team2Id] = {
            result: 'draw',
            score: `△\n${Math.floor(team1Goals)}-${Math.floor(team2Goals)}`,
            match_code: match.match_code
          };
          
          matrix[team2Id][team1Id] = {
            result: 'draw',
            score: `△\n${Math.floor(team2Goals)}-${Math.floor(team1Goals)}`,
            match_code: match.match_code
          };
        }
      } else {
        // 勝敗が決まった場合
        const winnerId = match.winner_team_id;
        if (!winnerId) return;
        
        const loserId = winnerId === team1Id ? team2Id : team1Id;
        const winnerGoals = winnerId === team1Id ? team1Goals : team2Goals;
        const loserGoals = winnerId === team1Id ? team2Goals : team1Goals;

        if (matrix[winnerId] && matrix[loserId] && matrix[winnerId][loserId] && matrix[loserId][winnerId]) {
          matrix[winnerId][loserId] = {
            result: 'win',
            score: `〇\n${Math.floor(winnerGoals)}-${Math.floor(loserGoals)}`,
            match_code: match.match_code
          };
          
          matrix[loserId][winnerId] = {
            result: 'loss',
            score: `×\n${Math.floor(loserGoals)}-${Math.floor(winnerGoals)}`,
            match_code: match.match_code
          };
        }
      }
    });

    return matrix;
  };

  // ブロック色分け関数（TournamentResults.tsxと同様）
  const getBlockColor = (blockKey: string): string => {
    if (blockKey.includes('予選A')) return 'bg-blue-100 text-blue-800';
    if (blockKey.includes('予選B')) return 'bg-green-100 text-green-800';
    if (blockKey.includes('予選C')) return 'bg-yellow-100 text-yellow-800';
    if (blockKey.includes('予選D')) return 'bg-purple-100 text-purple-800';
    if (blockKey.includes('予選')) return 'bg-gray-100 text-gray-800';
    if (blockKey.includes('決勝')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  // 結果の色を取得
  const getResultColor = (result: 'win' | 'loss' | 'draw' | null): string => {
    switch (result) {
      case 'win':
        return 'text-black bg-white';
      case 'loss':
        return 'text-gray-500 bg-white';
      case 'draw':
        return 'text-black bg-white';
      default:
        return 'text-gray-600 bg-white font-medium';
    }
  };

  // 特定ブロックの順位表データを取得
  const getStandingsForBlock = (blockName: string): TeamRanking[] => {
    const blockStanding = standings.find(s => s.block_name === blockName);
    if (blockStanding && blockStanding.team_rankings) {
      try {
        return JSON.parse(blockStanding.team_rankings);
      } catch {
        return [];
      }
    }
    return [];
  };

  // チーム順位情報を取得
  const getTeamStanding = (teamId: string, blockName: string): TeamRanking | undefined => {
    const blockTeams = getStandingsForBlock(blockName);
    return blockTeams.find((team: TeamRanking) => team.team_id === teamId);
  };

  // 順位アイコンの取得
  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 2:
        return <Target className="h-4 w-4 text-gray-400" />;
      case 3:
        return <Award className="h-4 w-4 text-amber-600" />;
      default:
        return <Users className="h-4 w-4 text-gray-400" />;
    }
  };

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
              <div className="text-2xl font-bold text-blue-600">{Object.keys(resultsByBlock).length}</div>
              <div className="text-sm text-gray-600">ブロック数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{teams.length}</div>
              <div className="text-sm text-gray-600">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{results.length}</div>
              <div className="text-sm text-gray-600">実施済み試合数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別戦績表 */}
      {Object.entries(resultsByBlock)
        .filter(([blockName]) => {
          // 予選リーグのみ表示
          const blockTeams = teamsByBlock[blockName] || [];
          return blockTeams.length > 0;
        })
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([blockName, blockResults]) => {
          const blockTeams = teamsByBlock[blockName] || [];
          const matrix = buildMatchMatrix(blockResults, blockTeams);
          const blockKey = `予選${blockName}ブロック`;
          
          return (
            <Card key={blockName}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey)}`}>
                      {blockKey}
                    </span>
                    <span className="text-sm text-gray-600 flex items-center">
                      <Users className="h-4 w-4 mr-1" />
                      {blockTeams.length}チーム
                    </span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {blockTeams.length > 0 ? (
                  <div className="overflow-x-auto">
                    {/* 統合された戦績表（順位表情報 + 対戦結果） */}
                    <table className="w-full border-collapse border border-gray-300 min-w-[800px] md:min-w-0">
                      <thead>
                        <tr>
                          <th className="border border-gray-300 p-2 md:p-3 bg-gray-100 text-sm md:text-base font-medium text-gray-700 min-w-[70px] md:min-w-[90px]">
                            チーム
                          </th>
                          {/* 対戦結果の列ヘッダー（チーム略称を縦書き表示） */}
                          {blockTeams.map((opponent, opponentIndex) => (
                            <th
                              key={`${blockName}-header-${opponent.team_id}-${opponentIndex}`}
                              className="border border-gray-300 p-1 md:p-2 bg-green-50 text-xs md:text-base font-medium text-gray-700 min-w-[50px] md:min-w-[70px] max-w-[70px] md:max-w-[90px]"
                            >
                              <div 
                                className="flex flex-col items-center justify-center h-16 md:h-20 overflow-hidden"
                                style={{ 
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  lineHeight: '1.0'
                                }}
                                title={opponent.team_name}
                              >
                                {/* モバイルでは略称を短縮、デスクトップでは通常表示 */}
                                <div className="md:hidden">
                                  {(opponent.team_omission || opponent.team_name).substring(0, 3).split('').map((char, index) => (
                                    <span key={index} className="block leading-tight">{char}</span>
                                  ))}
                                </div>
                                <div className="hidden md:flex md:flex-col md:items-center">
                                  {(opponent.team_omission || opponent.team_name).split('').map((char, index) => (
                                    <span key={index} className="block leading-tight">{char}</span>
                                  ))}
                                </div>
                              </div>
                            </th>
                          ))}
                          {/* 予選リーグの場合は順位表の列を追加 */}
                          <>
                            <th className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-xs md:text-base font-medium text-gray-700 min-w-[40px] md:min-w-[55px]">
                              <span className="md:hidden">順</span>
                              <span className="hidden md:inline">順位</span>
                            </th>
                            <th className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-xs md:text-base font-medium text-gray-700 min-w-[40px] md:min-w-[55px]">
                              <span className="md:hidden">点</span>
                              <span className="hidden md:inline">勝点</span>
                            </th>
                            <th className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-xs md:text-base font-medium text-gray-700 min-w-[35px] md:min-w-[50px]">
                              <span className="md:hidden">試</span>
                              <span className="hidden md:inline">試合数</span>
                            </th>
                            <th className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-xs md:text-base font-medium text-gray-700 min-w-[30px] md:min-w-[45px]">
                              勝
                            </th>
                            <th className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-xs md:text-base font-medium text-gray-700 min-w-[30px] md:min-w-[45px]">
                              分
                            </th>
                            <th className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-xs md:text-base font-medium text-gray-700 min-w-[30px] md:min-w-[45px]">
                              敗
                            </th>
                            <th className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-xs md:text-base font-medium text-gray-700 min-w-[35px] md:min-w-[50px]">
                              <span className="md:hidden">得</span>
                              <span className="hidden md:inline">得点</span>
                            </th>
                            <th className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-xs md:text-base font-medium text-gray-700 min-w-[35px] md:min-w-[50px]">
                              <span className="md:hidden">失</span>
                              <span className="hidden md:inline">失点</span>
                            </th>
                            <th className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-xs md:text-base font-medium text-gray-700 min-w-[40px] md:min-w-[55px]">
                              <span className="md:hidden">差</span>
                              <span className="hidden md:inline">得失差</span>
                            </th>
                          </>
                        </tr>
                      </thead>
                      <tbody>
                        {blockTeams.map((team, teamIndex) => {
                          const teamStanding = getTeamStanding(team.team_id, blockName);

                          return (
                            <tr key={`${blockName}-row-${team.team_id}-${teamIndex}`}>
                              {/* チーム名（略称優先） */}
                              <td className="border border-gray-300 p-2 md:p-3 bg-gray-50 font-medium text-sm md:text-base">
                                <div 
                                  className="truncate max-w-[60px] md:max-w-[80px]" 
                                  title={team.team_name}
                                >
                                  {/* モバイルでは短縮表示 */}
                                  <span className="md:hidden">
                                    {(team.team_omission || team.team_name).substring(0, 4)}
                                  </span>
                                  <span className="hidden md:inline">
                                    {team.team_omission || team.team_name}
                                  </span>
                                </div>
                              </td>

                              {/* 対戦結果 */}
                              {blockTeams.map((opponent, opponentIndex) => (
                                <td
                                  key={`${blockName}-cell-${team.team_id}-${opponent.team_id}-${opponentIndex}`}
                                  className="border border-gray-300 p-1 md:p-2 text-center bg-white"
                                >
                                  {team.team_id === opponent.team_id ? (
                                    <div className="w-full h-8 md:h-10 bg-gray-200 flex items-center justify-center">
                                      <span className="text-gray-500 text-sm md:text-base">-</span>
                                    </div>
                                  ) : (
                                    <div 
                                      className={`w-full h-8 md:h-10 flex items-center justify-center text-sm md:text-lg font-medium rounded ${
                                        getResultColor(matrix[team.team_id]?.[opponent.team_id]?.result || null)
                                      }`}
                                      title={`vs ${opponent.team_name} (${matrix[team.team_id]?.[opponent.team_id]?.match_code || ''})`}
                                    >
                                      <div className="text-center leading-tight whitespace-pre-line text-xs md:text-sm">
                                        {matrix[team.team_id]?.[opponent.team_id]?.score || '-'}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              ))}
                              
                              {/* 順位表の情報を表示 */}
                              <>
                                {/* 順位 */}
                                <td className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-center">
                                  <div className="flex items-center justify-center">
                                    {teamStanding ? (
                                      <>
                                        <span className="hidden md:inline-block mr-1">{getPositionIcon(teamStanding.position)}</span>
                                        <span className="font-bold text-sm md:text-base">
                                          {teamStanding.position > 0 ? teamStanding.position : '-'}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-gray-400 text-xs md:text-sm">-</span>
                                    )}
                                  </div>
                                </td>
                                
                                {/* 勝点 */}
                                <td className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-center">
                                  <span className="font-bold text-sm md:text-lg text-black">
                                    {teamStanding?.points || 0}
                                  </span>
                                </td>
                                
                                {/* 試合数 */}
                                <td className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-center">
                                  <span className="text-xs md:text-base text-black">{teamStanding?.matches_played || 0}</span>
                                </td>
                                
                                {/* 勝利 */}
                                <td className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-center">
                                  <span className="text-black font-medium text-xs md:text-base">
                                    {teamStanding?.wins || 0}
                                  </span>
                                </td>
                                
                                {/* 引分 */}
                                <td className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-center">
                                  <span className="text-black font-medium text-xs md:text-base">
                                    {teamStanding?.draws || 0}
                                  </span>
                                </td>
                                
                                {/* 敗北 */}
                                <td className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-center">
                                  <span className="text-black font-medium text-xs md:text-base">
                                    {teamStanding?.losses || 0}
                                  </span>
                                </td>
                                
                                {/* 総得点 */}
                                <td className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-center">
                                  <span className="font-medium text-xs md:text-base text-black">
                                    {teamStanding?.goals_for || 0}
                                  </span>
                                </td>
                                
                                {/* 総失点 */}
                                <td className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-center">
                                  <span className="font-medium text-xs md:text-base text-black">
                                    {teamStanding?.goals_against || 0}
                                  </span>
                                </td>
                                
                                {/* 得失差 */}
                                <td className="border border-gray-300 p-1 md:p-2 bg-blue-50 text-center">
                                  <span className="font-bold text-xs md:text-base text-black">
                                    {teamStanding ? (
                                      `${(teamStanding.goal_difference || 0) > 0 ? '+' : ''}${teamStanding.goal_difference || 0}`
                                    ) : '0'}
                                  </span>
                                </td>
                              </>
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
                      <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-4 text-xs md:text-sm text-gray-600">
                        <div className="flex items-center">
                          <div className="w-4 h-4 md:w-5 md:h-5 bg-white border border-gray-300 text-black rounded mr-1 md:mr-2 flex items-center justify-center text-xs">
                            〇
                          </div>
                          勝利
                        </div>
                        <div className="flex items-center">
                          <div className="w-4 h-4 md:w-5 md:h-5 bg-white border border-gray-300 text-gray-500 rounded mr-1 md:mr-2 flex items-center justify-center text-xs">
                            ×
                          </div>
                          敗北
                        </div>
                        <div className="flex items-center">
                          <div className="w-4 h-4 md:w-5 md:h-5 bg-white border border-gray-300 text-black rounded mr-1 md:mr-2 flex items-center justify-center text-xs">
                            △
                          </div>
                          引分
                        </div>
                        <div className="flex items-center col-span-2 md:col-span-1">
                          <div className="w-4 h-4 md:w-5 md:h-5 bg-gray-100 text-gray-600 rounded mr-1 md:mr-2 flex items-center justify-center text-xs font-medium">
                            A1
                          </div>
                          未実施試合（試合コード表示）
                        </div>
                      </div>

                      {/* 注意書き */}
                      <div className="text-xs text-gray-500">
                        ※ 対戦結果：縦のチーム名が横のチーム名に対する結果を表示
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    このブロックには参加チームがありません
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}

// アーカイブ用順位表コンポーネント（v1.0固定版 - TournamentStandingsと同じ設計）
function ArchivedTournamentStandings_v1({ standings, matches }: { standings: StandingData[], matches?: MatchData[] }) {
  
  // ブロック分類関数（TournamentStandings.tsxと同じロジック）
  const getBlockKey = (phase: string, blockName: string): string => {
    if (phase === 'preliminary') {
      if (blockName) {
        return `予選${blockName}ブロック`;
      }
      return '予選リーグ';
    } else if (phase === 'final') {
      return '決勝トーナメント';
    } else {
      return phase || 'その他';
    }
  };

  // ブロック色の取得（TournamentStandings.tsxと同じスタイル）
  const getBlockColor = (blockKey: string): string => {
    if (blockKey.includes('予選A')) return 'bg-blue-100 text-blue-800';
    if (blockKey.includes('予選B')) return 'bg-green-100 text-green-800';
    if (blockKey.includes('予選C')) return 'bg-yellow-100 text-yellow-800';
    if (blockKey.includes('予選D')) return 'bg-purple-100 text-purple-800';
    if (blockKey.includes('予選')) return 'bg-gray-100 text-gray-800';
    if (blockKey.includes('決勝')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  // フェーズ判定（予選リーグかトーナメントか）
  const isPreliminaryPhase = (phase: string): boolean => {
    return phase === 'preliminary' || phase.includes('予選') || phase.includes('リーグ');
  };

  // 決勝トーナメントかどうかの判定
  const isFinalPhase = (phase: string): boolean => {
    return phase === 'final' || phase.includes('決勝') || phase.includes('トーナメント');
  };

  // 順位アイコンの取得
  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 2:
        return <Award className="h-4 w-4 text-gray-400" />;
      case 3:
        return <Target className="h-4 w-4 text-amber-600" />;
      default:
        return <Users className="h-4 w-4 text-gray-400" />;
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

  if (standings.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">順位表</h3>
          <p className="text-gray-600">まだ試合結果がないため、順位表を表示できません。</p>
        </CardContent>
      </Card>
    );
  }

  // 総試合数を計算（実際の試合データから）
  const totalMatches = matches ? matches.filter(match => match.has_result).length : 0;

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
                {standings.filter(block => block.phase === 'preliminary').reduce((sum, block) => {
                  if (block.team_rankings) {
                    try {
                      const rankings = JSON.parse(block.team_rankings);
                      return sum + rankings.length;
                    } catch {
                      return sum;
                    }
                  }
                  return sum;
                }, 0)}
              </div>
              <div className="text-sm text-gray-600">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {totalMatches}
              </div>
              <div className="text-sm text-gray-600">実施済み試合数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別順位表 */}
      {standings.map((block) => {
        const rankings: TeamRanking[] = block.team_rankings ? (() => {
          try {
            return JSON.parse(block.team_rankings);
          } catch {
            return [];
          }
        })() : [];

        // display_round_nameが日本語の場合はそれを使用、英語の場合はgetBlockKeyで変換
        const isJapaneseDisplayName = block.block_name && 
          (block.block_name.includes('予選') || block.block_name.includes('決勝'));
        const blockKey = isJapaneseDisplayName 
          ? block.block_name 
          : getBlockKey(block.phase, block.block_name);

        return (
          <Card key={block.block_name}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey)}`}>
                    {blockKey}
                  </span>
                  <span className="text-sm text-gray-600 flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    {rankings.length}チーム
                  </span>
                </div>
              </CardTitle>
              {block.remarks && (
                <div className="mt-2 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                  <p className="text-sm text-yellow-800">{block.remarks}</p>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {/* 決勝トーナメントでチームがない場合の表示 */}
              {isFinalPhase(block.phase) && rankings.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">順位未確定</p>
                  <p className="text-sm">試合結果が確定次第、順位が表示されます。</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[700px] md:min-w-0">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-700 text-sm md:text-base min-w-[50px] md:min-w-[60px]">順位</th>
                        <th className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-700 text-sm md:text-base min-w-[90px] md:min-w-[120px]">チーム名</th>
                        {isPreliminaryPhase(block.phase) && (
                          <>
                            <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                              <span className="md:hidden">点</span>
                              <span className="hidden md:inline">勝点</span>
                            </th>
                            <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                              <span className="md:hidden">試</span>
                              <span className="hidden md:inline">試合数</span>
                            </th>
                            <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 text-xs md:text-base min-w-[30px] md:min-w-[50px]">勝</th>
                            <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 text-xs md:text-base min-w-[30px] md:min-w-[50px]">分</th>
                            <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 text-xs md:text-base min-w-[30px] md:min-w-[50px]">敗</th>
                            <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                              <span className="md:hidden">得</span>
                              <span className="hidden md:inline">総得点</span>
                            </th>
                            <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                              <span className="md:hidden">失</span>
                              <span className="hidden md:inline">総失点</span>
                            </th>
                            <th className="text-center py-2 md:py-3 px-1 md:px-3 font-medium text-gray-700 text-xs md:text-base min-w-[40px] md:min-w-[60px]">
                              <span className="md:hidden">差</span>
                              <span className="hidden md:inline">得失差</span>
                            </th>
                          </>
                        )}
                        {isFinalPhase(block.phase) && (
                          <th className="text-center py-2 md:py-3 px-2 md:px-3 font-medium text-gray-700 text-sm md:text-base min-w-[80px] md:min-w-[100px]">備考</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rankings.map((team, teamIndex) => (
                        <tr
                          key={`${block.block_name}-${team.team_id}-${teamIndex}`} 
                          className={`border-b transition-colors ${team.position > 0 ? getPositionBgColor(team.position) : 'hover:bg-gray-50'}`}
                        >
                          <td className="py-2 md:py-3 px-2 md:px-3">
                            <div className="flex items-center">
                              <span className="hidden md:inline-block mr-2">
                                {team.position > 0 ? getPositionIcon(team.position) : <Users className="h-4 w-4 text-gray-400" />}
                              </span>
                              <span className="font-bold text-base md:text-lg">{team.position}</span>
                            </div>
                          </td>
                          <td className="py-2 md:py-3 px-2 md:px-3">
                            <div>
                              {/* モバイルでは略称優先、デスクトップでは正式名称 */}
                              <div className="font-medium text-gray-900 text-sm md:text-base">
                                <span className="md:hidden">
                                  {(team.team_omission || team.team_name).substring(0, 6)}
                                </span>
                                <span className="hidden md:inline">
                                  {team.team_name}
                                </span>
                              </div>
                              {team.team_omission && (
                                <div className="text-xs text-gray-500 hidden md:block">({team.team_omission})</div>
                              )}
                            </div>
                          </td>
                          {isPreliminaryPhase(block.phase) && (
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
                                <span className="font-medium text-xs md:text-base">{team.goals_for || 0}</span>
                              </td>
                              <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                                <span className="font-medium text-xs md:text-base">{team.goals_against || 0}</span>
                              </td>
                              <td className="py-2 md:py-3 px-1 md:px-3 text-center">
                                <span 
                                  className={`font-bold text-xs md:text-base ${
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
                          {isFinalPhase(block.phase) && (
                            <td className="py-2 md:py-3 px-2 md:px-3 text-center">
                              <span className="text-sm md:text-base text-gray-600">
                                {team.position === 1 ? '優勝' :
                                 team.position === 2 ? '準優勝' :
                                 team.position === 3 ? '3位' :
                                 team.position === 4 ? '4位' :
                                 '準々決勝敗退'}
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// アーカイブ用参加チーム表コンポーネント（v1.0固定版）
function ArchivedTournamentTeams_v1({ teams }: { teams: TeamData[] }) {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // ブロック別にチームをグループ化（TournamentTeams.tsxと同じロジック）
  const groupTeamsByBlock = (teams: TeamData[]): Record<string, TeamData[]> => {
    const grouped: Record<string, TeamData[]> = {};
    teams.forEach(team => {
      const blockName = team.assigned_block || '未分類';
      if (!grouped[blockName]) {
        grouped[blockName] = [];
      }
      grouped[blockName].push(team);
    });
    return grouped;
  };

  // チーム状態の取得（TournamentTeams.tsxと同じロジック）
  const getTeamStatus = (team: TeamData) => {
    const playerCount = team.player_count || 0;
    if (playerCount === 0) {
      return {
        status: 'empty',
        statusText: '選手未登録',
        statusColor: 'text-red-600 bg-red-50'
      };
    } else if (playerCount < 5) {
      return {
        status: 'incomplete',
        statusText: `選手${playerCount}名`,
        statusColor: 'text-yellow-600 bg-yellow-50'
      };
    } else {
      return {
        status: 'complete',
        statusText: `選手${playerCount}名`,
        statusColor: 'text-green-600 bg-green-50'
      };
    }
  };

  // チーム展開の切り替え
  const toggleTeamExpansion = (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedTeams(newExpanded);
  };

  // ブロック分類関数（TournamentTeams.tsxと同じ）
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

  // ブロック色の取得（TournamentTeams.tsxと同じ）
  const getBlockColor = (blockKey: string): string => {
    if (blockKey.includes('予選A')) return 'bg-blue-100 text-blue-800';
    if (blockKey.includes('予選B')) return 'bg-green-100 text-green-800';
    if (blockKey.includes('予選C')) return 'bg-yellow-100 text-yellow-800';
    if (blockKey.includes('予選D')) return 'bg-purple-100 text-purple-800';
    if (blockKey.includes('予選')) return 'bg-gray-100 text-gray-800';
    if (blockKey.includes('決勝')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (teams.length === 0) {
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

  const teamsByBlock = groupTeamsByBlock(teams);
  const totalTeams = teams.length;
  const totalPlayers = teams.reduce((sum, team) => sum + (team.player_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* 概要統計（TournamentTeams.tsxと同じ） */}
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
              <div className="text-2xl font-bold text-blue-600">{totalTeams}</div>
              <div className="text-sm text-gray-600">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{totalPlayers}</div>
              <div className="text-sm text-gray-600">参加選手数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別チーム一覧（TournamentTeams.tsxと同じ） */}
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
              {teams.map((team, teamIndex) => {
                const teamStatus = getTeamStatus(team);
                const isExpanded = expandedTeams.has(team.team_id);

                return (
                  <div key={`team-list-${team.team_id}-${teamIndex}`} className="border rounded-lg">
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
                              {team.team_name}
                            </h3>
                            {team.team_omission && team.team_omission !== team.team_name && (
                              <p className="text-sm text-gray-600">({team.team_omission})</p>
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

                          {/* 選手一覧（アーカイブデータから） */}
                          {team.players && team.players.length > 0 ? (
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
                                    {team.players?.map((player, index) => (
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

// 大会概要タブのコンテンツ（v1.0固定版）
function ArchivedTournamentOverview_v1({ 
  tournament, 
  pdfInfo,
  archivedAt 
}: { 
  tournament: Tournament;
  pdfInfo: PdfInfo;
  archivedAt: string;
}) {
  const getStatusBadge = () => {
    return <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">アーカイブ済み</span>;
  };

  // 開催日程をパース
  const tournamentDates = tournament.tournament_dates ? JSON.parse(tournament.tournament_dates) : {};
  const dateEntries = Object.entries(tournamentDates).sort(([a], [b]) => Number(a) - Number(b));

  return (
    <div className="space-y-6">
      {/* アーカイブ通知 */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex items-center">
          <Archive className="h-5 w-5 text-orange-600 mr-2" />
          <div className="flex-1">
            <p className="font-medium text-orange-800">アーカイブされた大会データ（v1.0）</p>
            <p className="text-sm text-orange-700 mt-1">
              この大会は {formatDate(archivedAt)} にアーカイブされました。表示されているデータはアーカイブ時点のものです。
            </p>
          </div>
        </div>
      </div>

      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trophy className="h-5 w-5 mr-2 text-blue-600" />
            大会基本情報
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">大会名</h4>
              <p className="text-lg font-semibold">{tournament.tournament_name}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">ステータス</h4>
              {getStatusBadge()}
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">フォーマット</h4>
              <p className="text-gray-900">{tournament.format_name || '未設定'}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                会場
              </h4>
              <p className="text-gray-900">{tournament.venue_name || '未設定'}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                参加チーム数
              </h4>
              <p className="text-gray-900">{tournament.team_count}チーム</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">コート数</h4>
              <p className="text-gray-900">{tournament.court_count}コート</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PDF ダウンロードエリア - 存在するPDFのみ表示 */}
      {(pdfInfo?.bracketPdfExists || pdfInfo?.resultsPdfExists) && (
        <div className={`grid grid-cols-1 ${pdfInfo.bracketPdfExists && pdfInfo.resultsPdfExists ? 'lg:grid-cols-2' : ''} gap-6`}>
          {/* PDF トーナメント表リンク */}
          {pdfInfo.bracketPdfExists && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-green-600" />
                  トーナメント表（PDF版）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-3 p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex-1">
                    <h4 className="font-medium text-green-800 mb-1">PDFでトーナメント表を表示</h4>
                    <p className="text-sm text-green-700">
                      アーカイブ時点でのトーナメント表をPDF形式でご覧いただけます。
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <Button asChild className="bg-green-600 hover:bg-green-700">
                      <Link 
                        href={`/public/tournaments/${tournament.tournament_id}/bracket-pdf`}
                        className="flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        PDF表示
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PDF 結果表リンク */}
          {pdfInfo.resultsPdfExists && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
                  結果表（PDF版）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-800 mb-1">PDFで結果表を表示</h4>
                    <p className="text-sm text-blue-700">
                      アーカイブ時点での結果表をPDF形式でご覧いただけます。
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <Button asChild className="bg-blue-600 hover:bg-blue-700">
                      <Link 
                        href={`/public/tournaments/${tournament.tournament_id}/results-pdf`}
                        className="flex items-center gap-2"
                      >
                        <BarChart3 className="h-4 w-4" />
                        PDF表示
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 開催日程 */}
      {dateEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CalendarIcon className="h-5 w-5 mr-2 text-green-600" />
              開催日程
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dateEntries.map(([dayNumber, date]) => (
                <div key={dayNumber} className="flex items-center p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                    {dayNumber}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">第{dayNumber}日</p>
                    <p className="font-medium">{formatDateOnly(date as string)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 試合設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="h-5 w-5 mr-2 text-purple-600" />
            試合設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{tournament.match_duration_minutes}</p>
              <p className="text-sm text-gray-600">試合時間（分）</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{tournament.break_duration_minutes}</p>
              <p className="text-sm text-gray-600">休憩時間（分）</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 募集期間 */}
      {tournament.recruitment_start_date && tournament.recruitment_end_date && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Target className="h-5 w-5 mr-2 text-orange-600" />
              募集期間
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">開始</p>
                <p className="font-medium">{formatDate(tournament.recruitment_start_date)}</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-0.5 bg-orange-300"></div>
              </div>
              <div>
                <p className="text-sm text-gray-600">終了</p>
                <p className="font-medium">{formatDate(tournament.recruitment_end_date)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// メインレイアウトコンポーネント（v1.0固定版）
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
export default function ArchivedLayout_v1({ archived, uiVersion, versionInfo }: { archived: ArchivedData, uiVersion?: any, versionInfo?: any }) {
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ナビゲーション */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <BackButton />
            <Button variant="ghost" asChild>
              <Link href="/" className="flex items-center text-gray-600 hover:text-gray-900">
                <ArrowLeft className="h-4 w-4 mr-2" />
                TOPページに戻る
              </Link>
            </Button>
          </div>
        </div>

        {/* 大会タイトル */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{archived.tournament.tournament_name}</h1>
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
              📁 アーカイブ済み
            </span>
            <span className="text-gray-600">アーカイブ日時: {formatDate(archived.archived_at as string)}</span>
          </div>
        </div>

        {/* タブナビゲーション */}
        <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full mb-8 grid-cols-3 grid-rows-2 gap-1 h-auto sm:grid-cols-5 sm:grid-rows-1">
          <TabsTrigger value="overview" className="flex items-center justify-center py-3 text-xs sm:text-sm">
            <Trophy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline sm:inline">大会</span>概要
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center justify-center py-3 text-xs sm:text-sm">
            <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline sm:inline">日程・</span>結果
          </TabsTrigger>
          <TabsTrigger value="results" className="flex items-center justify-center py-3 text-xs sm:text-sm">
            <Award className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            戦績表
          </TabsTrigger>
          <TabsTrigger value="standings" className="flex items-center justify-center py-3 text-xs sm:text-sm">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            順位表
          </TabsTrigger>
          <TabsTrigger value="teams" className="flex items-center justify-center py-3 text-xs sm:text-sm">
            <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline sm:inline">参加</span>チーム
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ArchivedTournamentOverview_v1 
            tournament={archived.tournament} 
            pdfInfo={archived.pdfInfo}
            archivedAt={archived.archived_at}
          />
        </TabsContent>

        <TabsContent value="schedule">
          <ArchivedTournamentSchedule_v1 matches={archived.matches} teams={archived.teams} />
        </TabsContent>

        <TabsContent value="results">
          <ArchivedTournamentResults_v1 results={archived.results} teams={archived.teams} standings={archived.standings} />
        </TabsContent>

        <TabsContent value="standings">
          <ArchivedTournamentStandings_v1 standings={archived.standings} matches={archived.matches} />
        </TabsContent>

        <TabsContent value="teams">
          <ArchivedTournamentTeams_v1 teams={archived.teams} />
        </TabsContent>
      </Tabs>
      </div>

      <Footer />
    </div>
  );
}

// デフォルトエクスポート
export { ArchivedLayout_v1 };