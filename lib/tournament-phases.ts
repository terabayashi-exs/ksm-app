// lib/tournament-phases.ts
/**
 * トーナメントフェーズ管理のユーティリティ関数
 */

import type { TournamentPhases, PhaseFormatType } from './types/tournament-phases';

/**
 * レガシーの preliminary_format_type / final_format_type から
 * 新しいフェーズ構成（TournamentPhases）を生成する
 */
export function generatePhasesFromLegacy(
  preliminaryType: string | null,
  finalType: string | null
): TournamentPhases {
  const phases: TournamentPhases = { phases: [] };

  // 予選フェーズを追加
  if (preliminaryType && preliminaryType !== 'none') {
    phases.phases.push({
      id: 'preliminary',
      order: 1,
      name: '予選',
      format_type: preliminaryType as PhaseFormatType
    });
  }

  // 決勝フェーズを追加
  if (finalType && finalType !== 'none') {
    phases.phases.push({
      id: 'final',
      order: phases.phases.length + 1,
      name: '決勝トーナメント',
      format_type: finalType as PhaseFormatType
    });
  }

  return phases;
}

/**
 * フェーズ構成のバリデーション
 */
export function validatePhases(phases: TournamentPhases): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // フェーズが空でないことを確認
  if (!phases.phases || phases.phases.length === 0) {
    errors.push('少なくとも1つのフェーズが必要です');
    return { valid: false, errors };
  }

  // 各フェーズの必須フィールドチェック
  for (let i = 0; i < phases.phases.length; i++) {
    const phase = phases.phases[i];

    if (!phase.id || phase.id.trim() === '') {
      errors.push(`フェーズ${i + 1}: IDが必要です`);
    }

    if (!phase.name || phase.name.trim() === '') {
      errors.push(`フェーズ${i + 1}: 名前が必要です`);
    }

    if (!phase.format_type || (phase.format_type !== 'league' && phase.format_type !== 'tournament')) {
      errors.push(`フェーズ${i + 1}: format_typeは'league'または'tournament'である必要があります`);
    }

    if (typeof phase.order !== 'number' || phase.order < 1) {
      errors.push(`フェーズ${i + 1}: orderは1以上の数値である必要があります`);
    }
  }

  // ID重複チェック
  const ids = phases.phases.map(p => p.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push('フェーズIDが重複しています');
  }

  // order連続性チェック
  const orders = phases.phases.map(p => p.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      errors.push(`フェーズのorder値は1から連続している必要があります（現在: ${orders.join(', ')}）`);
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * フェーズIDから表示名を取得
 */
export function getPhaseDisplayName(phases: TournamentPhases, phaseId: string): string | null {
  const phase = phases.phases.find(p => p.id === phaseId);
  return phase ? phase.name : null;
}

/**
 * フェーズIDから形式タイプを取得
 */
export function getPhaseFormatType(phases: TournamentPhases, phaseId: string): PhaseFormatType | null {
  const phase = phases.phases.find(p => p.id === phaseId);
  return phase ? phase.format_type : null;
}

/**
 * phases JSON文字列またはオブジェクトをパースしてTournamentPhasesを取得
 */
export function parsePhasesJson(phases: string | object | null | undefined): TournamentPhases | null {
  if (!phases) return null;
  try {
    const data = typeof phases === 'string' ? JSON.parse(phases) : phases;
    if (data?.phases && Array.isArray(data.phases) && data.phases.length > 0) {
      return data as TournamentPhases;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * phases JSON文字列からフェーズID→format_typeのマップを構築する
 * DB取得値（string | object）を直接渡せる
 */
export function buildPhaseFormatMap(phases: string | object | null | undefined): Map<string, PhaseFormatType> {
  const map = new Map<string, PhaseFormatType>();
  const parsed = parsePhasesJson(phases);
  if (parsed) {
    for (const p of parsed.phases) {
      if (p.id && p.format_type) {
        map.set(p.id, p.format_type);
      }
    }
  }
  return map;
}

/**
 * phases JSON文字列からフェーズID→表示名のマップを構築する
 */
export function buildPhaseNameMap(phases: string | object | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  const parsed = parsePhasesJson(phases);
  if (parsed) {
    for (const p of parsed.phases) {
      if (p.id && p.name) {
        map.set(p.id, p.name);
      }
    }
  }
  return map;
}

/**
 * テンプレートのphase（旧形式: preliminary/final）をphasesのidにマッピングする
 * テンプレートのphaseがphasesのidに直接一致する場合はそのまま、
 * 一致しない場合はorder順で対応付ける
 */
export function buildTemplatePhaseMapping(
  templatePhases: string[],
  phases: string | object | null | undefined
): Map<string, string> {
  const mapping = new Map<string, string>();
  const parsed = parsePhasesJson(phases);
  if (!parsed) return mapping;

  const sortedPhases = [...parsed.phases].sort((a, b) => a.order - b.order);
  const phaseIds = new Set(sortedPhases.map(p => p.id));
  const uniqueTemplatePhases = [...new Set(templatePhases)];

  // まず直接一致するものをマッピング
  const unmapped: string[] = [];
  for (const tp of uniqueTemplatePhases) {
    if (phaseIds.has(tp)) {
      mapping.set(tp, tp);
    } else {
      unmapped.push(tp);
    }
  }

  // 一致しないテンプレートphaseをorder順でマッピング
  if (unmapped.length > 0) {
    const phaseOrder: Record<string, number> = { preliminary: 1, final: 2 };
    unmapped.sort((a, b) => (phaseOrder[a] || 99) - (phaseOrder[b] || 99));

    const availablePhases = sortedPhases.filter(p =>
      !Array.from(mapping.values()).includes(p.id)
    );

    for (let i = 0; i < unmapped.length && i < availablePhases.length; i++) {
      mapping.set(unmapped[i], availablePhases[i].id);
    }
  }

  return mapping;
}

/**
 * 標準的な2フェーズ構成を生成（予選→決勝）
 */
export function generateStandardTwoPhaseConfiguration(): TournamentPhases {
  return {
    phases: [
      { id: 'preliminary', order: 1, name: '予選', format_type: 'league' },
      { id: 'final', order: 2, name: '決勝トーナメント', format_type: 'tournament' }
    ]
  };
}
