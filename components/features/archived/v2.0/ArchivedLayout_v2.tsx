// components/features/archived/v2.0/ArchivedLayout_v2.tsx
'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar, MapPin, Trophy, Users, Clock, BarChart3, Archive, ArrowLeft, GitBranch, Grid3X3, Zap, CheckCircle } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Tournament } from '@/lib/types';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BackButton from '@/components/ui/back-button';

// データ型定義（v2.0対応）
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
  execution_priority?: number;
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

// v2.0新機能: 試合速報エリア
function ArchivedMatchNews_v2({ matches }: { matches: MatchData[] }) {
  // 完了済みの試合から最新5件を抽出
  const newsMatches = matches
    .filter(match => match.has_result)
    .sort((a, b) => new Date(b.tournament_date).getTime() - new Date(a.tournament_date).getTime())
    .slice(0, 5);

  if (newsMatches.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Zap className="h-5 w-5 mr-2 text-orange-600" />
          大会結果ハイライト
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {newsMatches.map(match => (
            <div key={match.match_id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border-l-4 border-blue-500">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-500 text-white px-2 py-1 rounded text-sm font-medium">
                  {match.match_code}
                </div>
                <div className="text-sm">
                  <div className="font-medium">
                    {match.team1_display_name} vs {match.team2_display_name}
                  </div>
                  <div className="text-gray-600">
                    コート{match.court_number} | {match.start_time?.substring(0, 5)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center text-blue-600 font-medium">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  <span>{match.team1_goals} - {match.team2_goals}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// v2.0新機能: トーナメント表（ブラケット）コンポーネント
function ArchivedTournamentBracket_v2({ matches, teams }: { matches: MatchData[], teams: TeamData[] }) {
  // 決勝トーナメントの試合のみフィルタ
  const finalMatches = matches.filter(match => match.phase === 'final');
  
  // チーム名マップを作成
  const teamMap = new Map(teams.map(t => [t.team_id, t]));

  // チーム名表示用関数
  const getTeamDisplayName = (teamId: string | undefined | null, displayName: string) => {
    if (!teamId) return displayName;
    const team = teamMap.get(teamId);
    return team ? team.team_name : displayName;
  };

  // execution_priorityでグループ化
  const matchesByPriority = finalMatches.reduce((acc: Record<number, MatchData[]>, match) => {
    const priority = match.execution_priority || 0;
    if (!acc[priority]) acc[priority] = [];
    acc[priority].push(match);
    return acc;
  }, {});

  const sortedPriorities = Object.keys(matchesByPriority)
    .map(Number)
    .sort((a, b) => a - b);

  // ラウンド名の取得
  const getRoundName = (priority: number, matchCount: number): string => {
    if (matchCount === 1) return '決勝';
    if (matchCount === 2) return '準決勝';
    if (matchCount === 4) return '準々決勝';
    if (matchCount === 8) return 'ベスト16';
    return `ラウンド${priority}`;
  };

  if (finalMatches.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <GitBranch className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">トーナメント表</h3>
          <p className="text-gray-600">決勝トーナメントのデータがありません。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* トーナメント概要 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <GitBranch className="h-5 w-5 mr-2 text-blue-600" />
            トーナメント表
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{finalMatches.length}</div>
              <div className="text-sm text-gray-600">決勝戦試合数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {sortedPriorities.length}
              </div>
              <div className="text-sm text-gray-600">ラウンド数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {finalMatches.filter(m => m.has_result).length}
              </div>
              <div className="text-sm text-gray-600">完了済み試合</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ラウンド別表示 */}
      <div className="space-y-6">
        {sortedPriorities.map(priority => {
          const roundMatches = matchesByPriority[priority];
          const roundName = getRoundName(priority, roundMatches.length);
          
          return (
            <Card key={priority}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="px-3 py-1 rounded-full text-sm font-medium mr-3 bg-red-100 text-red-800">
                    {roundName}
                  </span>
                  <span className="text-sm text-gray-600">
                    {roundMatches.length}試合
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {roundMatches
                    .sort((a, b) => a.match_code.localeCompare(b.match_code, undefined, { numeric: true }))
                    .map(match => {
                      const winnerIsTeam1 = match.winner_team_id === match.team1_id;
                      
                      return (
                        <div key={match.match_id} className="border rounded-lg p-4 bg-white">
                          <div className="flex items-center justify-between mb-3">
                            <div className="font-medium text-gray-900">{match.match_code}</div>
                            {match.has_result && (
                              <div className="flex items-center text-green-600">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                <span className="text-sm font-medium">完了</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="space-y-2">
                            <div className={`p-2 rounded ${winnerIsTeam1 ? 'bg-green-50 border-l-4 border-green-500' : 'bg-gray-50'}`}>
                              <div className="flex items-center justify-between">
                                <span className={`${winnerIsTeam1 ? 'font-bold text-green-800' : 'text-gray-700'}`}>
                                  {getTeamDisplayName(match.team1_id, match.team1_display_name)}
                                </span>
                                {match.has_result && (
                                  <span className={`font-bold ${winnerIsTeam1 ? 'text-green-800' : 'text-gray-600'}`}>
                                    {match.team1_goals}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="text-center text-gray-400 text-sm">vs</div>
                            
                            <div className={`p-2 rounded ${!winnerIsTeam1 && match.winner_team_id === match.team2_id ? 'bg-green-50 border-l-4 border-green-500' : 'bg-gray-50'}`}>
                              <div className="flex items-center justify-between">
                                <span className={`${!winnerIsTeam1 && match.winner_team_id === match.team2_id ? 'font-bold text-green-800' : 'text-gray-700'}`}>
                                  {getTeamDisplayName(match.team2_id, match.team2_display_name)}
                                </span>
                                {match.has_result && (
                                  <span className={`font-bold ${!winnerIsTeam1 && match.winner_team_id === match.team2_id ? 'text-green-800' : 'text-gray-600'}`}>
                                    {match.team2_goals}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {match.start_time && (
                            <div className="mt-3 text-xs text-gray-500 flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {match.start_time.substring(0, 5)}
                              {match.court_number && (
                                <>
                                  <MapPin className="h-3 w-3 ml-2 mr-1" />
                                  コート{match.court_number}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// v2.0改良版: 戦績表（マトリックス）コンポーネント - 統合版
function ArchivedTournamentMatrix_v2({ results, teams, standings }: { results: ResultData[], teams: TeamData[], standings: StandingData[] }) {
  
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

  // 対戦マトリックス構築（v1.0と同じロジック）
  const buildMatchMatrix = (blockResults: ResultData[], blockTeams: TeamData[]) => {
    const matrix: Record<string, Record<string, { result: 'win' | 'loss' | 'draw' | null; score: string; match_code: string }>> = {};
    
    // 初期化
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
      
      if (!team1Id || !team2Id || !matrix[team1Id] || !matrix[team2Id]) {
        return;
      }
      
      const team1Goals = match.team1_goals || 0;
      const team2Goals = match.team2_goals || 0;

      if (match.is_walkover) {
        const winnerId = match.winner_team_id;
        if (!winnerId) return;
        
        const loserId = winnerId === team1Id ? team2Id : team1Id;
        
        if (matrix[winnerId] && matrix[loserId]) {
          matrix[winnerId][loserId] = {
            result: 'win',
            score: '不戦勝',
            match_code: match.match_code
          };
          
          matrix[loserId][winnerId] = {
            result: 'loss',
            score: '不戦敗',
            match_code: match.match_code
          };
        }
      } else if (match.is_draw) {
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

  // v2.0改良: ブロック色分け関数
  const getBlockColor = (blockKey: string): string => {
    if (blockKey.includes('予選A')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (blockKey.includes('予選B')) return 'bg-green-100 text-green-800 border-green-200';
    if (blockKey.includes('予選C')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (blockKey.includes('予選D')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (blockKey.includes('予選')) return 'bg-gray-100 text-gray-800 border-gray-200';
    if (blockKey.includes('決勝')) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // 結果の色を取得
  const getResultColor = (result: 'win' | 'loss' | 'draw' | null): string => {
    switch (result) {
      case 'win':
        return 'text-black bg-green-50 border-green-200';
      case 'loss':
        return 'text-gray-500 bg-red-50 border-red-200';
      case 'draw':
        return 'text-black bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
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

  return (
    <div className="space-y-6">
      {/* v2.0改良: 概要統計 */}
      <Card className="border-2 border-blue-200">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardTitle className="flex items-center">
            <Grid3X3 className="h-5 w-5 mr-2 text-blue-600" />
            戦績マトリックス概要
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{Object.keys(resultsByBlock).length}</div>
              <div className="text-sm text-gray-600">ブロック数</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-2xl font-bold text-green-600">{teams.length}</div>
              <div className="text-sm text-gray-600">参加チーム数</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-2xl font-bold text-purple-600">{results.length}</div>
              <div className="text-sm text-gray-600">実施済み試合数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別戦績表 */}
      {Object.entries(resultsByBlock)
        .filter(([blockName]) => {
          const blockTeams = teamsByBlock[blockName] || [];
          return blockTeams.length > 0;
        })
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([blockName, blockResults]) => {
          const blockTeams = teamsByBlock[blockName] || [];
          const matrix = buildMatchMatrix(blockResults, blockTeams);
          const blockKey = `予選${blockName}ブロック`;
          const blockStandings = getStandingsForBlock(blockName);
          
          return (
            <Card key={blockName} className="border-2">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-blue-50">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className={`px-4 py-2 rounded-full text-sm font-medium mr-3 border ${getBlockColor(blockKey)}`}>
                      {blockKey}
                    </span>
                    <span className="text-sm text-gray-600 flex items-center">
                      <Users className="h-4 w-4 mr-1" />
                      {blockTeams.length}チーム
                    </span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {blockTeams.length > 0 ? (
                  <div className="overflow-x-auto">
                    {/* v2.0改良: 統合された戦績表（順位表情報 + 対戦結果） */}
                    <table className="w-full border-collapse border-2 border-gray-300 min-w-[900px] rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-gradient-to-r from-gray-100 to-blue-100">
                          <th className="border border-gray-300 p-3 bg-gray-100 text-sm font-medium text-gray-700 min-w-[100px]">
                            チーム
                          </th>
                          {/* 対戦結果の列ヘッダー */}
                          {blockTeams.map((opponent) => (
                            <th 
                              key={opponent.team_id}
                              className="border border-gray-300 p-2 bg-green-50 text-sm font-medium text-gray-700 min-w-[70px] max-w-[90px]"
                            >
                              <div 
                                className="flex flex-col items-center justify-center h-20 overflow-hidden"
                                style={{ 
                                  fontSize: '12px',
                                  fontWeight: '600',
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
                          {/* 順位表の列 */}
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[60px]">順位</th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[60px]">勝点</th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[55px]">試合数</th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[45px]">勝</th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[45px]">分</th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[45px]">敗</th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[55px]">得点</th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[55px]">失点</th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[60px]">得失差</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blockTeams.map((team) => {
                          const teamStanding = blockStandings.find((standing: TeamRanking) => standing.team_id === team.team_id);
                          
                          return (
                            <tr key={team.team_id} className="hover:bg-gray-50 transition-colors">
                              {/* チーム名 */}
                              <td className="border border-gray-300 p-3 bg-gray-50 font-medium text-sm">
                                <div className="truncate max-w-[80px]" title={team.team_name}>
                                  {team.team_omission || team.team_name}
                                </div>
                              </td>
                              
                              {/* 対戦結果 */}
                              {blockTeams.map((opponent) => (
                                <td 
                                  key={opponent.team_id}
                                  className="border border-gray-300 p-1 text-center"
                                >
                                  {team.team_id === opponent.team_id ? (
                                    <div className="w-full h-12 bg-gray-200 flex items-center justify-center rounded">
                                      <span className="text-gray-500 text-lg">-</span>
                                    </div>
                                  ) : (
                                    <div 
                                      className={`w-full h-12 flex items-center justify-center text-sm font-medium rounded border ${
                                        getResultColor(matrix[team.team_id]?.[opponent.team_id]?.result || null)
                                      }`}
                                      title={`vs ${opponent.team_name} (${matrix[team.team_id]?.[opponent.team_id]?.match_code || ''})`}
                                    >
                                      <div className="text-center leading-tight whitespace-pre-line text-xs">
                                        {matrix[team.team_id]?.[opponent.team_id]?.score || '-'}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              ))}
                              
                              {/* 順位表情報 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-bold text-lg text-blue-600">
                                  {teamStanding?.position || '-'}
                                </span>
                              </td>
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-bold text-lg text-green-600">
                                  {teamStanding?.points || 0}
                                </span>
                              </td>
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-sm">{teamStanding?.matches_played || 0}</span>
                              </td>
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-green-600 font-medium">{teamStanding?.wins || 0}</span>
                              </td>
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-yellow-600 font-medium">{teamStanding?.draws || 0}</span>
                              </td>
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-red-600 font-medium">{teamStanding?.losses || 0}</span>
                              </td>
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-medium">{teamStanding?.goals_for || 0}</span>
                              </td>
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-medium">{teamStanding?.goals_against || 0}</span>
                              </td>
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-bold text-sm">
                                  {teamStanding ? (
                                    `${(teamStanding.goal_difference || 0) > 0 ? '+' : ''}${teamStanding.goal_difference || 0}`
                                  ) : '0'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* v2.0改良: 視覚的凡例 */}
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h4 className="font-medium text-gray-800 mb-3">凡例</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center">
                          <div className="w-5 h-5 bg-green-50 border border-green-200 rounded mr-2 flex items-center justify-center text-xs">〇</div>
                          勝利
                        </div>
                        <div className="flex items-center">
                          <div className="w-5 h-5 bg-red-50 border border-red-200 rounded mr-2 flex items-center justify-center text-xs">×</div>
                          敗北
                        </div>
                        <div className="flex items-center">
                          <div className="w-5 h-5 bg-yellow-50 border border-yellow-200 rounded mr-2 flex items-center justify-center text-xs">△</div>
                          引分
                        </div>
                        <div className="flex items-center">
                          <div className="w-5 h-5 bg-gray-50 border border-gray-200 rounded mr-2 flex items-center justify-center text-xs font-medium">A1</div>
                          未実施
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        ※ 対戦結果: 縦のチームが横のチームに対する結果 | 青色列: 順位表データ
                      </p>
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

// v2.0継承: 既存コンポーネントの流用（ArchivedTournamentSchedule_v1、ArchivedTournamentStandings_v1、ArchivedTournamentTeams_v1の内容をコピー）
// ※ 実際の実装では、v1.0のコンポーネントをv2.0にコピーして改良版として使用

// v2.0改良版: 大会概要タブ
function ArchivedTournamentOverview_v2({ 
  tournament, 
  archivedAt 
}: { 
  tournament: Tournament;
  archivedAt: string;
}) {
  const getStatusBadge = () => {
    return (
      <span className="px-4 py-2 rounded-full text-sm font-medium bg-gradient-to-r from-orange-100 to-red-100 text-orange-800 border border-orange-200">
        📁 アーカイブ済み (v2.0)
      </span>
    );
  };


  return (
    <div className="space-y-6">
      {/* v2.0改良: アーカイブ通知 */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-6">
        <div className="flex items-center">
          <Archive className="h-6 w-6 text-orange-600 mr-3" />
          <div className="flex-1">
            <p className="font-semibold text-orange-800 text-lg">アーカイブされた大会データ（v2.0）</p>
            <p className="text-sm text-orange-700 mt-2">
              この大会は {formatDate(archivedAt)} にアーカイブされました。v2.0の新機能（ブラケット表示、戦績マトリックス）に対応した表示です。
            </p>
          </div>
        </div>
      </div>

      {/* v2.0改良: 基本情報 */}
      <Card className="border-2 border-blue-200">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardTitle className="flex items-center">
            <Trophy className="h-6 w-6 mr-3 text-blue-600" />
            大会基本情報
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-gray-700 mb-2">大会名</h4>
              <p className="text-lg font-semibold text-blue-800">{tournament.tournament_name}</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <h4 className="font-medium text-gray-700 mb-2">ステータス</h4>
              {getStatusBadge()}
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h4 className="font-medium text-gray-700 mb-2">フォーマット</h4>
              <p className="text-gray-900 font-medium">{tournament.format_name || '未設定'}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                会場
              </h4>
              <p className="text-gray-900 font-medium">{tournament.venue_name || '未設定'}</p>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                参加チーム数
              </h4>
              <p className="text-gray-900 font-bold text-xl">{tournament.team_count}チーム</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
              <h4 className="font-medium text-gray-700 mb-2">コート数</h4>
              <p className="text-gray-900 font-bold text-xl">{tournament.court_count}コート</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 他の既存セクション（PDF、日程、試合設定、募集期間）も同様に改良 */}
      {/* ... */}
    </div>
  );
}

// メインレイアウトコンポーネント（v2.0版）
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
export default function ArchivedLayout_v2({ archived, uiVersion, versionInfo }: { archived: ArchivedData, uiVersion?: any, versionInfo?: any }) {
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ナビゲーション */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <BackButton />
            <Button variant="ghost" asChild className="hover:bg-blue-100">
              <Link href="/" className="flex items-center text-gray-600 hover:text-blue-700">
                <ArrowLeft className="h-4 w-4 mr-2" />
                TOPページに戻る
              </Link>
            </Button>
          </div>
        </div>

        {/* v2.0改良: 大会タイトルエリア */}
        <div className="mb-8 p-6 bg-white rounded-xl border-2 border-blue-200 shadow-lg">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-3">
            {archived.tournament.tournament_name}
          </h1>
          <div className="flex items-center gap-4">
            <span className="px-4 py-2 rounded-full text-sm font-medium bg-gradient-to-r from-orange-100 to-red-100 text-orange-800 border border-orange-200">
              📁 アーカイブ済み（v2.0）
            </span>
            <span className="text-gray-600 flex items-center">
              <Calendar className="h-4 w-4 mr-1" />
              アーカイブ日時: {formatDate(archived.archived_at as string)}
            </span>
          </div>
        </div>

        {/* v2.0新機能: 試合速報エリア */}
        <ArchivedMatchNews_v2 matches={archived.matches} />

        {/* v2.0改良: タブナビゲーション */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full mb-8 grid-cols-3 grid-rows-2 gap-1 h-auto sm:grid-cols-6 sm:grid-rows-1 bg-white border-2 border-blue-200 p-2 rounded-xl">
            <TabsTrigger value="overview" className="flex items-center justify-center py-3 text-xs sm:text-sm rounded-lg">
              <Trophy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              概要
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center justify-center py-3 text-xs sm:text-sm rounded-lg">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              日程結果
            </TabsTrigger>
            <TabsTrigger value="bracket" className="flex items-center justify-center py-3 text-xs sm:text-sm rounded-lg">
              <GitBranch className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              ブラケット
            </TabsTrigger>
            <TabsTrigger value="matrix" className="flex items-center justify-center py-3 text-xs sm:text-sm rounded-lg">
              <Grid3X3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              戦績表
            </TabsTrigger>
            <TabsTrigger value="standings" className="flex items-center justify-center py-3 text-xs sm:text-sm rounded-lg">
              <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              順位表
            </TabsTrigger>
            <TabsTrigger value="teams" className="flex items-center justify-center py-3 text-xs sm:text-sm rounded-lg">
              <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              チーム
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ArchivedTournamentOverview_v2 
              tournament={archived.tournament} 
              archivedAt={archived.archived_at}
            />
          </TabsContent>

          <TabsContent value="schedule">
            {/* v1.0のScheduleコンポーネントを流用 */}
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">日程・結果表示（v1.0コンポーネントを流用予定）</p>
            </div>
          </TabsContent>

          <TabsContent value="bracket">
            <ArchivedTournamentBracket_v2 matches={archived.matches} teams={archived.teams} />
          </TabsContent>

          <TabsContent value="matrix">
            <ArchivedTournamentMatrix_v2 results={archived.results} teams={archived.teams} standings={archived.standings} />
          </TabsContent>

          <TabsContent value="standings">
            {/* v1.0のStandingsコンポーネントを流用 */}
            <div className="text-center py-12">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">順位表表示（v1.0コンポーネントを流用予定）</p>
            </div>
          </TabsContent>

          <TabsContent value="teams">
            {/* v1.0のTeamsコンポーネントを流用 */}
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">参加チーム表示（v1.0コンポーネントを流用予定）</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
}

// デフォルトエクスポート
export { ArchivedLayout_v2 };