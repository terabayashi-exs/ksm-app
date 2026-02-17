/**
 * 大会運営者の権限設定型定義
 * ダッシュボードのボタンと連動した権限管理
 */
export interface OperatorPermissions {
  canManageCourts: boolean;          // コート名設定
  canManageRules: boolean;           // ルール設定
  canRegisterTeams: boolean;         // チーム登録
  canCreateDraws: boolean;           // 組合せ作成・編集
  canChangeFormat: boolean;          // フォーマット変更
  canManageParticipants: boolean;    // 参加チーム管理
  canInputResults: boolean;          // 試合結果入力（結果の登録）
  canConfirmResults: boolean;        // 試合結果入力（結果の確定）
  canSetManualRankings: boolean;     // 手動順位設定
  canChangePromotionRules: boolean;  // 選出条件変更
  canManageFiles: boolean;           // ファイル管理
  canManageSponsors: boolean;        // スポンサー管理
}

/**
 * デフォルトの運営者権限（新規作成時）
 * 試合結果入力のみ有効
 */
export const DEFAULT_OPERATOR_PERMISSIONS: OperatorPermissions = {
  canManageCourts: false,
  canManageRules: false,
  canRegisterTeams: false,
  canCreateDraws: false,
  canChangeFormat: false,
  canManageParticipants: false,
  canInputResults: true,           // デフォルトで有効
  canConfirmResults: false,
  canSetManualRankings: false,
  canChangePromotionRules: false,
  canManageFiles: false,
  canManageSponsors: false,
};

/**
 * 運営者の基本情報型
 */
export interface Operator {
  operatorId: number;
  operatorLoginId: string;
  operatorName: string;
  administratorId: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 運営者の部門アクセス権限型
 */
export interface OperatorTournamentAccess {
  accessId: number;
  operatorId: number;
  tournamentId: number;
  permissions: OperatorPermissions;
  createdAt: string;
  updatedAt: string;
}

/**
 * 運営者登録フォーム用の部門アクセス設定
 */
export interface TournamentAccessConfig {
  tournamentId: number;
  tournamentName: string;
  categoryName: string;
  groupId: number;
  groupName: string;
  permissions: OperatorPermissions;
}

/**
 * 運営者登録フォーム用の型
 */
export interface OperatorFormData {
  operatorLoginId: string;
  password: string;
  operatorName: string;
  tournamentAccess: TournamentAccessConfig[]; // アクセス可能な部門と権限
}

/**
 * 運営者とアクセス可能な部門の結合型
 */
export interface OperatorWithAccess extends Operator {
  accessibleTournaments: {
    tournamentId: number;
    tournamentName: string;
    categoryName: string;
    groupId: number;
    groupName: string;
    permissions: OperatorPermissions;
  }[];
}
