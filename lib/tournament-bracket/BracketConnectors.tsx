"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { CARD_HEIGHT, CARD_GAP, HEADER_HEIGHT } from "./constants";
import type { PatternType, PatternConfig } from "./patterns";
import type { BracketMatch } from "./types";

/**
 * MatchCard内のチーム行の縦位置オフセット
 * p-3 (12px) + h-8/2 (16px) = 28px for team1
 * p-3 (12px) + h-8 (32px) + mb-2 (8px) + h-8/2 (16px) = 68px for team2
 */
const TEAM1_CENTER_OFFSET = 28;
const TEAM2_CENTER_OFFSET = 68;

/**
 * SeedCard内のチーム行の縦位置オフセット
 * p-3 (12px) + h-8/2 (16px) = 28px
 */
const SEED_CENTER_OFFSET = 28;

/**
 * 接続定義
 */
export interface ConnectionDef {
  type: "single" | "merge";
  /** ソースラウンドインデックス */
  fromRound: number;
  /** ソース位置（試合インデックス、複数の場合はmerge） */
  fromPositions: number[];
  /** 宛先ラウンドインデックス */
  toRound: number;
  /** 宛先位置（試合インデックス） */
  toPosition: number;
  /** シードからの接続かどうか */
  isFromSeed?: boolean;
  /** シードインデックス（isFromSeed=true時） */
  seedIndex?: number;
}

interface ConnectionLayerProps {
  /** パターンタイプ */
  pattern: PatternType;
  /** パターン設定 */
  config: PatternConfig;
  /** 接続定義 */
  connections: ConnectionDef[];
  /** ブロック全体の高さ */
  blockHeight: number;
  /** ステージ間のギャップ（px） */
  stageGap: number;
  /** 試合データ（勝者判定用） */
  matches: BracketMatch[];
  /** ラウンドごとの試合配列 */
  matchesByRound: BracketMatch[][];
}

// 勝者: 赤色, 敗者/未確定: グレー
const WINNER_COLOR = "#dc2626";
const DEFAULT_COLOR = "#9ca3af";

/**
 * カード上端の絶対Y座標を計算
 */
function getCardTopY(position: number): number {
  return HEADER_HEIGHT + position * (CARD_HEIGHT + CARD_GAP);
}

/**
 * 勝者を判定（0: team1, 1: team2, null: 未確定）
 */
function getWinnerIndex(match: BracketMatch): number | null {
  if (!match.is_confirmed) return null;

  if (
    match.winner_tournament_team_id !== undefined &&
    match.winner_tournament_team_id !== null
  ) {
    if (match.winner_tournament_team_id === match.team1_tournament_team_id)
      return 0;
    if (match.winner_tournament_team_id === match.team2_tournament_team_id)
      return 1;
  } else if (match.winner_team_id) {
    if (match.winner_team_id === match.team1_id) return 0;
    if (match.winner_team_id === match.team2_id) return 1;
  }

  return null;
}

interface PathData {
  d: string;
  color: string;
  /** デバッグ用識別子 */
  debugId?: string;
}

/**
 * カラム幅を計算
 */
function getColumnWidth(columnCount: number, stageGap: number, containerWidth: number): number {
  const totalGap = stageGap * (columnCount - 1);
  return (containerWidth - totalGap) / columnCount;
}

/**
 * カラムの開始X座標を計算（実ピクセル座標）
 * Column N starts at: N * columnWidth + N * stageGap
 */
function getColumnStartX(
  colIndex: number,
  columnCount: number,
  stageGap: number,
  containerWidth: number
): number {
  const columnWidth = getColumnWidth(columnCount, stageGap, containerWidth);
  return colIndex * (columnWidth + stageGap);
}

/**
 * カラムの終了X座標を計算（実ピクセル座標）
 * Column N ends at: (N + 1) * columnWidth + N * stageGap
 */
