'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy, Shield, Database, Users, Calendar, CheckCircle, XCircle, Trophy } from 'lucide-react';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  status: string;
  team_count: number;
  match_count: number;
  results_count: number;
  created_at: string;
}

interface TournamentGroup {
  group_id: number;
  group_name: string;
  organizer: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
}

interface DuplicateLevel {
  level: 'level1' | 'level2' | 'level3' | 'level4';
  name: string;
  description: string;
  stage: string;
  icon: string;
  details: string[];
  dataIncluded: string[];
}

interface DuplicateResult {
  success: boolean;
  message: string;
  details?: {
    original_tournament_id: number;
    new_tournament_id: number;
    new_tournament_name: string;
    level_applied: string;
    teams_copied: number;
    matches_copied: number;
  };
  error?: string;
}

const DUPLICATE_LEVELS: DuplicateLevel[] = [
  {
    level: 'level1',
    name: '基本設定のみ',
    description: '大会の基本情報・ルール・フォーマット設定のみ',
    stage: 'チーム登録前状態',
    icon: '⚙️',
    details: [
      '大会基本情報（名前、日程、会場など）',
      '競技種別設定とルール',
      'フォーマット設定（チーム数、ブロック構成）',
      'マッチテンプレート構造'
    ],
    dataIncluded: ['大会情報', 'ルール設定', 'テンプレート']
  },
  {
    level: 'level2',
    name: '基本設定 + チーム',
    description: '基本設定 + 登録済みチーム・選手データ',
    stage: '組合せ作成前状態',
    icon: '👥',
    details: [
      'レベル1のすべて',
      '登録済みチーム情報',
      '各チームの選手登録',
      'チーム別の参加設定'
    ],
    dataIncluded: ['大会情報', 'ルール設定', 'テンプレート', 'チーム', '選手']
  },
  {
    level: 'level3',
    name: '基本設定 + チーム + 組合せ',
    description: '基本設定 + チーム + 組合せ・試合スケジュール',
    stage: '大会進行前状態',
    icon: '📋',
    details: [
      'レベル2のすべて',
      'チームの組合せ（ブロック分け）',
      '試合スケジュール構成',
      '試合開始時刻設定'
    ],
    dataIncluded: ['大会情報', 'ルール設定', 'テンプレート', 'チーム', '選手', '組合せ', 'スケジュール']
  },
  {
    level: 'level4',
    name: 'すべてのデータ',
    description: 'すべてのデータ（進行中の試合状況を含む）',
    stage: '大会完了前状態',
    icon: '🏆',
    details: [
      'レベル3のすべて',
      '進行中の試合データ',
      '試合結果・スコア（確定前）',
      '現在の順位状況'
    ],
    dataIncluded: ['大会情報', 'ルール設定', 'テンプレート', 'チーム', '選手', '組合せ', 'スケジュール', '試合進行データ']
  }
];

