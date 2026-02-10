// components/features/tournament-format/phase-utils.ts
/**
 * フェーズ設定UIのためのユーティリティ関数
 */

import type { TournamentPhases, TournamentPhase } from "@/lib/types/tournament-phases";
import { validatePhases } from "@/lib/tournament-phases";

/**
 * フェーズ設定の拡張バリデーション（UI専用）
 */
export function validatePhaseConfiguration(phases: TournamentPhases): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 基本バリデーション
  const baseValidation = validatePhases(phases);
  if (!baseValidation.valid) {
    errors.push(...baseValidation.errors);
  }

  // ID重複チェック
  const ids = phases.phases.map(p => p.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push('フェーズIDが重複しています');
  }

  // ID命名規則チェック（英小文字、数字、アンダースコアのみ）
  const invalidIds = phases.phases.filter(p => !/^[a-z0-9_]+$/.test(p.id));
  if (invalidIds.length > 0) {
    errors.push(`不正なフェーズID: ${invalidIds.map(p => p.id).join(', ')} (英小文字、数字、アンダースコアのみ使用可能)`);
  }

  // order連続性チェック
  const orders = phases.phases.map(p => p.order).sort((a, b) => a - b);
  const expectedOrders = Array.from({ length: orders.length }, (_, i) => i + 1);
  if (JSON.stringify(orders) !== JSON.stringify(expectedOrders)) {
    errors.push('フェーズ順序が1から連続していません');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 標準的な2フェーズ構成かどうかを判定
 */
export function isStandardTwoPhaseConfiguration(phases: TournamentPhases): boolean {
  if (phases.phases.length === 0) return true; // 空の場合もシンプルモードでOK
  if (phases.phases.length > 2) return false; // 3フェーズ以上は詳細モード必須

  const ids = phases.phases.map(p => p.id);
  const hasStandardIds = ids.every(id => id === 'preliminary' || id === 'final');

  return hasStandardIds;
}

/**
 * プリセットフェーズ設定
 */
export const PHASE_PRESETS: Record<string, { name: string; phases: TournamentPhases }> = {
  "2phase_standard": {
    name: "標準2フェーズ（予選→決勝）",
    phases: {
      phases: [
        { id: "preliminary", order: 1, name: "予選", format_type: "league" },
        { id: "final", order: 2, name: "決勝トーナメント", format_type: "tournament" }
      ]
    }
  },
  "3phase_complex": {
    name: "3フェーズ（1次予選→2次予選→決勝）",
    phases: {
      phases: [
        { id: "preliminary_1", order: 1, name: "1次予選", format_type: "league" },
        { id: "preliminary_2", order: 2, name: "2次予選", format_type: "league" },
        { id: "final", order: 3, name: "決勝トーナメント", format_type: "tournament" }
      ]
    }
  },
  "4phase_advanced": {
    name: "4フェーズ（1次→2次→3次予選→決勝）",
    phases: {
      phases: [
        { id: "preliminary_1", order: 1, name: "1次予選", format_type: "league" },
        { id: "preliminary_2", order: 2, name: "2次予選", format_type: "league" },
        { id: "preliminary_3", order: 3, name: "3次予選", format_type: "league" },
        { id: "final", order: 4, name: "決勝トーナメント", format_type: "tournament" }
      ]
    }
  },
  "single_phase_final": {
    name: "単一フェーズ（決勝のみ）",
    phases: {
      phases: [
        { id: "final", order: 1, name: "決勝トーナメント", format_type: "tournament" }
      ]
    }
  },
  "single_phase_preliminary": {
    name: "単一フェーズ（予選のみ）",
    phases: {
      phases: [
        { id: "preliminary", order: 1, name: "予選", format_type: "league" }
      ]
    }
  }
};

/**
 * フェーズの順序を振り直す
 */
export function reorderPhases(phases: TournamentPhase[]): TournamentPhase[] {
  return phases.map((phase, index) => ({
    ...phase,
    order: index + 1
  }));
}