function getColumnEndX(
  colIndex: number,
  columnCount: number,
  stageGap: number,
  containerWidth: number
): number {
  const columnWidth = getColumnWidth(columnCount, stageGap, containerWidth);
  return (colIndex + 1) * columnWidth + colIndex * stageGap;
}

/**
 * ギャップの中間X座標を計算（実ピクセル座標）
 * Gap after column N midpoint: columnEnd + stageGap / 2
 */
function getGapMidX(
  colIndex: number,
  columnCount: number,
  stageGap: number,
  containerWidth: number
): number {
  const columnEnd = getColumnEndX(colIndex, columnCount, stageGap, containerWidth);
  return columnEnd + stageGap / 2;
}

/**
 * マージポイントX座標を計算（ターゲットカラム開始位置から少し左）
 * 縦線を描画する位置。ターゲットカードの左端と揃えて見やすくする。
 */
function getMergePointX(
  targetColIndex: number,
  columnCount: number,
  stageGap: number,
  containerWidth: number
): number {
  const targetColumnStart = getColumnStartX(targetColIndex, columnCount, stageGap, containerWidth);
  return targetColumnStart - 12; // ターゲットカード開始位置から12px左
}

/**
 * 単一接続のSVGパスを生成
 *
 * 形状: 両チームから水平線 → ブラケット縦線 → 中央から水平線 → 縦線 → 宛先への水平線
 */
function createSingleConnectorPath(
  sourceX: number,
  midX: number,
  mergeX: number,
  targetX: number,
  team1Y: number,
  team2Y: number,
  targetY: number,
  winnerIndex: number | null,
  debugPrefix: string = "S"
): PathData[] {
  const paths: PathData[] = [];
  const matchCenterY = (team1Y + team2Y) / 2;

  // チーム1から中間点への水平線
  paths.push({
    d: `M ${sourceX} ${team1Y} H ${midX}`,
    color: winnerIndex === 0 ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-1`,
  });

  // チーム2から中間点への水平線
  paths.push({
    d: `M ${sourceX} ${team2Y} H ${midX}`,
    color: winnerIndex === 1 ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-2`,
  });

  // ブラケット縦線（勝者側のみ赤色）
  // team1側（上半分）
  paths.push({
    d: `M ${midX} ${team1Y} V ${matchCenterY}`,
    color: winnerIndex === 0 ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-3a`,
  });
  // team2側（下半分）
  paths.push({
    d: `M ${midX} ${matchCenterY} V ${team2Y}`,
    color: winnerIndex === 1 ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-3b`,
  });

  // ブラケット中央からマージポイントへの水平線
  paths.push({
    d: `M ${midX} ${matchCenterY} H ${mergeX}`,
    color: winnerIndex !== null ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-4`,
  });

  // マージポイントでの縦線（matchCenterYからtargetYへ、必要な場合のみ）
  if (Math.abs(matchCenterY - targetY) > 1) {
    paths.push({
      d: `M ${mergeX} ${matchCenterY} V ${targetY}`,
      color: winnerIndex !== null ? WINNER_COLOR : DEFAULT_COLOR,
      debugId: `${debugPrefix}-5`,
    });
  }

  // 宛先カードへの水平線
  paths.push({
    d: `M ${mergeX} ${targetY} H ${targetX}`,
    color: winnerIndex !== null ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-6`,
  });

  return paths;
}

interface MatchTeamInfo {
  team1Y: number;
  team2Y: number;
  winnerIndex: number | null;
}

/**
 * マージ接続のSVGパスを生成
 *
 * 形状: 各試合から水平線+縦ブラケット → 各試合中央から水平線 → 試合間縦線 → 宛先への水平線
 */
