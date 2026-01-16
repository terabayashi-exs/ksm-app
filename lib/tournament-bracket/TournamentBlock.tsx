"use client";

import { useRef, useEffect, useCallback } from "react";
import { MatchCard } from "./MatchCard";
import { SeedCard } from "./SeedCard";
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
  /** 試合データ（0-7試合） */
  matches: BracketMatch[];
  /** ブロックタイトル */
  title?: string;
  /** ラウンドラベル（例: ["準々決勝", "準決勝", "決勝"]） */
  roundLabels?: string[];
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
  matches,
  sportConfig,
  title,
  winnerName,
  seedTeams = [],
  roundLabels,
}: TournamentBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 試合数からパターンを判定
  const pattern = getPatternByMatchCount(matches.length);
  const config = getPatternConfig(pattern);

  // ステージ間のギャップ
  const stageGap = 48; // gap-12 = 48px
  // カラム幅: 常に3カラム分で計算 (containerWidth - 2 * gap) / 3
  // CSS calc()で動的に計算
  const columnWidthCalc = `calc((100% - ${stageGap * 2}px) / 3)`;

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

    // 接続情報を収集
    const connections: { fromId: string; toId: string }[] = [];
    const addPath = (fromId: string, toId: string) => {
      connections.push({ fromId, toId });
    };

    // パターンに応じた接続線を収集
    drawConnectionsByPattern(pattern, blockId, addPath, config);

    // 宛先ごとにグループ化
    const groupedByDest = connections.reduce((acc, conn) => {
      if (!acc[conn.toId]) acc[conn.toId] = [];
      acc[conn.toId].push(conn.fromId);
      return acc;
    }, {} as Record<string, string[]>);

    // SVGパスを作成するヘルパー
    const createPath = (d: string) => {
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

    // グループごとに接続線を描画
    Object.entries(groupedByDest).forEach(([toId, fromIds]) => {
      const toEl = container.querySelector(
        `[data-match="${toId}"]`
      ) as HTMLElement;
      if (!toEl) return;

      const dest = midLeft(toEl);

      // ソース要素の座標を取得
      const sources = fromIds
        .map((fromId) => {
          const fromEl = container.querySelector(
            `[data-match="${fromId}"]`
          ) as HTMLElement;
          if (!fromEl) return null;
          return midRight(fromEl);
        })
        .filter((p): p is { x: number; y: number } => p !== null);

      if (sources.length === 0) return;

      if (sources.length === 1) {
        // 単一ソースの場合は従来通り
        const p1 = sources[0];
        const midX = p1.x + (dest.x - p1.x) * 0.5;
        createPath(
          `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${dest.y} L ${dest.x} ${dest.y}`
        );
      } else {
        // 複数ソースの場合：縦線の中心から横線を引く
        const minY = Math.min(...sources.map((s) => s.y));
        const maxY = Math.max(...sources.map((s) => s.y));
        const centerY = (minY + maxY) / 2;
        const midX =
          Math.max(...sources.map((s) => s.x)) +
          (dest.x - Math.max(...sources.map((s) => s.x))) * 0.5;

        // 各ソースから縦線位置まで横線を引く
        sources.forEach((p1) => {
          createPath(`M ${p1.x} ${p1.y} L ${midX} ${p1.y}`);
        });

        // 縦線を引く
        createPath(`M ${midX} ${minY} L ${midX} ${maxY}`);

        // 縦線の中心から宛先へ横線を引く
        createPath(`M ${midX} ${centerY} L ${dest.x} ${centerY}`);

        // 宛先への最後の接続（宛先のY位置が中心と異なる場合）
        if (Math.abs(centerY - dest.y) > 1) {
          createPath(`M ${dest.x} ${centerY} L ${dest.x} ${dest.y}`);
        }
      }
    });

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
            <div className="text-lg font-semibold">{winnerName || "勝者"}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}

      <div
        ref={containerRef}
        className="relative flex gap-12 w-full"
        style={{
          height: `${blockHeight}px`,
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
          // カスタムラベルがあればそれを使用、なければデフォルト
          const label = roundLabels?.[roundIndex] ?? round.name;

          return (
            <div
              key={round.name}
              className="relative"
              style={{
                width: columnWidthCalc,
                zIndex: 2,
              }}
            >
              <div
                className={`text-sm font-medium text-center mb-2 px-3 py-1 rounded-full ${getRoundColor(
                  roundIndex,
                  config.rounds.length
                )}`}
              >
                {label}
              </div>
              {/* シードカード（1回戦のみ） */}
              {roundIndex === 0 &&
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
