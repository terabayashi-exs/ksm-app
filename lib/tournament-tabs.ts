/**
 * 大会詳細画面のタブ定義
 * Tournament detail page tab definitions
 */

import { TARGET_TABS, type TargetTab } from './sponsor-banner-specs';

/**
 * タブの定義
 */
export interface TournamentTab {
  /** タブID（URLパラメータやバナーのtarget_tabとして使用） */
  id: TargetTab;
  /** タブ表示名 */
  label: string;
  /** タブの説明 */
  description: string;
  /** タブのアイコン（オプション） */
  icon?: string;
}

/**
 * 大会詳細画面で使用する全タブの定義
 */
export const TOURNAMENT_TABS: readonly TournamentTab[] = [
  {
    id: TARGET_TABS.OVERVIEW,
    label: '概要',
    description: '大会の基本情報、日程、会場などの概要',
  },
  {
    id: TARGET_TABS.SCHEDULE,
    label: '日程・結果',
    description: '試合スケジュールと結果の一覧',
  },
  {
    id: TARGET_TABS.PRELIMINARY,
    label: '予選',
    description: '予選ブロックの試合結果と順位',
  },
  {
    id: TARGET_TABS.FINAL,
    label: '決勝',
    description: '決勝トーナメントのブラケットと結果',
  },
  {
    id: TARGET_TABS.STANDINGS,
    label: '順位表',
    description: '大会全体の最終順位',
  },
  {
    id: TARGET_TABS.TEAMS,
    label: '参加チーム',
    description: '大会に参加するチームと選手の一覧',
  },
] as const;

/**
 * タブIDからタブ定義を取得
 */
export function getTournamentTab(tabId: TargetTab): TournamentTab | undefined {
  // 'all'は特殊なタブIDなので、具体的なタブとしては存在しない
  if (tabId === TARGET_TABS.ALL) {
    return undefined;
  }

  return TOURNAMENT_TABS.find((tab) => tab.id === tabId);
}

/**
 * タブIDからタブラベルを取得
 */
export function getTournamentTabLabel(tabId: TargetTab): string {
  if (tabId === TARGET_TABS.ALL) {
    return '全タブ共通';
  }

  const tab = getTournamentTab(tabId);
  return tab?.label ?? tabId;
}

/**
 * 全タブのIDリストを取得
 */
export function getAllTabIds(): TargetTab[] {
  return TOURNAMENT_TABS.map((tab) => tab.id);
}

/**
 * タブIDが有効かチェック
 */
export function isValidTabId(tabId: string): tabId is TargetTab {
  return tabId === TARGET_TABS.ALL || TOURNAMENT_TABS.some((tab) => tab.id === tabId);
}