function createMergeConnectorPath(
  sourceX: number,
  midX: number,
  mergeX: number,
  targetX: number,
  sources: MatchTeamInfo[],
  targetY: number,
  debugPrefix: string = "M"
): PathData[] {
  const paths: PathData[] = [];
  const matchCenterYs: number[] = [];
  const hasAnyWinner = sources.some((s) => s.winnerIndex !== null);

  sources.forEach((source, srcIdx) => {
    const matchCenterY = (source.team1Y + source.team2Y) / 2;
    matchCenterYs.push(matchCenterY);

    // チーム1から水平線
    paths.push({
      d: `M ${sourceX} ${source.team1Y} H ${midX}`,
      color: source.winnerIndex === 0 ? WINNER_COLOR : DEFAULT_COLOR,
      debugId: `${debugPrefix}-${srcIdx}a`,
    });

    // チーム2から水平線
    paths.push({
      d: `M ${sourceX} ${source.team2Y} H ${midX}`,
      color: source.winnerIndex === 1 ? WINNER_COLOR : DEFAULT_COLOR,
      debugId: `${debugPrefix}-${srcIdx}b`,
    });

    // 各試合内の縦線（勝者側のみ赤色）
    // team1側（上半分）
    paths.push({
      d: `M ${midX} ${source.team1Y} V ${matchCenterY}`,
      color: source.winnerIndex === 0 ? WINNER_COLOR : DEFAULT_COLOR,
      debugId: `${debugPrefix}-${srcIdx}c1`,
    });
    // team2側（下半分）
    paths.push({
      d: `M ${midX} ${matchCenterY} V ${source.team2Y}`,
      color: source.winnerIndex === 1 ? WINNER_COLOR : DEFAULT_COLOR,
      debugId: `${debugPrefix}-${srcIdx}c2`,
    });

    // 各試合の中央からマージポイントへの水平線
    paths.push({
      d: `M ${midX} ${matchCenterY} H ${mergeX}`,
      color: source.winnerIndex !== null ? WINNER_COLOR : DEFAULT_COLOR,
      debugId: `${debugPrefix}-${srcIdx}d`,
    });
  });

  // 全試合の中央を繋ぐ縦線と宛先への接続
  if (sources.length > 1) {
    const minCenterY = Math.min(...matchCenterYs);
    const maxCenterY = Math.max(...matchCenterYs);

    // 試合間を繋ぐ縦線（targetYも含めて描画）
    const minY = Math.min(minCenterY, targetY);
    const maxY = Math.max(maxCenterY, targetY);

    paths.push({
      d: `M ${mergeX} ${minY} V ${maxY}`,
      color: hasAnyWinner ? WINNER_COLOR : DEFAULT_COLOR,
      debugId: `${debugPrefix}-v`,
    });

    // 宛先カードへの水平線
    paths.push({
      d: `M ${mergeX} ${targetY} H ${targetX}`,
      color: hasAnyWinner ? WINNER_COLOR : DEFAULT_COLOR,
      debugId: `${debugPrefix}-out`,
    });
  } else if (sources.length === 1) {
    // 単一ソースの場合
    const source = sources[0];
    const matchCenterY = (source.team1Y + source.team2Y) / 2;

    // 中央からtargetYへの縦線（位置調整が必要な場合）
    if (Math.abs(matchCenterY - targetY) > 1) {
      paths.push({
        d: `M ${mergeX} ${matchCenterY} V ${targetY}`,
        color: source.winnerIndex !== null ? WINNER_COLOR : DEFAULT_COLOR,
        debugId: `${debugPrefix}-v`,
      });
    }

    // 宛先カードへの水平線
    paths.push({
      d: `M ${mergeX} ${targetY} H ${targetX}`,
      color: source.winnerIndex !== null ? WINNER_COLOR : DEFAULT_COLOR,
      debugId: `${debugPrefix}-out`,
    });
  }

  return paths;
}

/**
 * シード接続のSVGパスを生成（シード単独の場合）
 *
 * 形状: シードから水平線 → 縦線 → 宛先への水平線
 */
