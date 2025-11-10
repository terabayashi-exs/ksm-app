// lib/tournament-rule-validator.ts

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

export interface PeriodValidation {
  hasFirstHalf: boolean;
  hasSecondHalf: boolean;
  hasExtraFirst: boolean;
  hasExtraSecond: boolean;
  hasPK: boolean;
  periodCount: number;
}

/**
 * active_periodsの設定値を解析
 */
export function analyzePeriods(activePeriods: string[]): PeriodValidation {
  return {
    hasFirstHalf: activePeriods.includes('1'),
    hasSecondHalf: activePeriods.includes('2'),
    hasExtraFirst: activePeriods.includes('3'),
    hasExtraSecond: activePeriods.includes('4'),
    hasPK: activePeriods.includes('5'),
    periodCount: activePeriods.filter(p => p !== '5').length, // PK戦以外の数
  };
}

/**
 * サッカー競技のルール設定バリデーション
 */
export function validateSoccerPeriodSettings(activePeriods: string[]): ValidationResult {
  if (!Array.isArray(activePeriods) || activePeriods.length === 0) {
    return { 
      valid: false, 
      error: 'ピリオド設定が選択されていません。' 
    };
  }

  const periods = analyzePeriods(activePeriods);

  // 1. 基本ルール: 前半・後半は必須
  if (!periods.hasFirstHalf) {
    return { 
      valid: false, 
      error: '前半は必須です。サッカー競技では前半なしの試合はできません。' 
    };
  }

  if (!periods.hasSecondHalf) {
    return { 
      valid: false, 
      error: '後半は必須です。サッカー競技では後半なしの試合はできません。' 
    };
  }

  // 2. 延長戦ルール: 延長前半・延長後半は両方必要
  const hasAnyExtra = periods.hasExtraFirst || periods.hasExtraSecond;
  const hasBothExtra = periods.hasExtraFirst && periods.hasExtraSecond;

  if (hasAnyExtra && !hasBothExtra) {
    const missingHalf = !periods.hasExtraFirst ? '延長前半' : '延長後半';
    return { 
      valid: false, 
      error: `延長戦を使用する場合、延長前半・延長後半の両方が必要です。${missingHalf}が選択されていません。` 
    };
  }

  // 3. PK戦ルール: 通常時間（前半・後半）が前提
  if (periods.hasPK && (!periods.hasFirstHalf || !periods.hasSecondHalf)) {
    return { 
      valid: false, 
      error: 'PK戦を使用する場合、最低限前半・後半の設定が必要です。' 
    };
  }

  // 4. 論理的整合性チェック
  const validCombinations = [
    [1, 2],           // 前半・後半のみ
    [1, 2, 5],        // 前半・後半・PK戦
    [1, 2, 3, 4],     // 前半・後半・延長前半・延長後半
    [1, 2, 3, 4, 5]   // 前半・後半・延長前半・延長後半・PK戦
  ];

  const currentNumbers = activePeriods.map(p => parseInt(p)).sort((a, b) => a - b);
  const isValidCombination = validCombinations.some(combination => 
    combination.length === currentNumbers.length && 
    combination.every((num, index) => num === currentNumbers[index])
  );

  if (!isValidCombination) {
    return { 
      valid: false, 
      error: `選択されたピリオドの組み合わせが無効です。有効な組み合わせ: 「前半・後半」「前半・後半・PK戦」「前半・後半・延長前半・延長後半」「前半・後半・延長前半・延長後半・PK戦」` 
    };
  }

  // 5. 警告: PK戦のみで延長戦なし
  if (periods.hasPK && !periods.hasExtraFirst) {
    return {
      valid: true,
      warning: 'PK戦が設定されていますが延長戦がありません。同点の場合、通常時間終了後すぐにPK戦になります。'
    };
  }

  // 全てのチェックを通過
  return { valid: true };
}

/**
 * 現在の設定から推奨される表示用ラベルを生成
 */
export function generatePeriodDisplayLabel(activePeriods: string[]): string {
  const periods = analyzePeriods(activePeriods);
  
  if (periods.hasFirstHalf && periods.hasSecondHalf && periods.hasExtraFirst && periods.hasExtraSecond && periods.hasPK) {
    return '前半・後半・延長戦・PK戦';
  } else if (periods.hasFirstHalf && periods.hasSecondHalf && periods.hasExtraFirst && periods.hasExtraSecond) {
    return '前半・後半・延長戦';
  } else if (periods.hasFirstHalf && periods.hasSecondHalf && periods.hasPK) {
    return '前半・後半・PK戦';
  } else if (periods.hasFirstHalf && periods.hasSecondHalf) {
    return '前半・後半のみ';
  }
  
  return 'カスタム設定';
}

/**
 * 設定から期待されるスコア配列長を計算
 */
export function getExpectedScoreArrayLength(activePeriods: string[]): number {
  const periods = analyzePeriods(activePeriods);
  
  if (periods.hasExtraFirst && periods.hasExtraSecond && periods.hasPK) {
    return 5; // [前半, 後半, 延長前半, 延長後半, PK戦]
  } else if (periods.hasExtraFirst && periods.hasExtraSecond) {
    return 4; // [前半, 後半, 延長前半, 延長後半]
  } else if (periods.hasPK) {
    return 3; // [前半, 後半, PK戦]
  }
  
  return 2; // [前半, 後半]
}

/**
 * デバッグ用：バリデーション詳細の出力
 */
export function debugPeriodValidation(activePeriods: string[]): void {
  console.log('🔍 ピリオド設定バリデーション詳細:');
  console.log('  - 入力:', activePeriods);
  
  const periods = analyzePeriods(activePeriods);
  console.log('  - 解析結果:', periods);
  
  const validation = validateSoccerPeriodSettings(activePeriods);
  console.log('  - バリデーション:', validation);
  
  const expectedLength = getExpectedScoreArrayLength(activePeriods);
  console.log('  - 期待されるスコア配列長:', expectedLength);
  
  const displayLabel = generatePeriodDisplayLabel(activePeriods);
  console.log('  - 表示ラベル:', displayLabel);
}