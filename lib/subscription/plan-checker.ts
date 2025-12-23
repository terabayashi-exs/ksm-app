// プラン制限チェック機能
import { db } from '@/lib/db';
import { getCurrentPlan, getUsage, isTrialExpired } from './subscription-service';

export interface PlanChangeBlocker {
  activeGroups: number;
  activeDivisions: number;
  maxGroupsInNewPlan: number;
  maxDivisionsPerTournamentInNewPlan: number;
  excessGroups: number;
  excessDivisions: Array<{ group_id: number; group_name: string; division_count: number }>;
}

export interface PlanChangeCheckResult {
  allowed: boolean;
  reason?: string;
  blockers?: PlanChangeBlocker;
}

export interface PlanCheckResult {
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
}

/**
 * 大会グループ作成可能かチェック
 */
export async function canCreateTournamentGroup(adminLoginId: string): Promise<PlanCheckResult> {
  // プラン情報取得
  const plan = await getCurrentPlan(adminLoginId);
  if (!plan) {
    return {
      allowed: false,
      reason: 'プラン情報が見つかりません',
      current: 0,
      limit: 0,
    };
  }

  // 無料プラン期限チェック
  if (plan.plan_code === 'free') {
    const adminResult = await db.execute(
      `SELECT free_trial_end_date FROM m_administrators WHERE admin_login_id = ?`,
      [adminLoginId]
    );
    const trialEndDate = adminResult.rows[0]?.free_trial_end_date as string | null;

    if (isTrialExpired(trialEndDate)) {
      return {
        allowed: false,
        reason: '無料プラン期限切れ。有料プランへのアップグレードが必要です',
        current: 0,
        limit: 0,
      };
    }
  }

  // 使用状況取得
  const usage = await getUsage(adminLoginId);
  if (!usage) {
    return {
      allowed: false,
      reason: '使用状況情報が見つかりません',
      current: 0,
      limit: 0,
    };
  }

  const currentCount = usage.current_tournament_groups_count;
  const limit = plan.max_tournaments;

  // -1は無制限
  if (limit === -1) {
    return {
      allowed: true,
      current: currentCount,
      limit: -1,
    };
  }

  // 上限チェック
  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `プラン上限到達（${limit}大会まで）。プランをアップグレードしてください`,
      current: currentCount,
      limit,
    };
  }

  return {
    allowed: true,
    current: currentCount,
    limit,
  };
}

/**
 * 大会グループ内に部門（tournament）を追加可能かチェック
 */
export async function canAddDivision(
  adminLoginId: string,
  groupId: number
): Promise<PlanCheckResult> {
  // プラン情報取得
  const plan = await getCurrentPlan(adminLoginId);
  if (!plan) {
    return {
      allowed: false,
      reason: 'プラン情報が見つかりません',
      current: 0,
      limit: 0,
    };
  }

  // 無料プラン期限チェック
  if (plan.plan_code === 'free') {
    const adminResult = await db.execute(
      `SELECT free_trial_end_date FROM m_administrators WHERE admin_login_id = ?`,
      [adminLoginId]
    );
    const trialEndDate = adminResult.rows[0]?.free_trial_end_date as string | null;

    if (isTrialExpired(trialEndDate)) {
      return {
        allowed: false,
        reason: '無料プラン期限切れ。有料プランへのアップグレードが必要です',
        current: 0,
        limit: 0,
      };
    }
  }

  // この大会グループの現在の部門数を取得
  const divisionsResult = await db.execute(
    `SELECT COUNT(*) as count FROM t_tournaments WHERE group_id = ?`,
    [groupId]
  );

  const currentCount = (divisionsResult.rows[0]?.count as number) || 0;
  const limit = plan.max_divisions_per_tournament;

  // -1は無制限
  if (limit === -1) {
    return {
      allowed: true,
      current: currentCount,
      limit: -1,
    };
  }

  // 上限チェック
  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `プラン上限到達（1大会あたり${limit}部門まで）。プランをアップグレードしてください`,
      current: currentCount,
      limit,
    };
  }

  return {
    allowed: true,
    current: currentCount,
    limit,
  };
}

/**
 * 大会グループを編集可能かチェック（ダウングレード時の制限）
 */