function createSeedConnectorPath(
  sourceX: number,
  midX: number,
  targetX: number,
  seedY: number,
  targetY: number,
  debugPrefix: string = "SEED"
): PathData[] {
  const paths: PathData[] = [];

  // シードから中間点への水平線
  paths.push({
    d: `M ${sourceX} ${seedY} H ${midX}`,
    color: WINNER_COLOR, // シードは常に勝者扱い
    debugId: `${debugPrefix}-1`,
  });

  // 中間点から縦線（位置が異なる場合のみ）
  if (Math.abs(seedY - targetY) > 1) {
    paths.push({
      d: `M ${midX} ${seedY} V ${targetY}`,
      color: WINNER_COLOR,
      debugId: `${debugPrefix}-2`,
    });
  }

  // 宛先への水平線（midXからedgeXまで、さらにedgeXからtargetXまで）
  paths.push({
    d: `M ${midX} ${targetY} H ${targetX}`,
    color: WINNER_COLOR,
    debugId: `${debugPrefix}-3`,
  });

  return paths;
}

/**
 * シード＋試合のマージ接続のSVGパスを生成
 *
 * 形状:
 * - M1のteam1水平線がブラケット(midX)まで伸びる
 * - シードがそのteam1水平線に接続（ブラケット位置で合流）
 * - ブラケット中央から出力線がターゲットへ
 */
function createSeedMatchMergeConnectorPath(
  sourceX: number,
  midX: number,
  mergeX: number,
  targetX: number,
  seedY: number,
  matchTeam1Y: number,
  matchTeam2Y: number,
  targetY: number,
  matchWinnerIndex: number | null,
  debugPrefix: string = "SM"
): PathData[] {
  const paths: PathData[] = [];
  const matchCenterY = (matchTeam1Y + matchTeam2Y) / 2;

  // === M1 team1: sourceXからmidXまでの水平線 ===
  paths.push({
    d: `M ${sourceX} ${matchTeam1Y} H ${midX}`,
    color: matchWinnerIndex === 0 ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-1`,
  });

  // === M1 team2: sourceXからmidXまでの水平線 ===
  paths.push({
    d: `M ${sourceX} ${matchTeam2Y} H ${midX}`,
    color: matchWinnerIndex === 1 ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-2`,
  });

  // === team1とteam2を繋ぐブラケット縦線（勝者側のみ赤色） ===
  // team1側（上半分）
  paths.push({
    d: `M ${midX} ${matchTeam1Y} V ${matchCenterY}`,
    color: matchWinnerIndex === 0 ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-bracket1`,
  });
  // team2側（下半分）
  paths.push({
    d: `M ${midX} ${matchCenterY} V ${matchTeam2Y}`,
    color: matchWinnerIndex === 1 ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-bracket2`,
  });

  // === ブラケット中央からmergeXまで水平線 ===
  paths.push({
    d: `M ${midX} ${matchCenterY} H ${mergeX}`,
    color: matchWinnerIndex !== null ? WINNER_COLOR : DEFAULT_COLOR,
    debugId: `${debugPrefix}-out1`,
  });

  // === シード: mergeXまで水平線（SM-R0M0-vに接続） ===
  paths.push({
    d: `M ${sourceX} ${seedY} H ${mergeX}`,
    color: WINNER_COLOR,
    debugId: `${debugPrefix}-seed`,
  });

  // === mergeXでの縦線（シードと試合出力を繋ぎ、targetYまで） ===
  const vTopY = Math.min(seedY, matchCenterY, targetY);
  const vBottomY = Math.max(seedY, matchCenterY, targetY);
  paths.push({
    d: `M ${mergeX} ${vTopY} V ${vBottomY}`,
    color: WINNER_COLOR,
    debugId: `${debugPrefix}-v`,
  });

  // === 宛先カードへの水平線 ===
  paths.push({
    d: `M ${mergeX} ${targetY} H ${targetX}`,
    color: WINNER_COLOR,
    debugId: `${debugPrefix}-out2`,
  });

  return paths;
}

