"use client";

import { useRef, useEffect, useCallback } from "react";
import { MatchCard } from "./MatchCard";
import { SeedCard } from "./SeedCard";
import { CARD_HEIGHT, CARD_GAP } from "./constants";
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
  /** 試合データ（0-7試合） */
  matches: BracketMatch[];
  /** スポーツ設定 */
  sportConfig?: SportScoreConfig;
  /** ブロックタイトル */
  title?: string;
  /** 勝者チーム名（P1パターン用） */
  winnerName?: string;
  /** シードチーム名（パターンに応じて1回戦の空き枠に表示） */
  seedTeams?: string[];
}

/**
 * 1-8チームトーナメントブロックを描画するコンポーネント
 *
 * 試合数からパターン（P1〜P8）を自動判定し、適切なレイアウトで描画する。
 */
export function TournamentBlock({
  blockId,
  matches,
  sportConfig,
  title,
  winnerName,
  seedTeams = [],
}: TournamentBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 試合数からパターンを判定
  const pattern = getPatternByMatchCount(matches.length);
  const config = getPatternConfig(pattern);

  // カラム幅
  const columnWidth = 200;
  const columnGap = 60;

  // 試合をラウンドごとに分配
  const matchesByRound = distributeMatchesToRounds(matches, config);

  // ブロック全体の高さを計算
  const blockHeight = calculateBlockHeight(pattern);

  // SVG接続線を描画
  const drawLines = useCallback(() => {
    if (!containerRef.current || !svgRef.current) return;

    const svg = svgRef.current;
    const container = containerRef.current;

    // 既存のpathをクリア
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const containerRect = container.getBoundingClientRect();

    // 要素の中央右端を取得
    const midRight = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.right - containerRect.left,
        y: rect.top - containerRect.top + rect.height / 2,
      };
    };

    // 要素の中央左端を取得
    const midLeft = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top + rect.height / 2,
      };
    };

    // パスを追加
    const addPath = (fromId: string, toId: string) => {
      const from = container.querySelector(
        `[data-match="${fromId}"]`
      ) as HTMLElement;
      const to = container.querySelector(
        `[data-match="${toId}"]`
      ) as HTMLElement;

      if (!from || !to) return;

      const p1 = midRight(from);
      const p2 = midLeft(to);

      // 直角に曲がる接続線
      const midX = p1.x + (p2.x - p1.x) * 0.5;
      const d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("d", d);
      path.setAttribute("stroke", "hsl(var(--muted-foreground))");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("fill", "transparent");

      svg.appendChild(path);
    };

    // パターンに応じた接続線を描画
    drawConnectionsByPattern(pattern, blockId, addPath, config);

    // SVGサイズ設定
    svg.setAttribute("width", Math.ceil(containerRect.width).toString());
    svg.setAttribute("height", Math.ceil(containerRect.height).toString());
    svg.setAttribute(
      "viewBox",
      `0 0 ${Math.ceil(containerRect.width)} ${Math.ceil(containerRect.height)}`
    );
  }, [blockId, pattern, config]);

  // リサイズ時に線を再描画
  useEffect(() => {
    const handleResize = () => drawLines();
    window.addEventListener("resize", handleResize);

    // 初回描画
    setTimeout(drawLines, 100);

    return () => window.removeEventListener("resize", handleResize);
  }, [drawLines, matches]);

  // P1パターン（1チーム、試合なし）
  if (pattern === "P1") {
    return (
      <div className="relative">
        {title && (
          <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>
        )}
        <div className="flex items-center justify-center p-8 bg-card border border-border rounded-lg">
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-2">不戦勝</div>
            <div className="text-lg font-semibold">
              {winnerName || "勝者"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {title && (
        <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>
      )}

      <div
        ref={containerRef}
        className="relative"
        style={{
          height: `${blockHeight}px`,
          width: `${columnWidth * config.columnCount + columnGap * (config.columnCount - 1)}px`,
        }}
      >
        {/* SVG接続線 */}
        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 1 }}
        />

        {/* ラウンドごとにカラムを描画 */}
        {config.rounds.map((round, roundIndex) => {
          const roundMatches = matchesByRound[roundIndex] || [];

          return (
            <div
              key={round.name}
              className="absolute"
              style={{
                left: `${roundIndex * (columnWidth + columnGap)}px`,
                width: `${columnWidth}px`,
                zIndex: 2,
              }}
            >
              <div
                className={`text-sm font-medium text-center mb-2 px-3 py-1 rounded-full ${getRoundColor(
                  round.name
                )}`}
              >
                {round.name}
              </div>
              {/* シードカード（1回戦のみ） */}
              {roundIndex === 0 &&
                config.seedSlots?.map((seedSlot, seedIndex) => {
                  const seedTeamName = seedTeams[seedIndex] || "シード選手";
                  const top = seedSlot.position * (CARD_HEIGHT + CARD_GAP) + 32;

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
                const top = position * (CARD_HEIGHT + CARD_GAP) + 32;

                return (
                  <div
                    key={match.match_id}
                    className="absolute w-full"
                    style={{ top: `${top}px` }}
                  >
                    <MatchCard
                      match={match}
                      sportConfig={sportConfig}
                      data-match={`${blockId}-R${roundIndex}M${matchIndex}`}
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
  const heights: Record<PatternType, number> = {
    P1: CARD_HEIGHT + 64,
    P2: CARD_HEIGHT + 64,
    P3: 2 * CARD_HEIGHT + CARD_GAP + 64,
    P4: 2 * CARD_HEIGHT + CARD_GAP + 64,
    P5: 3 * CARD_HEIGHT + 2 * CARD_GAP + 64,
    P6: 4 * CARD_HEIGHT + 3 * CARD_GAP + 64, // シードがposition 3にあるため4スロット必要
    P7: 4 * CARD_HEIGHT + 3 * CARD_GAP + 64,
    P8: 4 * CARD_HEIGHT + 3 * CARD_GAP + 64,
  };
  return heights[pattern];
}

/**
 * パターンに応じた接続線を描画
 */
function drawConnectionsByPattern(
  pattern: PatternType,
  blockId: string,
  addPath: (from: string, to: string) => void,
  config: ReturnType<typeof getPatternConfig>
): void {
  // シードカードの接続線を描画
  config.seedSlots?.forEach((seedSlot, seedIndex) => {
    addPath(`${blockId}-SEED${seedIndex}`, `${blockId}-${seedSlot.connectTo}`);
  });

  switch (pattern) {
    case "P2":
      // 決勝のみ、接続線なし
      break;

    case "P3":
      // 1回戦 → 決勝
      addPath(`${blockId}-R0M0`, `${blockId}-R1M0`);
      break;

    case "P4":
      // 準決勝 → 決勝
      addPath(`${blockId}-R0M0`, `${blockId}-R1M0`);
      addPath(`${blockId}-R0M1`, `${blockId}-R1M0`);
      break;

    case "P5":
      // 1回戦 → 準決勝、準決勝 → 決勝
      addPath(`${blockId}-R0M0`, `${blockId}-R1M1`);
      addPath(`${blockId}-R1M0`, `${blockId}-R2M0`);
      addPath(`${blockId}-R1M1`, `${blockId}-R2M0`);
      break;

    case "P6":
      // 1回戦 → 準決勝、準決勝 → 決勝
      addPath(`${blockId}-R0M0`, `${blockId}-R1M0`);
      addPath(`${blockId}-R0M1`, `${blockId}-R1M1`);
      addPath(`${blockId}-R1M0`, `${blockId}-R2M0`);
      addPath(`${blockId}-R1M1`, `${blockId}-R2M0`);
      break;

    case "P7":
      // 1回戦 → 準決勝、準決勝 → 決勝
      addPath(`${blockId}-R0M0`, `${blockId}-R1M0`);
      addPath(`${blockId}-R0M1`, `${blockId}-R1M1`);
      addPath(`${blockId}-R0M2`, `${blockId}-R1M1`);
      addPath(`${blockId}-R1M0`, `${blockId}-R2M0`);
      addPath(`${blockId}-R1M1`, `${blockId}-R2M0`);
      break;

    case "P8":
      // 準々決勝 → 準決勝、準決勝 → 決勝
      addPath(`${blockId}-R0M0`, `${blockId}-R1M0`);
      addPath(`${blockId}-R0M1`, `${blockId}-R1M0`);
      addPath(`${blockId}-R0M2`, `${blockId}-R1M1`);
      addPath(`${blockId}-R0M3`, `${blockId}-R1M1`);
      addPath(`${blockId}-R1M0`, `${blockId}-R2M0`);
      addPath(`${blockId}-R1M1`, `${blockId}-R2M0`);
      break;
  }
}

