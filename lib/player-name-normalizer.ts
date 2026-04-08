// lib/player-name-normalizer.ts
// 選手名の正規化（重複チェック用）

/**
 * 半角カナ→全角カナ変換マッピング
 * 濁点・半濁点の結合文字も処理
 */
const HALF_TO_FULL_KANA: Record<string, string> = {
  ｦ: "ヲ",
  ｧ: "ァ",
  ｨ: "ィ",
  ｩ: "ゥ",
  ｪ: "ェ",
  ｫ: "ォ",
  ｬ: "ャ",
  ｭ: "ュ",
  ｮ: "ョ",
  ｯ: "ッ",
  ｰ: "ー",
  ｱ: "ア",
  ｲ: "イ",
  ｳ: "ウ",
  ｴ: "エ",
  ｵ: "オ",
  ｶ: "カ",
  ｷ: "キ",
  ｸ: "ク",
  ｹ: "ケ",
  ｺ: "コ",
  ｻ: "サ",
  ｼ: "シ",
  ｽ: "ス",
  ｾ: "セ",
  ｿ: "ソ",
  ﾀ: "タ",
  ﾁ: "チ",
  ﾂ: "ツ",
  ﾃ: "テ",
  ﾄ: "ト",
  ﾅ: "ナ",
  ﾆ: "ニ",
  ﾇ: "ヌ",
  ﾈ: "ネ",
  ﾉ: "ノ",
  ﾊ: "ハ",
  ﾋ: "ヒ",
  ﾌ: "フ",
  ﾍ: "ヘ",
  ﾎ: "ホ",
  ﾏ: "マ",
  ﾐ: "ミ",
  ﾑ: "ム",
  ﾒ: "メ",
  ﾓ: "モ",
  ﾔ: "ヤ",
  ﾕ: "ユ",
  ﾖ: "ヨ",
  ﾗ: "ラ",
  ﾘ: "リ",
  ﾙ: "ル",
  ﾚ: "レ",
  ﾛ: "ロ",
  ﾜ: "ワ",
  ﾝ: "ン",
  ﾞ: "゛",
  ﾟ: "゜",
  "｡": "。",
  "｢": "「",
  "｣": "」",
  "､": "、",
  "･": "・",
};

/** 濁点付き半角カナ→全角カナ */
const DAKUTEN_MAP: Record<string, string> = {
  ｶﾞ: "ガ",
  ｷﾞ: "ギ",
  ｸﾞ: "グ",
  ｹﾞ: "ゲ",
  ｺﾞ: "ゴ",
  ｻﾞ: "ザ",
  ｼﾞ: "ジ",
  ｽﾞ: "ズ",
  ｾﾞ: "ゼ",
  ｿﾞ: "ゾ",
  ﾀﾞ: "ダ",
  ﾁﾞ: "ヂ",
  ﾂﾞ: "ヅ",
  ﾃﾞ: "デ",
  ﾄﾞ: "ド",
  ﾊﾞ: "バ",
  ﾋﾞ: "ビ",
  ﾌﾞ: "ブ",
  ﾍﾞ: "ベ",
  ﾎﾞ: "ボ",
  ｳﾞ: "ヴ",
};

/** 半濁点付き半角カナ→全角カナ */
const HANDAKUTEN_MAP: Record<string, string> = {
  ﾊﾟ: "パ",
  ﾋﾟ: "ピ",
  ﾌﾟ: "プ",
  ﾍﾟ: "ペ",
  ﾎﾟ: "ポ",
};

function convertHalfToFullKana(str: string): string {
  // まず濁点・半濁点の結合（2文字→1文字）を処理
  let result = str;
  for (const [half, full] of Object.entries(HANDAKUTEN_MAP)) {
    result = result.replaceAll(half, full);
  }
  for (const [half, full] of Object.entries(DAKUTEN_MAP)) {
    result = result.replaceAll(half, full);
  }
  // 残りの単独半角カナを変換
  for (const [half, full] of Object.entries(HALF_TO_FULL_KANA)) {
    result = result.replaceAll(half, full);
  }
  return result;
}

/**
 * 選手名を正規化する
 * - 前後の空白をトリム
 * - 内部のスペース（全角・半角）を除去
 * - 半角カナ→全角カナ変換
 * - Unicode正規化（NFC）
 */
export function normalizePlayerName(name: string): string {
  let normalized = name.trim();
  // 全角・半角スペースを除去
  normalized = normalized.replace(/[\s\u3000]+/g, "");
  // 半角カナ→全角カナ
  normalized = convertHalfToFullKana(normalized);
  // Unicode NFC正規化
  normalized = normalized.normalize("NFC");
  return normalized;
}

/**
 * 2つの選手名が正規化後に同一かどうかを判定する
 */
export function isSamePlayerName(name1: string, name2: string): boolean {
  return normalizePlayerName(name1) === normalizePlayerName(name2);
}
