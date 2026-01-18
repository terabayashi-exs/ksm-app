"use client";

import { useRef } from "react";
import { MatchCard } from "./MatchCard";
import { SeedCard } from "./SeedCard";
import { ConnectionLayer, getConnectionsForPattern } from "./BracketConnectors";
import { CARD_HEIGHT, CARD_GAP, HEADER_HEIGHT, PADDING_BOTTOM } from "./constants";
import {
  getPatternByMatchCount,
  getPatternConfig,
  getRoundColor,
  type PatternType,
} from "./patterns";
import type { BracketMatch, SportScoreConfig } from "./types";

interface TournamentBlockProps {
  /** ブロック識別子（例: "A", "B", "FINAL"） */
  blockId: string;
  /** ブロックタイトル */
  title?: string;
  /** 試合データ（0-7試合） */
  matches: BracketMatch[];
  /** ラウンドラベル（例: ["準々決勝", "準決勝", "決勝"]） */
  roundLabels: string[];
  /** シードチーム名（パターンに応じて1回戦の空き枠に表示） */
  seedTeams?: string[];
  /** 勝者チーム名（P1パターン用） */
  winnerName?: string;
  /** スポーツ設定 */
  sportConfig?: SportScoreConfig;
}

/**
 * 1-8チームトーナメントブロックを描画するコンポーネント
 *
 * 試合数からパターン（P1〜P8）を自動判定し、適切なレイアウトで描画する。
 */
export function TournamentBlock({
  blockId,
  title,
  matches,
  roundLabels,
  seedTeams = [],
  winnerName,
  sportConfig,
}: TournamentBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 試合数からパターンを判定
  const pattern = getPatternByMatchCount(matches.length);
  const config = getPatternConfig(pattern);

  // ステージ間のギャップ
  const stageGap = 64; // gap-16 = 64px（線を引くスペース確保）
  // カラム幅: 常に3カラム分で計算（実際のカラム数に関わらず固定）
  // ※BracketConnectorsの座標計算と整合性を取るため
  const fixedColumnCount = 3;
  const totalGap = stageGap * (fixedColumnCount - 1);
  const columnWidthCalc = `calc((100% - ${totalGap}px) / ${fixedColumnCount})`;

  // 試合をラウンドごとに分配
  const matchesByRound = distributeMatchesToRounds(matches, config);

  // ブロック全体の高さを計算
  const blockHeight = calculateBlockHeight(pattern);

  // 接続定義を取得
  const connections = getConnectionsForPattern(pattern, config);

  // P1パターン（1チーム、試合なし）
  if (pattern === "P1") {
    return (
      <div className="relative tournament-block">
        {title && (
          <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>
        )}
        <div className="flex items-center justify-center p-8 bg-card border border-border rounded-lg">
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-2">不戦勝</div>
            <div className="text-lg font-semibold">{winnerName || "勝者"}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full tournament-block">
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}

      <div
        ref={containerRef}
        className="relative flex gap-16 w-full"
        style={{
          height: `${blockHeight}px`,
        }}
      >
        {/* SVG接続線 */}
        <ConnectionLayer
          pattern={pattern}
          config={config}
          connections={connections}
          blockHeight={blockHeight}
          stageGap={stageGap}
          matches={matches}
          matchesByRound={matchesByRound}
        />

        {/* 常に3カラムを描画（接続線の座標計算と整合性を取るため） */}
        {[0, 1, 2].map((columnIndex) => {
          const round = config.rounds[columnIndex];
          const roundMatches = matchesByRound[columnIndex] || [];
          const label = roundLabels[columnIndex];

          // このカラムにラウンドがない場合は空のカラムを描画
          if (!round) {
            return (
              <div
                key={columnIndex}
                className="relative shrink-0"
                style={{
                  width: columnWidthCalc,
                  zIndex: 2,
                }}
              />
            );
          }

          return (
            <div
              key={columnIndex}
              className="relative shrink-0"
              style={{
                width: columnWidthCalc,
                zIndex: 2,
              }}
            >
              <div
                className={`text-sm font-medium text-center mb-2 px-3 py-1 rounded-full ${getRoundColor(
                  columnIndex,
                  config.rounds.length
                )}`}
              >
                {label}
              </div>
              {/* シードカード（1回戦のみ） */}
              {columnIndex === 0 &&
                config.seedSlots?.map((seedSlot, seedIndex) => {
                  const seedTeamName = seedTeams[seedIndex] || "シード選手";
                  const top = seedSlot.position * (CARD_HEIGHT + CARD_GAP) + HEADER_HEIGHT;

                  return (
                    <div
                      key={`seed-${seedIndex}`}
                      className="absolute w-full"
                      style={{ top: `${top}px` }}
                      data-match={`${blockId}-SEED${seedIndex}`}
                    >
                      <SeedCard teamName={seedTeamName} />
                    </div>
                  );
                })}
              {/* 通常の試合カード */}
              {roundMatches.map((match, matchIndex) => {
                const position = round.positions[matchIndex] ?? matchIndex;
                const top = position * (CARD_HEIGHT + CARD_GAP) + HEADER_HEIGHT;

                return (
                  <div
                    key={match.match_id}
                    className="absolute w-full"
                    style={{ top: `${top}px` }}
                  >
                    <MatchCard
                      match={match}
                      sportConfig={sportConfig}
                      data-match={`${blockId}-R${columnIndex}M${matchIndex}`}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 試合をラウンドごとに分配
 */
function distributeMatchesToRounds(
  matches: BracketMatch[],
  config: ReturnType<typeof getPatternConfig>
): BracketMatch[][] {
  const result: BracketMatch[][] = [];
  let matchIndex = 0;

  for (const round of config.rounds) {
    const roundMatches: BracketMatch[] = [];
    for (let i = 0; i < round.matchCount && matchIndex < matches.length; i++) {
      roundMatches.push(matches[matchIndex]);
      matchIndex++;
    }
    result.push(roundMatches);
  }

  return result;
}

/**
 * ブロックの高さを計算
 */
function calculateBlockHeight(pattern: PatternType): number {
  const verticalPadding = HEADER_HEIGHT + PADDING_BOTTOM;
  const heights: Record<PatternType, number> = {
    P1: CARD_HEIGHT + verticalPadding,
    P2: CARD_HEIGHT + verticalPadding,
    P3: 2 * CARD_HEIGHT + CARD_GAP + verticalPadding,
    P4: 2 * CARD_HEIGHT + CARD_GAP + verticalPadding,
    P5: 3 * CARD_HEIGHT + 2 * CARD_GAP + verticalPadding,
    P6: 4 * CARD_HEIGHT + 3 * CARD_GAP + verticalPadding, // シードがposition 3にあるため4スロット必要
    P7: 4 * CARD_HEIGHT + 3 * CARD_GAP + verticalPadding,
    P8: 4 * CARD_HEIGHT + 3 * CARD_GAP + verticalPadding,
  };
  return heights[pattern];
}
