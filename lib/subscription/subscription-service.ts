// サブスクリプション関連のビジネスロジック
import { db } from '@/lib/db';

export interface SubscriptionPlan {
  plan_id: number;
  plan_name: string;
  plan_code: string;
  plan_description: string;
  monthly_price: number;
  yearly_price: number;
  max_tournaments: number; // -1 = 無制限
  max_divisions_per_tournament: number; // -1 = 無制限
  display_order: number;
}

export interface SubscriptionUsage {
  current_tournament_groups_count: number;
  current_tournaments_count: number;
  last_calculated_at: string | null;
}

export interface CurrentSubscriptionInfo {
  plan: SubscriptionPlan;
  usage: SubscriptionUsage;
  freeTrialEndDate: string | null;
  isTrialExpired: boolean;
  canCreateTournament: boolean;
  canAddDivision: boolean;
  remainingDays: number | null;
}

/**
 * 現在のプラン情報を取得
 */
export async function getCurrentPlan(adminLoginId: string): Promise<SubscriptionPlan | null> {
  const result = await db.execute(
    `SELECT p.*
     FROM m_subscription_plans p
     INNER JOIN m_administrators a ON a.current_plan_id = p.plan_id
     WHERE a.admin_login_id = ?`,
    [adminLoginId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as unknown as SubscriptionPlan;
}

/**
 * 使用状況を取得
 */
export async function getUsage(adminLoginId: string): Promise<SubscriptionUsage | null> {
  const result = await db.execute(
    `SELECT current_tournament_groups_count, current_tournaments_count, last_calculated_at
     FROM t_subscription_usage
     WHERE admin_login_id = ?`,
    [adminLoginId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as unknown as SubscriptionUsage;
}

/**
 * 無料トライアル期限の残り日数を計算
 */
export function calculateRemainingDays(trialEndDate: string | null): number | null {
  if (!trialEndDate) return null;

  const now = new Date();
  const endDate = new Date(trialEndDate);
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * トライアル期限が切れているかチェック
 */
export function isTrialExpired(trialEndDate: string | null): boolean {
  if (!trialEndDate) return false;

  const now = new Date();
  const endDate = new Date(trialEndDate);

  return now > endDate;
}

/**
 * 現在のサブスクリプション情報を全て取得
 */
export async function getCurrentSubscriptionInfo(
  adminLoginId: string
): Promise<CurrentSubscriptionInfo | null> {
  // プラン情報取得
  const plan = await getCurrentPlan(adminLoginId);
  if (!plan) return null;

  // 使用状況取得
  const usage = await getUsage(adminLoginId);
  if (!usage) return null;

  // 管理者のトライアル期限取得
  const adminResult = await db.execute(
    `SELECT free_trial_end_date FROM m_administrators WHERE admin_login_id = ?`,
    [adminLoginId]
  );

  const freeTrialEndDate = adminResult.rows[0]?.free_trial_end_date as string | null;
  const trialExpired = plan.plan_code === 'free' ? isTrialExpired(freeTrialEndDate) : false;
  const remainingDays = plan.plan_code === 'free' ? calculateRemainingDays(freeTrialEndDate) : null;

  // 大会作成可能かチェック
  const canCreateTournament =
    !trialExpired &&
    (plan.max_tournaments === -1 || usage.current_tournament_groups_count < plan.max_tournaments);

  // 部門追加可能かチェック（簡易版：全体の平均で判定）
  const avgDivisionsPerTournament =
    usage.current_tournament_groups_count > 0
      ? usage.current_tournaments_count / usage.current_tournament_groups_count
      : 0;

  const canAddDivision =
    !trialExpired &&
    (plan.max_divisions_per_tournament === -1 ||
      avgDivisionsPerTournament < plan.max_divisions_per_tournament);

  return {
    plan,
    usage,
    freeTrialEndDate,
    isTrialExpired: trialExpired,
    canCreateTournament,
    canAddDivision,
    remainingDays,
  };
}

/**
 * 期限切れ後の操作権限
 */
export interface TrialExpiredPermissions {
  canView: boolean;          // 閲覧
  canArchive: boolean;       // アーカイブ化
  canDelete: boolean;        // 削除
  canEdit: boolean;          // 編集（基本情報含む）
  canCreateNew: boolean;     // 新規作成
  canManageResults: boolean; // 試合結果入力
}

/**
 * 期限切れ後に許可される操作を取得
 */
export function getTrialExpiredPermissions(): TrialExpiredPermissions {
  return {
    canView: true,        // ✓ 閲覧のみ可能
    canArchive: true,     // ✓ アーカイブ化可能
    canDelete: true,      // ✓ 削除可能
    canEdit: false,       // ✗ 編集不可
    canCreateNew: false,  // ✗ 新規作成不可
    canManageResults: false, // ✗ 試合結果入力不可
  };
}

/**
 * 期限切れ後に特定の操作が許可されているかチェック
 */
export async function checkTrialExpiredPermission(
  adminLoginId: string,
  action: keyof TrialExpiredPermissions
): Promise<{ allowed: boolean; reason?: string; isTrialExpired?: boolean }> {
  const plan = await getCurrentPlan(adminLoginId);

  if (!plan || plan.plan_code !== 'free') {
    return { allowed: true }; // 有料プランは制限なし
  }

  const adminResult = await db.execute(
    `SELECT free_trial_end_date FROM m_administrators WHERE admin_login_id = ?`,
    [adminLoginId]
  );
  const trialEndDate = adminResult.rows[0]?.free_trial_end_date as string | null;

  if (!isTrialExpired(trialEndDate)) {
    return { allowed: true }; // 期限内は制限なし
  }

  // 期限切れ後の制限チェック
  const permissions = getTrialExpiredPermissions();

  if (!permissions[action]) {
    return {
      allowed: false,
      isTrialExpired: true,
      reason: '無料トライアル期間が終了しました。この操作を行うにはプランをアップグレードしてください。'
    };
  }

  return { allowed: true, isTrialExpired: true };
}

/**
 * 使用状況を再計算（アーカイブ除外）
 */
export async function recalculateUsage(adminLoginId: string): Promise<void> {
  // アクティブな大会のみカウント（部門が1つでもアーカイブされていない大会）
  const groupsResult = await db.execute(
    `SELECT COUNT(DISTINCT tg.group_id) as count
     FROM t_tournament_groups tg
     WHERE tg.admin_login_id = ?
     AND EXISTS (
       SELECT 1 FROM t_tournaments t
       WHERE t.group_id = tg.group_id
       AND (t.is_archived IS NULL OR t.is_archived = 0)
     )`,
    [adminLoginId]
  );

  const groupsCount = (groupsResult.rows[0]?.count as number) || 0;

  // アクティブな部門のみカウント（アーカイブされていない部門）
  const tournamentsResult = await db.execute(
    `SELECT COUNT(*) as count
     FROM t_tournaments t
     INNER JOIN t_tournament_groups g ON t.group_id = g.group_id
     WHERE g.admin_login_id = ?
     AND (t.is_archived IS NULL OR t.is_archived = 0)`,
    [adminLoginId]
  );

  const tournamentsCount = (tournamentsResult.rows[0]?.count as number) || 0;

  // 使用状況を更新
  await db.execute(
    `UPDATE t_subscription_usage
     SET current_tournament_groups_count = ?,
         current_tournaments_count = ?,
         last_calculated_at = datetime('now', '+9 hours'),
         updated_at = datetime('now', '+9 hours')
     WHERE admin_login_id = ?`,
    [groupsCount, tournamentsCount, adminLoginId]
  );
}