export default function TournamentDuplicatePage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentGroups, setTournamentGroups] = useState<TournamentGroup[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<'level1' | 'level2' | 'level3' | 'level4' | null>(null);
  const [newTournamentName, setNewTournamentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);

  useEffect(() => {
    fetchTournaments();
    fetchTournamentGroups();
  }, []);

  const fetchTournaments = async () => {
    try {
      const response = await fetch('/api/admin/tournaments');
      const data = await response.json();

      if (data.success) {
        // APIレスポンスの構造を確認してから適切に設定
        const tournaments = data.data.tournaments || data.data || [];

        // Tournament インターフェースに合うようにデータを変換
        const formattedTournaments = tournaments.map((tournament: any) => {
          if (!tournament || typeof tournament.tournament_id === 'undefined') {
            console.warn('Invalid tournament data:', tournament);
            return null;
          }

          return {
            tournament_id: tournament.tournament_id,
            tournament_name: tournament.tournament_name || '名前なし',
            status: tournament.calculated_status || tournament.status || 'unknown',
            team_count: tournament.registered_teams || tournament.team_count || 0,
            match_count: tournament.match_count || 0,
            results_count: tournament.results_count || 0,
            created_at: tournament.created_at || new Date().toISOString()
          };
        }).filter(Boolean); // null値を除外

        setTournaments(formattedTournaments);
      } else {
        console.error('データ取得エラー:', data.error);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTournamentGroups = async () => {
    try {
      setLoadingGroups(true);
      const response = await fetch('/api/tournament-groups');
      const data = await response.json();

      if (data.success) {
        setTournamentGroups(data.data || []);
      } else {
        console.error('大会グループ取得エラー:', data.error);
      }
    } catch (error) {
      console.error('大会グループ取得エラー:', error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleTournamentSelect = (tournamentId: number) => {
    const tournament = tournaments.find(t => t.tournament_id === tournamentId);
    setSelectedTournament(tournamentId);
    if (tournament) {
      setNewTournamentName(`${tournament.tournament_name} (複製)`);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedTournament || !selectedLevel || !newTournamentName.trim() || !selectedGroupId) return;

    setDuplicating(true);
    try {
      const response = await fetch('/api/admin/tournaments/duplicate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_tournament_id: selectedTournament,
          new_tournament_name: newTournamentName.trim(),
          duplicate_level: selectedLevel,
          group_id: selectedGroupId
        }),
      });

      const result = await response.json();
      setDuplicateResult(result);

      if (result.success) {
        // 成功時は最新データを再取得
        await fetchTournaments();
      }
    } catch (error) {
      console.error('複製エラー:', error);
      setDuplicateResult({
        success: false,
        message: '複製処理中にエラーが発生しました',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setDuplicating(false);
      setShowConfirm(false);
    }
  };

  const getStageColor = (stage: string) => {
    if (stage.includes('チーム登録前')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (stage.includes('組合せ作成前')) return 'bg-green-100 text-green-800 border-green-200';
    if (stage.includes('大会進行前')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (stage.includes('大会完了前')) return 'bg-purple-100 text-purple-800 border-purple-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const canExecuteDuplicate = selectedTournament && selectedLevel && newTournamentName.trim() && selectedGroupId;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">部門データ複製</h1>
              <p className="text-sm text-muted-foreground mt-1">
                既存の部門を複製してデモ用データを効率的に作成できます
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => router.push('/admin')}
              >
                管理者ダッシュボードに戻る
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 情報カード */}
        <Card className="border-green-200 bg-green-50 mb-6">
          <CardHeader>
            <CardTitle className="text-green-800 flex items-center">
              <Copy className="w-5 h-5 mr-2" />
              📋 部門複製機能について
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-green-700 space-y-2">
              <p>• 既存の部門データを新しいIDで複製し、デモ用データを効率的に作成できます</p>
              <p>• 複製レベルを選択することで、デモしたい段階に応じたデータを準備できます</p>
              <p>• 新しい部門として独立するため、元の部門に影響はありません</p>
              <p>• チーム登録前、組合せ前、進行前、完了前の4段階から選択可能です</p>
            </div>
          </CardContent>
        </Card>

        {/* 結果表示 */}
        {duplicateResult && (
          <Card className={`mb-6 ${duplicateResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <CardHeader>
              <CardTitle className={`flex items-center ${duplicateResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {duplicateResult.success ? <CheckCircle className="w-5 h-5 mr-2" /> : <XCircle className="w-5 h-5 mr-2" />}
                {duplicateResult.success ? '複製完了' : '複製失敗'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={duplicateResult.success ? 'text-green-700' : 'text-red-700'}>
                {duplicateResult.message}
              </p>
              {duplicateResult.success && duplicateResult.details && (
                <div className="mt-3 text-green-700 space-y-1">
                  <p>• 複製元大会ID: {duplicateResult.details.original_tournament_id}</p>
                  <p>• 新しい大会ID: {duplicateResult.details.new_tournament_id}</p>
                  <p>• 大会名: {duplicateResult.details.new_tournament_name}</p>
                  <p>• 複製レベル: {duplicateResult.details.level_applied}</p>
                  {duplicateResult.details.teams_copied > 0 && (
                    <p>• 複製したチーム: {duplicateResult.details.teams_copied}チーム</p>
                  )}
                  {duplicateResult.details.matches_copied > 0 && (
                    <p>• 複製した試合: {duplicateResult.details.matches_copied}試合</p>
                  )}
                </div>
              )}
              {duplicateResult.error && (
                <p className="mt-2 text-red-600 text-sm">エラー詳細: {duplicateResult.error}</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左側: 複製元大会選択 */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="w-5 h-5 mr-2" />
                  複製元部門選択
                </CardTitle>
                <p className="text-sm text-muted-foreground">複製したい部門を選択してください</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {tournaments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>複製可能な大会がありません</p>
                  </div>
                ) : (
                  tournaments.map((tournament) => (
                    <div
                      key={`tournament-${tournament.tournament_id}`}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedTournament === tournament.tournament_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handleTournamentSelect(tournament.tournament_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-foreground">
                            大会ID {tournament.tournament_id}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {tournament.tournament_name}
                          </p>
                          <div className="flex space-x-4 mt-2">
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Users className="w-3 h-3 mr-1" />
                              {tournament.team_count}チーム
                            </div>
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3 mr-1" />
                              {tournament.match_count}試合
                            </div>
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Trophy className="w-3 h-3 mr-1" />
                              {tournament.results_count}結果
                            </div>
                          </div>
                        </div>
                        <div className="ml-4">
                          <Badge variant={tournament.status === 'ongoing' ? 'default' : 'secondary'}>
                            {tournament.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* 所属大会選択 */}
            <Card>
              <CardHeader>
                <CardTitle>所属大会選択 (必須)</CardTitle>
                <p className="text-sm text-muted-foreground">複製する部門が所属する大会を選択してください</p>
              </CardHeader>
              <CardContent>
                {loadingGroups ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center text-muted-foreground">読込中...</div>
                  </div>
                ) : tournamentGroups.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    大会グループが見つかりません
                  </div>
                ) : (
                  tournamentGroups.map((group) => (
                    <div
                      key={group.group_id}
                      className={`p-4 mb-2 border rounded-lg cursor-pointer transition-colors ${
                        selectedGroupId === group.group_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedGroupId(group.group_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">
                            {group.group_name}
                          </p>
                          {group.organizer && (
                            <p className="text-sm text-muted-foreground mt-1">
                              主催: {group.organizer}
                            </p>
                          )}
                          {group.event_start_date && group.event_end_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {group.event_start_date} 〜 {group.event_end_date}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* 新しい部門名入力 */}
            <Card>
              <CardHeader>
                <CardTitle>新しい部門名</CardTitle>
                <p className="text-sm text-muted-foreground">複製後の部門名を入力してください</p>
              </CardHeader>
              <CardContent>
                <Label htmlFor="tournament-name">部門名</Label>
                <Input
                  id="tournament-name"
                  value={newTournamentName}
                  onChange={(e) => setNewTournamentName(e.target.value)}
                  placeholder="例: サンプル部門 (複製)"
                  className="mt-2"
                />
              </CardContent>
            </Card>
          </div>

          {/* 右側: 複製レベル選択 */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="w-5 h-5 mr-2" />
                  複製レベル選択
                </CardTitle>
                <p className="text-sm text-muted-foreground">デモしたい段階に応じて複製レベルを選択してください</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {DUPLICATE_LEVELS.map((level) => (
                  <div
                    key={level.level}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedLevel === level.level
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedLevel(level.level)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <span className="text-lg mr-2">{level.icon}</span>
                          <p className="font-medium text-foreground">{level.name}</p>
                          <Badge className={`ml-2 ${getStageColor(level.stage)}`} variant="outline">
                            {level.stage}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{level.description}</p>
                        <div className="mt-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">含まれるデータ:</p>
                          <div className="flex flex-wrap gap-1">
                            {level.dataIncluded.map((data, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {data}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                          {level.details.map((detail, index) => (
                            <li key={index}>• {detail}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 実行ボタン */}
        <div className="mt-8 flex justify-center">
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={!canExecuteDuplicate || duplicating}
            size="lg"
            className="min-w-48"
          >
            <Copy className="w-4 h-4 mr-2" />
            {duplicating ? '複製中...' : '部門を複製'}
          </Button>
        </div>
      </div>

      {/* 確認ダイアログ */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">複製実行の確認</h3>

            <div className="space-y-3 mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">以下の内容で部門を複製します：</p>
              <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded space-y-2">
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  <strong>所属大会:</strong> {tournamentGroups.find(g => g.group_id === selectedGroupId)?.group_name}
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  <strong>複製元部門:</strong> {tournaments.find(t => t.tournament_id === selectedTournament)?.tournament_name}
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  <strong>新しい部門名:</strong> {newTournamentName}
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  <strong>複製レベル:</strong> {DUPLICATE_LEVELS.find(l => l.level === selectedLevel)?.name}
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  <strong>作成される状態:</strong> {DUPLICATE_LEVELS.find(l => l.level === selectedLevel)?.stage}
                </p>
              </div>
            </div>

            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="flex-1"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleDuplicate}
                disabled={duplicating}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {duplicating ? '複製中...' : '複製実行'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}