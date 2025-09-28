'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  Square, 
  RotateCcw,
  Plus,
  Minus,
  Clock,
  Users,
  MapPin,
  AlertCircle,
  CheckCircle,
  Timer,
  ArrowLeft
} from 'lucide-react';
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
  actual_start_time?: string;
  actual_end_time?: string;
  referee_access: boolean;
  remarks?: string;
  tournament_id?: number;
}

export default function RefereeMatchPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const matchId = params.id as string;
  const token = searchParams.get('token');

  const [match, setMatch] = useState<MatchData | null>(null);
  const [extendedData, setExtendedData] = useState<{
    sport_config?: {
      default_periods: Array<{
        period_number: number;
        period_name: string;
      }>;
    };
    active_periods?: number[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<{ team1: number[], team2: number[] }>({ team1: [], team2: [] });
  const [winnerTeam, setWinnerTeam] = useState<'team1' | 'team2' | null>(null);
  const [matchRemarks, setMatchRemarks] = useState<string>('');
  const [tournamentId, setTournamentId] = useState<number | null>(null);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false); // 結果が保存されているかどうか
  // const [sportConfig, setSportConfig] = useState<SportRuleConfig | null>(null); // 将来の多競技対応用

  // トークン検証とマッチデータ取得
  useEffect(() => {
    const verifyTokenAndLoadMatch = async () => {
      if (!token) {
        setError('アクセストークンが必要です');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/matches/${matchId}/qr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        const result = await response.json();

        if (result.success) {
          setMatch(result.data);
          
          // トーナメントIDを取得
          if (result.data.tournament_id) {
            setTournamentId(result.data.tournament_id);
          }
          
          // 多競技対応：スポーツ設定を取得
          if (result.data.sport_config) {
            // 将来の多競技対応用（現在は使用しない）
            // setSportConfig(result.data.sport_config);
          }
          
          // 確定状態を設定
          setIsConfirmed(result.data.is_confirmed || false);
          
          // 既存のデータを復元
          if (result.data.remarks) {
            setMatchRemarks(result.data.remarks);
          }
          
          // 既存の勝者情報を復元
          if (result.data.winner_team_id) {
            console.log('Initial winner restoration:', {
              winner_team_id: result.data.winner_team_id,
              team1_id: result.data.team1_id,
              team2_id: result.data.team2_id
            });
            if (result.data.winner_team_id === result.data.team1_id) {
              setWinnerTeam('team1');
              console.log('Initial set winner to team1');
            } else if (result.data.winner_team_id === result.data.team2_id) {
              setWinnerTeam('team2');
              console.log('Initial set winner to team2');
            }
          } else {
            console.log('No initial winner_team_id found');
            setWinnerTeam(null);
          }
          
          // 現在のスコアを初期化
          const periodCount = result.data.period_count || 1;
          let currentScores;
          
          // APIからスコアデータがある場合はそれを使用
          if (result.data.team1_scores && result.data.team2_scores) {
            currentScores = {
              team1: (result.data.team1_scores as (string | number)[]).map((score) => Number(score) || 0),
              team2: (result.data.team2_scores as (string | number)[]).map((score) => Number(score) || 0)
            };
          } else {
            // スコアデータがない場合は0で初期化
            currentScores = {
              team1: new Array(periodCount).fill(0),
              team2: new Array(periodCount).fill(0)
            };
          }
          
          setScores(currentScores);
          
          // 拡張データの取得（ピリオド名表示用）
          try {
            const extendedResponse = await fetch(`/api/matches/${matchId}/extended-info`);
            const extendedResult = await extendedResponse.json();
            
            if (extendedResult.success) {
              setExtendedData(extendedResult.data);
              console.log('Extended match data loaded:', extendedResult.data);
            } else {
              console.warn('Extended data load failed:', extendedResult.error);
              // 拡張データ取得失敗は警告のみ（既存機能は維持）
            }
          } catch (extendedErr) {
            console.warn('Extended data fetch error:', extendedErr);
            // 拡張データ取得エラーは警告のみ
          }
          
        } else {
          console.error('Token verification failed:', result);
          const errorMsg = result.error || 'アクセス権限の確認に失敗しました';
          const details = result.details ? `\n詳細: ${result.details}` : '';
          setError(errorMsg + details);
        }
      } catch (err) {
        console.error('Network error:', err);
        setError('サーバーとの通信に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    verifyTokenAndLoadMatch();
  }, [matchId, token]);

  // 初回のみ現在の試合状態を取得
  useEffect(() => {
    const loadCurrentMatchStatus = async () => {
      if (!match) return;

      try {
        const response = await fetch(`/api/matches/${matchId}/status`);
        const result = await response.json();

        if (result.success) {
          // スコアを更新（確実に数値として処理）
          if (result.data.team1_scores && result.data.team2_scores) {
            setScores({
              team1: (result.data.team1_scores as (string | number)[]).map((score) => Number(score) || 0),
              team2: (result.data.team2_scores as (string | number)[]).map((score) => Number(score) || 0)
            });
          }
          
          // 勝者情報を復元（状態取得時も実行）
          if (result.data.winner_team_id) {
            if (result.data.winner_team_id === result.data.team1_id) {
              setWinnerTeam('team1');
            } else if (result.data.winner_team_id === result.data.team2_id) {
              setWinnerTeam('team2');
            }
          } else {
            setWinnerTeam(null);
          }
          
          // matchの備考を更新
          if (result.data.remarks) {
            setMatchRemarks(result.data.remarks);
          }
        }
      } catch (err) {
        console.error('Status load error:', err);
      }
    };

    if (match && !loading) {
      loadCurrentMatchStatus();
    }
  }, [matchId, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 試合状態更新
  const updateMatchStatus = async (action: string, additionalData?: Record<string, unknown>) => {
    if (!match) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/matches/${matchId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          updated_by: 'referee',
          ...additionalData
        })
      });
      
      const result = await response.json();

      if (response.ok && result.success) {
        setMatch(prev => prev ? { ...prev, ...result.data } : null);
        
        if (action === 'start') {
          alert('試合を開始しました！');
          // 試合開始時は初期スコア（0-0）が既に保存されているとみなす
          setIsSaved(true);
        } else if (action === 'end') {
          alert('試合を終了しました。お疲れ様でした！');
        }
      } else {
        console.error('Match status update failed:', result);
        alert(`エラー: ${result.error || '試合状態の更新に失敗しました'}`);
      }
    } catch (err) {
      console.error('Network error during match status update:', err);
      alert('ネットワークエラーが発生しました。もう一度お試しください。');
    } finally {
      setUpdating(false);
    }
  };

  // スコア・結果更新（勝者選択の矛盾チェック付き）
  const updateScores = async () => {
    // スコアと勝者選択の矛盾をチェック
    const team1Total = getTotalScore(scores.team1);
    const team2Total = getTotalScore(scores.team2);
    let scoreWinner = null;
    if (team1Total > team2Total) scoreWinner = 'team1';
    else if (team2Total > team1Total) scoreWinner = 'team2';
    
    // 矛盾がある場合は確認ダイアログを表示
    if (scoreWinner && winnerTeam && scoreWinner !== winnerTeam) {
      const team1DisplayName = match?.team1_omission || match?.team1_name || 'チーム1';
      const team2DisplayName = match?.team2_omission || match?.team2_name || 'チーム2';
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
    if (winnerTeam === 'team1' && match?.team1_id) {
      winner_team_id = match.team1_id;
    } else if (winnerTeam === 'team2' && match?.team2_id) {
      winner_team_id = match.team2_id;
    }

    await updateMatchStatus('update_scores', {
      team1_scores: scores.team1,
      team2_scores: scores.team2,
      winner_team_id: winner_team_id,
      remarks: matchRemarks.trim() || null
    });
    
    // 結果が正常に保存されたらisSavedをtrueに設定
    setIsSaved(true);
  };

  // ピリオドスコア変更（スコア変更時に勝者を自動決定）
  const changeScore = useCallback((team: 'team1' | 'team2', period: number, delta: number) => {
    console.log('changeScore called:', { team, period, delta });
    
    // スコア変更時に保存状態をリセット
    setIsSaved(false);
    
    setScores(prev => {
      // 現在のスコアを確実に数値として取得
      const currentScore = Number(prev[team][period]) || 0;
      const newScore = Math.max(0, currentScore + delta);
      console.log('Score change:', { team, period, currentScore, delta, newScore });
      
      const newScores = { ...prev };
      newScores[team] = [...newScores[team]];
      newScores[team][period] = newScore;
      
      return newScores;
    });
  }, []);

  // スコア変更後の勝者自動決定（PK戦考慮）
  useEffect(() => {
    if (!extendedData?.active_periods) {
      // 拡張データがない場合は従来の計算
      const team1Total = scores.team1.reduce((sum, score) => sum + (Number(score) || 0), 0);
      const team2Total = scores.team2.reduce((sum, score) => sum + (Number(score) || 0), 0);
      
      if (team1Total > team2Total) {
        setWinnerTeam('team1');
      } else if (team2Total > team1Total) {
        setWinnerTeam('team2');
      } else {
        setWinnerTeam(null); // 同点の場合
      }
    } else {
      // 通常時間での勝者判定
      const team1RegularTotal = getTotalScore(scores.team1);
      const team2RegularTotal = getTotalScore(scores.team2);
      
      if (team1RegularTotal > team2RegularTotal) {
        setWinnerTeam('team1');
      } else if (team2RegularTotal > team1RegularTotal) {
        setWinnerTeam('team2');
      } else {
        // 通常時間が同点の場合、PK戦の結果をチェック
        const pkPeriods = extendedData.active_periods.filter(p => {
          const periodName = getPeriodName(p);
          return periodName.includes('PK');
        });
        
        if (pkPeriods.length > 0) {
          // PK戦のスコアを取得
          let team1PkTotal = 0;
          let team2PkTotal = 0;
          
          pkPeriods.forEach(p => {
            const scoreIndex = p - 1;
            team1PkTotal += Number(scores.team1[scoreIndex]) || 0;
            team2PkTotal += Number(scores.team2[scoreIndex]) || 0;
          });
          
          if (team1PkTotal > team2PkTotal) {
            setWinnerTeam('team1');
          } else if (team2PkTotal > team1PkTotal) {
            setWinnerTeam('team2');
          } else {
            setWinnerTeam(null); // PK戦でも同点
          }
        } else {
          setWinnerTeam(null); // 通常時間同点、PK戦なし
        }
      }
    }
  }, [scores, extendedData]); // eslint-disable-line react-hooks/exhaustive-deps

  // 直接スコア入力
  const setDirectScore = (team: 'team1' | 'team2', period: number, value: string) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    
    // スコア変更時に保存状態をリセット
    setIsSaved(false);
    
    setScores(prev => {
      const newScores = { ...prev };
      newScores[team] = [...newScores[team]]; // 配列を新しく作成
      newScores[team][period] = numValue;
      
      return newScores;
    });
  };

  // 総得点計算（PK戦ピリオドを除外）
  const getTotalScore = (teamScores: number[]) => {
    if (!extendedData?.active_periods) {
      // 拡張データがない場合は従来の計算
      return teamScores.reduce((sum, score) => sum + (Number(score) || 0), 0);
    }
    
    // PK戦ピリオドを除外して計算
    const regularPeriods = extendedData.active_periods.filter(p => {
      const periodName = getPeriodName(p);
      return !periodName.includes('PK');
    });
    
    return regularPeriods.reduce((sum, p) => {
      const scoreIndex = p - 1; // 0ベースのインデックス
      return sum + (Number(teamScores[scoreIndex]) || 0);
    }, 0);
  };

  // ピリオド名を取得する関数（ルール設定に基づく）
  const getPeriodName = (periodNumber: number): string => {
    if (extendedData?.sport_config?.default_periods) {
      const period = extendedData.sport_config.default_periods.find(
        p => p.period_number === periodNumber
      );
      if (period) {
        return period.period_name;
      }
    }
    // フォールバック：従来の「第Nピリオド」表記
    return `第${periodNumber}ピリオド`;
  };

  // PK戦結果を取得する関数
  const getPenaltyKickResult = () => {
    if (!extendedData?.active_periods) return null;
    
    const pkPeriods = extendedData.active_periods.filter(p => {
      const periodName = getPeriodName(p);
      return periodName.includes('PK');
    });
    
    if (pkPeriods.length === 0) return null;
    
    let team1PkTotal = 0;
    let team2PkTotal = 0;
    
    pkPeriods.forEach(p => {
      const scoreIndex = p - 1;
      team1PkTotal += Number(scores.team1[scoreIndex]) || 0;
      team2PkTotal += Number(scores.team2[scoreIndex]) || 0;
    });
    
    return {
      team1PkScore: team1PkTotal,
      team2PkScore: team2PkTotal,
      hasPkScore: team1PkTotal > 0 || team2PkTotal > 0
    };
  };


  // ピリオド進行
  const advancePeriod = async () => {
    if (!match || match.current_period >= match.period_count) return;
    
    await updateMatchStatus('update_period', {
      current_period: match.current_period + 1
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">認証中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                {error}
              </AlertDescription>
            </Alert>
            <Button 
              className="w-full mt-4" 
              onClick={() => router.push('/')}
            >
              ホームに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">試合データが見つかりません</p>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (match.match_status) {
      case 'scheduled': return <Clock className="w-5 h-5 text-muted-foreground" />;
      case 'ongoing': return <Play className="w-5 h-5 text-green-600" />;
      case 'completed': return <CheckCircle className="w-5 h-5 text-blue-600" />;
      default: return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getStatusLabel = () => {
    switch (match.match_status) {
      case 'scheduled': return '試合前';
      case 'ongoing': return '試合中';
      case 'completed': return '完了';
      case 'cancelled': return '中止';
      default: return '不明';
    }
  };


  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ヘッダー */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-4">
            {/* 戻るボタン */}
            {tournamentId && (
              <div className="mb-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => router.push(`/admin/tournaments/${tournamentId}/matches`)}
                  className="flex items-center space-x-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>試合管理に戻る</span>
                </Button>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-3">
                <Users className="w-6 h-6 text-blue-600" />
                <span>{match.match_code}</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
                {getStatusIcon()}
                <span className={`font-medium ${
                  match.match_status === 'ongoing' ? 'text-green-600' : 
                  match.match_status === 'completed' ? 'text-blue-600' : 'text-muted-foreground'
                }`}>
                  {getStatusLabel()}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {match.team1_name} vs {match.team2_name}
              </h1>
              <div className="flex items-center justify-center space-x-6 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-1" />
                  コート{match.court_number}
                </div>
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  {match.scheduled_time}
                </div>
                {match.match_status === 'ongoing' && (
                  <div className="flex items-center">
                    <Timer className="w-4 h-4 mr-1" />
                    第{match.current_period}ピリオド
                  </div>
                )}
              </div>
            </div>

            {/* 確定済み試合の警告 */}
            {isConfirmed && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-400 dark:border-amber-600 p-4 mb-4 rounded-r-lg">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-amber-500 mr-2" />
                  <p className="text-amber-800 dark:text-amber-200 font-medium">
                    この試合は既に確定済みです。結果の編集はできません。
                  </p>
                </div>
              </div>
            )}

            {/* 現在のスコア表示 */}
            <div className="bg-card p-6 rounded-lg border-2 border-border mb-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-foreground mb-2">
                  {getTotalScore(scores.team1)} - {getTotalScore(scores.team2)}
                </div>
                <div className="text-sm text-muted-foreground">現在のスコア</div>
                
                {/* PK戦結果表示 */}
                {(() => {
                  const pkResult = getPenaltyKickResult();
                  if (pkResult && pkResult.hasPkScore) {
                    return (
                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="text-lg font-semibold text-orange-600">
                          PK戦 {pkResult.team1PkScore} - {pkResult.team2PkScore}
                        </div>
                        <div className="text-xs text-muted-foreground">ペナルティキック</div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* シンプルな試合管理インターフェース */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 試合制御 */}
          <Card>
            <CardHeader>
              <CardTitle>試合制御</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {match.match_status === 'scheduled' && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  size="lg"
                  onClick={() => updateMatchStatus('start')}
                  disabled={updating || isConfirmed}
                >
                  <Play className="w-5 h-5 mr-2" />
                  試合開始
                </Button>
              )}

              {match.match_status === 'ongoing' && (
                <div className="space-y-3">
                  {/* 確定前のメッセージ */}
                  {!isConfirmed && (
                    <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-800 dark:text-blue-200">
                        結果確定前の試合は、「試合開始前」や「実施中」に戻すことができます。
                      </AlertDescription>
                    </Alert>
                  )}

                  {match.current_period < match.period_count && (
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      onClick={advancePeriod}
                      disabled={updating || isConfirmed}
                    >
                      <RotateCcw className="w-5 h-5 mr-2" />
                      第{match.current_period + 1}ピリオドへ
                    </Button>
                  )}

                  <Button
                    className="w-full bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      // 結果が保存されていない場合は警告を表示
                      if (!isSaved) {
                        if (!window.confirm('スコア・結果が保存されていません。\n\n試合を終了する前に「スコア・結果を保存」ボタンを押して結果を保存してください。\n\nこのまま試合を終了しますか？')) {
                          return;
                        }
                      }
                      updateMatchStatus('end');
                    }}
                    disabled={updating || isConfirmed}
                  >
                    <Square className="w-5 h-5 mr-2" />
                    試合終了
                  </Button>

                  {/* 試合開始前に戻すボタン（確定前のみ表示） */}
                  {!isConfirmed && (
                    <Button
                      className="w-full bg-gray-400 hover:bg-gray-500 text-white"
                      variant="secondary"
                      onClick={() => {
                        if (window.confirm('試合を開始前の状態に戻しますか？\n\n現在のスコアやピリオド情報は保持されますが、試合状態は「開始前」に戻ります。')) {
                          updateMatchStatus('reset');
                        }
                      }}
                      disabled={updating}
                    >
                      <ArrowLeft className="w-5 h-5 mr-2" />
                      試合開始前に戻す
                    </Button>
                  )}
                </div>
              )}

              {match.match_status === 'completed' && !isConfirmed && (
                <div className="space-y-3">
                  <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800 dark:text-blue-200">
                      結果確定前の試合は、「試合開始前」や「実施中」に戻すことができます。
                    </AlertDescription>
                  </Alert>

                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => updateMatchStatus('start')}
                    disabled={updating}
                  >
                    <Play className="w-5 h-5 mr-2" />
                    試合再開（結果修正）
                  </Button>

                  <Button
                    className="w-full bg-gray-400 hover:bg-gray-500 text-white"
                    variant="secondary"
                    onClick={() => {
                      if (window.confirm('試合を開始前の状態に戻しますか？\n\n現在のスコアやピリオド情報は保持されますが、試合状態は「開始前」に戻ります。')) {
                        updateMatchStatus('reset');
                      }
                    }}
                    disabled={updating}
                  >
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    試合開始前に戻す
                  </Button>
                </div>
              )}

              {match.match_status === 'completed' && isConfirmed && (
                <div className="text-center py-4">
                  <div className="flex items-center justify-center text-green-600 mb-2">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    <span className="font-medium">試合結果確定済み</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    この試合の結果は既に確定されており、編集できません。
                  </p>
                </div>
              )}

              {/* 試合状態インジケーター */}
              <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-medium mb-3">試合状態</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-3 rounded-md border-2 text-center transition-all ${
                    match.match_status === 'scheduled' 
                      ? 'border-gray-500 bg-gray-100 dark:bg-gray-800 font-medium' 
                      : 'border-gray-200 dark:border-gray-700 text-muted-foreground'
                  }`}>
                    <Clock className={`w-4 h-4 mx-auto mb-1 ${
                      match.match_status === 'scheduled' ? 'text-gray-600' : 'text-muted-foreground'
                    }`} />
                    <span className="text-xs">試合前</span>
                  </div>

                  <div className={`p-3 rounded-md border-2 text-center transition-all ${
                    match.match_status === 'ongoing' 
                      ? 'border-green-500 bg-green-100 dark:bg-green-900/30 font-medium' 
                      : 'border-gray-200 dark:border-gray-700 text-muted-foreground'
                  }`}>
                    <Play className={`w-4 h-4 mx-auto mb-1 ${
                      match.match_status === 'ongoing' ? 'text-green-600' : 'text-muted-foreground'
                    }`} />
                    <span className="text-xs">進行中</span>
                  </div>

                  <div className={`p-3 rounded-md border-2 text-center transition-all ${
                    match.match_status === 'completed' && !isConfirmed 
                      ? 'border-yellow-500 bg-yellow-100 dark:bg-yellow-900/30 font-medium' 
                      : 'border-gray-200 dark:border-gray-700 text-muted-foreground'
                  }`}>
                    <AlertCircle className={`w-4 h-4 mx-auto mb-1 ${
                      match.match_status === 'completed' && !isConfirmed ? 'text-yellow-600' : 'text-muted-foreground'
                    }`} />
                    <span className="text-xs">確定待ち</span>
                  </div>

                  <div className={`p-3 rounded-md border-2 text-center transition-all ${
                    match.match_status === 'completed' && isConfirmed 
                      ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30 font-medium' 
                      : 'border-gray-200 dark:border-gray-700 text-muted-foreground'
                  }`}>
                    <CheckCircle className={`w-4 h-4 mx-auto mb-1 ${
                      match.match_status === 'completed' && isConfirmed ? 'text-blue-600' : 'text-muted-foreground'
                    }`} />
                    <span className="text-xs">完了</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* スコア入力 */}
          <Card>
            <CardHeader>
              <CardTitle>スコア入力</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(extendedData?.active_periods || Array.from({ length: match.period_count }, (_, i) => i + 1)).map((periodNumber: number) => {
                  const periodIndex = periodNumber - 1; // スコア配列のインデックス（0ベース）
                  return (
                    <div key={periodNumber} className="border rounded-lg p-4">
                    <Label className="block text-sm font-medium mb-3">
                      {getPeriodName(periodNumber)}
                      {periodNumber === match.current_period && match.match_status === 'ongoing' && !isConfirmed && (
                        <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          進行中
                        </span>
                      )}
                      {periodNumber === match.current_period && match.match_status === 'completed' && (
                        <span className="ml-2 text-xs bg-muted text-foreground px-2 py-1 rounded">
                          終了
                        </span>
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
                            onClick={() => changeScore('team1', periodIndex, -1)}
                            disabled={match.match_status !== 'ongoing' || isConfirmed}
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="text-2xl font-bold w-8 text-center">
                            {scores.team1[periodIndex] || 0}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => changeScore('team1', periodIndex, 1)}
                            disabled={match.match_status !== 'ongoing' || isConfirmed}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        {/* 直接入力フィールド */}
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">直接入力</div>
                          <Input
                            type="number"
                            min="0"
                            value={scores.team1[periodIndex] || 0}
                            onChange={(e) => setDirectScore('team1', periodIndex, e.target.value)}
                            disabled={match.match_status !== 'ongoing' || isConfirmed}
                            className="w-16 h-8 text-center text-sm mx-auto"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {/* チーム2 */}
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground mb-2">{match.team2_name}</div>
                        <div className="flex items-center justify-center space-x-2 mb-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => changeScore('team2', periodIndex, -1)}
                            disabled={match.match_status !== 'ongoing' || isConfirmed}
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="text-2xl font-bold w-8 text-center">
                            {scores.team2[periodIndex] || 0}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => changeScore('team2', periodIndex, 1)}
                            disabled={match.match_status !== 'ongoing' || isConfirmed}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        {/* 直接入力フィールド */}
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">直接入力</div>
                          <Input
                            type="number"
                            min="0"
                            value={scores.team2[periodIndex] || 0}
                            onChange={(e) => setDirectScore('team2', periodIndex, e.target.value)}
                            disabled={match.match_status !== 'ongoing' || isConfirmed}
                            className="w-16 h-8 text-center text-sm mx-auto"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}

                {/* 合計スコア表示 */}
                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h4 className="text-sm font-medium text-foreground mb-3">合計スコア</h4>
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
                  
                  {/* PK戦結果表示（合計スコア内） */}
                  {(() => {
                    const pkResult = getPenaltyKickResult();
                    if (pkResult && pkResult.hasPkScore) {
                      return (
                        <div className="mt-4 pt-3 border-t border-border">
                          <h5 className="text-xs font-medium text-muted-foreground mb-2">PK戦結果</h5>
                          <div className="grid grid-cols-2 gap-4 text-center">
                            <div>
                              <div className="text-lg font-semibold text-orange-600">
                                {pkResult.team1PkScore}
                              </div>
                            </div>
                            <div>
                              <div className="text-lg font-semibold text-orange-600">
                                {pkResult.team2PkScore}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* 勝者選択 */}
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
                      <Label htmlFor="remarks" className="text-sm font-medium">
                        備考 (任意)
                      </Label>
                      <textarea
                        id="remarks"
                        value={matchRemarks}
                        onChange={(e) => setMatchRemarks(e.target.value)}
                        disabled={match.match_status !== 'ongoing' || isConfirmed}
                        className="mt-1 w-full px-3 py-2 border border-input bg-background text-foreground rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-muted disabled:text-muted-foreground"
                        rows={2}
                        placeholder="抽選で勝敗決定、その他特記事項など..."
                      />
                    </div>

                    {/* スコア保存ボタン */}
                    <Button
                      className="w-full border-2 border-blue-600"
                      onClick={updateScores}
                      disabled={updating || match.match_status !== 'ongoing' || isConfirmed}
                    >
                      {updating ? '保存中...' : 'スコア・結果を保存'}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* フッター */}
        <div className="text-center text-sm text-muted-foreground">
          <p>審判専用画面 - 試合ID: {match.match_id}</p>
          <p>問題がある場合は大会運営スタッフにお知らせください</p>
        </div>
      </div>
    </div>
  );
}