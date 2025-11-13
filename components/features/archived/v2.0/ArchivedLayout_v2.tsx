// components/features/archived/v2.0/ArchivedLayout_v2.tsx
'use client';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Calendar, MapPin, Trophy, Users, Clock, BarChart3, Archive, ArrowLeft, GitBranch, Award, Target, 
  CheckCircle, XCircle, AlertTriangle, Filter, Hash, Medal, TrendingUp, ChevronDown, ChevronRight,
  Download, MessageSquare
} from 'lucide-react';
import { formatDate, formatDateOnly } from '@/lib/utils';
import { Tournament } from '@/lib/types';
import { detectPKFromScoreString, determinePKWinner } from '@/lib/pk-detection-utils';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BackButton from '@/components/ui/back-button';

// 汎用的ブロック色分け関数（全コンポーネントで共通使用）
const getUniversalBlockColor = (blockKey: string, blockStructure?: BlockStructure | null): string => {
  // メタデータベースの動的色分けを優先
  if (blockStructure) {
    const blockInfo = blockStructure.blocks_info?.find((b) => 
      b.block_name === blockKey || 
      b.display_round_name === blockKey ||
      blockKey.includes(b.block_name)
    );
    
    if (blockInfo) {
      const phase = blockInfo.phase;
      const blockOrder = blockInfo.block_order || 0;
      
      if (phase === 'preliminary') {
        // 予選ブロック用の色分け
        const colors = [
          'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
          'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
          'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
        ];
        return colors[blockOrder % colors.length];
      } else if (phase === 'final') {
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      }
    }
  }
  
  // フォールバック：従来のパターンマッチング
  if (blockKey.includes('決勝') || blockKey.toLowerCase().includes('final')) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
  }
  
  // 予選・リーグ戦の場合
  if (blockKey.includes('予選') || blockKey.toLowerCase().includes('preliminary') || 
      blockKey.includes('グループ') || blockKey.includes('ブロック') || 
      blockKey.includes('リーグ') || /^[A-Z0-9]+$/.test(blockKey)) {
    
    const colors = [
      'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-300',
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
      'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-300',
      'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300'
    ];
    
    // ハッシュベースの安定した色分け
    let hash = 0;
    for (let i = 0; i < blockKey.length; i++) {
      const char = blockKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const colorIndex = Math.abs(hash) % colors.length;
    return colors[colorIndex];
  }
  
  return 'bg-muted text-muted-foreground';
};

// データ型定義
interface PlayerData {
  player_name: string;
  jersey_number?: number;
  position?: string;
}

// メタデータ型定義
interface SportSettings {
  sport_code: string;
  supports_pk: boolean;
  has_extra_time: boolean;
  period_count: number;
  tie_breaking_rules: string[];
  score_format_rules: Record<string, unknown>;
  competition_format: string;
}

interface FormatDetails {
  format_info: {
    format_id: number;
    format_name: string;
    target_team_count: number;
    format_description: string;
    preliminary_format: string;
    final_format: string;
    preliminary_advance_count: number;
    has_third_place_match: boolean;
  };
  match_templates: Array<{
    template_id: number;
    match_code: string;
    phase: string;
    round_name: string;
    block_name: string;
    match_type: string;
    execution_priority: number;
    team1_source: string;
    team2_source: string;
  }>;
}

interface BlockStructure {
  blocks_info: Array<{
    match_block_id: number;
    phase: string;
    block_name: string;
    display_round_name: string;
    block_order: number;
    match_type: string;
    teams_count: number;
    matches_count: number;
  }>;
  block_assignments: Record<string, Array<{
    team_id: string;
    team_name: string;
    team_omission?: string;
    block_position: number;
    player_count: number;
  }>>;
  total_blocks_count: number;
  preliminary_blocks_count: number;
  final_blocks_count: number;
}

interface ExtendedMetadata {
  venue_info?: {
    venue_id: number;
    venue_name: string;
    address: string;
    available_courts: number;
  };
  display_settings: Record<string, unknown>;
  snapshot_info: {
    archived_timestamp: string;
    system_version: string;
    data_structure_version: string;
    ui_compatibility_version: string;
  };
  archive_completeness_check: Record<string, boolean>;
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
  team1_pk_goals?: number;
  team2_pk_goals?: number;
  block_order?: number;
  team1_goals: number;
  team2_goals: number;
  team1_scores?: string; // 多競技対応用の拡張スコアデータ
  team2_scores?: string; // 多競技対応用の拡張スコアデータ
  winner_team_id?: string;
  is_draw: number;
  is_walkover: number;
  match_status: string;
  result_status?: string;
  remarks?: string;
  has_result: number;
  execution_priority?: number;
}

interface TeamStanding {
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
  position_note?: string;
}

interface BlockStanding {
  match_block_id?: number;
  phase: string;
  display_round_name?: string;
  block_name: string;
  teams?: TeamStanding[];
  team_rankings?: string;
  remarks?: string;
}

interface ResultData {
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_name: string;
  team2_name: string;
  team1_goals?: number;
  team2_goals?: number;
  team1_scores?: string | number; // アーカイブデータ対応
  team2_scores?: string | number; // アーカイブデータ対応
  winner_team_id?: string;
  is_draw?: number;
  is_walkover?: number;
  has_result?: number | boolean; // 結果確定フラグ（アーカイブ互換性対応）
  block_name: string;
}

// アーカイブスコア計算関数
const calculateArchiveGoals = (scores: string | number | null | undefined): number => {
  if (!scores) return 0;
  
  // 既に数値の場合（processedMatchesから）
  if (typeof scores === 'number') {
    return Math.floor(scores);
  }
  
  // 文字列の場合はカンマ区切りで合計を計算
  if (typeof scores === 'string') {
    return scores.split(',').reduce((sum, score) => sum + (parseInt(score.trim()) || 0), 0);
  }
  
  return 0;
};

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

// 拡張メタデータを活用するヘルパー関数群
const getExtendedMetadata = (metadata: unknown): ExtendedMetadata | null => {
  try {
    if (typeof metadata === 'string') {
      const parsedMetadata = JSON.parse(metadata);
      return parsedMetadata.extended_metadata as ExtendedMetadata || null;
    }
    return (metadata as Record<string, unknown>)?.extended_metadata as ExtendedMetadata || null;
  } catch {
    return null;
  }
};

const getSportSettings = (metadata: unknown): SportSettings | null => {
  try {
    if (typeof metadata === 'string') {
      const parsedMetadata = JSON.parse(metadata);
      return parsedMetadata.sport_settings as SportSettings || null;
    }
    return (metadata as Record<string, unknown>)?.sport_settings as SportSettings || null;
  } catch {
    return null;
  }
};

const getFormatDetails = (metadata: unknown): FormatDetails | null => {
  try {
    if (typeof metadata === 'string') {
      const parsedMetadata = JSON.parse(metadata);
      return parsedMetadata.format_details as FormatDetails || null;
    }
    return (metadata as Record<string, unknown>)?.format_details as FormatDetails || null;
  } catch {
    return null;
  }
};

const getBlockStructure = (metadata: unknown): BlockStructure | null => {
  try {
    if (typeof metadata === 'string') {
      const parsedMetadata = JSON.parse(metadata);
      return parsedMetadata.block_structure as BlockStructure || null;
    }
    return (metadata as Record<string, unknown>)?.block_structure as BlockStructure || null;
  } catch {
    return null;
  }
};


