// サブスクリプション関連のビジネスロジック
import { db } from "@/lib/db";

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
 * adminLoginId が数値文字列の場合は m_login_users にフォールバック
 */
export async function getCurrentPlan(adminLoginId: string): Promise<SubscriptionPlan | null> {
  // まず m_administrators で検索（旧プロバイダー）
  const result = await db.execute(
    `SELECT p.*
     FROM m_subscription_plans p
     INNER JOIN m_administrators a ON a.current_plan_id = p.plan_id
     WHERE a.admin_login_id = ?`,
    [adminLoginId],
  );

  if (result.rows.length > 0) {
    return result.rows[0] as unknown as SubscriptionPlan;
  }

  // m_login_users にフォールバック（新プロバイダー：idが数値文字列）
  const loginUserId = Number(adminLoginId);
  if (!isNaN(loginUserId) && loginUserId > 0) {
    const loginUserResult = await db.execute(
      `SELECT p.*
       FROM m_subscription_plans p
       INNER JOIN m_login_users u ON u.current_plan_id = p.plan_id
       WHERE u.login_user_id = ?`,
      [loginUserId],
    );

    if (loginUserResult.rows.length > 0) {
      return loginUserResult.rows[0] as unknown as SubscriptionPlan;
    }

    // current_plan_id 未設定の場合はフリープランを返す
    const freePlan = await db.execute(
      `SELECT * FROM m_subscription_plans WHERE plan_code = 'free' LIMIT 1`,
    );
    if (freePlan.rows.length > 0) {
      return freePlan.rows[0] as unknown as SubscriptionPlan;
    }
  }

  return null;
}

/**
 * 使用状況を取得
 * adminLoginId が数値文字列の場合は m_login_users 経由で直接カウント
 */
export async function getUsage(adminLoginId: string): Promise<SubscriptionUsage | null> {
  // まず t_subscription_usage で検索（旧プロバイダー）
  const result = await db.execute(
    `SELECT current_tournament_groups_count, current_tournaments_count, last_calculated_at
     FROM t_subscription_usage
     WHERE admin_login_id = ?`,
    [adminLoginId],
  );

  if (result.rows.length > 0) {
    return result.rows[0] as unknown as SubscriptionUsage;
  }

  // m_login_users にフォールバック（新プロバイダー：idが数値文字列）
  // t_subscription_usage は admin_login_id 依存のため、大会数を直接カウント
  const loginUserId = Number(adminLoginId);
  if (!isNaN(loginUserId) && loginUserId > 0) {
    // m_login_users のメールアドレスで m_administrators を検索して admin_login_id を取得
    const adminResult = await db.execute(
      `SELECT a.admin_login_id
       FROM m_administrators a
       INNER JOIN m_login_users u ON a.email = u.email
       WHERE u.login_user_id = ?`,
      [loginUserId],
    );

    if (adminResult.rows.length > 0) {
      // 対応する m_administrators が存在する場合は t_subscription_usage から取得
      const adminLoginId2 = String(adminResult.rows[0].admin_login_id);
      const usageResult = await db.execute(
        `SELECT current_tournament_groups_count, current_tournaments_count, last_calculated_at
         FROM t_subscription_usage
         WHERE admin_login_id = ?`,
        [adminLoginId2],
      );
      if (usageResult.rows.length > 0) {
        return usageResult.rows[0] as unknown as SubscriptionUsage;
      }
    }

    // 直接カウントにフォールバック（m_administrators に対応レコードがない場合）
    const groupsResult = await db.execute(
      `SELECT COUNT(DISTINCT tg.group_id) as count
       FROM t_tournament_groups tg
       INNER JOIN m_login_users u ON u.email = (
         SELECT email FROM m_administrators WHERE admin_login_id = tg.admin_login_id LIMIT 1
       )
       WHERE u.login_user_id = ?
       AND EXISTS (
         SELECT 1 FROM t_tournaments t
         WHERE t.group_id = tg.group_id
         AND (t.is_archived IS NULL OR t.is_archived = 0)
       )`,
      [loginUserId],
    );

    const tournamentsResult = await db.execute(
      `SELECT COUNT(*) as count
       FROM t_tournaments t
       INNER JOIN t_tournament_groups tg ON t.group_id = tg.group_id
       INNER JOIN m_login_users u ON u.email = (
         SELECT email FROM m_administrators WHERE admin_login_id = tg.admin_login_id LIMIT 1
       )
       WHERE u.login_user_id = ?
       AND (t.is_archived IS NULL OR t.is_archived = 0)`,
      [loginUserId],
    );

    return {
      current_tournament_groups_count: Number(groupsResult.rows[0]?.count || 0),
      current_tournaments_count: Number(tournamentsResult.rows[0]?.count || 0),
      last_calculated_at: null,
    };
  }

  return null;
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
  adminLoginId: string,
): Promise<CurrentSubscriptionInfo | null> {
  // プラン情報取得
  const plan = await getCurrentPlan(adminLoginId);
  if (!plan) return null;

  // 使用状況取得
  const usage = await getUsage(adminLoginId);
  if (!usage) return null;

  // 管理者のトライアル期限取得（m_administrators → m_login_users フォールバック）
  let adminResult = await db.execute(
    `SELECT free_trial_end_date FROM m_administrators WHERE admin_login_id = ?`,
    [adminLoginId],
  );

  // m_login_users 経由で m_administrators を検索
  if (adminResult.rows.length === 0) {
    const loginUserId = Number(adminLoginId);
    if (!isNaN(loginUserId) && loginUserId > 0) {
      adminResult = await db.execute(
        `SELECT a.free_trial_end_date
         FROM m_administrators a
         INNER JOIN m_login_users u ON a.email = u.email
         WHERE u.login_user_id = ?`,
        [loginUserId],
      );
    }
  }

  const freeTrialEndDate = adminResult.rows[0]?.free_trial_end_date as string | null;
  const trialExpired = plan.plan_code === "free" ? isTrialExpired(freeTrialEndDate) : false;
  const remainingDays = plan.plan_code === "free" ? calculateRemainingDays(freeTrialEndDate) : null;

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
  canView: boolean; // 閲覧
  canArchive: boolean; // アーカイブ化
  canDelete: boolean; // 削除
  canEdit: boolean; // 編集（基本情報含む）
  canCreateNew: boolean; // 新規作成
  canManageResults: boolean; // 試合結果入力
}

