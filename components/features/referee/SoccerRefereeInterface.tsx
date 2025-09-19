"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  RotateCcw,
  Plus,
  Minus,
  Timer,
  AlertCircle,
  FastForward
} from 'lucide-react';
import { SportRuleConfig, PeriodConfig } from '@/lib/tournament-rules';

interface ExtendedMatchData {
  match_id: number;
  match_code: string;
  tournament_id: number;
  sport_type_id: number;
  sport_code: string;
  sport_name: string;
  match_phase: 'preliminary' | 'final';
  current_period: number;
  period_count: number;
  active_periods: number[];
  max_periods: number;
  sport_config: SportRuleConfig | null;
  rules: {
    phase: 'preliminary' | 'final';
    use_extra_time: boolean;
    use_penalty: boolean;
    active_periods_json: string;
  };
}

interface MatchData {
  match_id: number;
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_name: string;
  team2_name: string;
  team1_omission?: string;
  team2_omission?: string;
  court_number: number;
  scheduled_time: string;
  period_count: number;
  current_period: number;
  match_status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  team1_scores: number[];
  team2_scores: number[];
  winner_team_id?: string;
  tournament_id?: number;
  is_confirmed?: boolean;
  remarks?: string;
}

interface Props {
  match: MatchData;
  extendedData: ExtendedMatchData;
  scores: { team1: number[], team2: number[] };
  setScores: React.Dispatch<React.SetStateAction<{ team1: number[], team2: number[] }>>;
  winnerTeam: 'team1' | 'team2' | null;
  setWinnerTeam: React.Dispatch<React.SetStateAction<'team1' | 'team2' | null>>;
  matchRemarks: string;
  setMatchRemarks: React.Dispatch<React.SetStateAction<string>>;
  isConfirmed: boolean;
  updating: boolean;
  updateMatchStatus: (action: string, additionalData?: Record<string, unknown>) => Promise<void>;
  getTotalScore: (teamScores: number[]) => number;
}