export async function canEditTournamentGroup(
  adminLoginId: string,
  groupId: number
): Promise<boolean> {
  // プラン情報取得
  const plan = await getCurrentPlan(adminLoginId);
  if (!plan) return false;

  // 無料プラン期限チェック
  if (plan.plan_code === 'free') {
    const adminResult = await db.execute(
      `SELECT free_trial_end_date FROM m_administrators WHERE admin_login_id = ?`,
      [adminLoginId]
    );
    const trialEndDate = adminResult.rows[0]?.free_trial_end_date as string | null;

    if (isTrialExpired(trialEndDate)) {
      return false; // 期限切れは編集不可
    }
  }

  // 無制限プランは常に編集可能
  if (plan.max_tournaments === -1) return true;

  // プラン上限内の大会のみ編集可能（作成日時が古い順にlimit件）
  const editableGroupsResult = await db.execute(
    `SELECT group_id FROM t_tournament_groups
     WHERE admin_login_id = ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [adminLoginId, plan.max_tournaments]
  );

  const editableGroupIds = editableGroupsResult.rows.map((row) => row.group_id);

  return editableGroupIds.includes(groupId);
}

/**
 * 大会（division）を編集可能かチェック
 */
export async function canEditDivision(
  adminLoginId: string,
  tournamentId: number
): Promise<boolean> {
  // プラン情報取得
  const plan = await getCurrentPlan(adminLoginId);
  if (!plan) return false;

  // 無料プラン期限チェック
  if (plan.plan_code === 'free') {
    const adminResult = await db.execute(
      `SELECT free_trial_end_date FROM m_administrators WHERE admin_login_id = ?`,
      [adminLoginId]
    );
    const trialEndDate = adminResult.rows[0]?.free_trial_end_date as string | null;

    if (isTrialExpired(trialEndDate)) {
      return false;
    }
  }

  // 無制限プランは常に編集可能
  if (plan.max_tournaments === -1 && plan.max_divisions_per_tournament === -1) {
    return true;
  }

  // 大会が所属するグループIDを取得
  const tournamentResult = await db.execute(
    `SELECT group_id FROM t_tournaments WHERE tournament_id = ?`,
    [tournamentId]
  );

  if (tournamentResult.rows.length === 0) return false;

  const groupId = tournamentResult.rows[0].group_id as number;

  // グループが編集可能かチェック
  return await canEditTournamentGroup(adminLoginId, groupId);
}

/**
 * プラン変更可否をチェック（アーカイブ除外ロジック）
 */
export async function canChangePlan(
  adminLoginId: string,
  newPlanId: number
): Promise<PlanChangeCheckResult> {
  // 新プランの情報を取得
  const newPlanResult = await db.execute(
    `SELECT plan_id, plan_name, max_tournaments, max_divisions_per_tournament
     FROM m_subscription_plans
     WHERE plan_id = ?`,
    [newPlanId]
  );

  if (newPlanResult.rows.length === 0) {
    return { allowed: false, reason: 'プランが見つかりません' };
  }

  const newPlan = newPlanResult.rows[0] as unknown as {
    plan_id: number;
    plan_name: string;
    max_tournaments: number;
    max_divisions_per_tournament: number;
  };

  // アクティブな大会数を取得（アーカイブされていない部門が1つでもある大会）
  const activeGroupsResult = await db.execute(
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

  const activeGroups = Number(activeGroupsResult.rows[0]?.count || 0);

  // アクティブな部門総数を取得
  const activeDivisionsResult = await db.execute(
    `SELECT COUNT(*) as count
     FROM t_tournaments t
     INNER JOIN t_tournament_groups tg ON t.group_id = tg.group_id
     WHERE tg.admin_login_id = ?
     AND (t.is_archived IS NULL OR t.is_archived = 0)`,
    [adminLoginId]
  );

  const activeDivisions = Number(activeDivisionsResult.rows[0]?.count || 0);

  // 大会数チェック
  if (newPlan.max_tournaments !== -1 && activeGroups > newPlan.max_tournaments) {
    return {
      allowed: false,
      reason: 'アクティブな大会数が新プランの上限を超えています',
      blockers: {
        activeGroups,
        activeDivisions,
        maxGroupsInNewPlan: newPlan.max_tournaments,
        maxDivisionsPerTournamentInNewPlan: newPlan.max_divisions_per_tournament,
        excessGroups: activeGroups - newPlan.max_tournaments,
        excessDivisions: []
      }
    };
  }

  // 各大会の部門数チェック
  if (newPlan.max_divisions_per_tournament !== -1) {
    const divisionsResult = await db.execute(
      `SELECT tg.group_id, tg.group_name, COUNT(t.tournament_id) as division_count
       FROM t_tournament_groups tg
       LEFT JOIN t_tournaments t ON tg.group_id = t.group_id
         AND (t.is_archived IS NULL OR t.is_archived = 0)
       WHERE tg.admin_login_id = ?
       GROUP BY tg.group_id, tg.group_name
       HAVING division_count > ?`,
      [adminLoginId, newPlan.max_divisions_per_tournament]
    );

    if (divisionsResult.rows.length > 0) {
      return {
        allowed: false,
        reason: '一部の大会で部門数が新プランの上限を超えています',
        blockers: {
          activeGroups,
          activeDivisions,
          maxGroupsInNewPlan: newPlan.max_tournaments,
          maxDivisionsPerTournamentInNewPlan: newPlan.max_divisions_per_tournament,
          excessGroups: 0,
          excessDivisions: divisionsResult.rows.map(row => ({
            group_id: Number(row.group_id),
            group_name: String(row.group_name),
            division_count: Number(row.division_count)
          }))
        }
      };
    }
  }

  return { allowed: true };
}
