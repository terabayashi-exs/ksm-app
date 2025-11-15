// lib/pk-detection-utils.ts

export interface PKDetectionResult {
  pkIndex: number;        // PK戦スコアの配列インデックス（-1の場合PK戦なし）
  regularCount: number;   // 通常時間ピリオド数（延長含む）
  totalRegularGoals: number; // 通常時間の合計得点
  pkGoals: number;        // PK戦得点
  hasPK: boolean;         // PK戦が実際に行われたか
  detectionMethod: string; // 検出方法（デバッグ用）
}

/**
 * スコア配列からPK戦情報を検出（堅牢化版）
 */
export function detectPKData(scores: number[], rulePeriods?: string[]): PKDetectionResult {
  const scoresArray = Array.isArray(scores) ? scores : [];
  
  // 空配列やnullの場合
  if (scoresArray.length === 0) {
    return {
      pkIndex: -1,
      regularCount: 0,
      totalRegularGoals: 0,
      pkGoals: 0,
      hasPK: false,
      detectionMethod: 'empty_array'
    };
  }

  // ルール設定がある場合の優先判定
  if (rulePeriods && Array.isArray(rulePeriods)) {
    const ruleResult = detectPKByRule(scoresArray, rulePeriods);
    if (ruleResult) {
      return ruleResult;
    }
  }

  // パターンベース検出（フォールバック）
  return detectPKByPattern(scoresArray);
}

/**
 * ルール設定に基づくPK戦検出
 */
function detectPKByRule(scores: number[], rulePeriods: string[]): PKDetectionResult | null {
  const hasFirstHalf = rulePeriods.includes('1');
  const hasSecondHalf = rulePeriods.includes('2');
  const hasExtraFirst = rulePeriods.includes('3');
  const hasExtraSecond = rulePeriods.includes('4');
  const hasPKRule = rulePeriods.includes('5');

  if (!hasFirstHalf || !hasSecondHalf) {
    console.warn('⚠️ 不正なルール設定: 前半・後半が必須です', rulePeriods);
    return null;
  }

  let expectedLength = 2; // 基本は前半・後半
  if (hasExtraFirst && hasExtraSecond) {
    expectedLength = 4; // 延長戦あり
  }
  if (hasPKRule) {
    expectedLength += 1; // PK戦追加
  }

  // スコア配列長がルール期待値と一致する場合
  if (scores.length === expectedLength) {
    const regularCount = hasPKRule ? expectedLength - 1 : expectedLength;
    const pkIndex = hasPKRule ? expectedLength - 1 : -1;
    const totalRegularGoals = scores.slice(0, regularCount).reduce((sum, score) => sum + score, 0);
    const pkGoals = hasPKRule && pkIndex >= 0 ? (scores[pkIndex] || 0) : 0;

    return {
      pkIndex,
      regularCount,
      totalRegularGoals,
      pkGoals,
      hasPK: pkGoals > 0,
      detectionMethod: `rule_based_${expectedLength}_elements`
    };
  }

  console.warn(`⚠️ スコア配列長とルール設定が不整合: expected=${expectedLength}, actual=${scores.length}`, {
    scores,
    rulePeriods,
    expectedLength
  });

  return null; // ルールベース検出失敗、パターンベースにフォールバック
}

/**
 * パターンベースPK戦検出（フォールバック）
 */
