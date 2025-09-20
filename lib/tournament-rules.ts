// lib/tournament-rules.ts
// 大会ルール設定の型定義とデフォルト設定

export interface TournamentRule {
  tournament_rule_id?: number;
  tournament_id: number;
  phase: 'preliminary' | 'final';
  use_extra_time: boolean;
  use_penalty: boolean;
  active_periods: string; // JSON文字列: ["1", "2", "3", "4", "5"] など
  win_condition: 'score' | 'time' | 'points';
  notes?: string;
  point_system?: string; // JSON文字列: {"win": 3, "draw": 1, "loss": 0}
  walkover_settings?: string; // JSON文字列: {"winner_goals": 3, "loser_goals": 0}
  created_at?: string;
  updated_at?: string;
}

export interface PeriodConfig {
  period_number: number;
  period_name: string;
  is_default: boolean; // デフォルトで有効かどうか
  is_required: boolean; // 必須ピリオドかどうか（前半・後半は必須）
}

export interface SportRuleConfig {
  sport_type_id: number;
  sport_name: string;
  sport_code: string;
  default_periods: PeriodConfig[];
  default_preliminary_rules: Omit<TournamentRule, 'tournament_id' | 'tournament_rule_id'>;
  default_final_rules: Omit<TournamentRule, 'tournament_id' | 'tournament_rule_id'>;
}

// 競技種別ごとのデフォルトルール設定
export const SPORT_RULE_CONFIGS: Record<string, SportRuleConfig> = {
  pk: {
    sport_type_id: 1,
    sport_name: 'PK戦',
    sport_code: 'pk',
    default_periods: [
      {
        period_number: 1,
        period_name: 'PK戦',
        is_default: true,
        is_required: true
      }
    ],
    default_preliminary_rules: {
      phase: 'preliminary',
      use_extra_time: false,
      use_penalty: false,
      active_periods: '["1"]',
      win_condition: 'score'
    },
    default_final_rules: {
      phase: 'final',
      use_extra_time: false,
      use_penalty: false,
      active_periods: '["1"]',
      win_condition: 'score'
    }
  },
  
  soccer: {
    sport_type_id: 2,
    sport_name: 'サッカー',
    sport_code: 'soccer',
    default_periods: [
      {
        period_number: 1,
        period_name: '前半',
        is_default: true,
        is_required: true
      },
      {
        period_number: 2,
        period_name: '後半',
        is_default: true,
        is_required: true
      },
      {
        period_number: 3,
        period_name: '延長前半',
        is_default: false,
        is_required: false
      },
      {
        period_number: 4,
        period_name: '延長後半',
        is_default: false,
        is_required: false
      },
      {
        period_number: 5,
        period_name: 'PK戦',
        is_default: false,
        is_required: false
      }
    ],
    default_preliminary_rules: {
      phase: 'preliminary',
      use_extra_time: false,
      use_penalty: false,
      active_periods: '["1", "2"]', // 前半・後半のみ
      win_condition: 'score'
    },
    default_final_rules: {
      phase: 'final',
      use_extra_time: true,
      use_penalty: true,
      active_periods: '["1", "2", "3", "4", "5"]', // 全ピリオド使用可能
      win_condition: 'score'
    }
  },
  
  baseball: {
    sport_type_id: 3,
    sport_name: '野球',
    sport_code: 'baseball',
    default_periods: [
      {
        period_number: 1,
        period_name: '9回制',
        is_default: true,
        is_required: true
      }
    ],
    default_preliminary_rules: {
      phase: 'preliminary',
      use_extra_time: false,
      use_penalty: false,
      active_periods: '["1"]',
      win_condition: 'score'
    },
    default_final_rules: {
      phase: 'final',
      use_extra_time: false,
      use_penalty: false,
      active_periods: '["1"]',
      win_condition: 'score'
    }
  },
  
  track: {
    sport_type_id: 4,
    sport_name: '陸上（短距離）',
    sport_code: 'track',
    default_periods: [
      {
        period_number: 1,
        period_name: '計測',
        is_default: true,
        is_required: true
      }
    ],
    default_preliminary_rules: {
      phase: 'preliminary',
      use_extra_time: false,
      use_penalty: false,
      active_periods: '["1"]',
      win_condition: 'time'
    },
    default_final_rules: {
      phase: 'final',
      use_extra_time: false,
      use_penalty: false,
      active_periods: '["1"]',
      win_condition: 'time'
    }
  }
};

