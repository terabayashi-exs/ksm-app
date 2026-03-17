"use client";

import {
  QUARTER_FINAL_CODES,
  SEMI_FINAL_CODES,
  THIRD_PLACE_CODES,
  FINAL_CODES,
} from "./constants";
import type { BracketMatch, SportScoreConfig } from "./types";

interface MatchCardProps {
  match: BracketMatch;
  sportConfig?: SportScoreConfig;
  className?: string;
  [key: string]: unknown;
}

export function MatchCard({
  match,
  sportConfig,
  className = "",
  ...props
}: MatchCardProps) {
  const getWinnerTeam = () => {
    if (!match.is_confirmed) return null;

    // tournament_team_idが利用可能な場合はそちらを優先、なければteam_idで比較
    if (
      match.winner_tournament_team_id !== undefined &&
      match.winner_tournament_team_id !== null
    ) {
      if (match.winner_tournament_team_id === match.team1_tournament_team_id)
        return 0; // team1が勝者
      if (match.winner_tournament_team_id === match.team2_tournament_team_id)
        return 1; // team2が勝者
    } else if (match.winner_team_id) {
      // フォールバック: team_idで比較
      if (match.winner_team_id === match.team1_id) return 0; // team1が勝者
      if (match.winner_team_id === match.team2_id) return 1; // team2が勝者
    }

    return null;
  };

  const hasResult =
    match.is_confirmed &&
    (match.team1_goals !== null ||
      match.team2_goals !== null ||
      match.is_draw ||
      match.is_walkover);

  // 多競技対応のスコア表示ロジック
  const getScoreDisplay = (teamIndex: number) => {
    if (!hasResult || match.is_walkover) return null;

    const teamScores =
      teamIndex === 0 ? match.team1_scores : match.team2_scores;

    // 多競技スコアデータがある場合
    if (teamScores && teamScores.length > 0) {
      // サッカーでPK戦がある場合の特別処理
      if (sportConfig?.supports_pk && teamScores.length >= 5) {
        const regularGoals = teamScores
          .slice(0, 4)
          .reduce((sum, score) => sum + score, 0);
        const pkGoals = teamScores
          .slice(4)
          .reduce((sum, score) => sum + score, 0);

        if (pkGoals > 0) {
          return { regular: regularGoals, pk: pkGoals, isPkMatch: true };
        }
        return { regular: regularGoals, isPkMatch: false };
      }

      // 通常のスコア合計
      const totalScore = teamScores.reduce((sum, score) => sum + score, 0);
      return { regular: totalScore, isPkMatch: false };
    }

    // フォールバック: 従来のgoalsを使用
    const goals = teamIndex === 0 ? match.team1_goals : match.team2_goals;
    return { regular: goals || 0, isPkMatch: false };
  };

  // 試合コードからブロック色を取得
  const getMatchCodeColor = (matchCode: string): string => {
    if (QUARTER_FINAL_CODES.includes(matchCode))
      return "bg-blue-100 text-blue-800"; // 準々決勝
    if (SEMI_FINAL_CODES.includes(matchCode))
      return "bg-purple-100 text-purple-800"; // 準決勝
    if (THIRD_PLACE_CODES.includes(matchCode))
      return "bg-yellow-100 text-yellow-800"; // 3位決定戦
    if (FINAL_CODES.includes(matchCode)) return "bg-red-100 text-red-800"; // 決勝

    return "bg-gray-50 text-gray-500";
  };

  const winnerIndex = getWinnerTeam();

  // 中止試合の場合の特別処理
  if (match.match_status === "cancelled") {
    return (
      <div
        className={`relative bg-white border-2 border-red-300 rounded-lg p-3 shadow-sm ${className}`}
        {...props}
      >
        {/* 試合コード */}
        <div
          className={`absolute -top-2 left-3 border px-2 py-1 rounded-full text-xs font-medium ${getMatchCodeColor(
            match.match_code
          )}`}
        >
          {match.match_code}
        </div>

        {/* 中止マーク */}
        <div className="flex flex-col items-center justify-center h-20 bg-red-50 rounded">
          <span className="text-red-600 font-bold text-sm mb-1">試合中止</span>
          <span className="text-xs text-red-500">
            {match.team1_display_name}
          </span>
          <span className="text-xs text-gray-500">vs</span>
          <span className="text-xs text-red-500">
            {match.team2_display_name}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative bg-white border border-gray-200 rounded-lg p-3 shadow-sm ${className}`}
      {...props}
    >
      {/* 試合コード */}
      <div
        className={`absolute -top-2 left-3 border px-2 py-1 rounded-full text-xs font-medium ${getMatchCodeColor(
          match.match_code
        )}`}
      >
        {match.match_code}
      </div>

      {/* チーム1 */}
      <div
        className={`flex items-center justify-between h-8 px-3 mb-2 border rounded cursor-default transition-all ${
          winnerIndex === 0
            ? "bg-green-500/20 text-green-500 border-green-500 font-medium"
            : hasResult && winnerIndex === 1
            ? "bg-red-500/20 text-red-500 border-red-500"
            : hasResult && match.is_draw
            ? "bg-blue-500/20 text-blue-500 border-blue-500"
            : "bg-gray-50 text-gray-500 border-gray-200"
        }`}
      >
        <span className="text-sm truncate flex-1">
          {winnerIndex === 0 && hasResult ? "👑 " : ""}
          {match.team1_display_name || "調整中"}
        </span>
        {hasResult &&
          !match.is_draw &&
          (() => {
            const scoreData = getScoreDisplay(0);
            if (!scoreData) return null;

            return (
              <span className="text-sm font-bold ml-2">
                {scoreData.isPkMatch ? (
                  <span className="flex flex-col items-end text-xs">
                    <span>{scoreData.regular}</span>
                    <span className="text-[10px] text-gray-500">
                      PK{scoreData.pk}
                    </span>
                  </span>
                ) : (
                  scoreData.regular
                )}
              </span>
            );
          })()}
        {hasResult &&
          match.is_draw &&
          (() => {
            const scoreData = getScoreDisplay(0);
            if (!scoreData) return null;

            return (
              <span className="text-sm font-bold ml-2 text-blue-600">
                {scoreData.isPkMatch ? (
                  <span className="flex flex-col items-end text-xs">
                    <span>{scoreData.regular}</span>
                    <span className="text-[10px] text-gray-500">
                      PK{scoreData.pk}
                    </span>
                  </span>
                ) : (
                  scoreData.regular
                )}
              </span>
            );
          })()}
      </div>

      {/* チーム2 */}
      <div
        className={`flex items-center justify-between h-8 px-3 border rounded cursor-default transition-all ${
          winnerIndex === 1
            ? "bg-green-500/20 text-green-500 border-green-500 font-medium"
            : hasResult && winnerIndex === 0
            ? "bg-red-500/20 text-red-500 border-red-500"
            : hasResult && match.is_draw
            ? "bg-blue-500/20 text-blue-500 border-blue-500"
            : "bg-gray-50 text-gray-500 border-gray-200"
        }`}
      >
        <span className="text-sm truncate flex-1">
          {winnerIndex === 1 && hasResult ? "👑 " : ""}
          {match.team2_display_name || "調整中"}
        </span>
        {hasResult &&
          !match.is_draw &&
          (() => {
            const scoreData = getScoreDisplay(1);
            if (!scoreData) return null;

            return (
              <span className="text-sm font-bold ml-2">
                {scoreData.isPkMatch ? (
                  <span className="flex flex-col items-end text-xs">
                    <span>{scoreData.regular}</span>
                    <span className="text-[10px] text-gray-500">
                      PK{scoreData.pk}
                    </span>
                  </span>
                ) : (
                  scoreData.regular
                )}
              </span>
            );
          })()}
        {hasResult &&
          match.is_draw &&
          (() => {
            const scoreData = getScoreDisplay(1);
            if (!scoreData) return null;

            return (
              <span className="text-sm font-bold ml-2 text-blue-600">
                {scoreData.isPkMatch ? (
                  <span className="flex flex-col items-end text-xs">
                    <span>{scoreData.regular}</span>
                    <span className="text-[10px] text-gray-500">
                      PK{scoreData.pk}
                    </span>
                  </span>
                ) : (
                  scoreData.regular
                )}
              </span>
            );
          })()}
      </div>

      {/* 状態表示 */}
      <div className="mt-2 text-center">
        {match.match_status === "completed" && match.is_confirmed ? (
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-300 px-2 py-1 rounded-full">
            結果確定
          </span>
        ) : match.match_status === "ongoing" ? (
          <span className="text-xs bg-orange-50 text-orange-600 border border-orange-300 px-2 py-1 rounded-full animate-pulse">
            試合中
          </span>
        ) : match.match_status === "completed" ? (
          <span className="text-xs bg-purple-50 text-purple-600 border border-purple-300 px-2 py-1 rounded-full">
            試合完了
          </span>
        ) : (
          <span className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2 py-1 rounded-full">
            未実施
          </span>
        )}
      </div>
    </div>
  );
}