/**
 * 期限切れ後に許可される操作を取得
 */
export function getTrialExpiredPermissions(): TrialExpiredPermissions {
  return {
    canView: true, // ✓ 閲覧のみ可能
    canArchive: true, // ✓ アーカイブ化可能
    canDelete: true, // ✓ 削除可能
    canEdit: false, // ✗ 編集不可
    canCreateNew: false, // ✗ 新規作成不可
    canManageResults: false, // ✗ 試合結果入力不可
  };
}

/**
 * 期限切れ後に特定の操作が許可されているかチェック
 */
export async function checkTrialExpiredPermission(
  adminLoginId: string,
  action: keyof TrialExpiredPermissions,
): Promise<{ allowed: boolean; reason?: string; isTrialExpired?: boolean }> {
  const plan = await getCurrentPlan(adminLoginId);

  if (!plan || plan.plan_code !== "free") {
    return { allowed: true }; // 有料プランは制限なし
  }

  let adminResult = await db.execute(
    `SELECT free_trial_end_date FROM m_administrators WHERE admin_login_id = ?`,
    [adminLoginId],
  );

  // m_login_users フォールバック（新プロバイダー）
  if (adminResult.rows.length === 0) {
    const loginUserId = Number(adminLoginId);
    if (!isNaN(loginUserId) && loginUserId > 0) {
      adminResult = await db.execute(
        `SELECT a.free_trial_end_date
         FROM m_administrators a
         INNER JOIN m_login_users u ON a.email = u.email
         WHERE u.login_user_id = ?`,
        [loginUserId],
      );
    }
  }

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
      reason:
        "無料トライアル期間が終了しました。この操作を行うにはプランをアップグレードしてください。",
    };
  }

  return { allowed: true, isTrialExpired: true };
}

/**
 * 使用状況を再計算（アーカイブ除外）
 * sessionId が数値文字列の場合は login_user_id ベースで集計
 */
