// lib/types/tournament-phases.ts
/**
 * トーナメントフェーズの型定義
 */

/**
 * フェーズの形式タイプ
 */
export type PhaseFormatType = 'league' | 'tournament';

/**
 * 個別フェーズの定義
 */
export interface TournamentPhase {
  /** フェーズID（例: preliminary, final, preliminary_1） */
  id: string;
  /** 実行順序（1から始まる連番） */
  order: number;
  /** 表示名（例: 予選、決勝トーナメント） */
  name: string;
  /** フェーズの形式（league: リーグ戦、tournament: トーナメント戦） */
  format_type: PhaseFormatType;
  /** オプションの表示名（nameと異なる場合に使用） */
  display_name?: string;
  /** オプションの説明文 */
  description?: string;
}

/**
 * トーナメント全体のフェーズ構成
 */
export interface TournamentPhases {
  /** フェーズのリスト（order順にソート済み） */
  phases: TournamentPhase[];
}