function detectPKByPattern(scores: number[]): PKDetectionResult {
  const length = scores.length;

  // パターン1: [前半, 後半] - PK戦なし
  if (length === 2) {
    return {
      pkIndex: -1,
      regularCount: 2,
      totalRegularGoals: scores[0] + scores[1],
      pkGoals: 0,
      hasPK: false,
      detectionMethod: 'pattern_2_no_pk'
    };
  }

  // パターン2: [前半, 後半, PK戦]
  if (length === 3) {
    const pkGoals = scores[2] || 0;
    return {
      pkIndex: 2,
      regularCount: 2,
      totalRegularGoals: scores[0] + scores[1],
      pkGoals,
      hasPK: pkGoals > 0,
      detectionMethod: 'pattern_3_regular_pk'
    };
  }

  // パターン3: [前半, 後半, 延長前半, 延長後半] - PK戦なし
  if (length === 4) {
    return {
      pkIndex: -1,
      regularCount: 4,
      totalRegularGoals: scores[0] + scores[1] + scores[2] + scores[3],
      pkGoals: 0,
      hasPK: false,
      detectionMethod: 'pattern_4_extra_no_pk'
    };
  }

  // パターン4: [前半, 後半, 延長前半, 延長後半, PK戦]
  if (length === 5) {
    const pkGoals = scores[4] || 0;
    return {
      pkIndex: 4,
      regularCount: 4,
      totalRegularGoals: scores[0] + scores[1] + scores[2] + scores[3],
      pkGoals,
      hasPK: pkGoals > 0,
      detectionMethod: 'pattern_5_extra_pk'
    };
  }

  // パターン5: 異常なケース - 最後をPKと仮定
  if (length > 5) {
    console.warn(`⚠️ 異常なスコア配列長: ${length}, 最後の要素をPK戦と仮定`, scores);
    const pkIndex = length - 1;
    const regularCount = length - 1;
    const totalRegularGoals = scores.slice(0, regularCount).reduce((sum, score) => sum + score, 0);
    const pkGoals = scores[pkIndex] || 0;

    return {
      pkIndex,
      regularCount,
      totalRegularGoals,
      pkGoals,
      hasPK: pkGoals > 0,
      detectionMethod: `pattern_${length}_abnormal_last_pk`
    };
  }

  // パターン6: 1要素のみ（異常）
  console.warn('⚠️ スコア配列が1要素のみです', scores);
  return {
    pkIndex: -1,
    regularCount: 1,
    totalRegularGoals: scores[0] || 0,
    pkGoals: 0,
    hasPK: false,
    detectionMethod: 'pattern_1_abnormal'
  };
}

/**
 * スコア文字列からPK戦情報を検出
 */
export function detectPKFromScoreString(scoreString: string, rulePeriods?: string[]): PKDetectionResult {
  if (!scoreString || typeof scoreString !== 'string') {
    return detectPKData([], rulePeriods);
  }

  try {
    const scores = scoreString.split(',').map(s => parseInt(s.trim()) || 0);
    return detectPKData(scores, rulePeriods);
  } catch (error) {
    console.error('❌ スコア文字列の解析エラー:', error, scoreString);
    return detectPKData([], rulePeriods);
  }
}

/**
 * 両チームのスコアからPK戦勝者を判定
 */
export function determinePKWinner(
  team1Scores: string | number[],
  team2Scores: string | number[],
  rulePeriods?: string[]
): {
  team1PK: PKDetectionResult;
  team2PK: PKDetectionResult;
  pkWinnerIsTeam1: boolean | null;
  isActualPKGame: boolean;
} {
  // スコア正規化
  const scores1 = Array.isArray(team1Scores) 
    ? team1Scores 
    : (typeof team1Scores === 'string' ? team1Scores.split(',').map(s => parseInt(s.trim()) || 0) : []);
  
  const scores2 = Array.isArray(team2Scores)
    ? team2Scores
    : (typeof team2Scores === 'string' ? team2Scores.split(',').map(s => parseInt(s.trim()) || 0) : []);

  const team1PK = detectPKData(scores1, rulePeriods);
  const team2PK = detectPKData(scores2, rulePeriods);

  // PK戦が実際に行われたか（両チームでPK得点がある）
  const isActualPKGame = team1PK.hasPK || team2PK.hasPK;

  // PK戦勝者判定
  let pkWinnerIsTeam1: boolean | null = null;
  if (isActualPKGame && team1PK.pkGoals !== team2PK.pkGoals) {
    pkWinnerIsTeam1 = team1PK.pkGoals > team2PK.pkGoals;
  }

  return {
    team1PK,
    team2PK,
    pkWinnerIsTeam1,
    isActualPKGame
  };
}

/**
 * デバッグ用：PK検出結果の詳細表示
 */
export function debugPKDetection(
  team1Scores: string | number[],
  team2Scores: string | number[],
  rulePeriods?: string[]
): void {
  console.log('🥅 PK戦検出デバッグ:');
  console.log('  - チーム1スコア:', team1Scores);
  console.log('  - チーム2スコア:', team2Scores);
  console.log('  - ルール設定:', rulePeriods);

  const result = determinePKWinner(team1Scores, team2Scores, rulePeriods);
  
  console.log('  - チーム1 PK検出:', result.team1PK);
  console.log('  - チーム2 PK検出:', result.team2PK);
  console.log('  - 実際のPK戦:', result.isActualPKGame);
  console.log('  - PK戦勝者（チーム1）:', result.pkWinnerIsTeam1);
}