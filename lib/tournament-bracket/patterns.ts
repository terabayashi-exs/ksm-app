/**
 * トーナメントブロックパターン定義
 *
 * 1-8チームの各パターン（P1〜P8）の構造を定義
 */

export type PatternType = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8";

export interface RoundConfig {
  /** ラウンド名 */
  name: string;
  /** ラウンド内の試合数 */
  matchCount: number;
  /** 各試合の垂直位置インデックス（上から0始まり） */
  positions: number[];
}

export interface SeedSlot {
  /** 垂直位置インデックス */
  position: number;
  /** 次ラウンドの接続先 (例: "R1M0" = ラウンド1、試合0) */
  connectTo: string;
}

export interface PatternConfig {
  type: PatternType;
  teamCount: number;
  totalMatches: number;
  /** ラウンド構成（左から右の順） */
  rounds: RoundConfig[];
  /** カラム数 */
  columnCount: number;
  /** シードスロット（1回戦に空き枠がある場合） */
  seedSlots?: SeedSlot[];
}

/**
 * パターン定義
 *
 * 仕様書に基づく各パターンの構造：
 * - P1: 1チーム（不戦勝、試合なし）
 * - P2: 2チーム（決勝のみ）
 * - P3: 3チーム（1+2配分、1回戦1 + 決勝1）
 * - P4: 4チーム（2+2配分、準決勝2 + 決勝1）
 * - P5: 5チーム（2+3配分、1回戦1 + 準決勝2 + 決勝1）
 * - P6: 6チーム（3+3配分、1回戦2 + 準決勝2 + 決勝1）
 * - P7: 7チーム（3+4配分、1回戦3 + 準決勝2 + 決勝1）
 * - P8: 8チーム（4+4配分、準々決勝4 + 準決勝2 + 決勝1）
 */
export const PATTERNS: Record<PatternType, PatternConfig> = {
  // P1は使用しない（1チームのみのケースは想定外）
  P1: {
    type: "P1",
    teamCount: 1,
    totalMatches: 0,
    rounds: [],
    columnCount: 1,
  },
  P2: {
    type: "P2",
    teamCount: 2,
    totalMatches: 1,
    rounds: [{ name: "決勝", matchCount: 1, positions: [0] }],
    columnCount: 1,
  },
  P3: {
    type: "P3",
    teamCount: 3,
    totalMatches: 2,
    rounds: [
      { name: "1回戦", matchCount: 1, positions: [1] }, // 下側
      { name: "決勝", matchCount: 1, positions: [0.5] }, // 中央
    ],
    columnCount: 2,
    seedSlots: [{ position: 0, connectTo: "R1M0" }], // 上側にシード
  },
  P4: {
    type: "P4",
    teamCount: 4,
    totalMatches: 3,
    rounds: [
      { name: "準決勝", matchCount: 2, positions: [0, 1] },
      { name: "決勝", matchCount: 1, positions: [0.5] },
    ],
    columnCount: 2,
  },
  P5: {
    type: "P5",
    teamCount: 5,
    totalMatches: 4,
    rounds: [
      { name: "1回戦", matchCount: 1, positions: [2] }, // 下側の山
      { name: "準決勝", matchCount: 2, positions: [0, 1.5] },
      { name: "決勝", matchCount: 1, positions: [0.75] },
    ],
    columnCount: 3,
    seedSlots: [{ position: 0, connectTo: "R1M0" }], // 上側にシード（準決勝1へ直接）
  },
  P6: {
    type: "P6",
    teamCount: 6,
    totalMatches: 5,
    rounds: [
      { name: "1回戦", matchCount: 2, positions: [1, 2] }, // 上と下
      { name: "準決勝", matchCount: 2, positions: [0.5, 1.5] },
      { name: "決勝", matchCount: 1, positions: [1] },
    ],
    columnCount: 3,
    seedSlots: [
      { position: 0, connectTo: "R1M0" }, // 最上部にシード（準決勝1へ）
      { position: 3, connectTo: "R1M1" }, // 最下部にシード（準決勝2へ）
    ],
  },
  P7: {
    type: "P7",
    teamCount: 7,
    totalMatches: 6,
    rounds: [
      { name: "1回戦", matchCount: 3, positions: [1, 2, 3] },
      { name: "準決勝", matchCount: 2, positions: [0.5, 2.5] },
      { name: "決勝", matchCount: 1, positions: [1.5] },
    ],
    columnCount: 3,
    seedSlots: [{ position: 0, connectTo: "R1M0" }], // 最上部にシード（準決勝1へ）
  },
  P8: {
    type: "P8",
    teamCount: 8,
    totalMatches: 7,
    rounds: [
      { name: "準々決勝", matchCount: 4, positions: [0, 1, 2, 3] },
      { name: "準決勝", matchCount: 2, positions: [0.5, 2.5] },
      { name: "決勝", matchCount: 1, positions: [1.5] },
    ],
    columnCount: 3,
  },
};

/**
 * 試合数からパターンを判定
 */
export function getPatternByMatchCount(matchCount: number): PatternType {
  switch (matchCount) {
    case 0:
      // 1チームのみのケースは想定外
      throw new Error(
        "Match count 0 (1 team only) is not supported. Use at least 2 teams."
      );
    case 1:
      return "P2";
    case 2:
      return "P3";
    case 3:
      return "P4";
    case 4:
      return "P5";
    case 5:
      return "P6";
    case 6:
      return "P7";
    case 7:
      return "P8";
    default:
      // 8試合以上は複数ブロックに分割すべき
      throw new Error(
        `Invalid match count: ${matchCount}. Use MultiBlockBracket for larger tournaments.`
      );
  }
}

/**
 * チーム数からパターンを判定
 */
export function getPatternByTeamCount(teamCount: number): PatternType {
  if (teamCount < 1 || teamCount > 8) {
    throw new Error(`Invalid team count: ${teamCount}. Must be 1-8.`);
  }
  return `P${teamCount}` as PatternType;
}

/**
 * パターン設定を取得
 */
export function getPatternConfig(pattern: PatternType): PatternConfig {
  return PATTERNS[pattern];
}

/**
 * ラウンド名の色を取得
 */
export function getRoundColor(roundName: string): string {
  if (roundName.includes("準々決勝")) return "bg-blue-100 text-blue-800";
  if (roundName.includes("準決勝")) return "bg-purple-100 text-purple-800";
  if (roundName.includes("1回戦")) return "bg-green-100 text-green-800";
  if (roundName.includes("決勝")) return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
}
