import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

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

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const resolvedParams = await params;
    const groupId = parseInt(resolvedParams.id);
    const isSuperadmin = !!(session.user as { isSuperadmin?: boolean }).isSuperadmin;
    const loginUserId = (session.user as { loginUserId: number }).loginUserId;

    // 大会グループに属する部門を取得
    // スーパー管理者は全グループの部門にアクセス可能
    const result = isSuperadmin
      ? await db.execute({
          sql: `SELECT
                  t.tournament_id,
                  t.tournament_name,
                  t.category_name,
                  t.group_id,
                  tg.group_name
                FROM t_tournaments t
                JOIN t_tournament_groups tg ON t.group_id = tg.group_id
                WHERE t.group_id = ?
                ORDER BY t.category_name, t.tournament_name`,
          args: [groupId]
        })
      : await db.execute({
          sql: `SELECT
                  t.tournament_id,
                  t.tournament_name,
                  t.category_name,
                  t.group_id,
                  tg.group_name
                FROM t_tournaments t
                JOIN t_tournament_groups tg ON t.group_id = tg.group_id
                WHERE t.group_id = ? AND tg.login_user_id = ?
                ORDER BY t.category_name, t.tournament_name`,
          args: [groupId, loginUserId]
        });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('部門一覧取得エラー:', error);
    return NextResponse.json(
      { error: '部門一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
