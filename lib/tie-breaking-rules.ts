// lib/tie-breaking-rules.ts
// 競技種別ごとの順位決定ルールタイプ定義とロジック

/**
 * 順位決定ルールの定義
 */
export interface TieBreakingRule {
  type: string;
  order: number;
}

/**
 * 順位決定ルールタイプの詳細情報
 */
export interface TieBreakingRuleType {
  type: string;
  label: string;
  description: string;
  calculation_note?: string; // 計算方法の説明
}

/**
 * 競技種別ごとの利用可能な順位決定ルールタイプ
 */
export const SPORT_TIE_BREAKING_RULES: Record<string, TieBreakingRuleType[]> = {
  // PK選手権
  'pk_championship': [
    { 
      type: 'points', 
      label: '勝点', 
      description: '勝利3点、引分1点、敗北0点',
      calculation_note: '勝利数×3 + 引分数×1' 
    },
    { 
      type: 'goal_difference', 
      label: '得失点差', 
      description: '総得点 - 総失点',
      calculation_note: '得点合計 - 失点合計' 
    },
    { 
      type: 'goals_for', 
      label: '総得点', 
      description: '獲得した総得点数',
      calculation_note: '全試合の得点の合計' 
    },
    { 
      type: 'head_to_head', 
      label: '直接対決の結果', 
      description: '該当チーム間の対戦成績',
      calculation_note: '同順位チーム間の勝点→得失点差→総得点で判定' 
    },
    { 
      type: 'lottery', 
      label: '抽選', 
      description: '運営による抽選で決定',
      calculation_note: '手動で順位を設定する必要があります' 
    }
  ],

  // サッカー
  'soccer': [
    { 
      type: 'points', 
      label: '勝点', 
      description: '勝利3点、引分1点、敗北0点',
      calculation_note: '勝利数×3 + 引分数×1' 
    },
    { 
      type: 'goal_difference', 
      label: '得失点差', 
      description: '総得点 - 総失点',
      calculation_note: '得点合計 - 失点合計' 
    },
    { 
      type: 'goals_for', 
      label: '総得点', 
      description: '獲得した総得点数',
      calculation_note: '全試合の得点の合計' 
    },
    { 
      type: 'head_to_head', 
      label: '直接対決の結果', 
      description: '該当チーム間の対戦成績',
      calculation_note: '同順位チーム間の勝点→得失点差→総得点で判定' 
    },
    { 
      type: 'lottery', 
      label: '抽選', 
      description: '運営による抽選で決定',
      calculation_note: '手動で順位を設定する必要があります' 
    }
  ],

  // 野球
  'baseball': [
    { 
      type: 'win_rate', 
      label: '勝率', 
      description: '勝利数 ÷ (勝利数 + 敗北数)',
      calculation_note: '勝利数 ÷ (勝利数 + 敗北数)' 
    },
    { 
      type: 'win_count', 
      label: '勝利数', 
      description: '勝利した試合数',
      calculation_note: '勝利した試合の合計数' 
    },
    { 
      type: 'run_difference', 
      label: '得失点差', 
      description: '総得点 - 総失点',
      calculation_note: '得点合計 - 失点合計' 
    },
    { 
      type: 'runs_scored', 
      label: '総得点', 
      description: '獲得した総得点数',
      calculation_note: '全試合の得点の合計' 
    },
    { 
      type: 'head_to_head', 
      label: '直接対決の結果', 
      description: '該当チーム間の対戦成績',
      calculation_note: '同順位チーム間の勝率→得失点差→総得点で判定' 
    },
    { 
      type: 'lottery', 
      label: '抽選', 
      description: '運営による抽選で決定',
      calculation_note: '手動で順位を設定する必要があります' 
    }
  ],

  // 陸上競技（短距離）
  'track_and_field': [
    { 
      type: 'best_time', 
      label: 'ベストタイム', 
      description: '最速記録での順位決定',
      calculation_note: '全種目を通じた最速記録（秒単位、少ない方が上位）' 
    },
    { 
      type: 'points', 
      label: '総合得点', 
      description: '各種目の得点合計',
      calculation_note: '全種目の得点を合計（多い方が上位）' 
    },
    { 
      type: 'win_count', 
      label: '優勝種目数', 
      description: '1位獲得種目数',
      calculation_note: '1位を獲得した種目の数（多い方が上位）' 
    },
    { 
      type: 'podium_count', 
      label: '表彰台回数', 
      description: '3位以内の回数',
      calculation_note: '3位以内に入った種目の数（多い方が上位）' 
    },
    { 
      type: 'lottery', 
      label: '抽選', 
      description: '運営による抽選で決定',
      calculation_note: '手動で順位を設定する必要があります' 
    }
  ],

  // バスケットボール
  'basketball': [
    { 
      type: 'win_rate', 
      label: '勝率', 
      description: '勝利数 ÷ 試合数',
      calculation_note: '勝利数 ÷ 試合数' 
    },
    { 
      type: 'point_difference', 
      label: '得失点差', 
      description: '総得点 - 総失点',
      calculation_note: '得点合計 - 失点合計' 
    },
    { 
      type: 'points_scored', 
      label: '総得点', 
      description: '獲得した総得点数',
      calculation_note: '全試合の得点の合計' 
    },
    { 
      type: 'head_to_head', 
      label: '直接対決の結果', 
      description: '該当チーム間の対戦成績',
      calculation_note: '同順位チーム間の勝率→得失点差→総得点で判定' 
    },
    { 
      type: 'lottery', 
      label: '抽選', 
      description: '運営による抽選で決定',
      calculation_note: '手動で順位を設定する必要があります' 
    }
  ]
};

