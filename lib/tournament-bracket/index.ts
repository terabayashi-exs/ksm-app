// 定数
export {
  CARD_HEIGHT,
  CARD_GAP,
  COLUMN_GAP,
  HEADER_HEIGHT,
  PADDING_BOTTOM,
  EXTRA_HEIGHT,
  FINE_ADJUSTMENT,
  MIN_SEPARATION,
  SEPARATION_RATIO,
  AVOIDANCE_GAP,
  LINE_OFFSET,
  ROUND_ORDER,
  THIRD_PLACE_MATCH_TYPE,
  MATCH_TYPE_LABELS,
  QUARTER_FINAL_CODES,
  SEMI_FINAL_CODES,
  THIRD_PLACE_CODES,
  FINAL_CODES,
} from "./constants";

// 型定義
export type {
  BracketMatch,
  BracketProps,
  SportScoreConfig,
  BracketGroup,
  BracketStructure,
  ScoreData,
} from "./types";

// コンポーネント
export { MatchCard } from "./MatchCard";
export { SeedCard } from "./SeedCard";
export { TournamentBlock } from "./TournamentBlock";
export { MultiBlockBracket } from "./MultiBlockBracket";
export {
  ConnectionLayer,
  getConnectionsForPattern,
} from "./BracketConnectors";
export type { ConnectionDef } from "./BracketConnectors";

// パターン定義
export {
  PATTERNS,
  P6_ADJACENT_CONFIG,
  getPatternByMatchCount,
  getPatternByTeamCount,
  getPatternConfig,
  getP6PatternConfig,
  getRoundColor,
} from "./patterns";
export type { PatternType, PatternConfig, RoundConfig, SeedSlot, P6SeedLayout } from "./patterns";

// ユーティリティ
export { organizeBracket, organizeMatchesByMatchType } from "./utils";
