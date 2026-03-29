import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hasOperatorPermission } from '@/lib/operator-permission-check';

/**
 * GET /api/tournament-groups/[id]/tournaments
 * 特定の大会グループに属する全部門を取得
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params;
    const groupId = parseInt(resolvedParams.id);
    const isSuperadmin = !!(session.user as { isSuperadmin?: boolean }).isSuperadmin;

    // スーパー管理者・canManageOperators持ち: グループの全部門にアクセス可能
    // 通常の管理者: 自分が作成したグループのみ
    const result = (isSuperadmin || hasOperatorPerm)
      ? await db.execute(
          `SELECT t.tournament_id, t.tournament_name, t.category_name, t.group_id, tg.group_name
           FROM t_tournaments t
           JOIN t_tournament_groups tg ON t.group_id = tg.group_id
           WHERE t.group_id = ?
           ORDER BY t.category_name, t.tournament_name`,
          [groupId]
        )
      : await db.execute(
          `SELECT t.tournament_id, t.tournament_name, t.category_name, t.group_id, tg.group_name
           FROM t_tournaments t
           JOIN t_tournament_groups tg ON t.group_id = tg.group_id
           WHERE t.group_id = ? AND tg.login_user_id = ?
           ORDER BY t.category_name, t.tournament_name`,
          [groupId, loginUserId ?? 0]
        );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('部門一覧取得エラー:', error);
    return NextResponse.json(
      { error: '部門一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
