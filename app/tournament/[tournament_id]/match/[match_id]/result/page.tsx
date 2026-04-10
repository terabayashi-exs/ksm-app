"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Info,
  MapPin,
  Minus,
  Play,
  Plus,
  Square,
  Users,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MatchData {
  match_id: number;
  match_code: string;
  team1_tournament_team_id?: number;
  team2_tournament_team_id?: number;
  team1_name: string;
  team2_name: string;
  team1_omission?: string;
  team2_omission?: string;
  court_number: number;
  court_name?: string | null;
  scheduled_time: string;
  period_count: number;
  current_period: number;
  match_status: "scheduled" | "ongoing" | "completed" | "cancelled";
  team1_scores: number[];
  team2_scores: number[];
  winner_tournament_team_id?: number;
  actual_start_time?: string;
  actual_end_time?: string;
  referee_access: boolean;
  remarks?: string;
  tournament_id?: number;
  can_input?: boolean;
  input_disabled_reason?: string | null;
  window_start?: string | null;
  window_end?: string | null;
}

const INPUT_DISABLED_MESSAGES: Record<string, string> = {
  confirmed: "この試合の結果は確定済みです。結果の編集はできません。",
  no_start_time: "この試合の開始時刻が設定されていないため、結果入力はできません。",
  too_early: "結果入力は試合開始1時間前から可能です。",
  too_late: "結果入力の受付期間が終了しました。",
};

