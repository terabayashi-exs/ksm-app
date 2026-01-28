"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { CARD_HEIGHT, CARD_GAP, HEADER_HEIGHT } from "./constants";
import type { PatternType, PatternConfig } from "./patterns";
import type { BracketMatch } from "./types";

// MatchCard内のチーム行の縦位置オフセット
const TEAM1_CENTER_OFFSET = 28; // p-3 (12px) + h-8/2 (16px)
const TEAM2_CENTER_OFFSET = 68; // p-3 (12px) + h-8 (32px) + mb-2 (8px) + h-8/2 (16px)
const SEED_CENTER_OFFSET = 28;  // SeedCardも同じ

// 色定義（Tailwindカラーに合わせる）
const WINNER_COLOR = "#22c55e"; // green-500: MatchCardの勝者色と統一
const DEFAULT_COLOR = "#9ca3af"; // gray-400

// ============================================================
// 型定義
// ============================================================

interface PathData {
  d: string;
  color: string;
  /** デバッグ用識別子（SVG path の id 属性に使用） */
  id?: string;
}

export interface ConnectionDef {
  type: "single" | "merge";
  fromRound: number;
  fromPositions: number[];
  toRound: number;
  toPosition: number;
  isFromSeed?: boolean;
  seedIndex?: number;
}

interface ConnectionLayerProps {
  pattern: PatternType;
  config: PatternConfig;
  connections: ConnectionDef[];
  blockHeight: number;
  stageGap: number;
  matches: BracketMatch[];
  matchesByRound: BracketMatch[][];
}

interface SourceInfo {
  type: "match" | "seed";
  y?: number;           // seed用
  team1Y?: number;      // match用
  team2Y?: number;      // match用
  winnerIndex?: number | null;
}

interface XCoords {
  sourceX: number;
  midX: number;
  mergeX: number;
  targetX: number;
}

// ============================================================
// プリミティブ関数
// ============================================================

/** 水平線 */
function hLine(x1: number, x2: number, y: number, color: string, id?: string): PathData {
  return { d: `M ${x1} ${y} H ${x2}`, color, id };
}

/** 縦線 */
function vLine(x: number, y1: number, y2: number, color: string, id?: string): PathData {
  return { d: `M ${x} ${y1} V ${y2}`, color, id };
}

/** ブラケット（勝者色分け付き縦線） */
function bracket(
  x: number,
  team1Y: number,
  team2Y: number,
  winnerIndex: number | null,
  idPrefix?: string
): PathData[] {
  const centerY = (team1Y + team2Y) / 2;
  return [
    vLine(x, team1Y, centerY, winnerIndex === 0 ? WINNER_COLOR : DEFAULT_COLOR, idPrefix ? `${idPrefix}-top` : undefined),
    vLine(x, centerY, team2Y, winnerIndex === 1 ? WINNER_COLOR : DEFAULT_COLOR, idPrefix ? `${idPrefix}-btm` : undefined),
  ];
}

// ============================================================
// 座標計算
// ============================================================

function getCardTopY(position: number): number {
  return HEADER_HEIGHT + position * (CARD_HEIGHT + CARD_GAP);
}

function getColumnWidth(columnCount: number, stageGap: number, containerWidth: number): number {
  return (containerWidth - stageGap * (columnCount - 1)) / columnCount;
}

function getColumnStartX(colIndex: number, columnCount: number, stageGap: number, containerWidth: number): number {
  const columnWidth = getColumnWidth(columnCount, stageGap, containerWidth);
  return colIndex * (columnWidth + stageGap);
}

function getColumnEndX(colIndex: number, columnCount: number, stageGap: number, containerWidth: number): number {
  const columnWidth = getColumnWidth(columnCount, stageGap, containerWidth);
  return (colIndex + 1) * columnWidth + colIndex * stageGap;
}

function getGapMidX(colIndex: number, columnCount: number, stageGap: number, containerWidth: number): number {
  return getColumnEndX(colIndex, columnCount, stageGap, containerWidth) + stageGap / 2;
}

function getMergePointX(targetColIndex: number, columnCount: number, stageGap: number, containerWidth: number): number {
  return getColumnStartX(targetColIndex, columnCount, stageGap, containerWidth) - 12;
}

function getWinnerIndex(match: BracketMatch): number | null {
  if (!match.is_confirmed) return null;
  if (match.winner_tournament_team_id != null) {
    if (match.winner_tournament_team_id === match.team1_tournament_team_id) return 0;
    if (match.winner_tournament_team_id === match.team2_tournament_team_id) return 1;
  } else if (match.winner_team_id) {
    if (match.winner_team_id === match.team1_id) return 0;
    if (match.winner_team_id === match.team2_id) return 1;
  }
  return null;
}

// ============================================================
// 統合コネクタ描画
// ============================================================

/**
 * 全ての接続パターンを統一処理
 * sources: シードまたは試合の配列
 * targetY: ターゲットカードの接続Y座標
 * xCoords: X座標群
 * debugPrefix: デバッグ用ID接頭辞（例: "R0M0-R1M0"）
 */
