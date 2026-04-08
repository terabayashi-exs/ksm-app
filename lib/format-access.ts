import { db } from "@/lib/db";

/**
 * ユーザーがアクセス可能な restricted format ID の Set を返す
 */
export async function getGrantedFormatIds(loginUserId: number): Promise<Set<number>> {
  const result = await db.execute(
    `
    SELECT format_id FROM t_format_access_grants
    WHERE login_user_id = ?
      AND (expires_at IS NULL OR expires_at > datetime('now', '+9 hours'))
  `,
    [loginUserId],
  );

  return new Set(result.rows.map((row) => Number(row.format_id)));
}

/**
 * フォーマットがユーザーにとってアクセス可能か判定
 */
export function isFormatAccessible(
  format: { format_id: number; visibility: string },
  isSuperadmin: boolean,
  grantedIds: Set<number>,
): boolean {
  return format.visibility === "public" || isSuperadmin || grantedIds.has(format.format_id);
}

/**
 * フォーマットリストに isAccessible 注釈を付与
 */
export function annotateFormatsWithAccess<T extends { format_id: number; visibility: string }>(
  formats: T[],
  isSuperadmin: boolean,
  grantedIds: Set<number>,
): (T & { isAccessible: boolean })[] {
  return formats.map((format) => ({
    ...format,
    isAccessible: isFormatAccessible(format, isSuperadmin, grantedIds),
  }));
}