// 競技設定表示コンポーネント
const SportSettingsCard = ({ tournament, extendedMetadata }: { tournament: Tournament; extendedMetadata?: ExtendedMetadata | null }) => {
  const sportSettings = getSportSettings(extendedMetadata);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="h-5 w-5 mr-2 text-purple-600" />
          競技設定・試合ルール
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{tournament.match_duration_minutes}</p>
            <p className="text-sm text-muted-foreground">試合時間（分）</p>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{tournament.break_duration_minutes}</p>
            <p className="text-sm text-muted-foreground">休憩時間（分）</p>
          </div>
          {sportSettings && (
            <>
              <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <p className="text-lg font-bold text-purple-600">{sportSettings.sport_code?.toUpperCase() || 'SOCCER'}</p>
                <p className="text-sm text-muted-foreground">競技種目</p>
              </div>
              <div className="text-center p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                <p className="text-lg font-bold text-orange-600">{sportSettings.period_count || 2}ピリオド</p>
                <p className="text-sm text-muted-foreground">試合構成</p>
              </div>
              <div className="text-center p-4 bg-cyan-50 dark:bg-cyan-950/20 rounded-lg">
                <p className="text-lg font-bold text-cyan-600">{sportSettings.has_extra_time ? 'あり' : 'なし'}</p>
                <p className="text-sm text-muted-foreground">延長戦</p>
              </div>
              <div className="text-center p-4 bg-rose-50 dark:bg-rose-950/20 rounded-lg">
                <p className="text-lg font-bold text-rose-600">{sportSettings.supports_pk ? 'あり' : 'なし'}</p>
                <p className="text-sm text-muted-foreground">PK戦</p>
              </div>
            </>
          )}
        </div>
        
        {sportSettings?.tie_breaking_rules && (
          <div className="mt-4 p-4 bg-muted/30 rounded-lg">
            <h4 className="font-medium text-muted-foreground mb-2">順位決定ルール</h4>
            <div className="flex flex-wrap gap-2">
              {sportSettings.tie_breaking_rules.map((rule: string, index: number) => (
                <span key={index} className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs">
                  {index + 1}. {rule}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// 大会フォーマット詳細表示コンポーネント
const FormatDetailsCard = ({ formatDetails }: { formatDetails: FormatDetails | null }) => {
  const formatInfo = formatDetails?.format_info;
  const templates = formatDetails?.match_templates || [];
  
  if (!formatInfo) return null;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <GitBranch className="h-5 w-5 mr-2 text-indigo-600" />
          大会フォーマット詳細
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* フォーマット基本情報 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium text-muted-foreground mb-1">フォーマット名</h4>
              <p className="text-foreground font-medium">{formatInfo.format_name}</p>
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-1">対象チーム数</h4>
              <p className="text-foreground">{formatInfo.target_team_count}チーム</p>
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-1">進出チーム数</h4>
              <p className="text-foreground">{formatInfo.preliminary_advance_count || 0}チーム</p>
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-1">予選形式</h4>
              <p className="text-foreground">{formatInfo.preliminary_format}</p>
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-1">決勝形式</h4>
              <p className="text-foreground">{formatInfo.final_format}</p>
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-1">3位決定戦</h4>
              <p className="text-foreground">{formatInfo.has_third_place_match ? 'あり' : 'なし'}</p>
            </div>
          </div>
          
          {/* フォーマット説明 */}
          {formatInfo.format_description && (
            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium text-muted-foreground mb-2">フォーマット説明</h4>
              <p className="text-foreground text-sm">{formatInfo.format_description}</p>
            </div>
          )}
          
          {/* 試合テンプレート統計 */}
          {templates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <p className="text-lg font-bold text-blue-600">{templates.length}</p>
                <p className="text-xs text-muted-foreground">総試合数</p>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <p className="text-lg font-bold text-green-600">
                  {templates.filter((t) => t.phase === 'preliminary').length}
                </p>
                <p className="text-xs text-muted-foreground">予選試合</p>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                <p className="text-lg font-bold text-red-600">
                  {templates.filter((t) => t.phase === 'final').length}
                </p>
                <p className="text-xs text-muted-foreground">決勝試合</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ブロック構成表示コンポーネント
const BlockStructureCard = ({ extendedMetadata }: { extendedMetadata?: ExtendedMetadata | null }) => {
  const blockStructure = getBlockStructure(extendedMetadata);
  
  if (!blockStructure || !blockStructure.blocks_info || blockStructure.blocks_info.length === 0) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <BarChart3 className="h-5 w-5 mr-2 text-emerald-600" />
          ブロック構成情報
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* ブロック統計 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
              <p className="text-lg font-bold text-emerald-600">{blockStructure.total_blocks_count}</p>
              <p className="text-xs text-muted-foreground">総ブロック数</p>
            </div>
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <p className="text-lg font-bold text-blue-600">{blockStructure.preliminary_blocks_count}</p>
              <p className="text-xs text-muted-foreground">予選ブロック</p>
            </div>
            <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <p className="text-lg font-bold text-red-600">{blockStructure.final_blocks_count}</p>
              <p className="text-xs text-muted-foreground">決勝ブロック</p>
            </div>
            <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
              <p className="text-lg font-bold text-purple-600">
                {Object.values(blockStructure.block_assignments).reduce((total: number, teams) => total + teams.length, 0)}
              </p>
              <p className="text-xs text-muted-foreground">参加チーム</p>
            </div>
          </div>
          
          {/* ブロック詳細情報 */}
          <div className="space-y-3">
            <h4 className="font-medium text-muted-foreground">ブロック詳細</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {blockStructure.blocks_info.map((block, index: number) => (
                <div key={index} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getUniversalBlockColor(block.block_name, blockStructure)}`}>
                      {block.display_round_name || block.block_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {block.phase === 'preliminary' ? '予選' : '決勝'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">チーム：</span>
                      <span className="font-medium">{block.teams_count}チーム</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">試合：</span>
                      <span className="font-medium">{block.matches_count}試合</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {block.match_type}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* チーム配置詳細 */}
          {Object.keys(blockStructure.block_assignments).length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-muted-foreground">ブロック別チーム配置</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.entries(blockStructure.block_assignments).map(([blockName, teams]) => (
                  <div key={blockName} className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getUniversalBlockColor(blockName, blockStructure)}`}>
                        {blockName}
                      </span>
                      <span className="text-xs text-muted-foreground">{teams.length}チーム</span>
                    </div>
                    <div className="space-y-1">
                      {teams.slice(0, 4).map((team, index: number) => (
                        <div key={index} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{team.team_omission || team.team_name}</span>
                          <span className="text-muted-foreground">{team.player_count}名</span>
                        </div>
                      ))}
                      {teams.length > 4 && (
                        <div className="text-xs text-muted-foreground text-center">
                          他 {teams.length - 4}チーム...
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// 大会概要タブ
function ArchivedTournamentOverview({ 
  tournament, 
  archivedAt,
  extendedMetadata,
  formatDetails
}: { 
  tournament: Tournament;
  archivedAt: string;
  extendedMetadata?: ExtendedMetadata | null;
  formatDetails?: FormatDetails | null;
}) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ongoing':
        return <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">進行中</span>;
      case 'completed':
        return <span className="px-3 py-1 rounded-full text-sm font-medium bg-muted text-foreground">完了</span>;
      case 'planning':
      default:
        return <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">開催予定</span>;
    }
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
            <p className="font-medium text-orange-800">アーカイブされた大会データ</p>
            <p className="text-sm text-orange-700 mt-1">
              この大会は {formatDate(archivedAt)} にアーカイブされました。
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
              <h4 className="font-medium text-muted-foreground mb-2">大会名</h4>
              <p className="text-lg font-semibold">{tournament.tournament_name}</p>
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-2">ステータス</h4>
              {getStatusBadge(tournament.status)}
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-2">フォーマット</h4>
              <p className="text-foreground">{tournament.format_name || '未設定'}</p>
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-2 flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                会場
              </h4>
              <p className="text-foreground">{tournament.venue_name || '未設定'}</p>
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-2 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                参加チーム数
              </h4>
              <p className="text-foreground">{tournament.team_count}チーム</p>
            </div>
            <div>
              <h4 className="font-medium text-muted-foreground mb-2">コート数</h4>
              <p className="text-foreground">{tournament.court_count}コート</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 開催日程 */}
      {dateEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-green-600" />
              開催日程
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dateEntries.map(([dayNumber, date]) => (
                <div key={dayNumber} className="flex items-center p-3 bg-muted/50 rounded-lg">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                    {dayNumber}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">第{dayNumber}日</p>
                    <p className="font-medium text-foreground">{formatDateOnly(date as string)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 試合設定と競技詳細（拡張版） */}
      <SportSettingsCard tournament={tournament} extendedMetadata={extendedMetadata} />

      {/* 大会フォーマット詳細情報 */}
      {formatDetails && <FormatDetailsCard formatDetails={formatDetails} />}

      {/* ブロック構成情報 */}
      <BlockStructureCard extendedMetadata={extendedMetadata} />

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
            <div className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <div>
                <p className="text-sm text-orange-700 dark:text-orange-300">開始</p>
                <p className="font-medium text-orange-800 dark:text-orange-200">{formatDateOnly(tournament.recruitment_start_date)}</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-0.5 bg-orange-300 dark:bg-orange-600"></div>
              </div>
              <div>
                <p className="text-sm text-orange-700 dark:text-orange-300">終了</p>
                <p className="font-medium text-orange-800 dark:text-orange-200">{formatDateOnly(tournament.recruitment_end_date)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 日程・結果表示コンポーネント（TournamentSchedule.tsxと完全同一実装）
const ArchivedTournamentSchedule = ({ matches, teams, blockStructure }: { matches: MatchData[], teams: TeamData[], blockStructure?: BlockStructure | null }) => {
  // デバッグ情報をコンソールに出力（開発環境のみ）
  if (process.env.NODE_ENV === 'development') {
    console.log('ArchivedTournamentSchedule - matches:', matches);
    console.log('ArchivedTournamentSchedule - teams:', teams);
  }
  
  const teamMap = new Map(teams.map(t => [t.team_id, t]));

  // ブロック分類関数（TournamentSchedule.tsxと同じ）
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

  // 共通の動的色分け関数を使用
  const getBlockColor = (blockKey: string) => getUniversalBlockColor(blockKey, blockStructure);

  // 試合結果の表示（TournamentSchedule.tsxと同じ）
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
          return {
            status: 'cancelled',
            display: <span className="text-red-600 text-sm font-medium">中止</span>,
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
      return {
        status: 'walkover',
        display: <span className="text-orange-600 text-sm font-medium">不戦勝</span>,
        icon: <AlertTriangle className="h-4 w-4 text-orange-500" />
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
    const winnerIsTeam1 = match.winner_team_id === match.team1_id;
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

  // 時刻フォーマット（アーカイブデータ対応）
  const formatTime = (timeStr: string | null): string => {
    if (!timeStr) return '--:--';
    
    // 文字列に変換
    const timeString = String(timeStr).trim();
    
    // 空文字列や無効な時刻の場合のみ「--:--」を返す
    // 09:00も正当な試合時刻として扱う
    if (timeString === "" || timeString === "null" || timeString === "undefined") {
      return '--:--';
    }
    
    // 既にHH:MM形式の場合はそのまま返す
    if (timeString.length === 5 && timeString.includes(':')) {
      return timeString;
    }
    
    // YYYY-MM-DD HH:MM:SS形式の場合はHH:MMを抽出
    if (timeString.includes(' ')) {
      const timePart = timeString.split(' ')[1];
      if (timePart && timePart.includes(':')) {
        return timePart.substring(0, 5);
      }
    }
    
    // HH:MM:SS形式の場合はHH:MMを抽出
    if (timeString.includes(':')) {
      return timeString.substring(0, 5);
    }
    
    return '--:--';
  };

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
      // 予選ブロックを先に、決勝トーナメントを最後に
      const aIsFinal = a.includes('決勝');
      const bIsFinal = b.includes('決勝');
      if (aIsFinal && !bIsFinal) return 1;
      if (!aIsFinal && bIsFinal) return -1;
      return a.localeCompare(b);
    });
  };

  // 指定されたブロックの試合をフィルタリング
  const getMatchesForBlock = (blockKey: string) => {
    return matches.filter(match => getBlockKey(match) === blockKey);
  };

  // ブロックタブの短縮名を取得（スマホ表示用）
  // 汎用的ブロック短縮名取得
  const getBlockShortName = (blockKey: string): string => {
    // 決勝トーナメント
    if (blockKey.includes('決勝') || blockKey.toLowerCase().includes('final')) {
      return '決勝';
    }
    
    // 予選系のパターンマッチング
    // 「予選Aブロック」→「A」
    const prelimMatch = blockKey.match(/予選([A-Z0-9]+)/);
    if (prelimMatch) {
      return prelimMatch[1];
    }
    
    // 「グループA」→「A」
    const groupMatch = blockKey.match(/グループ([A-Z0-9]+)/i);
    if (groupMatch) {
      return groupMatch[1];
    }
    
    // 「Aブロック」→「A」
    const blockMatch = blockKey.match(/([A-Z0-9]+)ブロック/);
    if (blockMatch) {
      return blockMatch[1];
    }
    
    // 「1組」→「1組」
    const kumiMatch = blockKey.match(/^([0-9]+組)$/);
    if (kumiMatch) {
      return kumiMatch[1];
    }
    
    // 方角（東西南北）→そのまま
    if (/^[東西南北]+$/.test(blockKey)) {
      return blockKey;
    }
    
    // 1-2文字の英数字（A, B, 1, 2）→そのまま
    if (/^[A-Z0-9]{1,2}$/i.test(blockKey)) {
      return blockKey.toUpperCase();
    }
    
    // その他は最初の3文字
    return blockKey.substring(0, 3);
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {Math.max(...filteredMatches.map(m => m.court_number || 0), 0)}
            </div>
            <div className="text-sm text-muted-foreground">コート数</div>
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
        {sortedFilteredDates.map((date, dateIndex) => {
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
                      開催日 {dateIndex + 1}: {formatDateOnly(date)}
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
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
                      <span className="text-sm text-muted-foreground">
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
                                <tr key={match.match_id} className="border-b hover:bg-muted">
                                  <td className="py-2 px-2">
                                    <div className="flex items-center text-xs md:text-sm">
                                      <Clock className="h-3 w-3 mr-1 text-muted-foreground" />
                                      <span className="truncate">{formatTime(match.start_time || null)}</span>
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
                                          {teamMap.get(match.team1_id!)?.team_name || match.team1_display_name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">vs</div>
                                        <div className={`${result.winner === 'team2' ? 'font-bold text-green-600' : ''}`}>
                                          {teamMap.get(match.team2_id!)?.team_name || match.team2_display_name}
                                        </div>
                                      </div>
                                      <div className="md:hidden">
                                        {/* モバイル表示: 横並び */}
                                        <div className="flex items-center space-x-1 text-xs">
                                          <span className={`truncate max-w-[3.5rem] ${result.winner === 'team1' ? 'font-bold text-green-600' : ''}`}>
                                            {teamMap.get(match.team1_id!)?.team_name || match.team1_display_name}
                                          </span>
                                          <span className="text-muted-foreground text-xs">vs</span>
                                          <span className={`truncate max-w-[3.5rem] ${result.winner === 'team2' ? 'font-bold text-green-600' : ''}`}>
                                            {teamMap.get(match.team2_id!)?.team_name || match.team2_display_name}
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
                                      <div className="text-xs text-muted-foreground mt-1 hidden md:block">
                                        {match.remarks}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-2">
                                    {match.court_number ? (
                                      <div className="flex items-center text-xs md:text-sm">
                                        <MapPin className="h-3 w-3 mr-1 text-muted-foreground hidden md:inline" />
                                        <span className="md:hidden">C{match.court_number}</span>
                                        <span className="hidden md:inline">コート{match.court_number}</span>
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
};

// ArchivedTournamentBracket Component - Complete implementation matching TournamentBracket.tsx
const ArchivedTournamentBracket = ({ matches, teams, archived }: {
  matches: MatchData[];
  teams: TeamData[];
  archived: ArchivedData; // メタデータ含むアーカイブデータ
}) => {
  const bracketRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert archived data to BracketMatch format with proper execution_group
  if (process.env.NODE_ENV === 'development') {
    console.log('[ArchivedTournamentBracket] Input matches:', {
      totalMatches: matches.length,
      phases: [...new Set(matches.map(m => m.phase))],
      finalMatches: matches.filter(m => m.phase === 'final').length
    });
  }

  const bracketMatches: BracketMatch[] = matches
    .filter(match => match.phase === 'final')
    .map(match => {
      // execution_groupの決定（汎用的な試合コードベース）
      let execution_group = 1;
      
      // 数字部分を抽出して判定（T1, M1, Q1, SF1などに対応）
      const matchNumber = parseInt(match.match_code.match(/\d+$/)?.[0] || '1');
      
      if (matchNumber >= 1 && matchNumber <= 4) {
        execution_group = 1; // 準々決勝（1-4番）
      } else if (matchNumber >= 5 && matchNumber <= 6) {
        execution_group = 2; // 準決勝（5-6番）
      } else if (matchNumber === 7) {
        execution_group = 3; // 3位決定戦（7番）
      } else if (matchNumber === 8) {
        execution_group = 4; // 決勝（8番）
      } else {
        // フォールバック：特定のパターンに基づく分類
        if (match.match_code.includes('QF') || /[QF]\d+/.test(match.match_code)) {
          execution_group = 1; // QF1, QF2, Q1, F1など
        } else if (match.match_code.includes('SF') || /SF\d+/.test(match.match_code)) {
          execution_group = 2; // SF1, SF2など
        } else if (match.match_code.includes('3RD') || match.match_code.includes('THIRD')) {
          execution_group = 3; // 3RD, THIRD
        } else if (match.match_code.includes('FINAL') || match.match_code === 'F') {
          execution_group = 4; // FINAL, F
        }
      }

      return {
        match_id: match.match_id,
        match_code: match.match_code,
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        team1_display_name: (() => {
          // チーム略称を優先して表示
          const team1 = teams.find(t => t.team_id === match.team1_id);
          return (team1?.team_omission || team1?.team_name || match.team1_display_name);
        })(),
        team2_display_name: (() => {
          // チーム略称を優先して表示  
          const team2 = teams.find(t => t.team_id === match.team2_id);
          return (team2?.team_omission || team2?.team_name || match.team2_display_name);
        })(),
        team1_goals: (() => {
          // 堅牢化されたPK検出ロジックを使用して通常時間得点を計算
          if (match.team1_scores && typeof match.team1_scores === 'string') {
            const team1PK = detectPKFromScoreString(match.team1_scores);
            return team1PK.totalRegularGoals;
          }
          return match.team1_goals || 0;
        })(),
        team2_goals: (() => {
          // 堅牢化されたPK検出ロジックを使用して通常時間得点を計算
          if (match.team2_scores && typeof match.team2_scores === 'string') {
            const team2PK = detectPKFromScoreString(match.team2_scores);
            return team2PK.totalRegularGoals;
          }
          return match.team2_goals || 0;
        })(),
        winner_team_id: match.winner_team_id,
        is_draw: match.is_draw === 1,
        is_walkover: match.is_walkover === 1,
        match_status: (match.has_result === 1 ? 'completed' : 'scheduled') as 'scheduled' | 'ongoing' | 'completed' | 'cancelled',
        is_confirmed: match.has_result === 1,
        execution_priority: execution_group,
        start_time: match.start_time,
        court_number: match.court_number,
        execution_group: execution_group,
        // PK戦データを設定（堅牢化されたPK検出ロジック使用）
        soccer_data: (() => {
          if (match.team1_scores && match.team2_scores && 
              typeof match.team1_scores === 'string' && typeof match.team2_scores === 'string') {
            
            // アーカイブメタデータからルール情報を取得（オプション）
            const tournamentRules = archived.metadata?.tournament_rules;
            let rulePeriods: string[] | undefined;
            
            if (tournamentRules) {
              // メタデータからactive_periodsを再構築
              rulePeriods = ['1', '2']; // 前半・後半は必須
              if (tournamentRules.has_extra_time) {
                rulePeriods.push('3', '4'); // 延長前半・延長後半
              }
              if (tournamentRules.supports_pk) {
                rulePeriods.push('5'); // PK戦
              }
            }
            
            // 堅牢化されたPK検出ロジックを使用
            const pkResult = determinePKWinner(match.team1_scores, match.team2_scores, rulePeriods);
            
            // デバッグログ（開発用）
            if (match.match_code === 'M1' || match.match_code === 'M7') {
              console.log(`[ArchivedTournamentBracket] ${match.match_code} 堅牢PK検出:`, {
                matchCode: match.match_code,
                team1_scores: match.team1_scores,
                team2_scores: match.team2_scores,
                rulePeriods,
                team1PK: pkResult.team1PK,
                team2PK: pkResult.team2PK,
                isActualPKGame: pkResult.isActualPKGame,
                pkWinnerIsTeam1: pkResult.pkWinnerIsTeam1
              });
            }
            
            // PK戦が実際に行われた場合のみsoccer_dataを返す
            if (pkResult.isActualPKGame) {
              return {
                regular_goals_for: pkResult.team1PK.totalRegularGoals,   // チーム1の通常時間得点
                regular_goals_against: pkResult.team2PK.totalRegularGoals, // チーム2の通常時間得点
                pk_goals_for: pkResult.team1PK.pkGoals,                  // チーム1のPK得点
                pk_goals_against: pkResult.team2PK.pkGoals,              // チーム2のPK得点
                is_pk_game: true,                                        // PK戦フラグ
                pk_winner: pkResult.pkWinnerIsTeam1 ?? undefined,       // PK戦勝者（true=チーム1, false=チーム2, undefined=引分）
                detection_method: `${pkResult.team1PK.detectionMethod}/${pkResult.team2PK.detectionMethod}` // デバッグ用
              };
            }
          }
          return undefined;
        })()
      };
    });

  // Debug: Verify execution_group values
  // BracketMatches ログ削除（本番不要）

  interface BracketMatch {
    match_id: number;
    match_code: string;
    team1_id?: string;
    team2_id?: string;
    team1_display_name: string;
    team2_display_name: string;
    team1_goals: number;
    team2_goals: number;
    team1_scores?: number[];
    team2_scores?: number[];
    active_periods?: number[];
    winner_team_id?: string;
    is_draw: boolean;
    is_walkover: boolean;
    match_status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
    is_confirmed: boolean;
    execution_priority: number;
    start_time?: string;
    court_number?: number;
    execution_group?: number;
    soccer_data?: {
      regular_goals_for: number;
      regular_goals_against: number;
      pk_goals_for?: number;
      pk_goals_against?: number;
      is_pk_game: boolean;
      pk_winner?: boolean;
    };
  }

  interface SportScoreConfig {
    sport_code: string;
    score_label: string;
    score_against_label: string;
    difference_label: string;
    supports_pk: boolean;
  }

  interface BracketGroup {
    groupId: number;
    groupName: string;
    matches: BracketMatch[];
  }

  interface BracketStructure {
    groups: BracketGroup[];
    columnCount: number;
  }

  // Default sport config for PK championship
  const sportConfig: SportScoreConfig = {
    sport_code: 'pk_championship',
    score_label: '得点',
    score_against_label: '失点',
    difference_label: '得失差',
    supports_pk: false
  };

  // Match Card Component
  function MatchCard({ 
    match,
    className = "",
    ...props
  }: { 
    match: BracketMatch;
    className?: string;
    [key: string]: unknown;
  }) {
    // MatchCard props ログ削除（本番不要）
    const getWinnerTeam = () => {
      if (!match.winner_team_id || !match.is_confirmed) return null;
      if (match.winner_team_id === match.team1_id) return 0;
      if (match.winner_team_id === match.team2_id) return 1;
      return null;
    };

    const getScoreDisplay = (teamIndex: number) => {
      if (!hasResult || match.is_walkover) return null;

      // PK戦データがある場合の特別処理
      if (match.soccer_data && match.soccer_data.is_pk_game) {
        console.log('[ArchivedTournamentBracket] getScoreDisplay PK:', {
          matchCode: match.match_code,
          teamIndex,
          soccer_data: match.soccer_data
        });
        
        if (teamIndex === 0) {
          // team1の場合：for = チーム1のスコア
          return {
            regular: match.soccer_data.regular_goals_for,
            pk: match.soccer_data.pk_goals_for || 0,
            isPkMatch: true
          };
        } else {
          // team2の場合：against = チーム2のスコア
          return {
            regular: match.soccer_data.regular_goals_against,
            pk: match.soccer_data.pk_goals_against || 0,
            isPkMatch: true
          };
        }
      }
      
      // 通常の場合
      const goals = teamIndex === 0 ? match.team1_goals : match.team2_goals;
      return {
        regular: goals || 0,
        isPkMatch: false
      };
    };
    
    const hasResult = match.is_confirmed && (
      match.team1_goals !== null || 
      match.team2_goals !== null || 
      match.is_draw || 
      match.is_walkover
    );

    const getMatchCodeColor = (matchCode: string): string => {
      if (['M1', 'M2', 'M3', 'M4'].includes(matchCode)) return 'bg-blue-100 text-blue-800';
      if (['M5', 'M6'].includes(matchCode)) return 'bg-purple-100 text-purple-800';
      if (matchCode === 'M7') return 'bg-yellow-100 text-yellow-800';
      if (matchCode === 'M8') return 'bg-red-100 text-red-800';
      if (['T1', 'T2', 'T3', 'T4'].includes(matchCode)) return 'bg-blue-100 text-blue-800';
      if (['T5', 'T6'].includes(matchCode)) return 'bg-purple-100 text-purple-800';
      if (matchCode === 'T7') return 'bg-yellow-100 text-yellow-800';
      if (matchCode === 'T8') return 'bg-red-100 text-red-800';
      return 'bg-muted text-muted-foreground';
    };

    const winnerIndex = getWinnerTeam();

    return (
      <div className={`relative bg-card border border-border rounded-lg p-3 shadow-sm ${className}`} {...props}>
        <div className={`absolute -top-2 left-3 border px-2 py-1 rounded-full text-xs font-medium ${getMatchCodeColor(match.match_code)}`}>
          {match.match_code}
        </div>
        
        <div className={`flex items-center justify-between h-8 px-3 mb-2 border border-border rounded cursor-default transition-all ${
          winnerIndex === 0 
            ? 'bg-green-50 text-green-600 border-green-300 font-medium' 
            : hasResult && winnerIndex === 1
            ? 'bg-red-50 text-red-600 border-red-300' 
            : hasResult && match.is_draw
            ? 'bg-blue-50 text-blue-600 border-blue-300'
            : 'bg-muted text-muted-foreground'
        }`}>
          <span className="text-sm truncate flex-1">
            {winnerIndex === 0 && hasResult ? '👑 ' : ''}{match.team1_display_name || '未確定'}
          </span>
          {hasResult && !match.is_draw && (() => {
            const scoreData = getScoreDisplay(0);
            if (!scoreData) return null;
            return (
              <span className="text-sm font-bold ml-2">
                {scoreData.isPkMatch ? (
                  <span className="flex flex-col items-end text-xs">
                    <span>{scoreData.regular}</span>
                    <span className="text-[10px] text-muted-foreground">PK{scoreData.pk}</span>
                  </span>
                ) : (
                  scoreData.regular
                )}
              </span>
            );
          })()}
          {hasResult && match.is_draw && (() => {
            const scoreData = getScoreDisplay(0);
            if (!scoreData) return null;
            return (
              <span className="text-sm font-bold ml-2 text-blue-600">
                {scoreData.isPkMatch ? (
                  <span className="flex flex-col items-end text-xs">
                    <span>{scoreData.regular}</span>
                    <span className="text-[10px] text-muted-foreground">PK{scoreData.pk}</span>
                  </span>
                ) : (
                  scoreData.regular
                )}
              </span>
            );
          })()}
        </div>

        <div className={`flex items-center justify-between h-8 px-3 border border-border rounded cursor-default transition-all ${
          winnerIndex === 1 
            ? 'bg-green-50 text-green-600 border-green-300 font-medium' 
            : hasResult && winnerIndex === 0
            ? 'bg-red-50 text-red-600 border-red-300' 
            : hasResult && match.is_draw
            ? 'bg-blue-50 text-blue-600 border-blue-300'
            : 'bg-muted text-muted-foreground'
        }`}>
          <span className="text-sm truncate flex-1">
            {winnerIndex === 1 && hasResult ? '👑 ' : ''}{match.team2_display_name || '未確定'}
          </span>
          {hasResult && !match.is_draw && (() => {
            const scoreData = getScoreDisplay(1);
            if (!scoreData) return null;
            return (
              <span className="text-sm font-bold ml-2">
                {scoreData.isPkMatch ? (
                  <span className="flex flex-col items-end text-xs">
                    <span>{scoreData.regular}</span>
                    <span className="text-[10px] text-muted-foreground">PK{scoreData.pk}</span>
                  </span>
                ) : (
                  scoreData.regular
                )}
              </span>
            );
          })()}
          {hasResult && match.is_draw && (() => {
            const scoreData = getScoreDisplay(1);
            if (!scoreData) return null;
            return (
              <span className="text-sm font-bold ml-2 text-blue-600">
                {scoreData.isPkMatch ? (
                  <span className="flex flex-col items-end text-xs">
                    <span>{scoreData.regular}</span>
                    <span className="text-[10px] text-muted-foreground">PK{scoreData.pk}</span>
                  </span>
                ) : (
                  scoreData.regular
                )}
              </span>
            );
          })()}
        </div>

        <div className="mt-2 text-center">
          {match.match_status === 'completed' && match.is_confirmed ? (
            <span className="text-xs bg-blue-50 text-blue-600 border border-blue-300 px-2 py-1 rounded-full">
              結果確定
            </span>
          ) : match.match_status === 'ongoing' ? (
            <span className="text-xs bg-orange-50 text-orange-600 border border-orange-300 px-2 py-1 rounded-full animate-pulse">
              試合中
            </span>
          ) : match.match_status === 'completed' ? (
            <span className="text-xs bg-purple-50 text-purple-600 border border-purple-300 px-2 py-1 rounded-full">
              試合完了
            </span>
          ) : (
            <span className="text-xs bg-muted text-muted-foreground border border-border px-2 py-1 rounded-full">
              未実施
            </span>
          )}
        </div>
      </div>
    );
  }

  // Tournament structure organization
  const organizeBracket = (matches: BracketMatch[]): BracketStructure => {
    const hasExecutionGroup = matches.some(m => m.execution_group !== null && m.execution_group !== undefined);
    
    // Debug: Check execution_group detection
    console.log('[ArchivedTournamentBracket] organizeBracket:', {
      matchCount: matches.length,
      hasExecutionGroup,
      executionGroups: matches.map(m => ({ code: m.match_code, group: m.execution_group }))
    });
    
    if (!hasExecutionGroup) {
      const groups: BracketGroup[] = [];
      
      const quarterFinals = matches.filter(m => {
        const num = parseInt(m.match_code.match(/\d+$/)?.[0] || '0');
        return (num >= 1 && num <= 4) || m.match_code.includes('QF') || /[QF]\d+/.test(m.match_code);
      });
      const semiFinals = matches.filter(m => {
        const num = parseInt(m.match_code.match(/\d+$/)?.[0] || '0');
        return (num >= 5 && num <= 6) || m.match_code.includes('SF') || /SF\d+/.test(m.match_code);
      });
      const thirdPlace = matches.find(m => {
        const num = parseInt(m.match_code.match(/\d+$/)?.[0] || '0');
        return num === 7 || m.match_code.includes('3RD') || m.match_code.includes('THIRD');
      });
      const final = matches.find(m => {
        const num = parseInt(m.match_code.match(/\d+$/)?.[0] || '0');
        return num === 8 || m.match_code.includes('FINAL') || m.match_code === 'F';
      });
      
      if (quarterFinals.length > 0) {
        groups.push({
          groupId: 1,
          groupName: '準々決勝',
          matches: quarterFinals.sort((a, b) => a.match_code.localeCompare(b.match_code))
        });
      }
      
      if (semiFinals.length > 0) {
        groups.push({
          groupId: 2,
          groupName: '準決勝',
          matches: semiFinals.sort((a, b) => a.match_code.localeCompare(b.match_code))
        });
      }
      
      if (thirdPlace) {
        groups.push({
          groupId: 3,
          groupName: '3位決定戦',
          matches: [thirdPlace]
        });
      }
      
      if (final) {
        groups.push({
          groupId: 4,
          groupName: '決勝',
          matches: [final]
        });
      }
      
      return { groups, columnCount: groups.length };
    }

    const groupMap = new Map<number, BracketMatch[]>();
    
    matches.forEach(match => {
      const groupId = match.execution_group!;
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, []);
      }
      groupMap.get(groupId)!.push(match);
    });

    const getGroupName = (groupId: number, matchCount: number, matches: BracketMatch[]): string => {
      // 汎用的な判定（数字ベース + パターンマッチング）
      const hasQuarterFinals = matches.some(m => {
        const num = parseInt(m.match_code.match(/\d+$/)?.[0] || '0');
        return (num >= 1 && num <= 4) || m.match_code.includes('QF') || /[QF]\d+/.test(m.match_code);
      });
      
      const hasSemiFinals = matches.some(m => {
        const num = parseInt(m.match_code.match(/\d+$/)?.[0] || '0');
        return (num >= 5 && num <= 6) || m.match_code.includes('SF') || /SF\d+/.test(m.match_code);
      });
      
      const hasThirdPlace = matches.some(m => {
        const num = parseInt(m.match_code.match(/\d+$/)?.[0] || '0');
        return num === 7 || m.match_code.includes('3RD') || m.match_code.includes('THIRD');
      });
      
      const hasFinal = matches.some(m => {
        const num = parseInt(m.match_code.match(/\d+$/)?.[0] || '0');
        return num === 8 || m.match_code.includes('FINAL') || m.match_code === 'F';
      });
      
      if (hasQuarterFinals) return '準々決勝';
      if (hasSemiFinals) return '準決勝';
      if (hasThirdPlace) return '3位決定戦';
      if (hasFinal) return '決勝';
      
      // フォールバック：試合数ベース
      if (matchCount >= 4) return '準々決勝';
      if (matchCount === 2) return '準決勝';
      if (matchCount === 1) {
        return hasThirdPlace ? '3位決定戦' : '決勝';
      }
      return `グループ${groupId}`;
    };

    const groups: BracketGroup[] = Array.from(groupMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([groupId, matches]) => ({
        groupId,
        groupName: getGroupName(groupId, matches.length, matches),
        matches: matches.sort((a, b) => a.match_code.localeCompare(b.match_code))
      }));

    return {
      groups,
      columnCount: groups.length
    };
  };

  const bracket = organizeBracket(bracketMatches);

  // Debug: Check bracket structure
  console.log('[ArchivedTournamentBracket] Bracket structure:', {
    columnCount: bracket.columnCount,
    groups: bracket.groups.map(g => ({
      groupId: g.groupId,
      groupName: g.groupName,
      matchCount: g.matches.length,
      matchCodes: g.matches.map(m => m.match_code)
    }))
  });

  // SVG drawing functions
  const drawLines = useCallback(() => {
    console.log('[ArchivedTournamentBracket] drawLines called');
    if (!bracketRef.current || !svgRef.current) {
      console.log('[ArchivedTournamentBracket] Missing refs:', { 
        bracketRef: !!bracketRef.current, 
        svgRef: !!svgRef.current 
      });
      return;
    }
    
    const svg = svgRef.current;
    const bracketElement = bracketRef.current;
    
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    const box = bracketElement.getBoundingClientRect();
    
    const midRight = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.right - box.left, y: r.top - box.top + r.height / 2 };
    };
    
    const midLeft = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top + r.height / 2 };
    };
    
    const addPath = (fromId: string, toId: string, avoidThirdPlace = false) => {
      const from = bracketElement.querySelector(`[data-match="${fromId}"]`) as HTMLElement;
      const to = bracketElement.querySelector(`[data-match="${toId}"]`) as HTMLElement;
      
      console.log('[ArchivedTournamentBracket] addPath called:', { fromId, toId, hasFrom: !!from, hasTo: !!to });
      
      if (!from || !to) {
        console.log('[ArchivedTournamentBracket] Missing elements for path:', { fromId, toId });
        return;
      }
      
      const p1 = midRight(from);
      const p2 = midLeft(to);
      
      let d: string;
      
      if (avoidThirdPlace) {
        const thirdPlaceCard = bracketElement.querySelector(`[data-match="T7"]`) || 
                               bracketElement.querySelector(`[data-match="M7"]`) as HTMLElement;
        
        if (thirdPlaceCard) {
          const thirdPlaceRect = thirdPlaceCard.getBoundingClientRect();
          const boxRect = bracketElement.getBoundingClientRect();
          
          const thirdPlaceTop = thirdPlaceRect.top - boxRect.top;
          const thirdPlaceBottom = thirdPlaceRect.bottom - boxRect.top;
          
          const avoidanceGap = 20;
          let avoidanceY: number;
          
          if (p1.y < thirdPlaceTop + (thirdPlaceRect.height / 2)) {
            avoidanceY = thirdPlaceTop - avoidanceGap;
          } else {
            avoidanceY = thirdPlaceBottom + avoidanceGap;
          }
          
          const midX1 = p1.x + 30;
          const midX2 = p2.x - 30;
          
          d = `M ${p1.x} ${p1.y} L ${midX1} ${p1.y} L ${midX1} ${avoidanceY} L ${midX2} ${avoidanceY} L ${midX2} ${p2.y} L ${p2.x} ${p2.y}`;
        } else {
          const midX = p1.x + ((p2.x - p1.x) * 0.5);
          d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
        }
      } else {
        const midX = p1.x + ((p2.x - p1.x) * 0.5);
        d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
      }
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', 'hsl(var(--muted-foreground))');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'transparent');
      
      console.log('[ArchivedTournamentBracket] SVG path created:', { fromId, toId, d });
      
      svg.appendChild(path);
    };
    
    bracket.groups.forEach((group) => {
      const targetGroups: BracketGroup[] = [];
      
      if (group.groupName.includes('準々決勝')) {
        const semiFinalGroup = bracket.groups.find(g => g.groupName.includes('準決勝'));
        if (semiFinalGroup) targetGroups.push(semiFinalGroup);
      } else if (group.groupName.includes('準決勝')) {
        const finalGroup = bracket.groups.find(g => g.groupName === '決勝');
        if (finalGroup) targetGroups.push(finalGroup);
      }
      
      targetGroups.forEach(targetGroup => {
        group.matches.forEach((match, matchIndex) => {
          const targetGroupMatches = targetGroup.matches.length;
          const targetMatchIndex = Math.floor(matchIndex / Math.ceil(group.matches.length / targetGroupMatches));
          
          if (targetMatchIndex < targetGroupMatches) {
            const fromDataMatch = `G${group.groupId}M${matchIndex + 1}`;
            const toDataMatch = `G${targetGroup.groupId}M${targetMatchIndex + 1}`;
            
            const avoidThirdPlace = group.groupName.includes('準決勝') && targetGroup.groupName.includes('決勝');
            addPath(fromDataMatch, toDataMatch, avoidThirdPlace);
          }
        });
      });
    });
    
    svg.setAttribute('width', Math.ceil(box.width).toString());
    svg.setAttribute('height', Math.ceil(box.height).toString());
    svg.setAttribute('viewBox', `0 0 ${Math.ceil(box.width)} ${Math.ceil(box.height)}`);
  }, [bracket.groups]);

  useEffect(() => {
    const handleResize = () => drawLines();
    window.addEventListener('resize', handleResize);
    
    setTimeout(drawLines, 100);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [bracketMatches, drawLines]);

  const handlePrint = () => {
    window.print();
  };

  if (bracketMatches.length === 0) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground text-lg mb-2">この大会にはトーナメント戦がありません</p>
        <p className="text-muted-foreground text-sm">この大会は予選リーグ戦のみで構成されています。</p>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        @page { 
          size: A4 landscape; 
          margin: 4mm; 
        }
        
        @media print {
          .no-print { 
            display: none !important; 
          }
          
          body { 
            background: white !important; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            font-size: 12px !important;
          }
          
          .print-container { 
            overflow: visible !important; 
            box-shadow: none !important; 
            border: none !important;
            transform: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8px !important;
          }
          
          * { 
            line-height: 1.2 !important; 
            font-weight: 500 !important;
          }
          
          [data-match] { 
            break-inside: avoid !important; 
            page-break-inside: avoid !important; 
            border: 1px solid #666 !important;
            background: white !important;
          }
          
          [data-match] .text-sm {
            font-size: 10px !important;
            font-weight: 600 !important;
          }
          
          [data-match] .text-xs {
            font-size: 9px !important;
            font-weight: 700 !important;
          }
          
          svg path {
            stroke: #333 !important;
            stroke-width: 2px !important;
          }
          
          .absolute { 
            transform: translateZ(0); 
          }
          
          h3 {
            font-size: 11px !important;
            font-weight: 700 !important;
            margin-bottom: 6px !important;
          }
          
          .space-y-6 > * + * {
            margin-top: 18px !important;
          }
          
          .gap-10 {
            gap: 32px !important;
          }
        }
      `}</style>

      <div className="space-y-6">
        <div className="text-center no-print">
          <div className="flex items-center justify-center mb-2">
            <Trophy className="h-6 w-6 mr-2 text-yellow-600" />
            <h2 className="text-2xl font-bold text-foreground">決勝トーナメント</h2>
            <Button
              onClick={handlePrint}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 ml-4"
            >
              <Download className="h-4 w-4" />
              PDF出力（印刷）
            </Button>
          </div>
          <p className="text-muted-foreground">各ブロック上位2チームによるトーナメント表</p>
        </div>

        <div className="print-container relative bg-card border border-border rounded-lg p-6 shadow-sm overflow-x-auto">
        <div 
          ref={bracketRef}
          className="relative grid gap-10 min-w-fit"
          style={{ 
            gridTemplateColumns: `repeat(${bracket.columnCount}, minmax(200px, 1fr))`,
            minWidth: `${bracket.columnCount * 220 + (bracket.columnCount - 1) * 40}px`,
            minHeight: `${(() => {
              const maxMatchCount = Math.max(...bracket.groups.map(g => g.matches.length));
              const cardHeight = 140;
              const cardGap = 24;
              const headerHeight = 44;
              const paddingBottom = 100;
              
              return headerHeight + (maxMatchCount * cardHeight) + ((maxMatchCount - 1) * cardGap) + paddingBottom + 200;
            })()}px`
          }}
        >
          <svg 
            ref={svgRef}
            className="absolute inset-0 pointer-events-none" 
            style={{ zIndex: 1 }}
          />

          {bracket.groups.map((group, groupIndex) => {
            const getGroupColor = (groupName: string) => {
              if (groupName.includes('準々決勝')) return 'bg-blue-100 text-blue-800';
              if (groupName.includes('準決勝')) return 'bg-purple-100 text-purple-800';
              if (groupName.includes('3位決定戦')) return 'bg-yellow-100 text-yellow-800';
              if (groupName.includes('決勝')) return 'bg-red-100 text-red-800';
              return 'bg-muted text-muted-foreground';
            };

            return (
              <div key={group.groupId} style={{ zIndex: 2 }}>
                <h3 className={`text-sm font-medium px-3 py-1 rounded-full text-center tracking-wide mb-6 ${getGroupColor(group.groupName)}`}>
                  {group.groupName}
                </h3>
                
                {groupIndex === 0 ? (
                  <div className="space-y-6">
                    {group.matches.map((match, matchIndex) => (
                      <MatchCard 
                        key={match.match_id} 
                        match={match}
                        className="h-fit"
                        data-match={`G${group.groupId}M${matchIndex + 1}`}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="relative">
                    {group.matches.map((match, matchIndex) => {
                      const cardHeight = 140;
                      const cardGap = 24;
                      const headerHeight = 44;
                      
                      let topMargin = 0;
                      
                      if (group.groupName === '決勝' || group.groupName === '3位決定戦') {
                        const semiFinalGroup = bracket.groups.find(g => g.groupName.includes('準決勝'));
                        
                        if (semiFinalGroup && semiFinalGroup.matches.length >= 2) {
                          const quarterFinalGroup = bracket.groups.find(g => g.groupName.includes('準々決勝'));
                          let semiFinalBaseY = 0;
                          
                          if (quarterFinalGroup && quarterFinalGroup.matches.length >= 2) {
                            const actualGap = 24;
                            const qf1CenterY = (cardHeight / 2);
                            const qf2CenterY = cardHeight + actualGap + (cardHeight / 2);
                            const qfCenterY = (qf1CenterY + qf2CenterY) / 2;
                            semiFinalBaseY = qfCenterY - (cardHeight / 2);
                          }
                          
                          const t5TopMargin = semiFinalBaseY;
                          const t6TopMargin = semiFinalBaseY + cardHeight + cardGap;
                          
                          const t5CenterY = t5TopMargin + (cardHeight / 2);
                          const t6CenterY = t6TopMargin + (cardHeight / 2);
                          
                          const semiFinalCenterY = (t5CenterY + t6CenterY) / 2;
                          
                          if (group.groupName === '決勝') {
                            const fineAdjustment = 20;
                            topMargin = semiFinalCenterY - (cardHeight / 2) + fineAdjustment;
                          } else if (group.groupName === '3位決定戦') {
                            const semiFinalHeight = t6CenterY - t5CenterY;
                            const dynamicSeparationOffset = Math.max(
                              semiFinalHeight * 0.8,
                              120
                            );
                            topMargin = t6CenterY + (cardHeight / 2) + dynamicSeparationOffset;
                          }
                        } else {
                          const prevGroup = bracket.groups[groupIndex - 1];
                          const matchesPerGroup = Math.ceil(prevGroup.matches.length / group.matches.length);
                          const startIdx = matchIndex * matchesPerGroup;
                          const endIdx = Math.min(startIdx + matchesPerGroup, prevGroup.matches.length);
                          const avgPosition = (startIdx + endIdx - 1) / 2;
                          const centerPosition = headerHeight + (cardHeight / 2) + (avgPosition * (cardHeight + cardGap));
                          topMargin = centerPosition - headerHeight - (cardHeight / 2);
                        }
                      } else {
                        const prevGroup = bracket.groups[groupIndex - 1];
                        const matchesPerGroup = Math.ceil(prevGroup.matches.length / group.matches.length);
                        const startIdx = matchIndex * matchesPerGroup;
                        const endIdx = Math.min(startIdx + matchesPerGroup, prevGroup.matches.length);
                        const avgPosition = (startIdx + endIdx - 1) / 2;
                        const centerPosition = headerHeight + (cardHeight / 2) + (avgPosition * (cardHeight + cardGap));
                        topMargin = centerPosition - headerHeight - (cardHeight / 2);
                      }
                      
                      return (
                        <div 
                          key={match.match_id}
                          className="absolute w-full"
                          style={{ top: `${topMargin}px` }}
                        >
                          <MatchCard 
                            match={match}
                            className="h-fit"
                            data-match={`G${group.groupId}M${matchIndex + 1}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="h-2 w-2 bg-green-400 rounded-full"></div>
              </div>
              <div className="text-sm text-green-700">
                <p className="font-medium mb-1">PDF出力方法</p>
                <ul className="list-disc list-inside space-y-1 text-green-600">
                  <li>「PDF出力（印刷）」ボタンをクリック</li>
                  <li>印刷ダイアログで「送信先」を「PDFに保存」を選択</li>
                  <li>用紙サイズを「A4」、向きを「横」に設定</li>
                  <li>「詳細設定」で「背景のグラフィック」をオンにする</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="h-2 w-2 bg-blue-400 rounded-full"></div>
              </div>
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">トーナメント表の見方</p>
                <ul className="list-disc list-inside space-y-1 text-blue-600">
                  <li>実線は勝利チームの勝ち上がり、点線は敗者の進出先（3位決定戦）</li>
                  <li>太字は勝利チーム、数字は{sportConfig?.score_label || '得点'}を表示</li>
                  <li>［T1］などは試合コードを表示</li>
                  <li>各ブロック上位2チームが決勝トーナメントに進出</li>
                  {sportConfig?.supports_pk && (
                    <li>サッカーの場合、通常時間とPK戦の{sportConfig.score_label}を分けて表示</li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  );
};

// ArchivedTournamentResults Component - Exact implementation of TournamentResults.tsx
const ArchivedTournamentResults = ({ _results, teams, standings, blockStructure }: { 
  _results: ResultData[], 
  teams: TeamData[],
  standings: BlockStanding[],
  blockStructure?: BlockStructure | null
}) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  
  // デバッグ: standingsデータの詳細を出力
  console.log('[DEBUG] ArchivedTournamentResults standings:', standings);
  standings.forEach((standing, index) => {
    console.log(`[DEBUG] Standing ${index}:`, {
      block_name: standing.block_name,
      phase: standing.phase,
      hasRemarks: !!standing.remarks,
      remarks: standing.remarks
    });
  });

  // Sport config for archived data
  const sportConfig = {
    sport_code: 'pk_championship',
    score_label: '得点',
    score_against_label: '失点',
    difference_label: '得失差',
    supports_pk: false
  };

  // Block classification function (same as TournamentResults.tsx)
  const getBlockKey = (phase: string, blockName: string, matchCode?: string): string => {
    if (phase === 'preliminary') {
      if (blockName) {
        return `予選${blockName}ブロック`;
      }
      if (matchCode) {
        const blockMatch = matchCode.match(/([ABCD])\d+/);
        if (blockMatch) {
          return `予選${blockMatch[1]}ブロック`;
        }
      }
      return '予選リーグ';
    } else if (phase === 'final') {
      return '決勝トーナメント';
    } else {
      return phase || 'その他';
    }
  };

  // Block color function (same as TournamentResults.tsx)
  // 共通の動的色分け関数を使用
  const getBlockColor = (blockKey: string) => getUniversalBlockColor(blockKey, blockStructure);

  // Preliminary phase detection
  const isPreliminaryPhase = (phase: string): boolean => {
    return phase === 'preliminary' || phase.includes('予選') || phase.includes('リーグ');
  };

  // Get standings for specific block
  const getStandingsForBlock = (blockName: string): TeamStanding[] => {
    // ブロック名ベースで検索（アーカイブデータでは match_block_id が信頼できない場合がある）
    const blockStanding = standings.find(s => s.block_name === blockName);
    if (blockStanding && blockStanding.team_rankings) {
      try {
        if (typeof blockStanding.team_rankings === 'string') {
          return JSON.parse(blockStanding.team_rankings);
        } else if (Array.isArray(blockStanding.team_rankings)) {
          return blockStanding.team_rankings;
        }
      } catch (e) {
        console.warn(`順位表データのパースに失敗 (${blockName}):`, e);
      }
    }
    return [];
  };

  // Get team standing for specific team in block
  const getTeamStanding = (teamId: string, blockName: string): TeamStanding | undefined => {
    const blockTeams = getStandingsForBlock(blockName);
    return blockTeams.find((team: TeamStanding) => team.team_id === teamId);
  };

  // Position icons (same as TournamentResults.tsx)
  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 2:
        return <Medal className="h-4 w-4 text-muted-foreground" />;
      case 3:
        return <Award className="h-4 w-4 text-amber-600" />;
      default:
        return <Hash className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Create a pseudo-results structure from archived data
  interface BlockResults {
    match_block_id: number;
    phase: string;
    block_name: string;
    display_round_name: string;
    teams: TeamData[];
    matches: MatchData[];
    match_matrix: Record<string, Record<string, { result: string | null; score: string; match_code: string; }>>
    remarks: string | null;
  }

  // Use archived results data if available, otherwise create placeholder data
  const getBlockResults = (): BlockResults[] => {
    // アーカイブされたresultsデータから戦績表を生成（予選リーグのみ）
    if (_results && Array.isArray(_results) && _results.length > 0) {
      // block_nameでグループ化（決勝トーナメントを除外）
      const blockMap: Record<string, ResultData[]> = {};
      _results.forEach((result: ResultData) => {
        const blockName = result.block_name || 'default';
        // 決勝トーナメントは戦績表に含めない（複数の条件でチェック）
        if (blockName === '決勝トーナメント' || 
            blockName === 'final' || 
            blockName.includes('決勝') ||
            (result.match_code && /^T\d+$/.test(result.match_code))) {
          return;
        }
        // 予選リーグのみ戦績表に含める（汎用的判定）
        const isPreliminaryBlock = (name: string): boolean => {
          // 決勝・準決勝・3位決定戦などは除外
          if (name.includes('決勝') || name.toLowerCase().includes('final') || 
              name.includes('準決勝') || name.toLowerCase().includes('semifinal') ||
              name.includes('準々決勝') || name.toLowerCase().includes('quarterfinal') ||
              name.includes('3位決定戦') || name.toLowerCase().includes('third')) {
            return false;
          }
          
          // 予選・グループ・ブロック・リーグ関連のキーワードを含む場合
          if (name.includes('予選') || name.toLowerCase().includes('preliminary') ||
              name.includes('グループ') || name.toLowerCase().includes('group') ||
              name.includes('ブロック') || name.toLowerCase().includes('block') ||
              name.includes('リーグ') || name.toLowerCase().includes('league')) {
            return true;
          }
          
          // 1-2文字の英数字（A, B, C, D, 1, 2, 3...）
          if (/^[A-Z0-9]{1,2}$/.test(name)) return true;
          
          // 数字+ブロック/グループ（「1組」「2グループ」など）
          if (/^[0-9]+[組グループ]$/.test(name)) return true;
          
          // 漢字の方角（東西南北）
          if (/^[東西南北]+$/.test(name)) return true;
          
          return false;
        };
        
        if (isPreliminaryBlock(blockName)) {
          if (!blockMap[blockName]) blockMap[blockName] = [];
          blockMap[blockName].push(result);
        }
      });
      
      return Object.entries(blockMap).map(([blockName, blockResults], index) => {
        // チームを抽出
        const teamSet = new Set<string>();
        const teamNames: Record<string, string> = {};
        blockResults.forEach((result) => {
          if (result.team1_id && result.team1_name) {
            teamSet.add(result.team1_id);
            teamNames[result.team1_id] = result.team1_name;
          }
          if (result.team2_id && result.team2_name) {
            teamSet.add(result.team2_id);
            teamNames[result.team2_id] = result.team2_name;
          }
        });
        
        const blockTeams = Array.from(teamSet).map(teamId => {
          // teamsデータから該当チームの詳細情報（略称含む）を取得
          const teamDetail = teams.find(t => t.team_id === teamId);
          return {
            team_id: teamId,
            team_name: teamDetail?.team_name || teamNames[teamId] || `チーム${teamId}`,
            team_omission: teamDetail?.team_omission || teamDetail?.team_name || teamNames[teamId] || `チーム${teamId}`,
            assigned_block: blockName,
            block_position: 1,
            players: []
          };
        });
        
        // 戦績マトリックス生成
        const matchMatrix: Record<string, Record<string, { result: string | null; score: string; match_code: string; }>> = {};
        blockTeams.forEach(team1 => {
          matchMatrix[team1.team_id] = {};
          blockTeams.forEach(team2 => {
            if (team1.team_id === team2.team_id) {
              matchMatrix[team1.team_id][team2.team_id] = { 
                result: null, 
                score: '-', 
                match_code: '-' 
              };
            } else {
              // 試合結果を探す
              const match = blockResults.find((r: ResultData) => 
                (r.team1_id === team1.team_id && r.team2_id === team2.team_id) ||
                (r.team1_id === team2.team_id && r.team2_id === team1.team_id)
              );
              
              if (match) {
                // 試合が見つかった場合の処理
                if (match.winner_team_id || match.is_draw) {
                  // 結果が確定している場合
                  let result: 'win' | 'loss' | 'draw';
                  let score: string;
                  
                  if (match.is_walkover) {
                    // 不戦勝/不戦敗
                    if (match.winner_team_id === team1.team_id) {
                      result = 'win';
                      score = '不戦勝';
                    } else {
                      result = 'loss';
                      score = '不戦敗';
                    }
                  } else if (match.is_draw) {
                    result = 'draw';
                    // team1から見た引き分けスコア（スコア計算付き）
                    const team1Goals = match.team1_goals !== undefined ? 
                      Math.floor(match.team1_goals) : calculateArchiveGoals(match.team1_scores);
                    const team2Goals = match.team2_goals !== undefined ? 
                      Math.floor(match.team2_goals) : calculateArchiveGoals(match.team2_scores);
                    score = `△\n${team1Goals}-${team2Goals}`;
                  } else if (match.winner_team_id === team1.team_id) {
                    result = 'win';
                    // team1勝利の場合（スコア計算付き）
                    const team1Goals = match.team1_goals !== undefined ? 
                      Math.floor(match.team1_goals) : calculateArchiveGoals(match.team1_scores);
                    const team2Goals = match.team2_goals !== undefined ? 
                      Math.floor(match.team2_goals) : calculateArchiveGoals(match.team2_scores);
                    score = `〇\n${team1Goals}-${team2Goals}`;
                  } else {
                    result = 'loss';
                    // team1敗北の場合（スコア計算付き）
                    const team1Goals = match.team1_goals !== undefined ? 
                      Math.floor(match.team1_goals) : calculateArchiveGoals(match.team1_scores);
                    const team2Goals = match.team2_goals !== undefined ? 
                      Math.floor(match.team2_goals) : calculateArchiveGoals(match.team2_scores);
                    score = `×\n${team1Goals}-${team2Goals}`;
                  }
                  
                  matchMatrix[team1.team_id][team2.team_id] = { 
                    result, 
                    score, 
                    match_code: match.match_code || ''
                  };
                } else {
                  // 試合はあるが未完了
                  matchMatrix[team1.team_id][team2.team_id] = { 
                    result: null, 
                    score: match.match_code || '未実施', 
                    match_code: match.match_code || ''
                  };
                }
              } else {
                // 試合が見つからない（未設定）
                matchMatrix[team1.team_id][team2.team_id] = { 
                  result: null, 
                  score: '未実施', 
                  match_code: ''
                };
              }
            }
          });
        });
        
        // 対応する順位表データから備考を取得
        const blockStanding = standings.find(s => s.block_name === blockName);
        const blockRemarks = blockStanding?.remarks || null;
        
        // デバッグ情報を出力
        console.log(`[DEBUG] Block ${blockName} remarks:`, {
          blockStanding: !!blockStanding,
          remarks: blockRemarks,
          standingsLength: standings.length
        });
        
        return {
          match_block_id: index + 1,
          phase: 'preliminary',
          display_round_name: `予選${blockName}ブロック`,
          block_name: blockName,
          teams: blockTeams,
          matches: [],
          match_matrix: matchMatrix,
          remarks: blockRemarks
        };
      });
    }
    
    // Fallback: Convert teams data to basic BlockResults format
    const teamsByBlock = teams.reduce((acc, team) => {
      const blockName = team.assigned_block || 'その他';
      if (!acc[blockName]) acc[blockName] = [];
      acc[blockName].push(team);
      return acc;
    }, {} as Record<string, TeamData[]>);

    return Object.entries(teamsByBlock).map(([blockName, blockTeams], index) => {
      // Create a basic match matrix for the block
      const matchMatrix: Record<string, Record<string, { result: string | null; score: string; match_code: string; }>> = {};
      
      blockTeams.forEach(team1 => {
        matchMatrix[team1.team_id] = {};
        blockTeams.forEach(team2 => {
          if (team1.team_id === team2.team_id) {
            matchMatrix[team1.team_id][team2.team_id] = { result: null, score: '-', match_code: '' };
          } else {
            // For archived data, show placeholder
            matchMatrix[team1.team_id][team2.team_id] = { 
              result: null, 
              score: '未実施', 
              match_code: `${blockName}${Math.floor(Math.random() * 10)}` 
            };
          }
        });
      });

      // 対応する順位表データから備考を取得
      const blockStanding = standings.find(s => s.block_name === blockName);
      const blockRemarks = blockStanding?.remarks || null;
      
      // デバッグ情報を出力（フォールバック）
      console.log(`[DEBUG FALLBACK] Block ${blockName} remarks:`, {
        blockStanding: !!blockStanding,
        remarks: blockRemarks,
        standingsLength: standings.length
      });
      
      return {
        match_block_id: index + 1,
        phase: 'preliminary',
        block_name: blockName,
        display_round_name: `予選${blockName}ブロック`,
        teams: blockTeams,
        matches: [],
        match_matrix: matchMatrix,
        remarks: blockRemarks
      };
    });
  };

  const blockResults = getBlockResults();

  if (blockResults.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">戦績表</h3>
          <p className="text-muted-foreground">まだ試合結果がないため、戦績表を表示できません。</p>
        </CardContent>
      </Card>
    );
  }

  // Dummy PDF download function for archived data
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      alert('アーカイブされた大会のPDFダウンロードは現在サポートされていません。');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 概要統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Award className="h-5 w-5 mr-2 text-blue-600" />
              戦績表概要
            </div>
            <Button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {downloadingPdf ? 'PDF生成中...' : 'PDFダウンロード'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{blockResults.length}</div>
              <div className="text-sm text-muted-foreground">ブロック数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {blockResults.reduce((sum, block) => sum + block.teams.length, 0)}
              </div>
              <div className="text-sm text-muted-foreground">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {(() => {
                  // アーカイブデータから実施済み試合数を計算（非アーカイブ版と同じ方法）
                  if (_results && Array.isArray(_results)) {
                    // 全ブロック（予選+決勝）の確定済み試合をカウント
                    // has_resultがtrueの試合、またはwinner_team_idかis_drawがある試合をカウント
                    // (新しいアーカイブはhas_result=true、古いアーカイブは後者で判定)
                    return _results.filter(result => 
                      result.has_result || result.winner_team_id || result.is_draw
                    ).length;
                  }
                  return '-';
                })()}
              </div>
              <div className="text-sm text-muted-foreground">実施済み試合数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別戦績表 */}
      {blockResults
        .filter(block => isPreliminaryPhase(block.phase))
        .sort((a, b) => {
          return (a.block_name || '').localeCompare(b.block_name || '', undefined, { numeric: true });
        })
        .map((block) => {
          const isJapaneseDisplayName = block.display_round_name && 
            (block.display_round_name.includes('予選') || block.display_round_name.includes('決勝'));
          const blockKey = isJapaneseDisplayName 
            ? block.display_round_name 
            : getBlockKey(block.phase, block.block_name);
          
          return (
            <Card key={block.match_block_id || `${block.phase}-${block.block_name || 'default'}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey)}`}>
                      {blockKey}
                    </span>
                    <span className="text-sm text-muted-foreground flex items-center">
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
                <table className="w-full border-collapse border border-border min-w-[800px] md:min-w-0">
                  <thead>
                    <tr>
                      <th className="border border-border p-2 md:p-3 bg-muted text-sm md:text-base font-medium text-muted-foreground min-w-[70px] md:min-w-[90px]">
                        チーム
                      </th>
                      {/* 対戦結果の列ヘッダー（チーム略称を縦書き表示） */}
                      {block.teams.map((opponent) => (
                        <th 
                          key={opponent.team_id}
                          className="border border-border p-1 md:p-2 bg-green-50 dark:bg-green-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[50px] md:min-w-[70px] max-w-[70px] md:max-w-[90px]"
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
                      {isPreliminaryPhase(block.phase) && (
                        <>
                          <th className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[40px] md:min-w-[55px]">
                            <span className="md:hidden">順</span>
                            <span className="hidden md:inline">順位</span>
                          </th>
                          <th className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[40px] md:min-w-[55px]">
                            <span className="md:hidden">点</span>
                            <span className="hidden md:inline">勝点</span>
                          </th>
                          <th className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[35px] md:min-w-[50px]">
                            <span className="md:hidden">試</span>
                            <span className="hidden md:inline">試合数</span>
                          </th>
                          <th className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[30px] md:min-w-[45px]">
                            勝
                          </th>
                          <th className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[30px] md:min-w-[45px]">
                            分
                          </th>
                          <th className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[30px] md:min-w-[45px]">
                            敗
                          </th>
                          <th className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[35px] md:min-w-[50px]">
                            <span className="md:hidden">{(sportConfig?.score_label || '得点').charAt(0)}</span>
                            <span className="hidden md:inline">{sportConfig?.score_label || '得点'}</span>
                          </th>
                          <th className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[35px] md:min-w-[50px]">
                            <span className="md:hidden">{(sportConfig?.score_against_label || '失点').charAt(0)}</span>
                            <span className="hidden md:inline">{sportConfig?.score_against_label || '失点'}</span>
                          </th>
                          <th className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-xs md:text-base font-medium text-muted-foreground min-w-[40px] md:min-w-[55px]">
                            <span className="md:hidden">差</span>
                            <span className="hidden md:inline">{sportConfig?.difference_label || '得失差'}</span>
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {block.teams.map((team) => {
                      const teamStanding = getTeamStanding(team.team_id, block.block_name);
                      
                      return (
                        <tr key={team.team_id}>
                          {/* チーム名（略称優先） */}
                          <td className="border border-border p-2 md:p-3 bg-muted font-medium text-sm md:text-base">
                            <div 
                              className="truncate max-w-[60px] md:max-w-[80px]" 
                              title={team.team_name}
                            >
                              <span className="md:hidden">
                                {(team.team_omission || team.team_name).substring(0, 4)}
                              </span>
                              <span className="hidden md:inline">
                                {team.team_omission || team.team_name}
                              </span>
                            </div>
                          </td>
                          
                          {/* 対戦結果 */}
                          {block.teams.map((opponent) => (
                            <td 
                              key={opponent.team_id}
                              className="border border-border p-1 md:p-2 text-center bg-card"
                            >
                              {team.team_id === opponent.team_id ? (
                                <div className="w-full h-8 md:h-10 bg-muted flex items-center justify-center">
                                  <span className="text-muted-foreground text-sm md:text-base">-</span>
                                </div>
                              ) : (
                                <div className="w-full h-8 md:h-10 flex items-center justify-center text-sm md:text-lg font-medium rounded"
                                  title={`vs ${opponent.team_name}`}
                                >
                                  <div className="text-center leading-tight whitespace-pre-line text-xs md:text-sm">
                                    {block.match_matrix[team.team_id]?.[opponent.team_id]?.score || '-'}
                                  </div>
                                </div>
                              )}
                            </td>
                          ))}
                          
                          {/* 予選リーグの場合は順位表の情報を表示 */}
                          {isPreliminaryPhase(block.phase) && (
                            <>
                              {/* 順位 */}
                              <td className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-center">
                                <div className="flex items-center justify-center">
                                  {teamStanding ? (
                                    <>
                                      <span className="hidden md:inline-block mr-1">{getPositionIcon(teamStanding.position)}</span>
                                      <span className="font-bold text-sm md:text-base">
                                        {teamStanding.position > 0 ? teamStanding.position : '-'}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground text-xs md:text-sm">-</span>
                                  )}
                                </div>
                              </td>
                              
                              {/* 勝点 */}
                              <td className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-center">
                                <span className="font-bold text-sm md:text-lg text-black">
                                  {teamStanding?.points || 0}
                                </span>
                              </td>
                              
                              {/* 試合数 */}
                              <td className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-center">
                                <span className="text-xs md:text-base text-black">{teamStanding?.matches_played || 0}</span>
                              </td>
                              
                              {/* 勝利 */}
                              <td className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-center">
                                <span className="text-black font-medium text-xs md:text-base">
                                  {teamStanding?.wins || 0}
                                </span>
                              </td>
                              
                              {/* 引分 */}
                              <td className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-center">
                                <span className="text-black font-medium text-xs md:text-base">
                                  {teamStanding?.draws || 0}
                                </span>
                              </td>
                              
                              {/* 敗北 */}
                              <td className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-center">
                                <span className="text-black font-medium text-xs md:text-base">
                                  {teamStanding?.losses || 0}
                                </span>
                              </td>
                              
                              {/* 総得点 */}
                              <td className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-center">
                                <span className="font-medium text-xs md:text-base text-black">
                                  {teamStanding?.goals_for || 0}
                                </span>
                              </td>
                              
                              {/* 総失点 */}
                              <td className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-center">
                                <span className="font-medium text-xs md:text-base text-black">
                                  {teamStanding?.goals_against || 0}
                                </span>
                              </td>
                              
                              {/* 得失差 */}
                              <td className="border border-border p-1 md:p-2 bg-blue-50 dark:bg-blue-950/20 text-center">
                                <span className="font-bold text-xs md:text-base text-black">
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
                  <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded mr-2"></div>
                      順位表情報
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-700 rounded mr-2"></div>
                      対戦結果
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-4 text-xs md:text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <div className="w-4 h-4 md:w-5 md:h-5 bg-card border border-border text-foreground rounded mr-1 md:mr-2 flex items-center justify-center text-xs">
                        〇
                      </div>
                      勝利
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 md:w-5 md:h-5 bg-card border border-border text-muted-foreground rounded mr-1 md:mr-2 flex items-center justify-center text-xs">
                        ×
                      </div>
                      敗北
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 md:w-5 md:h-5 bg-card border border-border text-foreground rounded mr-1 md:mr-2 flex items-center justify-center text-xs">
                        △
                      </div>
                      引分
                    </div>
                    <div className="flex items-center col-span-2 md:col-span-1">
                      <div className="w-4 h-4 md:w-5 md:h-5 bg-muted text-muted-foreground rounded mr-1 md:mr-2 flex items-center justify-center text-xs font-medium">
                        A1
                      </div>
                      未実施試合（試合コード表示）
                    </div>
                  </div>

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
          );
        })}

      {/* トーナメント戦の場合の注意書き */}
      {blockResults.some(block => !isPreliminaryPhase(block.phase)) && (
        <Card className="border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/20">
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
};

// 順位表コンポーネント（TournamentStandings.tsxと同じ実装）
const ArchivedTournamentStandings = ({ standings, matches, blockStructure, sportSettings: _sportSettings }: { standings: BlockStanding[], matches?: MatchData[], blockStructure?: BlockStructure | null, sportSettings?: SportSettings | null }) => {
  // デバッグ情報をコンソールに出力
  console.log('ArchivedTournamentStandings - standings data:', standings);
  
  // 決勝トーナメント順位を試合結果から動的生成する関数
  const generateFinalTournamentRankings = (finalMatches: MatchData[]): TeamStanding[] => {
    const rankings: TeamStanding[] = [];
    
    console.log('Debug: generateFinalTournamentRankings - 入力された決勝試合:', 
      finalMatches.map(m => ({ match_code: m.match_code, has_result: m.has_result })));
    
    // 決勝戦を特定（通常はM1またはT8）
    const finalMatch = finalMatches.find(m => 
      m.match_code === 'M1' || m.match_code === 'T8' || 
      m.match_code.includes('決勝') || m.match_code.includes('Final')
    );
    
    console.log('Debug: 見つかった決勝戦:', finalMatch ? {
      match_code: finalMatch.match_code,
      has_result: finalMatch.has_result,
      winner_team_id: finalMatch.winner_team_id
    } : 'なし');
    
    if (finalMatch && finalMatch.has_result) {
      const winner = finalMatch.winner_team_id === finalMatch.team1_id 
        ? { team_id: finalMatch.team1_id!, team_name: finalMatch.team1_display_name }
        : { team_id: finalMatch.team2_id!, team_name: finalMatch.team2_display_name };
      const runnerUp = finalMatch.winner_team_id === finalMatch.team1_id 
        ? { team_id: finalMatch.team2_id!, team_name: finalMatch.team2_display_name }
        : { team_id: finalMatch.team1_id!, team_name: finalMatch.team1_display_name };
      
      rankings.push({
        team_id: winner.team_id,
        team_name: winner.team_name,
        position: 1,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        position_note: '優勝'
      });
      
      rankings.push({
        team_id: runnerUp.team_id,
        team_name: runnerUp.team_name,
        position: 2,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        position_note: '準優勝'
      });
    }
    
    // 3位決定戦を特定
    const thirdPlaceMatch = finalMatches.find(m => 
      m.match_code === 'M7' || m.match_code === 'T7' ||
      m.match_code.includes('3位') || m.match_code.includes('Third')
    );
    
    console.log('Debug: 見つかった3位決定戦:', thirdPlaceMatch ? {
      match_code: thirdPlaceMatch.match_code,
      has_result: thirdPlaceMatch.has_result
    } : 'なし');
    
    if (thirdPlaceMatch && thirdPlaceMatch.has_result) {
      const thirdPlace = thirdPlaceMatch.winner_team_id === thirdPlaceMatch.team1_id 
        ? { team_id: thirdPlaceMatch.team1_id!, team_name: thirdPlaceMatch.team1_display_name }
        : { team_id: thirdPlaceMatch.team2_id!, team_name: thirdPlaceMatch.team2_display_name };
      const fourthPlace = thirdPlaceMatch.winner_team_id === thirdPlaceMatch.team1_id 
        ? { team_id: thirdPlaceMatch.team2_id!, team_name: thirdPlaceMatch.team2_display_name }
        : { team_id: thirdPlaceMatch.team1_id!, team_name: thirdPlaceMatch.team1_display_name };
      
      rankings.push({
        team_id: thirdPlace.team_id,
        team_name: thirdPlace.team_name,
        position: 3,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        position_note: '3位'
      });
      
      rankings.push({
        team_id: fourthPlace.team_id,
        team_name: fourthPlace.team_name,
        position: 4,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        position_note: '4位'
      });
    }
    
    // 準々決勝敗退チーム（M3-M6またはT1-T4）
    const quarterFinals = finalMatches.filter(m => 
      ['T1', 'T2', 'T3', 'T4', 'M3', 'M4', 'M5', 'M6'].includes(m.match_code) ||
      m.match_code.includes('準々決勝') || m.match_code.includes('Quarter')
    );
    
    console.log('Debug: 準々決勝試合:', quarterFinals.map(m => ({ match_code: m.match_code, has_result: m.has_result })));
    quarterFinals.forEach((match) => {
      if (match.has_result && match.winner_team_id) {
        const loser = match.winner_team_id === match.team1_id 
          ? { team_id: match.team2_id!, team_name: match.team2_display_name }
          : { team_id: match.team1_id!, team_name: match.team1_display_name };
        
        // 準々決勝敗退チームが準決勝・3位決定戦・決勝に進んでいないことを確認
        const advancedToSemi = finalMatches.some(m => 
          (['T5', 'T6', 'T7', 'T8', 'M1', 'M2', 'M7'].includes(m.match_code) ||
           m.match_code.includes('準決勝') || m.match_code.includes('決勝') || m.match_code.includes('3位')) &&
          (m.team1_id === loser.team_id || m.team2_id === loser.team_id)
        );
        
        if (!advancedToSemi) {
          rankings.push({
            team_id: loser.team_id,
            team_name: loser.team_name,
            position: 5,
            points: 0,
            matches_played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goals_for: 0,
            goals_against: 0,
            goal_difference: 0,
            position_note: '準々決勝敗退'
          });
        }
      }
    });
    
    console.log('Debug: 最終的に生成された順位数:', rankings.length);
    console.log('Debug: 最終順位データ:', rankings);
    
    return rankings.sort((a, b) => a.position - b.position);
  };
  if (!standings || standings.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">順位表</h3>
          <p className="text-muted-foreground">まだ試合結果がないため、順位表を表示できません。</p>
        </CardContent>
      </Card>
    );
  }

  // ブロック分類関数（TournamentStandings.tsxと同じ）
  const getBlockKey = (phase: string, blockName: string, matchCode?: string): string => {
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
      return '決勝トーナメント';
    } else {
      return phase || 'その他';
    }
  };

  // ブロック色の取得（TournamentStandings.tsxと同じ）
  // 共通の動的色分け関数を使用
  const getBlockColor = (blockKey: string) => getUniversalBlockColor(blockKey, blockStructure);

  // フェーズ判定（TournamentStandings.tsxと同じ）
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
                {standings.filter(block => {
                  // 予選ブロックのみをフィルタリング（戦績表と同じ方法）
                  const isPreliminaryPhase = (phase: string): boolean => {
                    if (!phase) return false;
                    if (phase.includes('preliminary') || phase.includes('予選') || 
                        phase.includes('league') || phase.includes('リーグ') || 
                        phase.includes('group') || phase.includes('グループ')) {
                      return true;
                    }
                    return !phase.includes('final') && !phase.includes('決勝');
                  };
                  return isPreliminaryPhase(block.phase);
                }).reduce((total, block) => {
                  try {
                    let rankings = [];
                    if (block.team_rankings) {
                      if (typeof block.team_rankings === 'string') {
                        rankings = JSON.parse(block.team_rankings);
                      } else if (Array.isArray(block.team_rankings)) {
                        rankings = block.team_rankings;
                      }
                    } else if (block.teams && Array.isArray(block.teams)) {
                      rankings = block.teams;
                    }
                    return total + rankings.length;
                  } catch {
                    return total + (block.teams?.length || 0);
                  }
                }, 0)}
              </div>
              <div className="text-sm text-gray-600">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {(() => {
                  // アーカイブデータから実施済み試合数を計算
                  if (matches && Array.isArray(matches)) {
                    // 確定済み試合をカウント（全ブロック：予選+決勝）
                    // has_resultがtrueの試合、またはwinner_team_idかis_drawがある試合をカウント
                    return matches.filter(match => 
                      match.has_result || match.winner_team_id || match.is_draw
                    ).length;
                  }
                  return '-';
                })()}
              </div>
              <div className="text-sm text-gray-600">実施済み試合数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別順位表 */}
      {standings.map((block) => {
        let blockTeams: TeamStanding[] = [];
        try {
          if (block.team_rankings) {
            if (typeof block.team_rankings === 'string') {
              blockTeams = JSON.parse(block.team_rankings);
            } else if (Array.isArray(block.team_rankings)) {
              blockTeams = block.team_rankings;
            }
          } else if (block.teams && Array.isArray(block.teams)) {
            blockTeams = block.teams;
          }
        } catch (error) {
          console.error('順位表データの解析エラー:', error, block);
          // エラーが発生した場合はblock.teamsを使用してフォールバック
          blockTeams = block.teams || [];
        }
        
        if (blockTeams.length === 0) {
          // 決勝トーナメントで順位データがない場合、試合結果から動的生成
          const isFinalPhase = block.phase === 'final' || (block.phase && block.phase.includes('決勝'));
          
          if (isFinalPhase && matches) {
            console.log('Debug: 決勝トーナメント順位生成 - 全試合数:', matches.length);
            console.log('Debug: 全試合のphase情報:', matches.map(m => ({ match_code: m.match_code, phase: m.phase })));
            
            const finalMatches = matches.filter(m => m.phase === 'final');
            console.log('Debug: フィルタリング後の決勝試合数:', finalMatches.length);
            console.log('Debug: 決勝試合データ:', finalMatches.map(m => ({ 
              match_code: m.match_code, 
              phase: m.phase,
              has_result: m.has_result,
              winner_team_id: m.winner_team_id
            })));
            
            if (finalMatches.length > 0) {
              blockTeams = generateFinalTournamentRankings(finalMatches);
              console.log('Debug: 生成された決勝順位:', blockTeams);
            }
          }
          
          if (blockTeams.length === 0) {
            return (
              <Card key={block.match_block_id || block.block_name || 'empty-block'}>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    {(() => {
                      const isJapaneseDisplayName = block.display_round_name && 
                        (block.display_round_name.includes('予選') || block.display_round_name.includes('決勝'));
                      const blockKey = isJapaneseDisplayName 
                        ? block.display_round_name 
                        : getBlockKey(block.phase, block.block_name);
                      return (
                        <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey || '')}`}>
                          {blockKey}
                        </span>
                      );
                    })()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center py-8 text-muted-foreground">
                  {isFinalPhase ? (
                    <div>
                      <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-lg font-medium mb-2">決勝トーナメント順位未確定</p>
                      <p className="text-sm">決勝トーナメントの結果が確定していないか、データの読み込みに失敗しました。</p>
                    </div>
                  ) : (
                    <div>
                      <p>このブロックの順位データの読み込みに失敗しました。</p>
                      <p className="text-xs mt-2">Phase: {block.phase}, Block: {block.block_name}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          }
        }

        return (
          <Card key={block.match_block_id || block.block_name}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  {(() => {
                    // display_round_nameが日本語の場合はそれを使用、英語の場合はgetBlockKeyで変換
                    const isJapaneseDisplayName = block.display_round_name && 
                      (block.display_round_name.includes('予選') || block.display_round_name.includes('決勝'));
                    const blockKey = isJapaneseDisplayName 
                      ? block.display_round_name 
                      : getBlockKey(block.phase, block.block_name);
                    return (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey || '')}`}>
                        {blockKey}
                      </span>
                    );
                  })()}
                  <span className="text-sm text-gray-600 flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    {blockTeams.length}チーム
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* 決勝トーナメントでチームがない場合の表示 */}
              {isFinalPhase(block.phase) && blockTeams.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">順位データの読み込みに失敗しました</p>
                  <p className="text-sm">アーカイブデータに順位情報が含まれていない可能性があります。</p>
                </div>
              ) : blockTeams.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <p className="text-sm">データが見つかりません</p>
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[700px] md:min-w-0">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-gray-800">
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
                            <span className="hidden md:inline">得失点差</span>
                          </th>
                        </>
                      )}
                      {isFinalPhase(block.phase) && (
                        <th className="text-center py-2 md:py-3 px-2 md:px-3 font-medium text-gray-700 text-sm md:text-base min-w-[80px] md:min-w-[100px]">備考</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {blockTeams.map((team) => (
                      <tr 
                        key={team.team_id} 
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
                              {team.position > 0 ? getPositionIcon(team.position) : team.position === 0 ? <span className="text-gray-400">-</span> : <Hash className="h-4 w-4 text-gray-400" />}
                            </span>
                            <span className="font-bold text-base md:text-lg">{team.position === 0 ? '-' : team.position}</span>
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
                                {((team.goal_difference || 0) > 0 ? '+' : '') + (team.goal_difference || 0)}
                              </span>
                            </td>
                          </>
                        )}
                        {isFinalPhase(block.phase) && (
                          <td className="py-2 md:py-3 px-2 md:px-3 text-center">
                            <span className="text-xs md:text-sm text-gray-600">
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
        );
      })}
    </div>
  );
};

// 参加チームコンポーネント（TournamentTeams.tsxと同じ実装）
const ArchivedTournamentTeams = ({ teams, blockStructure, extendedMetadata: _extendedMetadata }: { teams: TeamData[], blockStructure?: BlockStructure | null, extendedMetadata?: ExtendedMetadata | null }) => {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const toggleTeamExpansion = (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedTeams(newExpanded);
  };

  // ブロック別にチームをグループ化
  const teamsByBlock = teams.reduce((acc: Record<string, TeamData[]>, team) => {
    const blockName = team.assigned_block || 'その他';
    if (!acc[blockName]) acc[blockName] = [];
    acc[blockName].push(team);
    return acc;
  }, {});

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

  // ブロック色の取得
  // 共通の動的色分け関数を使用
  const getBlockColor = (blockKey: string) => getUniversalBlockColor(blockKey, blockStructure);

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

  if (!teams || teams.length === 0) {
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
              <div className="text-2xl font-bold text-blue-600">{teams.length}</div>
              <div className="text-sm text-muted-foreground">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {teams.reduce((total, team) => total + (team.player_count || 0), 0)}
              </div>
              <div className="text-sm text-muted-foreground">参加選手数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別チーム一覧 */}
      {Object.entries(teamsByBlock).map(([blockName, blockTeams]) => (
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
                <span className="text-sm text-muted-foreground flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  {blockTeams.length}チーム
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {blockTeams.map((team) => {
                const teamStatus = getTeamStatus(team);
                const isExpanded = expandedTeams.has(team.team_id);
                
                // 選手データのデバッグ情報出力
                if (team.team_id === blockTeams[0]?.team_id) {
                  console.log(`[DEBUG] ${team.team_name} の選手データ:`, team.players);
                  console.log(`[DEBUG] players配列の型:`, typeof team.players);
                  console.log(`[DEBUG] players配列の長さ:`, team.players?.length);
                }

                return (
                  <div key={team.team_id} className="border rounded-lg">
                    {/* チーム基本情報 */}
                    <div 
                      className="p-4 cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => toggleTeamExpansion(team.team_id)}
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
                              {team.team_name}
                            </h3>
                            {team.team_omission && team.team_omission !== team.team_name && (
                              <p className="text-sm text-muted-foreground">({team.team_omission})</p>
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
                          {team.players && Array.isArray(team.players) && team.players.length > 0 ? (
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
                                      <th className="text-left py-2 px-3 font-medium">状態</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {team.players.map((player, index) => (
                                      <tr key={`${team.team_id}-${index}`} className="border-b">
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
                            <div className="text-center py-6 text-muted-foreground">
                              <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                              <p>
                                {team.player_count && team.player_count > 0 
                                  ? `選手${team.player_count}名（詳細情報は旧版アーカイブデータで非表示）`
                                  : 'このチームには選手が登録されていません'
                                }
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
      ))}
    </div>
  );
};

// メインレイアウトコンポーネント（v2.0版）
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
function ArchivedLayout_v2({ archived, uiVersion, versionInfo }: { archived: ArchivedData, uiVersion?: any, versionInfo?: any }) {
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
  // 拡張メタデータを取得
  const extendedMetadata = getExtendedMetadata(archived.metadata);
  const sportSettings = getSportSettings(archived.metadata);
  const formatDetails = getFormatDetails(archived.metadata);
  const blockStructure = getBlockStructure(archived.metadata);
  
  // デバッグ情報をコンソールに出力
  // アーカイブデータ構造のデバッグログ（開発環境のみ）
  if (process.env.NODE_ENV === 'development') {
    console.log('ArchivedLayout_v2 - archived data structure:', archived);
    console.log('ArchivedLayout_v2 - extended metadata:', extendedMetadata);
    console.log('ArchivedLayout_v2 - sport settings:', sportSettings);
    console.log('ArchivedLayout_v2 - format details:', formatDetails);
    console.log('ArchivedLayout_v2 - block structure:', blockStructure);
    if (archived.teams && archived.teams[0]) {
      console.log('ArchivedLayout_v2 - first team structure:', archived.teams[0]);
    }
  }
  
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ナビゲーション */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <BackButton />
            <Button variant="ghost" asChild>
              <Link href="/" className="flex items-center text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4 mr-2" />
                TOPページに戻る
              </Link>
            </Button>
          </div>
        </div>

        {/* ページヘッダー */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{archived.tournament.tournament_name}</h1>
          <p className="text-muted-foreground">大会の詳細情報をご覧いただけます</p>
        </div>

        {/* タブナビゲーション */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full mb-8 grid-cols-3 grid-rows-2 gap-1 h-auto sm:grid-cols-6 sm:grid-rows-1">
            <TabsTrigger value="overview" className="flex items-center justify-center py-3 text-xs sm:text-sm">
              <Trophy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline sm:inline">大会</span>概要
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center justify-center py-3 text-xs sm:text-sm">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline sm:inline">日程・</span>結果
            </TabsTrigger>
            <TabsTrigger value="bracket" className="flex items-center justify-center py-3 text-xs sm:text-sm">
              <GitBranch className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline sm:inline">ト</span>ーナメント表
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
            <ArchivedTournamentOverview 
              tournament={archived.tournament} 
              archivedAt={archived.archived_at}
              extendedMetadata={extendedMetadata || undefined}
              formatDetails={formatDetails || undefined}
            />
          </TabsContent>

          <TabsContent value="schedule">
            <ArchivedTournamentSchedule 
              matches={archived.matches} 
              teams={archived.teams} 
              blockStructure={blockStructure}
            />
          </TabsContent>

          <TabsContent value="bracket">
            <ArchivedTournamentBracket 
              matches={archived.matches} 
              teams={archived.teams} 
              archived={archived}
            />
          </TabsContent>

          <TabsContent value="results">
            <ArchivedTournamentResults 
              _results={archived.results} 
              teams={archived.teams} 
              standings={archived.standings} 
              blockStructure={blockStructure}
            />
          </TabsContent>

          <TabsContent value="standings">
            <ArchivedTournamentStandings 
              standings={archived.standings} 
              matches={archived.matches} 
              blockStructure={blockStructure}
              sportSettings={sportSettings}
            />
          </TabsContent>

          <TabsContent value="teams">
            <ArchivedTournamentTeams 
              teams={archived.teams} 
              blockStructure={blockStructure}
              extendedMetadata={extendedMetadata}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
}

// デフォルトエクスポートとネームドエクスポートの両方に対応
export default ArchivedLayout_v2;
export { ArchivedLayout_v2 };