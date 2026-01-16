/**
 * トーナメントブラケット描画用の定数
 */

// カードサイズ
export const CARD_HEIGHT = 140;
export const CARD_GAP = 24;
export const COLUMN_GAP = 60;

// レイアウト
export const HEADER_HEIGHT = 44;
export const PADDING_BOTTOM = 40;
export const EXTRA_HEIGHT = 0;

// 位置調整
export const FINE_ADJUSTMENT = 20;
export const MIN_SEPARATION = 120;
export const SEPARATION_RATIO = 0.8;

// SVG線描画
export const AVOIDANCE_GAP = 20;
export const LINE_OFFSET = 30;

/**
 * ラウンド順序（match_type ベースのグループ化用）
 * DB の match_type は英語: preliminary, quarterfinal, semifinal, third_place, final
 *
 * TODO: t_match_blocks 作成時に m_match_templates から match_type を引き継ぐように修正後、
 *       utils.ts の organizeMatchesByMatchType でこの定数を使用する
 */
export const ROUND_ORDER: Record<string, number> = {
  'preliminary': 0,
  'first_round': 1,
  'quarterfinal': 2,
  'semifinal': 3,
  'final': 4,
  'third_place': 99,  // 別ブロック扱い
};

export const THIRD_PLACE_MATCH_TYPE = 'third_place';

// match_type を日本語ラベルに変換
export const MATCH_TYPE_LABELS: Record<string, string> = {
  'preliminary': '予選',
  'first_round': '1回戦',
  'quarterfinal': '準々決勝',
  'semifinal': '準決勝',
  'final': '決勝',
  'third_place': '3位決定戦',
};

// 試合コード（8チーム固定）
// @deprecated match_type ベースのロジックを使用してください
export const QUARTER_FINAL_CODES = ["M1", "M2", "M3", "M4", "T1", "T2", "T3", "T4"];
export const SEMI_FINAL_CODES = ["M5", "M6", "T5", "T6"];
export const THIRD_PLACE_CODES = ["M7", "T7"];
export const FINAL_CODES = ["M8", "T8"];
