import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hasOperatorPermission } from '@/lib/operator-permission-check';

/**
 * POST /api/admin/operators/check-email
 * メールアドレスが既に登録されているかチェック
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const loginUserId = (session.user as { loginUserId?: number }).loginUserId;
    const roles = (session.user as { roles?: string[] }).roles || [];
    const isAdmin = roles.includes('admin');
    const isOperatorWithPerm = roles.includes('operator') && loginUserId
      ? await hasOperatorPermission(loginUserId, 'canManageOperators')
      : false;

    if (!isAdmin && !isOperatorWithPerm) {
      return NextResponse.json({ error: '権限がありません' }, { status: 401 });
    }

    const body = await request.json();
    const { email } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'メールアドレスを入力してください' }, { status: 400 });
    }

    // 自分自身のメールアドレスかチェック
    if (session.user.email && email.trim().toLowerCase() === session.user.email.toLowerCase()) {
      return NextResponse.json({ error: '自分自身を運営者として登録することはできません' }, { status: 400 });
    }

    // メールアドレスで既存ユーザーを検索
    const userResult = await db.execute({
      sql: `SELECT
              u.login_user_id,
              u.email,
              u.display_name,
              u.created_at,
              u.is_active
            FROM m_login_users u
            WHERE u.email = ?`,
      args: [email.trim()]
    });

    if (userResult.rows.length === 0) {
      // 新規ユーザー（招待が必要）
      return NextResponse.json({
        exists: false
      });
    }

    const user = userResult.rows[0];

    // 既に運営者ロールを持っているかチェック
    const roleResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM m_login_user_roles WHERE login_user_id = ? AND role = ?',
      args: [user.login_user_id, 'operator']
    });

    const hasOperatorRole = Number(roleResult.rows[0].count) > 0;

    // 既存の部門アクセス権を取得
    let existingTournaments: Array<{ tournamentId: number; tournamentName: string; categoryName: string }> = [];
    if (hasOperatorRole) {
      const accessResult = await db.execute({
        sql: `SELECT
                ota.tournament_id,
                t.tournament_name,
                t.category_name
              FROM t_operator_tournament_access ota
              JOIN t_tournaments t ON ota.tournament_id = t.tournament_id
              WHERE ota.operator_id = ?
              ORDER BY t.category_name`,
        args: [user.login_user_id]
      });

      existingTournaments = accessResult.rows.map(row => ({
        tournamentId: Number(row.tournament_id),
        tournamentName: String(row.tournament_name),
        categoryName: String(row.category_name)
      }));
    }

    // 既存ユーザー
    return NextResponse.json({
      exists: true,
      user: {
        loginUserId: Number(user.login_user_id),
        email: user.email,
        displayName: user.display_name,
        createdAt: user.created_at,
        isActive: Number(user.is_active) === 1,
        hasOperatorRole,
        existingTournaments
      }
    });
  } catch (error) {
    console.error('メールアドレス確認エラー:', error);
    return NextResponse.json(
      { error: 'メールアドレスの確認に失敗しました' },
      { status: 500 }
    );
  }
}
