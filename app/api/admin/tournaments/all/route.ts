import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/admin/tournaments/all
 * 管理者配下の全部門を取得（運営者登録用）
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者配下の全部門を取得
    const result = await db.execute({
      sql: `SELECT
              t.tournament_id,
              t.tournament_name,
              t.category_name,
              t.group_id,
              tg.group_name
            FROM t_tournaments t
            JOIN t_tournament_groups tg ON t.group_id = tg.group_id
            WHERE tg.admin_login_id = ?
            ORDER BY tg.group_name, t.category_name`,
      args: [session.user.id]
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
