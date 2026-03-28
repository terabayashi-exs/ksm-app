import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/admin/operators/[id]
 * 運営者詳細を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const resolvedParams = await params;
    const operatorId = parseInt(resolvedParams.id);

    // 運営者を取得（m_login_users + m_login_user_roles）
    const operatorResult = await db.execute({
      sql: `SELECT
              u.login_user_id,
              u.email,
              u.display_name,
              u.is_active,
              u.created_at,
              u.updated_at
            FROM m_login_users u
            INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
            WHERE u.login_user_id = ? AND r.role = 'operator'`,
      args: [operatorId]
    });

    if (operatorResult.rows.length === 0) {
      return NextResponse.json({ error: '運営者が見つかりません' }, { status: 404 });
    }

    const operator = operatorResult.rows[0];

    // アクセス可能な部門を取得
    const accessResult = await db.execute({
      sql: `SELECT
              ota.tournament_id,
              ota.permissions,
              t.tournament_name,
              t.category_name,
              t.group_id,
              tg.group_name
            FROM t_operator_tournament_access ota
            JOIN t_tournaments t ON ota.tournament_id = t.tournament_id
            JOIN t_tournament_groups tg ON t.group_id = tg.group_id
            WHERE ota.operator_id = ?
            ORDER BY tg.group_name, t.category_name`,
      args: [operatorId]
    });

    return NextResponse.json({
      operatorId: Number(operator.login_user_id),
      operatorLoginId: operator.email,
      operatorName: operator.display_name,
      isActive: operator.is_active === 1,
      createdAt: operator.created_at,
      updatedAt: operator.updated_at,
      accessibleTournaments: accessResult.rows.map((row) => ({
        tournamentId: Number(row.tournament_id),
        tournamentName: row.tournament_name,
        categoryName: row.category_name,
        groupId: Number(row.group_id),
        groupName: row.group_name,
        permissions: JSON.parse(row.permissions as string)
      }))
    });
  } catch (error) {
    console.error('運営者取得エラー:', error);
    return NextResponse.json(
      { error: '運営者の取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/operators/[id]
 * 運営者情報を更新
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const adminLoginUserId = (session.user as { loginUserId?: number }).loginUserId;
    const isSuperadmin = !!(session.user as { isSuperadmin?: boolean }).isSuperadmin;
    if (!adminLoginUserId) {
      return NextResponse.json({ error: '管理者情報が見つかりません' }, { status: 404 });
    }

    const resolvedParams = await params;
    const body = await request.json();
    const operatorId = parseInt(resolvedParams.id);

    // 運営者の存在確認
    const operatorResult = await db.execute({
      sql: `SELECT u.login_user_id, u.created_by_login_user_id
            FROM m_login_users u
            INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
            WHERE u.login_user_id = ? AND r.role = 'operator'`,
      args: [operatorId]
    });

    if (operatorResult.rows.length === 0) {
      return NextResponse.json({ error: '運営者が見つかりません' }, { status: 404 });
    }

    // 所属確認（自分が作成した運営者のみ編集可能、スーパー管理者は全運営者を編集可能）
    const operator = operatorResult.rows[0];
    if (!isSuperadmin && operator.created_by_login_user_id !== adminLoginUserId) {
      return NextResponse.json({ error: 'この運営者を編集する権限がありません' }, { status: 403 });
    }

    // 部門アクセス権を更新（個人情報は更新しない）
    await db.execute({
      sql: 'DELETE FROM t_operator_tournament_access WHERE operator_id = ?',
      args: [operatorId]
    });

    if (body.tournamentAccess && body.tournamentAccess.length > 0) {
      for (const access of body.tournamentAccess) {
        await db.execute({
          sql: 'INSERT INTO t_operator_tournament_access (operator_id, tournament_id, permissions, assigned_by_login_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\', \'+9 hours\'), datetime(\'now\', \'+9 hours\'))',
          args: [operatorId, access.tournamentId, JSON.stringify(access.permissions), adminLoginUserId]
        });
      }
    }

    // updated_atのみ更新
    await db.execute({
      sql: 'UPDATE m_login_users SET updated_at = datetime(\'now\', \'+9 hours\') WHERE login_user_id = ?',
      args: [operatorId]
    });

    return NextResponse.json({ message: '運営者情報を更新しました' });
  } catch (error) {
    console.error('運営者更新エラー:', error);
    return NextResponse.json(
      { error: '運営者情報の更新に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/operators/[id]
 * 運営者を削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const adminLoginUserId = (session.user as { loginUserId?: number }).loginUserId;
    const isSuperadmin = !!(session.user as { isSuperadmin?: boolean }).isSuperadmin;
    if (!adminLoginUserId) {
      return NextResponse.json({ error: '管理者情報が見つかりません' }, { status: 404 });
    }

    const resolvedParams = await params;
    const operatorId = parseInt(resolvedParams.id);

    // 運営者の存在確認と所属確認
    const operatorResult = await db.execute({
      sql: `SELECT u.login_user_id, u.created_by_login_user_id
            FROM m_login_users u
            INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
            WHERE u.login_user_id = ? AND r.role = 'operator'`,
      args: [operatorId]
    });

    if (operatorResult.rows.length === 0) {
      return NextResponse.json({ error: '運営者が見つかりません' }, { status: 404 });
    }

    // 所属確認（自分が作成した運営者のみ削除可能、スーパー管理者は全運営者を削除可能）
    const operator = operatorResult.rows[0];
    if (!isSuperadmin && operator.created_by_login_user_id !== adminLoginUserId) {
      return NextResponse.json({ error: 'この運営者を削除する権限がありません' }, { status: 403 });
    }

    // アクセス権を削除
    await db.execute({
      sql: 'DELETE FROM t_operator_tournament_access WHERE operator_id = ?',
      args: [operatorId]
    });

    // operatorロールのみを削除（アカウント自体は保持）
    await db.execute({
      sql: 'DELETE FROM m_login_user_roles WHERE login_user_id = ? AND role = ?',
      args: [operatorId, 'operator']
    });

    return NextResponse.json({ message: '運営者を削除しました' });
  } catch (error) {
    console.error('運営者削除エラー:', error);
    return NextResponse.json(
      { error: '運営者の削除に失敗しました' },
      { status: 500 }
    );
  }
}
