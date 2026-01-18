/**
 * トーナメントブロックパターン定義
 *
 * 1-8チームの各パターン（P1〜P8）の構造を定義
 */

export type PatternType = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8";

/** P6のシード配置パターン */
export type P6SeedLayout = "dispersed" | "adjacent";

export interface RoundConfig {
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
    rounds: [{ matchCount: 1, positions: [0] }],
    columnCount: 1,
  },
  P3: {
    type: "P3",
    teamCount: 3,
    totalMatches: 2,
    rounds: [
      { matchCount: 1, positions: [1] }, // 下側
      { matchCount: 1, positions: [0.5] }, // 中央
    ],
    columnCount: 2,
    seedSlots: [{ position: 0, connectTo: "R1M0" }], // 上側にシード
  },
  P4: {
    type: "P4",
    teamCount: 4,
    totalMatches: 3,
    rounds: [
      { matchCount: 2, positions: [0, 1] },
      { matchCount: 1, positions: [0.5] },
    ],
    columnCount: 2,
  },
  P5: {
    type: "P5",
    teamCount: 5,
    totalMatches: 4,
    rounds: [
      { matchCount: 1, positions: [2] },
      { matchCount: 2, positions: [0.25, 1.75] }, // SF1, SF2を入力の中央に
      { matchCount: 1, positions: [1] }, // SFの中間に配置
    ],
    columnCount: 3,
    seedSlots: [
      { position: 0, connectTo: "R1M0" },     // Seed1 → SF1 (上)
      { position: 0.5, connectTo: "R1M0" },   // Seed2 → SF1 (下)
      { position: 1.5, connectTo: "R1M1" },   // Seed3 → SF2 (M1と近接配置)
    ],
  },
  P6: {
    type: "P6",
    teamCount: 6,
    totalMatches: 5,
    rounds: [
      { matchCount: 2, positions: [1, 2] }, // M1, M2
      { matchCount: 2, positions: [0.5, 2.5] }, // M3, M4（M4はSeed1とM2の中央に配置）
      { matchCount: 1, positions: [1.5] }, // M5（M3とM4の中央に配置）
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
      { matchCount: 3, positions: [1, 2, 3] }, // M1, M2, M3
      { matchCount: 2, positions: [0.75, 2.5] }, // M4（Seed=0.5とM1=1の中央）, M5
      { matchCount: 1, positions: [1.625] }, // M6（M4=0.75とM5=2.5の中央）
    ],
    columnCount: 3,
    seedSlots: [{ position: 0.5, connectTo: "R1M0" }],
  },
  P8: {
    type: "P8",
    teamCount: 8,
    totalMatches: 7,
    rounds: [
      { matchCount: 4, positions: [0, 1, 2, 3] },
      { matchCount: 2, positions: [0.5, 2.5] },
      { matchCount: 1, positions: [1.5] },
    ],
    columnCount: 3,
  },
};

/**
 * P6隣接シード配置パターン
 * シード同士がSF1で対戦し、1回戦勝者同士がSF2で対戦する構成
 *
 * 構造:
 * 位置0     Seed1 ──────┐
 *                        ├─ SF1 (M3: Seed1 vs Seed2) ──┐
 * 位置0.5   Seed2 ──────┘                              │
 *                                                       ├─ Final (M5)
 * 位置1.5   M1 ──────────┐                              │
 *                        ├─ SF2 (M4: M1勝者 vs M2勝者) ─┘
 * 位置2.5   M2 ──────────┘
 */
export const P6_ADJACENT_CONFIG: PatternConfig = {
  type: "P6",
  teamCount: 6,
  totalMatches: 5,
  rounds: [
    { matchCount: 2, positions: [1.5, 2.5] }, // M1, M2（下側に配置）
    { matchCount: 2, positions: [0.25, 2] },  // SF1（シード間）, SF2（試合間）
    { matchCount: 1, positions: [1.125] },    // Final
  ],
  columnCount: 3,
  seedSlots: [
    { position: 0, connectTo: "R1M0" },    // Seed1 → SF1
    { position: 0.5, connectTo: "R1M0" },  // Seed2 → SF1
  ],
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
 * P6パターン設定を取得（シード配置オプション付き）
 */
export function getP6PatternConfig(seedLayout: P6SeedLayout = "dispersed"): PatternConfig {
  return seedLayout === "adjacent" ? P6_ADJACENT_CONFIG : PATTERNS.P6;
}

/**
 * ラウンド名の色を取得
 */
export function getRoundColor(roundIndex: number, totalRounds: number): string {
  // 最終ラウンド（決勝）
  if (roundIndex === totalRounds - 1) {
    return "bg-red-100 text-red-800";
  }
  // 最初のラウンド（1回戦/予選）
  if (roundIndex === 0) {
    return "bg-green-100 text-green-800";
  }
  // 中間ラウンド（準決勝など）
  return "bg-purple-100 text-purple-800";
}
