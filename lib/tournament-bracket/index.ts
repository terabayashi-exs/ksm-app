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

// パターン定義
export {
  PATTERNS,
  getPatternByMatchCount,
  getPatternByTeamCount,
  getPatternConfig,
  getRoundColor,
} from "./patterns";
export type { PatternType, PatternConfig, RoundConfig, SeedSlot } from "./patterns";

// ユーティリティ
export { organizeBracket } from "./utils";