export default function MatchResultPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const matchId = params.match_id as string;
  const token = searchParams.get("token");

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
  const [scores, setScores] = useState<{ team1: number[]; team2: number[] }>({
    team1: [],
    team2: [],
  });
  const [winnerTeam, setWinnerTeam] = useState<"team1" | "team2" | null>(null);
  const [matchRemarks, setMatchRemarks] = useState<string>("");
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [canInput, setCanInput] = useState<boolean>(true);
  const [inputDisabledReason, setInputDisabledReason] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // トークン検証とマッチデータ取得
  useEffect(() => {
    const verifyTokenAndLoadMatch = async () => {
      if (!token) {
        setError("アクセストークンが必要です");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/matches/${matchId}/qr`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const result = await response.json();

        if (result.success) {
          setMatch(result.data);

          // 時間制限の状態を設定
          setCanInput(result.data.can_input ?? true);
          setInputDisabledReason(result.data.input_disabled_reason ?? null);

          // 確定状態を設定
          setIsConfirmed(result.data.is_confirmed || false);

          // 既存のデータを復元
          if (result.data.remarks) {
            setMatchRemarks(result.data.remarks);
          }

          // 既存の勝者情報を復元
          if (result.data.winner_tournament_team_id) {
            if (result.data.winner_tournament_team_id === result.data.team1_tournament_team_id) {
              setWinnerTeam("team1");
            } else if (
              result.data.winner_tournament_team_id === result.data.team2_tournament_team_id
            ) {
              setWinnerTeam("team2");
            }
          } else {
            setWinnerTeam(null);
          }

          // 現在のスコアを初期化
          const periodCount = result.data.period_count || 1;
          let currentScores;
          let hasExistingScores = false;

          if (result.data.team1_scores && result.data.team2_scores) {
            currentScores = {
              team1: (result.data.team1_scores as (string | number)[]).map(
                (score) => Number(score) || 0,
              ),
              team2: (result.data.team2_scores as (string | number)[]).map(
                (score) => Number(score) || 0,
              ),
            };
            hasExistingScores = true;
          } else {
            currentScores = {
              team1: new Array(periodCount).fill(0),
              team2: new Array(periodCount).fill(0),
            };
          }

          setScores(currentScores);
          if (hasExistingScores) {
            setIsSaved(true);
          }

          // 拡張データの取得（ピリオド名表示用）
          try {
            const extendedResponse = await fetch(`/api/matches/${matchId}/extended-info`);
            const extendedResult = await extendedResponse.json();
            if (extendedResult.success) {
              setExtendedData(extendedResult.data);
            }
          } catch (extendedErr) {
            console.warn("Extended data fetch error:", extendedErr);
          }
        } else {
          setError(result.error || "アクセス権限の確認に失敗しました");
        }
      } catch (err) {
        console.error("Network error:", err);
        setError("サーバーとの通信に失敗しました");
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
          if (result.data.team1_scores && result.data.team2_scores) {
            setScores({
              team1: (result.data.team1_scores as (string | number)[]).map(
                (score) => Number(score) || 0,
              ),
              team2: (result.data.team2_scores as (string | number)[]).map(
                (score) => Number(score) || 0,
              ),
            });
            setIsSaved(true);
          }

          if (result.data.winner_tournament_team_id) {
            if (result.data.winner_tournament_team_id === result.data.team1_tournament_team_id) {
              setWinnerTeam("team1");
            } else if (
              result.data.winner_tournament_team_id === result.data.team2_tournament_team_id
            ) {
              setWinnerTeam("team2");
            }
          } else {
            setWinnerTeam(null);
          }

          if (result.data.remarks) {
            setMatchRemarks(result.data.remarks);
          }
        }
      } catch (err) {
        console.error("Status load error:", err);
      }
    };

    if (match && !loading) {
      loadCurrentMatchStatus();
    }
  }, [matchId, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 入力不可かどうかの判定
  const isInputDisabled = !canInput || isConfirmed;

  // 試合状態更新
  const updateMatchStatus = async (action: string, additionalData?: Record<string, unknown>) => {
    if (!match || isInputDisabled) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/matches/${matchId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          updated_by: "referee",
          ...additionalData,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setMatch((prev) => (prev ? { ...prev, ...result.data } : null));

        if (action === "start") {
          alert("試合を開始しました！");
        } else if (action === "end") {
          alert("試合を終了しました。お疲れ様でした！");
        }
      } else {
        alert(`エラー: ${result.error || "試合状態の更新に失敗しました"}`);
      }
    } catch (err) {
      console.error("Network error during match status update:", err);
      alert("ネットワークエラーが発生しました。もう一度お試しください。");
    } finally {
      setUpdating(false);
    }
  };

  // スコア・結果更新
  const updateScores = async () => {
    if (isInputDisabled) return;

    const team1Total = getTotalScore(scores.team1);
    const team2Total = getTotalScore(scores.team2);
    let scoreWinner = null;
    if (team1Total > team2Total) scoreWinner = "team1";
    else if (team2Total > team1Total) scoreWinner = "team2";

    if (scoreWinner && winnerTeam && scoreWinner !== winnerTeam) {
      const team1DisplayName = match?.team1_omission || match?.team1_name || "チーム1";
      const team2DisplayName = match?.team2_omission || match?.team2_name || "チーム2";
      const scoreWinnerName = scoreWinner === "team1" ? team1DisplayName : team2DisplayName;
      const selectedWinnerName = winnerTeam === "team1" ? team1DisplayName : team2DisplayName;

      const confirmed = window.confirm(
        `スコア上は「${scoreWinnerName}」が勝利していますが、選択されているのは「${selectedWinnerName}」です。\n\nこのまま登録してもよろしいですか？`,
      );
      if (!confirmed) return;
    }

    let winner_team_id = null;
    if (winnerTeam === "team1" && match?.team1_tournament_team_id) {
      winner_team_id = match.team1_tournament_team_id;
    } else if (winnerTeam === "team2" && match?.team2_tournament_team_id) {
      winner_team_id = match.team2_tournament_team_id;
    }

    await updateMatchStatus("update_scores", {
      team1_scores: scores.team1,
      team2_scores: scores.team2,
      winner_team_id: winner_team_id,
      remarks: matchRemarks.trim() || null,
    });

    setIsSaved(true);
  };

  // ピリオドスコア変更
  const changeScore = useCallback((team: "team1" | "team2", period: number, delta: number) => {
    setIsSaved(false);
    setScores((prev) => {
      const currentScore = Number(prev[team][period]) || 0;
      const newScore = Math.max(0, currentScore + delta);
      const newScores = { ...prev };
      newScores[team] = [...newScores[team]];
      newScores[team][period] = newScore;
      return newScores;
    });
  }, []);

  // スコア変更後の勝者自動決定
  useEffect(() => {
    if (!extendedData?.active_periods) {
      const team1Total = scores.team1.reduce((sum, score) => sum + (Number(score) || 0), 0);
      const team2Total = scores.team2.reduce((sum, score) => sum + (Number(score) || 0), 0);

      if (team1Total > team2Total) setWinnerTeam("team1");
      else if (team2Total > team1Total) setWinnerTeam("team2");
      else setWinnerTeam(null);
    } else {
      const team1RegularTotal = getTotalScore(scores.team1);
      const team2RegularTotal = getTotalScore(scores.team2);

      if (team1RegularTotal > team2RegularTotal) {
        setWinnerTeam("team1");
      } else if (team2RegularTotal > team1RegularTotal) {
        setWinnerTeam("team2");
      } else {
        const pkPeriods = extendedData.active_periods.filter((p) => {
          const periodName = getPeriodName(p);
          return periodName.includes("PK");
        });

        if (pkPeriods.length > 0) {
          let team1PkTotal = 0;
          let team2PkTotal = 0;
          pkPeriods.forEach((p) => {
            const scoreIndex = p - 1;
            team1PkTotal += Number(scores.team1[scoreIndex]) || 0;
            team2PkTotal += Number(scores.team2[scoreIndex]) || 0;
          });

          if (team1PkTotal > team2PkTotal) setWinnerTeam("team1");
          else if (team2PkTotal > team1PkTotal) setWinnerTeam("team2");
          else setWinnerTeam(null);
        } else {
          setWinnerTeam(null);
        }
      }
    }
  }, [scores, extendedData]); // eslint-disable-line react-hooks/exhaustive-deps

  // 直接スコア入力
  const setDirectScore = (team: "team1" | "team2", period: number, value: string) => {
    const numValue = Math.max(0, Number.parseInt(value) || 0);
    setIsSaved(false);
    setScores((prev) => {
      const newScores = { ...prev };
      newScores[team] = [...newScores[team]];
      newScores[team][period] = numValue;
      return newScores;
    });
  };

  // 総得点計算（PK戦ピリオドを除外）
  const getTotalScore = (teamScores: number[]) => {
    if (!extendedData?.active_periods) {
      return teamScores.reduce((sum, score) => sum + (Number(score) || 0), 0);
    }
    const regularPeriods = extendedData.active_periods.filter((p) => {
      const periodName = getPeriodName(p);
      return !periodName.includes("PK");
    });
    return regularPeriods.reduce((sum, p) => {
      const scoreIndex = p - 1;
      return sum + (Number(teamScores[scoreIndex]) || 0);
    }, 0);
  };

  // ピリオド名を取得
  const getPeriodName = (periodNumber: number): string => {
    if (extendedData?.sport_config?.default_periods) {
      const period = extendedData.sport_config.default_periods.find(
        (p) => p.period_number === periodNumber,
      );
      if (period) return period.period_name;
    }
    return `第${periodNumber}ピリオド`;
  };

  // PK戦結果を取得
  const getPenaltyKickResult = () => {
    if (!extendedData?.active_periods) return null;
    const pkPeriods = extendedData.active_periods.filter((p) => {
      const periodName = getPeriodName(p);
      return periodName.includes("PK");
    });
    if (pkPeriods.length === 0) return null;
    let team1PkTotal = 0;
    let team2PkTotal = 0;
    pkPeriods.forEach((p) => {
      const scoreIndex = p - 1;
      team1PkTotal += Number(scores.team1[scoreIndex]) || 0;
      team2PkTotal += Number(scores.team2[scoreIndex]) || 0;
    });
    return {
      team1PkScore: team1PkTotal,
      team2PkScore: team2PkTotal,
      hasPkScore: team1PkTotal > 0 || team2PkTotal > 0,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-gray-500">認証中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <Alert className="border-destructive/20 bg-destructive/5">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">{error}</AlertDescription>
            </Alert>
            <Button className="w-full mt-4" onClick={() => router.push("/")}>
              ホームに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">試合データが見つかりません</p>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (match.match_status) {
      case "scheduled":
        return <Clock className="w-5 h-5 text-gray-500" />;
      case "ongoing":
        return <Play className="w-5 h-5 text-green-600" />;
      case "completed":
        return <CheckCircle className="w-5 h-5 text-blue-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getStatusLabel = () => {
    switch (match.match_status) {
      case "scheduled":
        return "試合前";
      case "ongoing":
        return "試合中";
      case "completed":
        return "完了";
      case "cancelled":
        return "中止";
      default:
        return "不明";
    }
  };

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ヘッダー */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-3">
                <Users className="w-6 h-6 text-blue-600" />
                <span>{match.match_code}</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
                {getStatusIcon()}
                <span
                  className={`font-medium ${
                    match.match_status === "ongoing"
                      ? "text-green-600"
                      : match.match_status === "completed"
                        ? "text-blue-600"
                        : "text-gray-500"
                  }`}
                >
                  {getStatusLabel()}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {match.team1_name} vs {match.team2_name}
              </h1>
              <div className="flex items-center justify-center space-x-6 text-sm text-gray-500">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-1" />
                  {match.court_name ? match.court_name : `コート${match.court_number}`}
                </div>
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  {match.scheduled_time || "--:--"}
                </div>
              </div>
            </div>

            {/* 入力不可バナー */}
            {isInputDisabled && (
              <div
                className={`p-4 mb-4 rounded-lg border-l-4 ${
                  inputDisabledReason === "confirmed"
                    ? "bg-amber-50 border-amber-400"
                    : inputDisabledReason === "too_early"
                      ? "bg-blue-50 border-blue-400"
                      : inputDisabledReason === "too_late"
                        ? "bg-gray-50 border-gray-400"
                        : "bg-orange-50 border-orange-400"
                }`}
              >
                <div className="flex items-start">
                  <Info className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-gray-600" />
                  <div>
                    <p className="font-medium text-gray-800">
                      {inputDisabledReason
                        ? INPUT_DISABLED_MESSAGES[inputDisabledReason] || "結果入力はできません。"
                        : "結果入力はできません。"}
                    </p>
                    {inputDisabledReason === "too_early" && match.window_start && (
                      <p className="text-sm text-gray-600 mt-1">
                        入力可能開始時刻: {match.window_start}
                      </p>
                    )}
                    {inputDisabledReason === "too_late" && match.window_end && (
                      <p className="text-sm text-gray-600 mt-1">入力期限: {match.window_end}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 現在のスコア表示 */}
            <div className="bg-white p-6 rounded-lg border-2 border-gray-200 mb-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-gray-900 mb-2">
                  {getTotalScore(scores.team1)} - {getTotalScore(scores.team2)}
                </div>
                <div className="text-sm text-gray-500">現在のスコア</div>

                {/* PK戦結果表示 */}
                {(() => {
                  const pkResult = getPenaltyKickResult();
                  if (pkResult && pkResult.hasPkScore) {
                    return (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-lg font-semibold text-orange-600">
                          PK戦 {pkResult.team1PkScore} - {pkResult.team2PkScore}
                        </div>
                        <div className="text-xs text-gray-500">ペナルティキック</div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 試合管理・スコア入力（入力可能な場合のみ表示） */}
        {!isInputDisabled && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 試合制御 */}
            <Card>
              <CardHeader>
                <CardTitle>試合制御</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {match.match_status === "scheduled" && (
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="lg"
                    onClick={() => updateMatchStatus("start")}
                    disabled={updating}
                  >
                    <Play className="w-5 h-5 mr-2" />
                    試合開始
                  </Button>
                )}

                {match.match_status === "ongoing" && (
                  <div className="space-y-3">
                    <Alert className="border-primary/20 bg-primary/5">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      <AlertDescription className="text-primary">
                        結果確定前の試合は、「試合開始前」や「実施中」に戻すことができます。
                      </AlertDescription>
                    </Alert>

                    <Button
                      className="w-full bg-red-600 hover:bg-red-700"
                      onClick={() => {
                        if (!isSaved) {
                          if (
                            !window.confirm(
                              "スコア・結果が保存されていません。\n\n試合を終了する前に「スコア・結果を保存」ボタンを押して結果を保存してください。\n\nこのまま試合を終了しますか？",
                            )
                          ) {
                            return;
                          }
                        }
                        updateMatchStatus("end");
                      }}
                      disabled={updating}
                    >
                      <Square className="w-5 h-5 mr-2" />
                      試合終了
                    </Button>

                    <Button
                      className="w-full bg-gray-400 hover:bg-gray-500 text-white"
                      variant="secondary"
                      onClick={() => {
                        if (
                          window.confirm(
                            "試合を開始前の状態に戻しますか？\n\n現在のスコアやピリオド情報は保持されますが、試合状態は「開始前」に戻ります。",
                          )
                        ) {
                          updateMatchStatus("reset");
                        }
                      }}
                      disabled={updating}
                    >
                      <ArrowLeft className="w-5 h-5 mr-2" />
                      試合開始前に戻す
                    </Button>
                  </div>
                )}

                {match.match_status === "completed" && !isConfirmed && (
                  <div className="space-y-3">
                    <Alert className="border-primary/20 bg-primary/5">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      <AlertDescription className="text-primary">
                        結果確定前の試合は、「試合開始前」や「実施中」に戻すことができます。
                      </AlertDescription>
                    </Alert>

                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      onClick={() => updateMatchStatus("start")}
                      disabled={updating}
                    >
                      <Play className="w-5 h-5 mr-2" />
                      試合再開（結果修正）
                    </Button>

                    <Button
                      className="w-full bg-gray-400 hover:bg-gray-500 text-white"
                      variant="secondary"
                      onClick={() => {
                        if (
                          window.confirm(
                            "試合を開始前の状態に戻しますか？\n\n現在のスコアやピリオド情報は保持されますが、試合状態は「開始前」に戻ります。",
                          )
                        ) {
                          updateMatchStatus("reset");
                        }
                      }}
                      disabled={updating}
                    >
                      <ArrowLeft className="w-5 h-5 mr-2" />
                      試合開始前に戻す
                    </Button>
                  </div>
                )}

                {/* 試合状態インジケーター */}
                <div className="mt-6 p-4 bg-gray-50/30 rounded-lg">
                  <h4 className="text-sm font-medium mb-3">試合状態</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className={`p-3 rounded-md border-2 text-center transition-all ${
                        match.match_status === "scheduled"
                          ? "border-gray-500 bg-gray-100 font-medium"
                          : "border-gray-200 text-gray-500"
                      }`}
                    >
                      <Clock
                        className={`w-4 h-4 mx-auto mb-1 ${match.match_status === "scheduled" ? "text-gray-600" : "text-gray-500"}`}
                      />
                      <span className="text-xs">試合前</span>
                    </div>
                    <div
                      className={`p-3 rounded-md border-2 text-center transition-all ${
                        match.match_status === "ongoing"
                          ? "border-green-500 bg-green-100 font-medium"
                          : "border-gray-200 text-gray-500"
                      }`}
                    >
                      <Play
                        className={`w-4 h-4 mx-auto mb-1 ${match.match_status === "ongoing" ? "text-green-600" : "text-gray-500"}`}
                      />
                      <span className="text-xs">進行中</span>
                    </div>
                    <div
                      className={`p-3 rounded-md border-2 text-center transition-all ${
                        match.match_status === "completed" && !isConfirmed
                          ? "border-yellow-500 bg-yellow-100 font-medium"
                          : "border-gray-200 text-gray-500"
                      }`}
                    >
                      <AlertCircle
                        className={`w-4 h-4 mx-auto mb-1 ${match.match_status === "completed" && !isConfirmed ? "text-yellow-600" : "text-gray-500"}`}
                      />
                      <span className="text-xs">確定待ち</span>
                    </div>
                    <div
                      className={`p-3 rounded-md border-2 text-center transition-all ${
                        match.match_status === "completed" && isConfirmed
                          ? "border-blue-500 bg-blue-100 font-medium"
                          : "border-gray-200 text-gray-500"
                      }`}
                    >
                      <CheckCircle
                        className={`w-4 h-4 mx-auto mb-1 ${match.match_status === "completed" && isConfirmed ? "text-blue-600" : "text-gray-500"}`}
                      />
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
                  {(
                    extendedData?.active_periods ||
                    Array.from({ length: match.period_count }, (_, i) => i + 1)
                  ).map((periodNumber: number) => {
                    const periodIndex = periodNumber - 1;
                    return (
                      <div key={periodNumber} className="border rounded-lg p-4">
                        <Label className="block text-sm font-medium mb-3">
                          {getPeriodName(periodNumber)}
                        </Label>
                        <div className="grid grid-cols-2 gap-4">
                          {/* チーム1 */}
                          <div className="text-center">
                            <div className="text-xs text-gray-500 mb-2">{match.team1_name}</div>
                            <div className="flex items-center justify-center space-x-2 mb-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => changeScore("team1", periodIndex, -1)}
                                disabled={match.match_status !== "ongoing"}
                              >
                                <Minus className="w-4 h-4" />
                              </Button>
                              <span className="text-2xl font-bold w-8 text-center">
                                {scores.team1[periodIndex] || 0}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => changeScore("team1", periodIndex, 1)}
                                disabled={match.match_status !== "ongoing"}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500 mb-1">直接入力</div>
                              <Input
                                type="number"
                                min="0"
                                value={scores.team1[periodIndex] || 0}
                                onChange={(e) =>
                                  setDirectScore("team1", periodIndex, e.target.value)
                                }
                                disabled={match.match_status !== "ongoing"}
                                className="w-16 h-8 text-center text-sm mx-auto"
                                placeholder="0"
                              />
                            </div>
                          </div>
                          {/* チーム2 */}
                          <div className="text-center">
                            <div className="text-xs text-gray-500 mb-2">{match.team2_name}</div>
                            <div className="flex items-center justify-center space-x-2 mb-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => changeScore("team2", periodIndex, -1)}
                                disabled={match.match_status !== "ongoing"}
                              >
                                <Minus className="w-4 h-4" />
                              </Button>
                              <span className="text-2xl font-bold w-8 text-center">
                                {scores.team2[periodIndex] || 0}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => changeScore("team2", periodIndex, 1)}
                                disabled={match.match_status !== "ongoing"}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500 mb-1">直接入力</div>
                              <Input
                                type="number"
                                min="0"
                                value={scores.team2[periodIndex] || 0}
                                onChange={(e) =>
                                  setDirectScore("team2", periodIndex, e.target.value)
                                }
                                disabled={match.match_status !== "ongoing"}
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
                  <div className="mt-6 p-4 bg-gray-50/50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">合計スコア</h4>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-xs text-gray-500">{match.team1_name}</div>
                        <div className="text-3xl font-bold text-blue-600">
                          {getTotalScore(scores.team1)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">{match.team2_name}</div>
                        <div className="text-3xl font-bold text-red-600">
                          {getTotalScore(scores.team2)}
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const pkResult = getPenaltyKickResult();
                      if (pkResult && pkResult.hasPkScore) {
                        return (
                          <div className="mt-4 pt-3 border-t border-gray-200">
                            <h5 className="text-xs font-medium text-gray-500 mb-2">PK戦結果</h5>
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
                  {(match.match_status === "ongoing" || match.match_status === "completed") && (
                    <div className="mt-4 space-y-4">
                      <div>
                        <Label className="text-sm font-medium">勝利チーム選択</Label>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <Button
                            variant={winnerTeam === "team1" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setWinnerTeam("team1")}
                            className={
                              winnerTeam === "team1"
                                ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                                : "hover:bg-blue-50 border-gray-300"
                            }
                          >
                            {match.team1_omission || match.team1_name}
                          </Button>
                          <Button
                            variant={winnerTeam === null ? "default" : "outline"}
                            size="sm"
                            onClick={() => setWinnerTeam(null)}
                            className={
                              winnerTeam === null
                                ? "bg-gray-100 text-white hover:bg-gray-100/80 border-secondary"
                                : "hover:bg-gray-50 border-gray-200"
                            }
                          >
                            引分
                          </Button>
                          <Button
                            variant={winnerTeam === "team2" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setWinnerTeam("team2")}
                            className={
                              winnerTeam === "team2"
                                ? "bg-red-600 text-white hover:bg-red-700 border-red-600"
                                : "hover:bg-red-50 border-gray-300"
                            }
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
                          disabled={match.match_status !== "ongoing"}
                          className="mt-1 w-full px-3 py-2 border border-gray-200 bg-white text-gray-900 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                          rows={2}
                          placeholder="抽選で勝敗決定、その他特記事項など..."
                        />
                      </div>

                      {/* スコア保存ボタン */}
                      <Button
                        className="w-full border-2 border-blue-600"
                        onClick={updateScores}
                        disabled={updating || match.match_status !== "ongoing"}
                      >
                        {updating ? "保存中..." : "スコア・結果を保存"}
                      </Button>

                      {/* 試合終了ボタン */}
                      {match.match_status === "ongoing" && (
                        <Button
                          className="w-full bg-red-600 hover:bg-red-700"
                          onClick={() => {
                            if (!isSaved) {
                              if (
                                !window.confirm(
                                  "スコア・結果が保存されていません。\n\n試合を終了する前に「スコア・結果を保存」ボタンを押して結果を保存してください。\n\nこのまま試合を終了しますか？",
                                )
                              ) {
                                return;
                              }
                            }
                            updateMatchStatus("end");
                          }}
                          disabled={updating}
                        >
                          <Square className="w-5 h-5 mr-2" />
                          試合終了
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* フッター */}
        <div className="text-center text-sm text-gray-500">
          <p>試合結果入力画面 - 試合ID: {match.match_id}</p>
          <p>問題がある場合は大会運営スタッフにお知らせください</p>
        </div>
      </div>
    </div>
  );
}