function createConnector(
  sources: SourceInfo[],
  targetY: number,
  xCoords: XCoords,
  debugPrefix?: string
): PathData[] {
  const { sourceX, midX, mergeX, targetX } = xCoords;
  const paths: PathData[] = [];
  const outputYs: number[] = [];

  // 各ソースを処理
  sources.forEach((src, srcIdx) => {
    const srcPrefix = debugPrefix ? `${debugPrefix}-src${srcIdx}` : undefined;

    if (src.type === "seed" && src.y !== undefined) {
      // シード: 水平線をmergeXまで
      paths.push(hLine(sourceX, mergeX, src.y, WINNER_COLOR, srcPrefix ? `${srcPrefix}-h` : undefined));
      outputYs.push(src.y);
    } else if (src.type === "match" && src.team1Y !== undefined && src.team2Y !== undefined) {
      const centerY = (src.team1Y + src.team2Y) / 2;
      const winner = src.winnerIndex;
      const winColor = winner !== null ? WINNER_COLOR : DEFAULT_COLOR;

      // team1, team2 水平線
      paths.push(hLine(sourceX, midX, src.team1Y, winner === 0 ? WINNER_COLOR : DEFAULT_COLOR, srcPrefix ? `${srcPrefix}-t1` : undefined));
      paths.push(hLine(sourceX, midX, src.team2Y, winner === 1 ? WINNER_COLOR : DEFAULT_COLOR, srcPrefix ? `${srcPrefix}-t2` : undefined));

      // ブラケット縦線
      paths.push(...bracket(midX, src.team1Y, src.team2Y, winner ?? null, srcPrefix ? `${srcPrefix}-bkt` : undefined));

      // 中央からmergeXへの水平線
      paths.push(hLine(midX, mergeX, centerY, winColor, srcPrefix ? `${srcPrefix}-out` : undefined));
      outputYs.push(centerY);
    }
  });

  // マージ縦線（全outputYsを繋ぐ）
  const hasWinner = sources.some(s => s.type === "seed" || s.winnerIndex !== null);
  const allSeeds = sources.every(s => s.type === "seed");

  if (allSeeds && outputYs.length >= 2) {
    // 全ソースがシードの場合: シード間のマージ縦線を描画し、その中心から水平線を出す
    const seedMinY = Math.min(...outputYs);
    const seedMaxY = Math.max(...outputYs);
    const mergeCenter = (seedMinY + seedMaxY) / 2;

    // マージ縦線（シード間のみ）
    paths.push(vLine(mergeX, seedMinY, seedMaxY, WINNER_COLOR, debugPrefix ? `${debugPrefix}-merge` : undefined));

    // マージ中心からターゲットへの水平線
    paths.push(hLine(mergeX, targetX, mergeCenter, WINNER_COLOR, debugPrefix ? `${debugPrefix}-target` : undefined));
  } else {
    // 通常パターン: 全outputYsとtargetYを繋ぐ
    const allYs = [...outputYs, targetY];
    const minY = Math.min(...allYs);
    const maxY = Math.max(...allYs);

    if (maxY - minY > 1) {
      paths.push(vLine(mergeX, minY, maxY, hasWinner ? WINNER_COLOR : DEFAULT_COLOR, debugPrefix ? `${debugPrefix}-merge` : undefined));
    }

    // ターゲットへの水平線
    paths.push(hLine(mergeX, targetX, targetY, hasWinner ? WINNER_COLOR : DEFAULT_COLOR, debugPrefix ? `${debugPrefix}-target` : undefined));
  }

  return paths;
}

// ============================================================
// ConnectionLayer コンポーネント
// ============================================================

