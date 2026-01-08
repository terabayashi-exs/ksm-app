// lib/bye-match-utils.ts
// 不戦勝試合判定のユーティリティ関数

/**
 * チーム名のバリデーション結果
 */
export interface MatchTeamsValidation {
  valid: boolean;
  error?: string;
  isByeMatch: boolean;
}

/**
 * 試合のチーム名をバリデーションし、不戦勝試合かどうかを判定する
 */
export function validateMatchTeams(
  team1: string | null | undefined,
  team2: string | null | undefined
): MatchTeamsValidation {
  // 両方がnullまたは空の場合はエラー
  if ((!team1 || team1.trim() === '') && (!team2 || team2.trim() === '')) {
    return {
      valid: false,
      error: 'チーム1またはチーム2の少なくとも一方を指定してください',
      isByeMatch: false
    };
  }

  // 片方が「不戦勝」の場合、もう片方は必須
  if (team1 === '不戦勝' && (!team2 || team2.trim() === '')) {
    return {
      valid: false,
      error: 'チーム1が「不戦勝」の場合、チーム2を指定してください',
      isByeMatch: false
    };
  }

  if (team2 === '不戦勝' && (!team1 || team1.trim() === '')) {
    return {
      valid: false,
      error: 'チーム2が「不戦勝」の場合、チーム1を指定してください',
      isByeMatch: false
    };
  }

  // 両方が「不戦勝」はエラー
  if (team1 === '不戦勝' && team2 === '不戦勝') {
    return {
      valid: false,
      error: '両方のチームを「不戦勝」にすることはできません',
      isByeMatch: false
    };
  }

  // 不戦勝試合かどうかを判定
  const isByeMatch = team1 === '不戦勝' || team2 === '不戦勝';

  return {
    valid: true,
    isByeMatch
  };
}

/**
 * boolean値を数値（0または1）に変換
 * データベース保存用
 */
export function isByeMatchToNumber(isByeMatch: boolean): number {
  return isByeMatch ? 1 : 0;
}

/**
 * 数値（0または1）をboolean値に変換
 * データベース読み込み用
 */
export function isByeMatchToBoolean(value: number | null | undefined): boolean {
  return value === 1;
}