/**
 * 複数シードのマージ接続のSVGパスを生成
 *
 * 形状: 各シードから水平線 → マージポイントで縦線 → ターゲット中央への水平線
 */
function createSeedsMergeConnectorPath(
  sourceX: number,
  mergeX: number,
  targetX: number,
  seedYs: number[],
  targetY: number,
  debugPrefix: string = "SEEDS"
): PathData[] {
  const paths: PathData[] = [];

  // 各シードから水平線
  seedYs.forEach((seedY, idx) => {
    paths.push({
      d: `M ${sourceX} ${seedY} H ${mergeX}`,
      color: WINNER_COLOR,
      debugId: `${debugPrefix}-${idx}`,
    });
  });

  // マージポイントでの縦線（全シードとターゲットを繋ぐ）
  const allYs = [...seedYs, targetY];
  const minY = Math.min(...allYs);
  const maxY = Math.max(...allYs);
  paths.push({
    d: `M ${mergeX} ${minY} V ${maxY}`,
    color: WINNER_COLOR,
    debugId: `${debugPrefix}-v`,
  });

  // ターゲットへの水平線
  paths.push({
    d: `M ${mergeX} ${targetY} H ${targetX}`,
    color: WINNER_COLOR,
    debugId: `${debugPrefix}-out`,
  });

  return paths;
}

/**
 * 接続線レイヤー
 * SVGで接続線を描画（コンテナ幅を実測して正確な座標計算）
 */
