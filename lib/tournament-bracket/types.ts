/**
 * トーナメントブラケット用の型定義
 */

export interface BracketMatch {
  match_id: number;
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_tournament_team_id?: number | null;
  team2_tournament_team_id?: number | null;
  team1_display_name: string;
  team2_display_name: string;
  team1_goals: number;
  team2_goals: number;
  // 多競技対応の拡張フィールド
  team1_scores?: number[];
  team2_scores?: number[];
  active_periods?: number[];
  winner_team_id?: string;
  winner_tournament_team_id?: number | null;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: "scheduled" | "ongoing" | "completed" | "cancelled";
  is_confirmed: boolean;
  execution_priority: number;
  start_time?: string;
  court_number?: number;
  execution_group?: number;
  // ブロック情報（t_match_blocks からJOIN）
  match_type: string;
  block_name: string;
  display_round_name?: string;
  position_note?: string;
  // テンプレート情報（m_match_templates からJOIN）
  team1_source?: string;
  team2_source?: string;
  is_bye_match?: boolean;
  // サッカー専用データ（該当する場合のみ）
  soccer_data?: {
    regular_goals_for: number;
    regular_goals_against: number;
    pk_goals_for?: number;
    pk_goals_against?: number;
    is_pk_game: boolean;
    pk_winner?: boolean;
  };
}

export interface BracketProps {
  tournamentId: number;
  phase?: "preliminary" | "final";
}

export interface SportScoreConfig {
  sport_code: string;
  score_label: string;
  score_against_label: string;
  difference_label: string;
  supports_pk: boolean;
}

export interface BracketGroup {
  groupId: number;
  groupName: string;
  matches: BracketMatch[];
}

export interface BracketStructure {
  groups: BracketGroup[];
  columnCount: number;
}

export interface ScoreData {
  regular: number;
  pk?: number;
  isPkMatch: boolean;
}