/**
 * デフォルトの順位決定ルール設定（競技種別ごと）
 */
export const DEFAULT_TIE_BREAKING_RULES: Record<string, TieBreakingRule[]> = {
  'pk_championship': [
    { type: 'points', order: 1 },
    { type: 'goal_difference', order: 2 },
    { type: 'goals_for', order: 3 },
    { type: 'head_to_head', order: 4 },
    { type: 'lottery', order: 5 }
  ],
  'soccer': [
    { type: 'points', order: 1 },
    { type: 'goal_difference', order: 2 },
    { type: 'goals_for', order: 3 },
    { type: 'head_to_head', order: 4 },
    { type: 'lottery', order: 5 }
  ],
  'baseball': [
    { type: 'win_rate', order: 1 },
    { type: 'run_difference', order: 2 },
    { type: 'runs_scored', order: 3 },
    { type: 'head_to_head', order: 4 },
    { type: 'lottery', order: 5 }
  ],
  'track_and_field': [
    { type: 'best_time', order: 1 },
    { type: 'points', order: 2 },
    { type: 'win_count', order: 3 },
    { type: 'podium_count', order: 4 },
    { type: 'lottery', order: 5 }
  ],
  'basketball': [
    { type: 'win_rate', order: 1 },
    { type: 'point_difference', order: 2 },
    { type: 'points_scored', order: 3 },
    { type: 'head_to_head', order: 4 },
    { type: 'lottery', order: 5 }
  ]
};

/**
 * 競技種別から利用可能な順位決定ルールタイプを取得
 */
export function getAvailableTieBreakingRules(sportCode: string): TieBreakingRuleType[] {
  return SPORT_TIE_BREAKING_RULES[sportCode] || SPORT_TIE_BREAKING_RULES['pk_championship'];
}

/**
 * 競技種別からデフォルト順位決定ルールを取得
 */
export function getDefaultTieBreakingRules(sportCode: string): TieBreakingRule[] {
  return DEFAULT_TIE_BREAKING_RULES[sportCode] || DEFAULT_TIE_BREAKING_RULES['pk_championship'];
}

/**
 * 順位決定ルールの妥当性をチェック
 */
export function validateTieBreakingRules(rules: TieBreakingRule[], sportCode: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const availableTypes = getAvailableTieBreakingRules(sportCode).map(rule => rule.type);

  // 基本的なバリデーション
  if (!Array.isArray(rules) || rules.length === 0) {
    errors.push('順位決定ルールが設定されていません');
    return { isValid: false, errors };
  }

  if (rules.length > 5) {
    errors.push('順位決定ルールは最大5つまでです');
  }

  // ルールの重複チェック
  const types = rules.map(rule => rule.type);
  const uniqueTypes = new Set(types);
  if (types.length !== uniqueTypes.size) {
    errors.push('同じルールタイプを複数設定することはできません');
  }

  // 利用可能なルールタイプかチェック
  for (const rule of rules) {
    if (!availableTypes.includes(rule.type)) {
      errors.push(`'${rule.type}' は ${sportCode} で利用できないルールタイプです`);
    }
  }

  // order の連続性チェック
  const orders = rules.map(rule => rule.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      errors.push('順位決定ルールの順序は1から連続である必要があります');
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 順位決定ルールのJSONをパース
 */
export function parseTieBreakingRules(rulesJson: string | null): TieBreakingRule[] {
  if (!rulesJson) return [];
  
  try {
    const parsed = JSON.parse(rulesJson);
    if (!Array.isArray(parsed)) return [];
    
    return parsed.map(rule => ({
      type: String(rule.type),
      order: Number(rule.order)
    })).sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

/**
 * 順位決定ルールをJSONに変換
 */
export function stringifyTieBreakingRules(rules: TieBreakingRule[]): string {
  return JSON.stringify(rules.sort((a, b) => a.order - b.order));
}

/**
 * 抽選が必要かどうかの判定
 */
export function requiresLottery(rules: TieBreakingRule[]): boolean {
  const lastRule = rules.sort((a, b) => b.order - a.order)[0];
  return lastRule?.type === 'lottery';
}

/**
 * ルールタイプの表示名を取得
 */
export function getTieBreakingRuleLabel(ruleType: string, sportCode: string): string {
  const availableRules = getAvailableTieBreakingRules(sportCode);
  const rule = availableRules.find(r => r.type === ruleType);
  return rule?.label || ruleType;
}

/**
 * ルールタイプの説明を取得
 */
export function getTieBreakingRuleDescription(ruleType: string, sportCode: string): string {
  const availableRules = getAvailableTieBreakingRules(sportCode);
  const rule = availableRules.find(r => r.type === ruleType);
  return rule?.description || '';
}