export function ConnectionLayer({
  pattern,
  config,
  connections,
  blockHeight,
  stageGap,
  matches: _matches,
  matchesByRound,
}: ConnectionLayerProps) {
  const containerRef = useRef<SVGSVGElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // コンテナ幅を測定
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.getBoundingClientRect().width;
        setContainerWidth(width);
      }
    };

    // 初回測定
    updateWidth();

    // リサイズ監視
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // カラム数は常に3固定（TournamentBlockのレイアウトと整合性を取るため）
  const columnCount = 3;

  // SVGパスを計算（コンテナ幅が確定後）
  const allPaths = useMemo(() => {
    // P1（1チーム）とP2（決勝のみ）は接続線なし
    if (pattern === "P1" || pattern === "P2") {
      return [];
    }

    // コンテナ幅が未確定の場合は空配列
    if (containerWidth === 0) {
      return [];
    }

    const paths: PathData[] = [];

    // 接続をターゲットごとにグループ化（シード＋試合の統合描画のため）
    const connectionsByTarget = new Map<string, ConnectionDef[]>();
    connections.forEach((conn) => {
      const key = `${conn.toRound}-${conn.toPosition}`;
      const existing = connectionsByTarget.get(key) || [];
      existing.push(conn);
      connectionsByTarget.set(key, existing);
    });
    console.log("[BracketConnectors] Pattern:", pattern, "Connections:", JSON.stringify(connections));
    console.log("[BracketConnectors] connectionsByTarget:", Array.from(connectionsByTarget.entries()));

    // 各ターゲットグループを処理
    connectionsByTarget.forEach((targetConnections) => {
      // シード接続と試合接続を分離
      const seedConns = targetConnections.filter((c) => c.isFromSeed);
      const matchConns = targetConnections.filter((c) => !c.isFromSeed);

      // 複数シードが同じターゲットを持つ場合（試合なし）は統合描画
      if (seedConns.length >= 2 && matchConns.length === 0) {
        console.log("[BracketConnectors] Using seeds merge drawing for pattern:", pattern);
        const firstSeed = seedConns[0];
        const sourceRound = firstSeed.fromRound;
        const targetRound = firstSeed.toRound;

        const sourceX = getColumnEndX(sourceRound, columnCount, stageGap, containerWidth) + 4;
        const mergeX = getMergePointX(targetRound, columnCount, stageGap, containerWidth);
        const targetX = getColumnStartX(targetRound, columnCount, stageGap, containerWidth) - 4;

        const targetRoundConfig = config.rounds[targetRound];
        const targetPosition =
          targetRoundConfig?.positions[firstSeed.toPosition] ?? firstSeed.toPosition;
        const targetCardTop = getCardTopY(targetPosition);
        const targetY = targetCardTop + (TEAM1_CENTER_OFFSET + TEAM2_CENTER_OFFSET) / 2;

        // 全シードのY座標を取得
        const seedYs = seedConns.map((conn) => {
          const seedSlot = config.seedSlots?.[conn.seedIndex ?? 0];
          if (!seedSlot) return 0;
          const seedTop = getCardTopY(seedSlot.position);
          return seedTop + SEED_CENTER_OFFSET;
        });

        paths.push(
          ...createSeedsMergeConnectorPath(
            sourceX,
            mergeX,
            targetX,
            seedYs,
            targetY,
            `SEEDS-R${targetRound}M${firstSeed.toPosition}`
          )
        );
        return;
      }

      // シードと単一試合が同じターゲットを持つ場合は統合描画
      if (seedConns.length === 1 && matchConns.length === 1 && matchConns[0].type === "single") {
        console.log("[BracketConnectors] Using unified seed+match drawing for pattern:", pattern);
        const seedConn = seedConns[0];
        const matchConn = matchConns[0];
        const sourceRound = matchConn.fromRound;
        const targetRound = matchConn.toRound;

        const sourceX = getColumnEndX(sourceRound, columnCount, stageGap, containerWidth) + 4;
        const midX = getGapMidX(sourceRound, columnCount, stageGap, containerWidth);
        const mergeX = getMergePointX(targetRound, columnCount, stageGap, containerWidth);
        const targetX = getColumnStartX(targetRound, columnCount, stageGap, containerWidth) - 4;

        const targetRoundConfig = config.rounds[targetRound];
        const targetPosition =
          targetRoundConfig?.positions[matchConn.toPosition] ?? matchConn.toPosition;
        const targetCardTop = getCardTopY(targetPosition);
        const targetY = targetCardTop + (TEAM1_CENTER_OFFSET + TEAM2_CENTER_OFFSET) / 2;

        // シード情報
        const seedSlot = config.seedSlots?.[seedConn.seedIndex ?? 0];
        if (!seedSlot) return;
        const seedTop = getCardTopY(seedSlot.position);
        const seedY = seedTop + SEED_CENTER_OFFSET;

        // 試合情報
        const sourceRoundConfig = config.rounds[sourceRound];
        const fromMatchIndex = matchConn.fromPositions[0];
        const sourcePosition =
          sourceRoundConfig?.positions[fromMatchIndex] ?? fromMatchIndex;
        const sourceMatch = matchesByRound[sourceRound]?.[fromMatchIndex];
        const winnerIndex = sourceMatch ? getWinnerIndex(sourceMatch) : null;
        const sourceCardTop = getCardTopY(sourcePosition);
        const matchTeam1Y = sourceCardTop + TEAM1_CENTER_OFFSET;
        const matchTeam2Y = sourceCardTop + TEAM2_CENTER_OFFSET;

        paths.push(
          ...createSeedMatchMergeConnectorPath(
            sourceX,
            midX,
            mergeX,
            targetX,
            seedY,
            matchTeam1Y,
            matchTeam2Y,
            targetY,
            winnerIndex,
            `SM-R${matchConn.fromRound}M${matchConn.fromPositions[0]}`
          )
        );
        return;
      }

      // 通常の接続処理
      console.log("[BracketConnectors] Using normal connection processing for:", targetConnections.map(c => ({ type: c.type, isFromSeed: c.isFromSeed })));
      targetConnections.forEach((conn) => {
        const sourceRound = conn.fromRound;
        const targetRound = conn.toRound;

        const sourceX = getColumnEndX(sourceRound, columnCount, stageGap, containerWidth) + 4;
        const midX = getGapMidX(sourceRound, columnCount, stageGap, containerWidth);
        const mergeX = getMergePointX(targetRound, columnCount, stageGap, containerWidth);
        const targetX = getColumnStartX(targetRound, columnCount, stageGap, containerWidth) - 4;

        const targetRoundConfig = config.rounds[targetRound];
        const targetPosition =
          targetRoundConfig?.positions[conn.toPosition] ?? conn.toPosition;
        const targetCardTop = getCardTopY(targetPosition);

        let targetY: number;
        if (conn.isFromSeed) {
          targetY = targetCardTop + TEAM1_CENTER_OFFSET;
        } else if (conn.type === "single") {
          targetY = targetCardTop + TEAM2_CENTER_OFFSET;
        } else {
          targetY = targetCardTop + (TEAM1_CENTER_OFFSET + TEAM2_CENTER_OFFSET) / 2;
        }

        if (conn.isFromSeed && conn.seedIndex !== undefined) {
          const seedSlot = config.seedSlots?.[conn.seedIndex];
          if (!seedSlot) return;

          const seedTop = getCardTopY(seedSlot.position);
          const seedY = seedTop + SEED_CENTER_OFFSET;

          paths.push(...createSeedConnectorPath(sourceX, midX, targetX, seedY, targetY, `SEED${conn.seedIndex}`));
        } else if (conn.type === "single") {
          const sourceRoundConfig = config.rounds[sourceRound];
          const fromMatchIndex = conn.fromPositions[0];
          const sourcePosition =
            sourceRoundConfig?.positions[fromMatchIndex] ?? fromMatchIndex;
          const sourceMatch = matchesByRound[sourceRound]?.[fromMatchIndex];
          const winnerIndex = sourceMatch ? getWinnerIndex(sourceMatch) : null;

          const sourceCardTop = getCardTopY(sourcePosition);
          const team1Y = sourceCardTop + TEAM1_CENTER_OFFSET;
          const team2Y = sourceCardTop + TEAM2_CENTER_OFFSET;

          paths.push(
            ...createSingleConnectorPath(
              sourceX,
              midX,
              mergeX,
              targetX,
              team1Y,
              team2Y,
              targetY,
              winnerIndex,
              `R${sourceRound}M${fromMatchIndex}`
            )
          );
        } else if (conn.type === "merge") {
          const sourceRoundConfig = config.rounds[sourceRound];
          const sources: MatchTeamInfo[] = [];

          conn.fromPositions.forEach((fromMatchIndex) => {
            const sourcePosition =
              sourceRoundConfig?.positions[fromMatchIndex] ?? fromMatchIndex;
            const sourceMatch = matchesByRound[sourceRound]?.[fromMatchIndex];
            const winnerIndex = sourceMatch ? getWinnerIndex(sourceMatch) : null;

            const sourceCardTop = getCardTopY(sourcePosition);
            sources.push({
              team1Y: sourceCardTop + TEAM1_CENTER_OFFSET,
              team2Y: sourceCardTop + TEAM2_CENTER_OFFSET,
              winnerIndex,
            });
          });

          paths.push(
            ...createMergeConnectorPath(
              sourceX,
              midX,
              mergeX,
              targetX,
              sources,
              targetY,
              `MRG-R${sourceRound}[${conn.fromPositions.join(",")}]`
            )
          );
        }
      });
    });

    return paths;
  }, [pattern, connections, config, stageGap, matchesByRound, containerWidth]);

  // パスがない場合でもSVG要素はレンダリング（サイズ測定のため）
  return (
    <svg
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      viewBox={containerWidth > 0 ? `0 0 ${containerWidth} ${blockHeight}` : undefined}
      preserveAspectRatio="none"
      style={{ width: "100%", height: "100%", zIndex: 1 }}
    >
      {allPaths.map((pathData, i) => (
        <path
          key={i}
          id={pathData.debugId}
          d={pathData.d}
          stroke={pathData.color}
          strokeWidth="2"
          fill="none"
          className="bracket-line"
        />
      ))}
    </svg>
  );
}