export default function SoccerRefereeInterface({
  match,
  extendedData,
  scores,
  setScores,
  winnerTeam,
  setWinnerTeam,
  matchRemarks,
  setMatchRemarks,
  isConfirmed,
  updating,
  updateMatchStatus,
  getTotalScore
}: Props) {
  const [currentPeriod, setCurrentPeriod] = useState(match.current_period);
  const [availablePeriods, setAvailablePeriods] = useState<PeriodConfig[]>([]);
  
  // PK戦用状態管理
  const [pkMode, setPkMode] = useState(false);
  const [pkScores, setPkScores] = useState({ team1: 0, team2: 0 });
  const [regularScores, setRegularScores] = useState({ team1: 0, team2: 0 });
  
  useEffect(() => {
    if (extendedData.sport_config) {
      setAvailablePeriods(extendedData.sport_config.default_periods);
    }
    
    // 初期スコアを分離
    const team1Total = getTotalScore(scores.team1);
    const team2Total = getTotalScore(scores.team2);
    setRegularScores({ team1: team1Total, team2: team2Total });
  }, [extendedData, scores, getTotalScore]);

  // ピリオド進行
  const advancePeriod = async () => {
    const nextPeriod = currentPeriod + 1;
    
    if (nextPeriod > extendedData.max_periods) {
      alert('最後のピリオドです');
      return;
    }

    // 次のピリオドが使用可能かチェック
    if (!extendedData.active_periods.includes(nextPeriod)) {
      const periodName = availablePeriods.find(p => p.period_number === nextPeriod)?.period_name || `第${nextPeriod}ピリオド`;
      const confirmed = confirm(`${periodName}は大会ルールで使用しない設定ですが、進行してもよろしいですか？`);
      if (!confirmed) return;
    }

    await updateMatchStatus('update_period', {
      current_period: nextPeriod
    });
    
    setCurrentPeriod(nextPeriod);
  };

  // ピリオド戻し（管理者のみ）
  const regressPeriod = async () => {
    if (currentPeriod <= 1) {
      alert('最初のピリオドです');
      return;
    }

    const confirmed = confirm('前のピリオドに戻してもよろしいですか？\nスコアは保持されます。');
    if (!confirmed) return;

    const prevPeriod = currentPeriod - 1;
    await updateMatchStatus('update_period', {
      current_period: prevPeriod
    });
    
    setCurrentPeriod(prevPeriod);
  };

  // ピリオドスコア変更（サッカー用）
  const changeScore = (team: 'team1' | 'team2', period: number, delta: number) => {
    setScores(prev => {
      const currentScore = Number(prev[team][period - 1]) || 0;
      const newScore = Math.max(0, currentScore + delta);
      
      const newScores = { ...prev };
      newScores[team] = [...newScores[team]];
      
      // 配列のサイズを必要に応じて拡張
      while (newScores[team].length < period) {
        newScores[team].push(0);
      }
      
      newScores[team][period - 1] = newScore;
      
      // スコア変更後に勝者を自動決定
      const team1Total = newScores.team1.reduce((sum, score) => sum + (Number(score) || 0), 0);
      const team2Total = newScores.team2.reduce((sum, score) => sum + (Number(score) || 0), 0);
      
      if (team1Total > team2Total) {
        setWinnerTeam('team1');
      } else if (team2Total > team1Total) {
        setWinnerTeam('team2');
      } else {
        setWinnerTeam(null);
      }
      
      return newScores;
    });
  };

  // 直接スコア入力（サッカー用）
  const setDirectScore = (team: 'team1' | 'team2', period: number, value: string) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    
    setScores(prev => {
      const newScores = { ...prev };
      newScores[team] = [...newScores[team]];
      
      // 配列のサイズを必要に応じて拡張
      while (newScores[team].length < period) {
        newScores[team].push(0);
      }
      
      newScores[team][period - 1] = numValue;
      
      // スコア変更後に勝者を自動決定
      const team1Total = newScores.team1.reduce((sum, score) => sum + (Number(score) || 0), 0);
      const team2Total = newScores.team2.reduce((sum, score) => sum + (Number(score) || 0), 0);
      
      if (team1Total > team2Total) {
        setWinnerTeam('team1');
      } else if (team2Total > team1Total) {
        setWinnerTeam('team2');
      } else {
        setWinnerTeam(null);
      }
      
      return newScores;
    });
  };

  // ピリオド名を取得
  const getPeriodName = (periodNumber: number): string => {
    const period = availablePeriods.find(p => p.period_number === periodNumber);
    return period?.period_name || `第${periodNumber}ピリオド`;
  };

  // ピリオドの使用可能性をチェック
  const isPeriodAvailable = (periodNumber: number): boolean => {
    return extendedData.active_periods.includes(periodNumber);
  };

  // ピリオドの必須チェック
  const isPeriodRequired = (periodNumber: number): boolean => {
    const period = availablePeriods.find(p => p.period_number === periodNumber);
    return period?.is_required || false;
  };

  // PK戦モード切り替え
  const togglePkMode = () => {
    if (!pkMode) {
      const confirmed = confirm('PK戦モードに切り替えますか？\n通常ゴールとPKゴールが分離して記録されます。');
      if (confirmed) {
        setPkMode(true);
        // 現在のスコアを通常ゴールとして保存
        const team1Total = getTotalScore(scores.team1);
        const team2Total = getTotalScore(scores.team2);
        setRegularScores({ team1: team1Total, team2: team2Total });
        setPkScores({ team1: 0, team2: 0 });
      }
    } else {
      const confirmed = confirm('通常モードに戻りますか？\nPKスコアは保持されます。');
      if (confirmed) {
        setPkMode(false);
      }
    }
  };

  // PKスコア変更
  const changePkScore = (team: 'team1' | 'team2', delta: number) => {
    setPkScores(prev => {
      const currentScore = prev[team];
      const newScore = Math.max(0, currentScore + delta);
      const newScores = { ...prev, [team]: newScore };
      
      // PKスコアに基づいて勝者を自動決定
      if (newScores.team1 > newScores.team2) {
        setWinnerTeam('team1');
      } else if (newScores.team2 > newScores.team1) {
        setWinnerTeam('team2');
      } else if (regularScores.team1 === regularScores.team2) {
        setWinnerTeam(null); // 通常ゴール・PKともに同点
      }
      
      return newScores;
    });
  };

  // サッカー用スコア更新
  const updateSoccerScores = async () => {
    // ピリオド別スコアデータを構築
    const periodScores = extendedData.active_periods.map(periodNumber => ({
      period: periodNumber,
      team1_score: scores.team1[periodNumber - 1] || 0,
      team2_score: scores.team2[periodNumber - 1] || 0
    }));

    // スコアと勝者選択の矛盾をチェック
    const team1Total = getTotalScore(scores.team1);
    const team2Total = getTotalScore(scores.team2);
    let scoreWinner = null;
    if (team1Total > team2Total) scoreWinner = 'team1';
    else if (team2Total > team1Total) scoreWinner = 'team2';
    
    // 矛盾がある場合は確認ダイアログを表示
    if (scoreWinner && winnerTeam && scoreWinner !== winnerTeam) {
      const team1DisplayName = match.team1_omission || match.team1_name || 'チーム1';
      const team2DisplayName = match.team2_omission || match.team2_name || 'チーム2';
      const scoreWinnerName = scoreWinner === 'team1' ? team1DisplayName : team2DisplayName;
      const selectedWinnerName = winnerTeam === 'team1' ? team1DisplayName : team2DisplayName;
      
      const confirmed = window.confirm(
        `スコア上は「${scoreWinnerName}」が勝利していますが、選択されているのは「${selectedWinnerName}」です。\n\nこのまま登録してもよろしいですか？`
      );
      
      if (!confirmed) {
        return; // 登録をキャンセル
      }
    }

    // 勝者IDを決定
    let winner_team_id = null;
    if (winnerTeam === 'team1' && match.team1_id) {
      winner_team_id = match.team1_id;
    } else if (winnerTeam === 'team2' && match.team2_id) {
      winner_team_id = match.team2_id;
    }

    // 拡張スコアAPIを使用（PK戦データを含む）
    const requestData = {
      period_scores: periodScores,
      winner_team_id: winner_team_id,
      is_draw: winnerTeam === null,
      remarks: matchRemarks.trim() || null,
      updated_by: 'referee',
      // PK戦データを追加
      pk_mode: pkMode,
      regular_scores: pkMode ? regularScores : null,
      pk_scores: pkMode ? pkScores : null
    };

    try {
      const response = await fetch(`/api/matches/${match.match_id}/scores-extended`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();

      if (result.success) {
        if (pkMode) {
          alert('PK戦データを含むサッカー試合のスコアを保存しました！');
        } else {
          alert('サッカー試合のスコアを保存しました！');
        }
      } else {
        alert(`エラー: ${result.error}`);
      }
    } catch (error) {
      console.error('Soccer score update error:', error);
      alert('スコア保存中にエラーが発生しました');
    }
  };

  return (
    <div className="space-y-6">
      {/* サッカー専用ピリオド制御 */}
      <Card className="border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-950/20">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Timer className="w-5 h-5 text-green-600" />
            <span>サッカー試合進行</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 現在ピリオド表示 */}
            <div className="flex items-center justify-between p-4 bg-card rounded-lg border-2">
              <div className="flex items-center space-x-3">
                <div className="text-2xl font-bold text-green-600">
                  {getPeriodName(currentPeriod)}
                </div>
                {isPeriodAvailable(currentPeriod) ? (
                  <Badge variant="default" className="bg-green-600">使用中</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-yellow-500 text-white">規定外</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {currentPeriod}/{extendedData.max_periods}
              </div>
            </div>

            {/* ピリオド操作ボタン */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={regressPeriod}
                disabled={currentPeriod <= 1 || isConfirmed || match.match_status !== 'ongoing'}
                className="flex items-center space-x-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>前のピリオドへ</span>
              </Button>
              
              <Button
                variant="default"
                onClick={advancePeriod}
                disabled={currentPeriod >= extendedData.max_periods || isConfirmed || match.match_status !== 'ongoing'}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
              >
                <FastForward className="w-4 h-4" />
                <span>次のピリオドへ</span>
              </Button>
            </div>

            {/* ピリオド一覧表示 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availablePeriods.map((period) => {
                const isCurrent = period.period_number === currentPeriod;
                const isAvailable = isPeriodAvailable(period.period_number);
                const isRequired = isPeriodRequired(period.period_number);
                
                return (
                  <div
                    key={period.period_number}
                    className={`p-2 rounded border text-center text-sm ${
                      isCurrent 
                        ? 'border-green-500 bg-green-100 dark:bg-green-900/30' 
                        : isAvailable
                        ? 'border-blue-200 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 bg-gray-50 dark:bg-gray-800'
                    }`}
                  >
                    <div className="font-medium">{period.period_name}</div>
                    <div className="mt-1 space-x-1">
                      {isCurrent && <Badge variant="default" className="text-xs bg-green-600">現在</Badge>}
                      {isRequired && <Badge variant="secondary" className="text-xs bg-green-600">必須</Badge>}
                      {isAvailable && !isCurrent && <Badge variant="outline" className="text-xs">使用</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* サッカー対応スコア入力 */}
      <Card>
        <CardHeader>
          <CardTitle>ピリオド別スコア入力</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {extendedData.active_periods.map((periodNumber) => {
              const periodName = getPeriodName(periodNumber);
              const isCurrent = periodNumber === currentPeriod;
              const isAvailable = isPeriodAvailable(periodNumber);
              
              return (
                <div key={periodNumber} className={`border rounded-lg p-4 ${
                  isCurrent ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' : 'border-border'
                }`}>
                  <Label className="block text-sm font-medium mb-3">
                    {periodName}
                    {isCurrent && match.match_status === 'ongoing' && !isConfirmed && (
                      <Badge className="ml-2 bg-green-600">進行中</Badge>
                    )}
                    {!isAvailable && (
                      <Badge variant="secondary" className="ml-2 bg-yellow-500 text-white">規定外</Badge>
                    )}
                  </Label>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {/* チーム1 */}
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-2">{match.team1_name}</div>
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => changeScore('team1', periodNumber, -1)}
                          disabled={match.match_status !== 'ongoing' || isConfirmed}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="text-2xl font-bold w-8 text-center">
                          {scores.team1[periodNumber - 1] || 0}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => changeScore('team1', periodNumber, 1)}
                          disabled={match.match_status !== 'ongoing' || isConfirmed}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={scores.team1[periodNumber - 1] || 0}
                        onChange={(e) => setDirectScore('team1', periodNumber, e.target.value)}
                        disabled={match.match_status !== 'ongoing' || isConfirmed}
                        className="w-16 h-8 text-center text-sm mx-auto"
                        placeholder="0"
                      />
                    </div>

                    {/* チーム2 */}
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-2">{match.team2_name}</div>
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => changeScore('team2', periodNumber, -1)}
                          disabled={match.match_status !== 'ongoing' || isConfirmed}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="text-2xl font-bold w-8 text-center">
                          {scores.team2[periodNumber - 1] || 0}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => changeScore('team2', periodNumber, 1)}
                          disabled={match.match_status !== 'ongoing' || isConfirmed}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={scores.team2[periodNumber - 1] || 0}
                        onChange={(e) => setDirectScore('team2', periodNumber, e.target.value)}
                        disabled={match.match_status !== 'ongoing' || isConfirmed}
                        className="w-16 h-8 text-center text-sm mx-auto"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 合計スコア表示 */}
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-foreground">合計スコア</h4>
                {!pkMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={togglePkMode}
                    disabled={isConfirmed || match.match_status !== 'ongoing'}
                    className="text-xs border-orange-300 hover:bg-orange-50"
                  >
                    PK戦モード
                  </Button>
                )}
              </div>
              
              {!pkMode ? (
                // 通常モード表示
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">{match.team1_name}</div>
                    <div className="text-3xl font-bold text-blue-600">
                      {getTotalScore(scores.team1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{match.team2_name}</div>
                    <div className="text-3xl font-bold text-red-600">
                      {getTotalScore(scores.team2)}
                    </div>
                  </div>
                </div>
              ) : (
                // PKモード表示
                <div className="space-y-4">
                  {/* 通常ゴール */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-2 text-center">通常ゴール</div>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-xs text-muted-foreground">{match.team1_name}</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {regularScores.team1}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{match.team2_name}</div>
                        <div className="text-2xl font-bold text-red-600">
                          {regularScores.team2}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* PKゴール */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-center mb-2">
                      <div className="text-xs text-muted-foreground">PKゴール</div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={togglePkMode}
                        className="ml-2 text-xs text-orange-600 hover:text-orange-700"
                      >
                        通常モードに戻る
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-xs text-muted-foreground">{match.team1_name}</div>
                        <div className="text-2xl font-bold text-orange-600">
                          {pkScores.team1}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{match.team2_name}</div>
                        <div className="text-2xl font-bold text-orange-600">
                          {pkScores.team2}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 総合結果 */}
                  <div className="border-t pt-4 bg-slate-50 dark:bg-slate-800 p-3 rounded">
                    <div className="text-xs text-muted-foreground mb-2 text-center">総合結果</div>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-xs text-muted-foreground">{match.team1_name}</div>
                        <div className="text-xl font-bold text-blue-600">
                          {regularScores.team1} ({pkScores.team1})
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{match.team2_name}</div>
                        <div className="text-xl font-bold text-red-600">
                          {regularScores.team2} ({pkScores.team2})
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* PK戦専用入力UI */}
            {pkMode && (match.match_status === 'ongoing' || match.match_status === 'completed') && (
              <Card className="border-orange-200 bg-orange-50/30 dark:border-orange-800 dark:bg-orange-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-orange-700 dark:text-orange-300">
                    <div className="w-5 h-5 rounded-full bg-orange-600 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">PK</span>
                    </div>
                    <span>PK戦スコア入力</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    {/* チーム1 PK */}
                    <div className="text-center">
                      <div className="text-sm font-medium text-muted-foreground mb-3">{match.team1_name}</div>
                      <div className="flex items-center justify-center space-x-3 mb-3">
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => changePkScore('team1', -1)}
                          disabled={match.match_status !== 'ongoing' || isConfirmed}
                          className="border-orange-300 hover:bg-orange-50"
                        >
                          <Minus className="w-5 h-5" />
                        </Button>
                        <div className="text-4xl font-bold text-orange-600 w-16 text-center">
                          {pkScores.team1}
                        </div>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => changePkScore('team1', 1)}
                          disabled={match.match_status !== 'ongoing' || isConfirmed}
                          className="border-orange-300 hover:bg-orange-50"
                        >
                          <Plus className="w-5 h-5" />
                        </Button>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={pkScores.team1}
                        onChange={(e) => {
                          const value = Math.max(0, parseInt(e.target.value) || 0);
                          setPkScores(prev => ({ ...prev, team1: value }));
                        }}
                        disabled={match.match_status !== 'ongoing' || isConfirmed}
                        className="w-20 h-10 text-center text-lg mx-auto border-orange-300"
                        placeholder="0"
                      />
                    </div>

                    {/* チーム2 PK */}
                    <div className="text-center">
                      <div className="text-sm font-medium text-muted-foreground mb-3">{match.team2_name}</div>
                      <div className="flex items-center justify-center space-x-3 mb-3">
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => changePkScore('team2', -1)}
                          disabled={match.match_status !== 'ongoing' || isConfirmed}
                          className="border-orange-300 hover:bg-orange-50"
                        >
                          <Minus className="w-5 h-5" />
                        </Button>
                        <div className="text-4xl font-bold text-orange-600 w-16 text-center">
                          {pkScores.team2}
                        </div>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => changePkScore('team2', 1)}
                          disabled={match.match_status !== 'ongoing' || isConfirmed}
                          className="border-orange-300 hover:bg-orange-50"
                        >
                          <Plus className="w-5 h-5" />
                        </Button>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={pkScores.team2}
                        onChange={(e) => {
                          const value = Math.max(0, parseInt(e.target.value) || 0);
                          setPkScores(prev => ({ ...prev, team2: value }));
                        }}
                        disabled={match.match_status !== 'ongoing' || isConfirmed}
                        className="w-20 h-10 text-center text-lg mx-auto border-orange-300"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4 text-center">
                    <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                      <AlertDescription className="text-orange-800 dark:text-orange-200">
                        PK戦のスコアは通常ゴールとは分離して記録されます。「スコア・結果を保存」ボタンで両方のデータが保存されます。
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 勝者選択・備考・保存 */}
            {(match.match_status === 'ongoing' || match.match_status === 'completed') && (
              <div className="mt-4 space-y-4">
                <div>
                  <Label className="text-sm font-medium">勝利チーム選択</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Button
                      variant={winnerTeam === 'team1' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWinnerTeam('team1')}
                      disabled={isConfirmed}
                      className={winnerTeam === 'team1' ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600' : 'hover:bg-blue-50 border-gray-300'}
                    >
                      {match.team1_omission || match.team1_name}
                    </Button>
                    <Button
                      variant={winnerTeam === null ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWinnerTeam(null)}
                      disabled={isConfirmed}
                      className={winnerTeam === null ? 'bg-secondary text-white hover:bg-secondary/80 border-secondary' : 'hover:bg-muted border-border'}
                    >
                      引分
                    </Button>
                    <Button
                      variant={winnerTeam === 'team2' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWinnerTeam('team2')}
                      disabled={isConfirmed}
                      className={winnerTeam === 'team2' ? 'bg-red-600 text-white hover:bg-red-700 border-red-600' : 'hover:bg-red-50 border-gray-300'}
                    >
                      {match.team2_omission || match.team2_name}
                    </Button>
                  </div>
                </div>

                {/* 備考欄 */}
                <div>
                  <Label htmlFor="soccer-remarks" className="text-sm font-medium">
                    備考 (任意)
                  </Label>
                  <textarea
                    id="soccer-remarks"
                    value={matchRemarks}
                    onChange={(e) => setMatchRemarks(e.target.value)}
                    disabled={match.match_status !== 'ongoing' || isConfirmed}
                    className="mt-1 w-full px-3 py-2 border border-input bg-background text-foreground rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-muted disabled:text-muted-foreground"
                    rows={2}
                    placeholder="延長戦・PK戦での決着、その他特記事項など..."
                  />
                </div>

                {/* スコア保存ボタン */}
                <Button
                  className={`w-full border-2 ${pkMode ? 'border-orange-600 bg-orange-600 hover:bg-orange-700' : 'border-blue-600'}`}
                  onClick={updateSoccerScores}
                  disabled={updating || match.match_status !== 'ongoing' || isConfirmed}
                >
                  {updating ? '保存中...' : pkMode ? 'PK戦込みスコア・結果を保存' : 'スコア・結果を保存'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}