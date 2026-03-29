import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hasOperatorPermission, getOperatorGroupIds } from '@/lib/operator-permission-check';

/**
 * GET /api/admin/tournaments/all
 * 管理者配下の全部門を取得（運営者登録用）
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const loginUserId = (session.user as { loginUserId?: number }).loginUserId;
    const roles = (session.user as { roles?: string[] }).roles || [];
    const isAdmin = roles.includes('admin');
    const isOperator = roles.includes('operator');
    const hasOperatorPerm = isOperator && loginUserId
      ? await hasOperatorPermission(loginUserId, 'canManageOperators')
      : false;

    if (!isAdmin && !hasOperatorPerm) {
      return NextResponse.json({ error: '権限がありません' }, { status: 401 });
    }

    let result;

    if (hasOperatorPerm && loginUserId) {
      // 運営者: アクセス権のあるグループの全部門
      const groupIds = await getOperatorGroupIds(loginUserId);
      if (groupIds.length === 0) {
        return NextResponse.json([]);
      }
      const placeholders = groupIds.map(() => '?').join(',');
      result = await db.execute(
        `SELECT
           t.tournament_id,
           t.tournament_name,
           t.category_name,
           t.group_id,
           tg.group_name
         FROM t_tournaments t
         JOIN t_tournament_groups tg ON t.group_id = tg.group_id
         WHERE t.group_id IN (${placeholders})
         ORDER BY tg.group_name, t.category_name`,
        groupIds
      );
    } else {
      // 管理者: admin_login_id または login_user_id で紐づく部門
      result = await db.execute(
        `SELECT
           t.tournament_id,
           t.tournament_name,
           t.category_name,
           t.group_id,
           tg.group_name
         FROM t_tournaments t
         JOIN t_tournament_groups tg ON t.group_id = tg.group_id
         WHERE tg.admin_login_id = ? OR tg.login_user_id = ?
         ORDER BY tg.group_name, t.category_name`,
        [session.user.id, loginUserId ?? 0]
      );
    }

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('部門一覧取得エラー:', error);
    return NextResponse.json(
      { error: '部門一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
