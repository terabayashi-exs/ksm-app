'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RotateCcw, Shield, Database, Users, Calendar, CheckCircle, XCircle } from 'lucide-react';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  status: string;
  team_count: number;
  match_count: number;
  results_count: number;
}

interface ResetLevel {
  level: 'level1' | 'level2' | 'level3';
  name: string;
  description: string;
  safety: 'safe' | 'caution' | 'danger';
  icon: string;
  details: string[];
}

interface ResetResult {
  success: boolean;
  message: string;
  details?: {
    tournaments_reset: number[];
    matches_reset: number;
    results_cleared: number;
    level_applied: string;
  };
  error?: string;
}

const RESET_LEVELS: ResetLevel[] = [
  {
    level: 'level1',
    name: '試合結果のみリセット',
    description: '試合結果・スコア・順位をクリア（組み合わせは保持）',
    safety: 'safe',
    icon: '🔄',
    details: [
      'チーム振り分けは保持されます',
      '試合スケジュールは保持されます',
      '試合結果・スコアのみクリアされます',
      '順位表がリセットされます'
    ]
  },
  {
    level: 'level2',
    name: '組み合わせリセット',
    description: '試合結果 + チーム振り分けをクリア（登録チームは保持）',
    safety: 'caution',
    icon: '⚠️',
    details: [
      '登録チームは保持されます',
      'チーム振り分けがクリアされます',
      '試合のチーム割り当てがクリアされます',
      '組み合わせからやり直しが必要です'
    ]
  },
  {
    level: 'level3',
    name: '完全リセット',
    description: '試合スケジュール・ブロック構成を完全削除',
    safety: 'danger',
    icon: '💥',
    details: [
      '試合スケジュールが完全削除されます',
      'ブロック構成が削除されます',
      'マッチテンプレートから再作成が必要です',
      '※ この操作は取り消せません'
    ]
  }
];

