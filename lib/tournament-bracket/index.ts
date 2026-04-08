// 定数

export type { ConnectionDef } from "./BracketConnectors";
export {
  ConnectionLayer,
  getConnectionsForPattern,
} from "./BracketConnectors";
export {
  AVOIDANCE_GAP,
  CARD_GAP,
  CARD_HEIGHT,
  COLUMN_GAP,
  EXTRA_HEIGHT,
  FINAL_CODES,
  FINE_ADJUSTMENT,
  HEADER_HEIGHT,
  LINE_OFFSET,
  MATCH_TYPE_LABELS,
  MIN_SEPARATION,
  PADDING_BOTTOM,
  PLACEMENT_MATCH_PATTERN,
  QUARTER_FINAL_CODES,
  ROUND_ORDER,
  SEMI_FINAL_CODES,
  SEPARATION_RATIO,
  THIRD_PLACE_CODES,
  THIRD_PLACE_MATCH_TYPE,
} from "./constants";
// コンポーネント
export { MatchCard } from "./MatchCard";
export { MultiBlockBracket } from "./MultiBlockBracket";
export type { P6SeedLayout, PatternConfig, PatternType, RoundConfig, SeedSlot } from "./patterns";
// パターン定義
export {
  getP6PatternConfig,
  getPatternByMatchCount,
  getPatternByTeamCount,
  getPatternConfig,
  getRoundColor,
  P6_ADJACENT_CONFIG,
  PATTERNS,
} from "./patterns";
export { SeedCard } from "./SeedCard";
export { TournamentBlock } from "./TournamentBlock";
// 型定義
export type {
  BracketGroup,
  BracketMatch,
  BracketProps,
  BracketStructure,
  ScoreData,
  SportScoreConfig,
} from "./types";

// ユーティリティ
export { compareMatchCode, organizeBracket, organizeMatchesByMatchType } from "./utils";