export async function recalculateUsage(sessionId: string): Promise<void> {
  const loginUserId = Number(sessionId);
  const isNewProvider = !isNaN(loginUserId) && loginUserId > 0;

  let groupsCount = 0;
  let tournamentsCount = 0;

  if (isNewProvider) {
    // 新プロバイダー: login_user_id で t_tournament_groups を検索
    const groupsResult = await db.execute(
      `SELECT COUNT(DISTINCT tg.group_id) as count
       FROM t_tournament_groups tg
       WHERE (
         tg.login_user_id = ?
         OR (tg.login_user_id IS NULL AND tg.admin_login_id = (
           SELECT a.admin_login_id FROM m_administrators a
           INNER JOIN m_login_users u ON a.email = u.email
           WHERE u.login_user_id = ? LIMIT 1
         ))
       )
       AND EXISTS (
         SELECT 1 FROM t_tournaments t
         WHERE t.group_id = tg.group_id
         AND (t.is_archived IS NULL OR t.is_archived = 0)
       )`,
      [loginUserId, loginUserId],
    );
    groupsCount = Number(groupsResult.rows[0]?.count || 0);

    const tournamentsResult = await db.execute(
      `SELECT COUNT(*) as count
       FROM t_tournaments t
       INNER JOIN t_tournament_groups tg ON t.group_id = tg.group_id
       WHERE (
         tg.login_user_id = ?
         OR (tg.login_user_id IS NULL AND tg.admin_login_id = (
           SELECT a.admin_login_id FROM m_administrators a
           INNER JOIN m_login_users u ON a.email = u.email
           WHERE u.login_user_id = ? LIMIT 1
         ))
       )
       AND (t.is_archived IS NULL OR t.is_archived = 0)`,
      [loginUserId, loginUserId],
    );
    tournamentsCount = Number(tournamentsResult.rows[0]?.count || 0);

    // t_subscription_usage は admin_login_id キーのため、対応 admin_login_id を取得して更新
    const adminResult = await db.execute(
      `SELECT a.admin_login_id FROM m_administrators a
       INNER JOIN m_login_users u ON a.email = u.email
       WHERE u.login_user_id = ? LIMIT 1`,
      [loginUserId],
    );

    if (adminResult.rows.length > 0) {
      const adminLoginId = String(adminResult.rows[0].admin_login_id);
      await db.execute(
        `UPDATE t_subscription_usage
         SET current_tournament_groups_count = ?,
             current_tournaments_count = ?,
             last_calculated_at = datetime('now', '+9 hours'),
             updated_at = datetime('now', '+9 hours')
         WHERE admin_login_id = ?`,
        [groupsCount, tournamentsCount, adminLoginId],
      );
    }
    // m_administrators に対応レコードがない新規ユーザーの場合は t_subscription_usage 更新をスキップ
    // （getUsage() が直接カウントにフォールバックするため問題なし）
  } else {
    // 旧プロバイダー: admin_login_id で直接処理
    const adminLoginId = sessionId;

    const groupsResult = await db.execute(
      `SELECT COUNT(DISTINCT tg.group_id) as count
       FROM t_tournament_groups tg
       WHERE tg.admin_login_id = ?
       AND EXISTS (
         SELECT 1 FROM t_tournaments t
         WHERE t.group_id = tg.group_id
         AND (t.is_archived IS NULL OR t.is_archived = 0)
       )`,
      [adminLoginId],
    );
    groupsCount = Number(groupsResult.rows[0]?.count || 0);

    const tournamentsResult = await db.execute(
      `SELECT COUNT(*) as count
       FROM t_tournaments t
       INNER JOIN t_tournament_groups g ON t.group_id = g.group_id
       WHERE g.admin_login_id = ?
       AND (t.is_archived IS NULL OR t.is_archived = 0)`,
      [adminLoginId],
    );
    tournamentsCount = Number(tournamentsResult.rows[0]?.count || 0);

    await db.execute(
      `UPDATE t_subscription_usage
       SET current_tournament_groups_count = ?,
           current_tournaments_count = ?,
           last_calculated_at = datetime('now', '+9 hours'),
           updated_at = datetime('now', '+9 hours')
       WHERE admin_login_id = ?`,
      [groupsCount, tournamentsCount, adminLoginId],
    );
  }
}