export default function TournamentResetPage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<'level1' | 'level2' | 'level3' | null>(null);
  const [selectedTournaments, setSelectedTournaments] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      const response = await fetch('/api/admin/tournaments/reset');
      const data = await response.json();
      
      if (data.success) {
        setTournaments(data.data.test_tournaments);
      } else {
        console.error('データ取得エラー:', data.error);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTournamentToggle = (tournamentId: number) => {
    setSelectedTournaments(prev => 
      prev.includes(tournamentId)
        ? prev.filter(id => id !== tournamentId)
        : [...prev, tournamentId]
    );
  };

  const handleSelectAll = () => {
    setSelectedTournaments(
      selectedTournaments.length === tournaments.length 
        ? [] 
        : tournaments.map(t => t.tournament_id)
    );
  };

  const handleReset = async () => {
    if (!selectedLevel || selectedTournaments.length === 0) return;

    setResetting(true);
    try {
      const response = await fetch('/api/admin/tournaments/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tournament_ids: selectedTournaments,
          reset_level: selectedLevel,
          confirm_password: confirmPassword
        }),
      });

      const result = await response.json();
      setResetResult(result);
      
      if (result.success) {
        // 成功時は最新データを再取得
        await fetchTournaments();
        setSelectedTournaments([]);
        setSelectedLevel(null);
      }
    } catch (error) {
      console.error('リセットエラー:', error);
      setResetResult({
        success: false,
        message: 'リセット処理中にエラーが発生しました',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setResetting(false);
      setShowConfirm(false);
      setConfirmPassword('');
    }
  };

  const getSafetyColor = (safety: string) => {
    switch (safety) {
      case 'safe': return 'bg-green-100 text-green-800 border-green-200';
      case 'caution': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'danger': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const canExecuteReset = selectedLevel && selectedTournaments.length > 0;

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
              <h1 className="text-3xl font-bold text-foreground">大会データリセット</h1>
              <p className="text-sm text-muted-foreground mt-1">
                大会ID 9, 10, 11 のテスト用データをリセットできます
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
        {/* 警告カード */}
        <Card className="border-yellow-200 bg-yellow-50 mb-6">
          <CardHeader>
            <CardTitle className="text-yellow-800 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              ⚠️ 重要な注意事項
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-yellow-700 space-y-2">
              <p>• このページは<strong>テスト用大会（ID: 9, 10, 11）専用</strong>のリセット機能です</p>
              <p>• リセット後のデータ復旧はできません</p>
              <p>• 本番大会では絶対に使用しないでください</p>
              <p>• Level 3（完全リセット）は特に慎重に実行してください</p>
            </div>
          </CardContent>
        </Card>

        {/* 結果表示 */}
        {resetResult && (
          <Card className={`mb-6 ${resetResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <CardHeader>
              <CardTitle className={`flex items-center ${resetResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {resetResult.success ? <CheckCircle className="w-5 h-5 mr-2" /> : <XCircle className="w-5 h-5 mr-2" />}
                {resetResult.success ? 'リセット完了' : 'リセット失敗'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={resetResult.success ? 'text-green-700' : 'text-red-700'}>
                {resetResult.message}
              </p>
              {resetResult.success && resetResult.details && (
                <div className="mt-3 text-green-700 space-y-1">
                  <p>• 対象大会: {resetResult.details.tournaments_reset.join(', ')}</p>
                  <p>• リセットした試合: {resetResult.details.matches_reset}件</p>
                  <p>• クリアした結果: {resetResult.details.results_cleared}件</p>
                </div>
              )}
              {resetResult.error && (
                <p className="mt-2 text-red-600 text-sm">エラー詳細: {resetResult.error}</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左側: 対象大会選択 */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="w-5 h-5 mr-2" />
                  対象大会選択
                </CardTitle>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">リセットする大会を選択してください</p>
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>
                    {selectedTournaments.length === tournaments.length ? '全解除' : '全選択'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {tournaments.map((tournament) => (
                  <div
                    key={tournament.tournament_id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedTournaments.includes(tournament.tournament_id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleTournamentToggle(tournament.tournament_id)}
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
                            <CheckCircle className="w-3 h-3 mr-1" />
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
                ))}
              </CardContent>
            </Card>
          </div>

          {/* 右側: リセットレベル選択 */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="w-5 h-5 mr-2" />
                  リセットレベル選択
                </CardTitle>
                <p className="text-sm text-muted-foreground">実行するリセットの種類を選択してください</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {RESET_LEVELS.map((level) => (
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
                          <Badge className={`ml-2 ${getSafetyColor(level.safety)}`} variant="outline">
                            {level.safety === 'safe' && '安全'}
                            {level.safety === 'caution' && '注意'}
                            {level.safety === 'danger' && '危険'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{level.description}</p>
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
            disabled={!canExecuteReset || resetting}
            size="lg"
            className="min-w-48"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {resetting ? 'リセット中...' : 'リセットを実行'}
          </Button>
        </div>
      </div>

      {/* 確認ダイアログ */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-foreground mb-4">リセット実行の確認</h3>
            
            <div className="space-y-3 mb-6">
              <p className="text-sm text-muted-foreground">以下の内容でリセットを実行します：</p>
              <div className="bg-muted p-3 rounded">
                <p className="text-sm">
                  <strong>対象大会:</strong> {selectedTournaments.join(', ')}
                </p>
                <p className="text-sm">
                  <strong>リセットレベル:</strong> {RESET_LEVELS.find(l => l.level === selectedLevel)?.name}
                </p>
              </div>
              
              {selectedLevel === 'level3' && (
                <div className="bg-red-50 border border-red-200 p-3 rounded">
                  <p className="text-red-800 text-sm font-medium">
                    ⚠️ 完全リセットは取り消せません！
                  </p>
                </div>
              )}
            </div>

            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmPassword('');
                }}
                className="flex-1"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1"
              >
                {resetting ? '実行中...' : '実行'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}