/**
 * 大会運営者の権限設定型定義
 * ダッシュボードのボタンと連動した権限管理
 */
export interface OperatorPermissions {
  canManageCourts: boolean;          // 日程・会場設定 / 会場・コート設定
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
  canPrintRefereeCards: boolean;     // 審判カード印刷
  canSendEmails: boolean;            // メール送信
  canManageDisplaySettings: boolean; // 表示設定（フェーズタブ表示/非表示、チーム表示名変更）
  canManageNotices: boolean;         // お知らせ管理
  canManageOperators: boolean;       // 運営者管理（運営者の追加）
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
  canPrintRefereeCards: false,
  canSendEmails: false,
  canManageDisplaySettings: false,
  canManageNotices: false,
  canManageOperators: false,
};

/**
 * 権限プリセットの種類
 */
export type PermissionPreset = 'preparation' | 'event_day' | 'management' | 'custom';

/**
 * 権限プリセット定義
 */
export const PERMISSION_PRESETS: Record<PermissionPreset, { label: string; description: string; permissions: OperatorPermissions }> = {
  preparation: {
    label: '事前準備',
    description: 'ルール設定、チーム登録、組合せ作成など大会開催前の準備作業',
    permissions: {
      canManageCourts: true,           // 日程・会場設定 / 会場・コート設定
      canManageRules: true,            // ルール設定
      canRegisterTeams: true,          // チーム登録
      canCreateDraws: true,            // 組合せ作成・編集
      canChangeFormat: false,          // フォーマット変更（管理者のみ）
      canManageParticipants: true,     // 参加チーム管理
      canInputResults: false,
      canConfirmResults: false,
      canSetManualRankings: false,
      canChangePromotionRules: false,
      canManageFiles: false,
      canManageSponsors: false,
      canPrintRefereeCards: true,      // 審判カード印刷
      canSendEmails: false,
      canManageDisplaySettings: false,
      canManageNotices: false,
      canManageOperators: false,
    }
  },
  event_day: {
    label: '当日運営',
    description: '試合結果入力、順位設定など大会当日の運営作業',
    permissions: {
      canManageCourts: false,
      canManageRules: false,
      canRegisterTeams: false,
      canCreateDraws: false,
      canChangeFormat: false,
      canManageParticipants: false,
      canInputResults: true,           // 試合結果入力（結果の登録）
      canConfirmResults: true,         // 試合結果入力（結果の確定）
      canSetManualRankings: true,      // 手動順位設定
      canChangePromotionRules: true,   // 選出条件変更
      canManageFiles: false,
      canManageSponsors: false,
      canPrintRefereeCards: false,
      canSendEmails: false,
      canManageDisplaySettings: false,
      canManageNotices: false,
      canManageOperators: false,
    }
  },
  management: {
    label: '管理・その他',
    description: 'メール送信、ファイル管理、スポンサー管理',
    permissions: {
      canManageCourts: false,
      canManageRules: false,
      canRegisterTeams: false,
      canCreateDraws: false,
      canChangeFormat: false,
      canManageParticipants: false,
      canInputResults: false,
      canConfirmResults: false,
      canSetManualRankings: false,
      canChangePromotionRules: false,
      canManageFiles: true,            // ファイル管理
      canManageSponsors: true,         // スポンサー管理
      canPrintRefereeCards: false,
      canSendEmails: true,             // メール送信
      canManageDisplaySettings: true,  // 表示設定
      canManageNotices: true,          // お知らせ管理
      canManageOperators: true,        // 運営者管理
    }
  },
  custom: {
    label: 'カスタム',
    description: '個別に権限を設定',
    permissions: DEFAULT_OPERATOR_PERMISSIONS
  }
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
