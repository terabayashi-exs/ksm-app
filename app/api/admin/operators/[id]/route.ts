import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

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

    // 運営者を取得
    const operatorResult = await db.execute({
      sql: `SELECT
              operator_id,
              operator_login_id,
              operator_name,
              administrator_id,
              is_active,
              created_at,
              updated_at
            FROM m_operators
            WHERE operator_id = ?`,
      args: [operatorId]
    });

    if (operatorResult.rows.length === 0) {
      return NextResponse.json({ error: '運営者が見つかりません' }, { status: 404 });
    }

    const operator = operatorResult.rows[0];

    // 管理者IDを確認
    const adminResult = await db.execute({
      sql: 'SELECT administrator_id FROM m_administrators WHERE admin_login_id = ?',
      args: [session.user.id]
    });

    if (adminResult.rows.length === 0 ||
        operator.administrator_id !== adminResult.rows[0].administrator_id) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

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
      operatorId: Number(operator.operator_id),
      operatorLoginId: operator.operator_login_id,
      operatorName: operator.operator_name,
      administratorId: Number(operator.administrator_id),
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

    const resolvedParams = await params;
    const body = await request.json();
    const operatorId = parseInt(resolvedParams.id);

    // 管理者IDを取得
    const adminResult = await db.execute({
      sql: 'SELECT administrator_id FROM m_administrators WHERE admin_login_id = ?',
      args: [session.user.id]
    });

    if (adminResult.rows.length === 0) {
      return NextResponse.json({ error: '管理者が見つかりません' }, { status: 404 });
    }

    const administratorId = adminResult.rows[0].administrator_id as string;

    // 運営者の所属確認
    const operatorResult = await db.execute({
      sql: 'SELECT administrator_id FROM m_operators WHERE operator_id = ?',
      args: [operatorId]
    });

    if (operatorResult.rows.length === 0) {
      return NextResponse.json({ error: '運営者が見つかりません' }, { status: 404 });
    }

    if (operatorResult.rows[0].administrator_id !== administratorId) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // 基本情報を更新
    if (body.password) {
      const passwordHash = await bcrypt.hash(body.password, 10);
      await db.execute({
        sql: `UPDATE m_operators
              SET operator_name = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP
              WHERE operator_id = ?`,
        args: [body.operatorName, passwordHash, operatorId]
      });
    } else {
      await db.execute({
        sql: `UPDATE m_operators
              SET operator_name = ?, updated_at = CURRENT_TIMESTAMP
              WHERE operator_id = ?`,
        args: [body.operatorName, operatorId]
      });
    }

    // 部門アクセス権を更新
    await db.execute({
      sql: 'DELETE FROM t_operator_tournament_access WHERE operator_id = ?',
      args: [operatorId]
    });

    if (body.tournamentAccess && body.tournamentAccess.length > 0) {
      for (const access of body.tournamentAccess) {
        await db.execute({
          sql: 'INSERT INTO t_operator_tournament_access (operator_id, tournament_id, permissions) VALUES (?, ?, ?)',
          args: [operatorId, access.tournamentId, JSON.stringify(access.permissions)]
        });
      }
    }

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

    const resolvedParams = await params;
    const operatorId = parseInt(resolvedParams.id);

    // 管理者IDを取得
    const adminResult = await db.execute({
      sql: 'SELECT administrator_id FROM m_administrators WHERE admin_login_id = ?',
      args: [session.user.id]
    });

    if (adminResult.rows.length === 0) {
      return NextResponse.json({ error: '管理者が見つかりません' }, { status: 404 });
    }

    const administratorId = adminResult.rows[0].administrator_id as string;

    // 運営者の所属確認
    const operatorResult = await db.execute({
      sql: 'SELECT administrator_id FROM m_operators WHERE operator_id = ?',
      args: [operatorId]
    });

    if (operatorResult.rows.length === 0) {
      return NextResponse.json({ error: '運営者が見つかりません' }, { status: 404 });
    }

    if (operatorResult.rows[0].administrator_id !== administratorId) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // アクセス権を削除
    await db.execute({
      sql: 'DELETE FROM t_operator_tournament_access WHERE operator_id = ?',
      args: [operatorId]
    });

    // 運営者を削除
    await db.execute({
      sql: 'DELETE FROM m_operators WHERE operator_id = ?',
      args: [operatorId]
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
