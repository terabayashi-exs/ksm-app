import { db } from "@/lib/db";
import type { OperatorPermissions } from "@/lib/types/operator";

/**
 * 運営者が特定の権限を持っているか確認
 * いずれかの部門で対象権限を持っていればtrue
 */
export async function hasOperatorPermission(
  loginUserId: number,
  permission: keyof OperatorPermissions,
): Promise<boolean> {
  const result = await db.execute(
    `SELECT permissions FROM t_operator_tournament_access WHERE operator_id = ?`,
    [loginUserId],
  );

  for (const row of result.rows) {
    try {
      const perms = JSON.parse(String(row.permissions)) as Partial<OperatorPermissions>;
      if (perms[permission]) return true;
    } catch {
      // ignore parse errors
    }
  }
  return false;
}

/**
 * 運営者のすべての部門権限をマージして返す（全部門の権限のOR）
 */
export async function getMergedOperatorPermissions(
  loginUserId: number,
): Promise<Partial<OperatorPermissions>> {
  const result = await db.execute(
    `SELECT permissions FROM t_operator_tournament_access WHERE operator_id = ?`,
    [loginUserId],
  );

  const merged: Partial<OperatorPermissions> = {};

  for (const row of result.rows) {
    try {
      const perms = JSON.parse(String(row.permissions)) as Partial<OperatorPermissions>;
      for (const [key, value] of Object.entries(perms)) {
        if (value) {
          (merged as Record<string, boolean>)[key] = true;
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  return merged;
}

/**
 * 運営者がアクセスできる大会グループIDの一覧を取得
 */
export async function getOperatorGroupIds(loginUserId: number): Promise<number[]> {
  const result = await db.execute(
    `SELECT DISTINCT t.group_id
     FROM t_operator_tournament_access ota
     INNER JOIN t_tournaments t ON ota.tournament_id = t.tournament_id
     WHERE ota.operator_id = ?`,
    [loginUserId],
  );
  return result.rows.map((row) => Number(row.group_id));
}

/**
 * 付与しようとしている権限が自分の権限範囲内か検証
 * 違反する権限名のリストを返す（空なら問題なし）
 */
export function validatePermissionScope(
  myPermissions: Partial<OperatorPermissions>,
  targetPermissions: Partial<OperatorPermissions>,
): string[] {
  const violations: string[] = [];
  for (const [key, value] of Object.entries(targetPermissions)) {
    if (value && !(myPermissions as Record<string, boolean>)[key]) {
      violations.push(key);
    }
  }
  return violations;
}
