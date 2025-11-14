// lib/types.ts
/**
 * 用語マッピング:
 * - 大会 (Tournament Event) = t_tournament_groups テーブル
 * - 部門/コース (Division/Category) = t_tournaments テーブル
 *
 * 従来の「大会グループ」を「大会」、「大会」を「部門」として扱います
 */

/**
 * 部門（旧：大会）
 * 大会の中の1つのカテゴリーを表す
 * データベース: t_tournaments
 */
export interface Tournament {
  tournament_id: number;
  tournament_name: string;
  format_id: number;
  venue_id: number;
  team_count: number;
  court_count: number;
  tournament_dates?: string; // JSON形式: {"1": "2024-02-01", "2": "2024-02-03"}
  match_duration_minutes: number;
  break_duration_minutes: number;
  status: 'planning' | 'ongoing' | 'completed';
  visibility: number; // 公開フラグ (0: 非公開, 1: 公開)
  public_start_date?: string; // 公開開始日
  recruitment_start_date?: string; // 募集開始日
  recruitment_end_date?: string; // 募集終了日
  sport_type_id?: number; // 競技種別ID
  created_by?: string; // 作成者ID
  created_at: string;
  updated_at: string;
  // Optional joined fields
  venue_name?: string;
  format_name?: string;
  preliminary_format_type?: string; // 予選の形式 ('league' | 'tournament')
  final_format_type?: string; // 決勝の形式 ('league' | 'tournament')
  // 後方互換性のため (ダッシュボードで使用)
  is_public?: boolean;
  event_start_date?: string;
  event_end_date?: string;
  start_time?: string;
  end_time?: string;
  // 参加状況
  is_joined?: boolean;
  // アーカイブ関連
  is_archived?: boolean;
  archive_ui_version?: string;
  // 管理者ロゴ情報
  logo_blob_url?: string | null;
  organization_name?: string | null;
  // グループ関連
  group_id?: number | null;
  group_order?: number;
  category_name?: string | null;
  group_name?: string | null;
  group_description?: string | null;
  group_color?: string | null;
}

/**
 * 大会（旧：大会グループ）
 * 複数の部門を持つ大会全体を表す
 * データベース: t_tournament_groups
 */
export interface TournamentGroup {
  group_id: number;
  group_name: string;
  organizer?: string;
  venue_id?: number;
  event_start_date?: string;
  event_end_date?: string;
  recruitment_start_date?: string;
  recruitment_end_date?: string;
  visibility?: string;
  event_description?: string;
  created_at: string;
  updated_at: string;
  // Optional joined fields
  venue_name?: string;
  division_count?: number; // 所属部門数
  ongoing_count?: number;
  completed_count?: number;
}

/**
 * 型エイリアス（新しい用語での参照用）
 */
export type TournamentEvent = TournamentGroup;  // 大会
export type Division = Tournament;               // 部門

// 大会開催日程の型
export interface TournamentDate {
  dayNumber: number; // m_match_templatesのday_numberに対応
  date: string; // YYYY-MM-DD形式
}

export interface Team {
  team_id: string;
  team_name: string;
  team_omission?: string;
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  is_active: boolean;
}

export interface Player {
  player_id: number;
  player_name: string;
  jersey_number?: number;
  current_team_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 辞退ステータスの型定義
export type WithdrawalStatus = 
  | 'active'                    // 参加中（通常状態）
  | 'withdrawal_requested'      // 辞退申請中
  | 'withdrawal_approved'       // 辞退承認済み
  | 'withdrawal_rejected';      // 辞退却下

export interface TournamentTeam {
  tournament_team_id: number;
  tournament_id: number;
  team_id: string; // マスターチームID
  team_name: string; // 大会エントリー時のチーム名
  team_omission: string; // 大会エントリー時のチーム略称
  assigned_block?: string;
  block_position?: number;
  created_at: string;
  updated_at: string;
  // 辞退関連フィールド
  withdrawal_status: WithdrawalStatus; // 辞退ステータス
  withdrawal_reason?: string; // 辞退理由
  withdrawal_requested_at?: string; // 辞退申請日時
  withdrawal_processed_at?: string; // 辞退処理完了日時
  withdrawal_processed_by?: string; // 辞退処理者（管理者ID）
  // Optional joined fields
  master_team_name?: string; // マスターチームの元々の名前
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  player_count?: number; // 登録選手数
}

// 辞退申請フォームのデータ型
export interface WithdrawalRequest {
  tournament_team_id: number;
  withdrawal_reason: string;
}

// 辞退申請の詳細情報型（管理者用）
export interface WithdrawalDetail extends TournamentTeam {
  tournament_name: string;
  master_team_name: string;
  contact_person: string;
  contact_email: string;
  format_name?: string;
  venue_name?: string;
  recruitment_end_date?: string;
}

export interface TournamentPlayer {
  tournament_player_id: number;
  tournament_id: number;
  team_id: string;
  player_id: number;
  jersey_number?: number;
  player_status: 'active' | 'inactive' | 'withdrawn';
  registration_date: string;
  withdrawal_date?: string;
  remarks?: string;
  created_at: string;
  updated_at: string;
  // Optional joined fields
  player_name?: string;
}

export interface Match {
  match_id: number;
  match_block_id: number;
  tournament_date: string;
  match_number: number;
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_display_name: string;
  team2_display_name: string;
  court_number?: number;
  start_time?: string;
  team1_goals: number;
  team2_goals: number;
  winner_team_id?: string;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  result_status: 'none' | 'pending' | 'confirmed';
  remarks?: string;
}

export interface Venue {
  venue_id: number;
  venue_name: string;
  address?: string;
  contact_phone?: string;
  court_count: number;
  is_active: boolean;
}

export interface TournamentFormat {
  format_id: number;
  format_name: string;
  target_team_count: number;
  format_description?: string;
  created_at: string;
  updated_at: string;
}

export interface MatchTemplate {
  template_id: number;
  format_id: number;
  match_number: number;
  match_code: string;
  match_type: string;
  phase: string;
  round_name?: string;
  block_name?: string;
  team1_source?: string;
  team2_source?: string;
  team1_display_name: string;
  team2_display_name: string;
  day_number: number;
  execution_priority: number;
  court_number?: number;
  suggested_start_time?: string;
  period_count?: number;
  created_at: string;
}

export interface MatchBlock {
  match_block_id: number;
  tournament_id: number;
  block_name: string;
  block_type: 'preliminary' | 'final';
  display_order: number;
  is_active: boolean;
}

export interface Administrator {
  admin_id: number;
  admin_name: string;
  email: string;
  password_hash: string;
  role: 'super_admin' | 'tournament_admin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}