/**
 * パターンごとの接続定義を生成
 */
export function getConnectionsForPattern(
  pattern: PatternType,
  config: PatternConfig
): ConnectionDef[] {
  const connections: ConnectionDef[] = [];

  // シードカードの接続
  config.seedSlots?.forEach((seedSlot, seedIndex) => {
    // connectTo形式: "R1M0" -> round 1, match 0
    const match = seedSlot.connectTo.match(/R(\d+)M(\d+)/);
    if (match) {
      const toRound = parseInt(match[1], 10);
      const toPosition = parseInt(match[2], 10);
      connections.push({
        type: "single",
        fromRound: 0,
        fromPositions: [seedIndex],
        toRound,
        toPosition,
        isFromSeed: true,
        seedIndex,
      });
    }
  });

  // 試合間の接続
  switch (pattern) {
    case "P3":
      // 1回戦 → 決勝
      connections.push({
        type: "single",
        fromRound: 0,
        fromPositions: [0],
        toRound: 1,
        toPosition: 0,
      });
      break;

    case "P4":
      // 準決勝 → 決勝（2対1マージ）
      connections.push({
        type: "merge",
        fromRound: 0,
        fromPositions: [0, 1],
        toRound: 1,
        toPosition: 0,
      });
      break;

    case "P5":
      // 1回戦 → 準決勝2
      connections.push({
        type: "single",
        fromRound: 0,
        fromPositions: [0],
        toRound: 1,
        toPosition: 1,
      });
      // 準決勝 → 決勝（2対1マージ）
      connections.push({
        type: "merge",
        fromRound: 1,
        fromPositions: [0, 1],
        toRound: 2,
        toPosition: 0,
      });
      break;

    case "P6":
      // 1回戦1 → 準決勝1
      connections.push({
        type: "single",
        fromRound: 0,
        fromPositions: [0],
        toRound: 1,
        toPosition: 0,
      });
      // 1回戦2 → 準決勝2
      connections.push({
        type: "single",
        fromRound: 0,
        fromPositions: [1],
        toRound: 1,
        toPosition: 1,
      });
      // 準決勝 → 決勝（2対1マージ）
      connections.push({
        type: "merge",
        fromRound: 1,
        fromPositions: [0, 1],
        toRound: 2,
        toPosition: 0,
      });
      break;

    case "P7":
      // 1回戦1 → 準決勝1
      connections.push({
        type: "single",
        fromRound: 0,
        fromPositions: [0],
        toRound: 1,
        toPosition: 0,
      });
      // 1回戦2,3 → 準決勝2（2対1マージ）
      connections.push({
        type: "merge",
        fromRound: 0,
        fromPositions: [1, 2],
        toRound: 1,
        toPosition: 1,
      });
      // 準決勝 → 決勝（2対1マージ）
      connections.push({
        type: "merge",
        fromRound: 1,
        fromPositions: [0, 1],
        toRound: 2,
        toPosition: 0,
      });
      break;

    case "P8":
      // 準々決勝1,2 → 準決勝1（2対1マージ）
      connections.push({
        type: "merge",
        fromRound: 0,
        fromPositions: [0, 1],
        toRound: 1,
        toPosition: 0,
      });
      // 準々決勝3,4 → 準決勝2（2対1マージ）
      connections.push({
        type: "merge",
        fromRound: 0,
        fromPositions: [2, 3],
        toRound: 1,
        toPosition: 1,
      });
      // 準決勝 → 決勝（2対1マージ）
      connections.push({
        type: "merge",
        fromRound: 1,
        fromPositions: [0, 1],
        toRound: 2,
        toPosition: 0,
      });
      break;
  }

  return connections;
}