// 競技種別コードからルール設定を取得
export function getSportRuleConfig(sportCode: string): SportRuleConfig | null {
  return SPORT_RULE_CONFIGS[sportCode] || null;
}

// 競技種別IDからルール設定を取得
export function getSportRuleConfigById(sportTypeId: number): SportRuleConfig | null {
  return Object.values(SPORT_RULE_CONFIGS).find(config => config.sport_type_id === sportTypeId) || null;
}

// デフォルトルールを生成
export function generateDefaultRules(tournamentId: number, sportTypeId: number): TournamentRule[] {
  const config = getSportRuleConfigById(sportTypeId);
  if (!config) {
    throw new Error(`競技種別ID ${sportTypeId} の設定が見つかりません`);
  }
  
  return [
    {
      tournament_id: tournamentId,
      ...config.default_preliminary_rules
    },
    {
      tournament_id: tournamentId,
      ...config.default_final_rules
    }
  ];
}

// ピリオド設定の解析
export function parseActivePeriods(activePeriodsJson: string): number[] {
  try {
    const periods = JSON.parse(activePeriodsJson);
    return Array.isArray(periods) ? periods.map(p => parseInt(p)) : [];
  } catch {
    return [1]; // デフォルトはピリオド1のみ
  }
}

// ピリオド設定のJSON化
export function stringifyActivePeriods(periods: number[]): string {
  return JSON.stringify(periods.map(p => p.toString()));
}

// 既存のPK戦大会との互換性確保
export function isLegacyTournament(tournamentId: number, sportTypeId: number): boolean {
  // PK戦（sport_type_id = 1）で、ルール設定がない場合は既存大会として扱う
  return sportTypeId === 1;
}

// 既存大会用のデフォルトルール（後方互換性）
export function getLegacyDefaultRules(tournamentId: number): TournamentRule[] {
  return [
    {
      tournament_id: tournamentId,
      phase: 'preliminary',
      use_extra_time: false,
      use_penalty: false,
      active_periods: '["1"]',
      win_condition: 'score'
    },
    {
      tournament_id: tournamentId,
      phase: 'final',
      use_extra_time: false,
      use_penalty: false,
      active_periods: '["1"]',
      win_condition: 'score'
    }
  ];
}

// 不戦勝設定の型定義
export interface WalkoverSettings {
  winner_goals: number;
  loser_goals: number;
}

// 不戦勝設定の解析
export function parseWalkoverSettings(walkoverSettingsJson?: string): WalkoverSettings {
  if (!walkoverSettingsJson) {
    return { winner_goals: 3, loser_goals: 0 }; // デフォルト値
  }
  
  try {
    const settings = JSON.parse(walkoverSettingsJson);
    return {
      winner_goals: Number(settings.winner_goals) || 3,
      loser_goals: Number(settings.loser_goals) || 0
    };
  } catch {
    return { winner_goals: 3, loser_goals: 0 }; // パースエラー時のデフォルト値
  }
}

// 不戦勝設定のJSON化
export function stringifyWalkoverSettings(settings: WalkoverSettings): string {
  return JSON.stringify({
    winner_goals: settings.winner_goals,
    loser_goals: settings.loser_goals
  });
}

// 大会の不戦勝設定を取得
export async function getTournamentWalkoverSettings(tournamentId: number): Promise<WalkoverSettings> {
  try {
    const { db } = await import('./db');
    
    const result = await db.execute(`
      SELECT walkover_settings 
      FROM t_tournament_rules 
      WHERE tournament_id = ? AND phase = 'preliminary'
      LIMIT 1
    `, [tournamentId]);
    
    if (result.rows.length > 0) {
      const walkoverSettingsJson = result.rows[0].walkover_settings as string;
      return parseWalkoverSettings(walkoverSettingsJson);
    }
    
    // ルール設定がない場合はデフォルト値を返す
    return { winner_goals: 3, loser_goals: 0 };
    
  } catch (error) {
    console.error('不戦勝設定の取得に失敗:', error);
    // エラー時もデフォルト値を返す
    return { winner_goals: 3, loser_goals: 0 };
  }
}