/**
 * スコアデータのパース・変換ユーティリティ
 *
 * 【対応形式】
 * - JSON配列形式: "[2,1]" → [2, 1]
 * - カンマ区切り形式（レガシー）: "2,1" → [2, 1]
 * - 数値のみ形式（レガシー）: "2" → [2]
 * - null/undefined → [0]
 *
 * 【使用例】
 * ```typescript
 * const scores = parseScoreArray(match.team1_scores); // [2, 1]
 * const total = parseTotalScore(match.team1_scores);  // 3
 * const formatted = formatScoreArray([2, 1]);         // "[2,1]"
 * ```
 */

/**
 * スコアデータを数値配列にパースする
 * あらゆる形式（JSON配列、カンマ区切り、数値のみ）に対応
 *
 * @param score - パース対象のスコアデータ
 * @returns 数値配列（パース失敗時は [0]）
 */
export function parseScoreArray(
  score: string | number | bigint | ArrayBuffer | null | undefined
): number[] {
  // null/undefinedの場合
  if (score === null || score === undefined) {
    return [0];
  }

  // 数値型の場合
  if (typeof score === 'number') {
    return isNaN(score) ? [0] : [score];
  }

  // bigint型の場合
  if (typeof score === 'bigint') {
    return [Number(score)];
  }

  // ArrayBufferの場合（Tursoから返される可能性）
  if (score instanceof ArrayBuffer) {
    const decoder = new TextDecoder();
    const stringValue = decoder.decode(score);
    return parseScoreArray(stringValue);
  }

  // 文字列型の場合
  if (typeof score === 'string') {
    const trimmed = score.trim();

    // 空文字列
    if (trimmed === '') {
      return [0];
    }

    // JSON配列形式: "[2,1]" または "[2, 1]"
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(n => {
            const num = Number(n);
            return isNaN(num) ? 0 : num;
          });
        }
      } catch (error) {
        console.warn('JSON parse failed for score:', trimmed, error);
        return [0];
      }
    }

    // カンマ区切り形式（レガシー）: "2,1"
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => {
        const num = parseInt(s.trim(), 10);
        return isNaN(num) ? 0 : num;
      });
    }

    // 数値のみ形式（レガシー）: "2"
    const singleNum = parseInt(trimmed, 10);
    return isNaN(singleNum) ? [0] : [singleNum];
  }

  // それ以外の型
  console.warn('Unexpected score type:', typeof score, score);
  return [0];
}

/**
 * スコア配列の合計値を計算する
 *
 * @param score - パース対象のスコアデータ
 * @returns 合計スコア
 */
export function parseTotalScore(
  score: string | number | bigint | ArrayBuffer | null | undefined
): number {
  const scores = parseScoreArray(score);
  return scores.reduce((sum, s) => sum + s, 0);
}

/**
 * スコア配列をJSON形式の文字列に変換する（保存用）
 *
 * @param scores - スコア配列
 * @returns JSON形式の文字列（例: "[2,1]"）
 */
export function formatScoreArray(scores: number[] | number | null | undefined): string {
  // null/undefinedの場合
  if (scores === null || scores === undefined) {
    return '[0]';
  }

  // 数値の場合
  if (typeof scores === 'number') {
    return JSON.stringify([scores]);
  }

  // 配列の場合
  if (Array.isArray(scores)) {
    // 空配列の場合
    if (scores.length === 0) {
      return '[0]';
    }

    // 数値に変換して整形
    const sanitized = scores.map(s => {
      const num = Number(s);
      return isNaN(num) ? 0 : Math.floor(num);
    });

    return JSON.stringify(sanitized);
  }

  // その他の型
  console.warn('Unexpected scores type:', typeof scores, scores);
  return '[0]';
}

/**
 * スコアデータが有効かチェックする
 *
 * @param score - チェック対象のスコアデータ
 * @returns 有効な場合true
 */
export function isValidScore(
  score: string | number | bigint | ArrayBuffer | null | undefined
): boolean {
  if (score === null || score === undefined) {
    return false;
  }

  try {
    const parsed = parseScoreArray(score);
    return parsed.length > 0 && parsed.some(s => s > 0);
  } catch {
    return false;
  }
}

/**
 * 複数のピリオドスコアを表示用にフォーマットする
 *
 * @param scores - スコア配列
 * @param separator - 区切り文字（デフォルト: "-"）
 * @returns フォーマット済み文字列（例: "2-1-0"）
 */
export function formatScoreDisplay(
  scores: number[] | string | null | undefined,
  separator: string = '-'
): string {
  const scoreArray = typeof scores === 'string'
    ? parseScoreArray(scores)
    : (scores || [0]);

  return scoreArray.join(separator);
}