export function ConnectionLayer({
  pattern,
  config,
  connections,
  blockHeight,
  stageGap,
  matchesByRound,
}: ConnectionLayerProps) {
  const containerRef = useRef<SVGSVGElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.getBoundingClientRect().width);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const columnCount = 3;

  const allPaths = useMemo(() => {
    if (pattern === "P1" || pattern === "P2" || containerWidth === 0) return [];

    const paths: PathData[] = [];

    // ターゲットごとにグループ化
    const byTarget = new Map<string, ConnectionDef[]>();
    connections.forEach((conn) => {
      const key = `${conn.toRound}-${conn.toPosition}`;
      byTarget.set(key, [...(byTarget.get(key) || []), conn]);
    });

    byTarget.forEach((conns) => {
      const seedConns = conns.filter((c) => c.isFromSeed);
      const matchConns = conns.filter((c) => !c.isFromSeed);

      // ターゲット情報を取得
      const firstConn = conns[0];
      const targetRound = firstConn.toRound;
      const targetRoundConfig = config.rounds[targetRound];
      const targetPosition = targetRoundConfig?.positions[firstConn.toPosition] ?? firstConn.toPosition;
      const targetCardTop = getCardTopY(targetPosition);
      const targetCenterY = targetCardTop + (TEAM1_CENTER_OFFSET + TEAM2_CENTER_OFFSET) / 2;

      // ソースラウンドはシードまたは試合から取得
      const sourceRound = matchConns[0]?.fromRound ?? seedConns[0]?.fromRound ?? 0;

      const xCoords: XCoords = {
        sourceX: getColumnEndX(sourceRound, columnCount, stageGap, containerWidth) + 4,
        midX: getGapMidX(sourceRound, columnCount, stageGap, containerWidth),
        mergeX: getMergePointX(targetRound, columnCount, stageGap, containerWidth),
        targetX: getColumnStartX(targetRound, columnCount, stageGap, containerWidth) - 4,
      };

      // ソース情報を構築
      const sources: SourceInfo[] = [];

      // シードを追加
      seedConns.forEach((conn) => {
        const seedSlot = config.seedSlots?.[conn.seedIndex ?? 0];
        if (seedSlot) {
          sources.push({
            type: "seed",
            y: getCardTopY(seedSlot.position) + SEED_CENTER_OFFSET,
          });
        }
      });

      // 試合を追加
      matchConns.forEach((conn) => {
        const sourceRoundConfig = config.rounds[conn.fromRound];
        conn.fromPositions.forEach((matchIdx) => {
          const pos = sourceRoundConfig?.positions[matchIdx] ?? matchIdx;
          const match = matchesByRound[conn.fromRound]?.[matchIdx];
          const cardTop = getCardTopY(pos);
          sources.push({
            type: "match",
            team1Y: cardTop + TEAM1_CENTER_OFFSET,
            team2Y: cardTop + TEAM2_CENTER_OFFSET,
            winnerIndex: match ? getWinnerIndex(match) : null,
          });
        });
      });

      // デバッグ用ID: ターゲット位置を示す（例: "toR1M0", "toR2M0"）
      const debugPrefix = `toR${targetRound}M${firstConn.toPosition}`;
      paths.push(...createConnector(sources, targetCenterY, xCoords, debugPrefix));
    });

    return paths;
  }, [pattern, connections, config, stageGap, matchesByRound, containerWidth]);

  return (
    <svg
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      viewBox={containerWidth > 0 ? `0 0 ${containerWidth} ${blockHeight}` : undefined}
      preserveAspectRatio="none"
      style={{ width: "100%", height: "100%", zIndex: 1 }}
    >
      {allPaths.map((p, i) => (
        <path key={p.id ?? i} id={p.id} d={p.d} stroke={p.color} strokeWidth="2" fill="none" className="bracket-line" />
      ))}
    </svg>
  );
}

// ============================================================
// 接続定義生成
// ============================================================

export function getConnectionsForPattern(pattern: PatternType, config: PatternConfig): ConnectionDef[] {
  const connections: ConnectionDef[] = [];

  // シード接続
  config.seedSlots?.forEach((slot, idx) => {
    const match = slot.connectTo.match(/R(\d+)M(\d+)/);
    if (match) {
      connections.push({
        type: "single",
        fromRound: 0,
        fromPositions: [idx],
        toRound: parseInt(match[1], 10),
        toPosition: parseInt(match[2], 10),
        isFromSeed: true,
        seedIndex: idx,
      });
    }
  });

  // 試合接続（パターン別）
  const patternConnections: Record<string, Array<{ from: number[]; to: [number, number] }>> = {
    P3: [{ from: [0], to: [1, 0] }],
    P4: [{ from: [0, 1], to: [1, 0] }],
    P5: [{ from: [0], to: [1, 1] }, { from: [0, 1], to: [2, 0] }],
    P6: [{ from: [0], to: [1, 0] }, { from: [1], to: [1, 1] }, { from: [0, 1], to: [2, 0] }],
    P7: [{ from: [0], to: [1, 0] }, { from: [1, 2], to: [1, 1] }, { from: [0, 1], to: [2, 0] }],
    P8: [{ from: [0, 1], to: [1, 0] }, { from: [2, 3], to: [1, 1] }, { from: [0, 1], to: [2, 0] }],
  };

  // P6隣接配置: 両シードが同じ試合（SF1）に接続する場合、M1とM2は両方SF2に接続
  const isP6Adjacent = pattern === "P6" &&
    config.seedSlots?.length === 2 &&
    config.seedSlots[0].connectTo === config.seedSlots[1].connectTo;

  const conns = isP6Adjacent
    ? [{ from: [0, 1], to: [1, 1] }, { from: [0, 1], to: [2, 0] }]  // M1, M2 → SF2; SF1, SF2 → Final
    : patternConnections[pattern];
  if (conns) {
    conns.forEach(({ from, to }) => {
      // P5-P8の後半の接続はfromRound=1
      const fromRound = to[0] === 2 ? 1 : 0;
      connections.push({
        type: from.length > 1 ? "merge" : "single",
        fromRound,
        fromPositions: from,
        toRound: to[0],
        toPosition: to[1],
      });
    });
  }

  return connections;
}
