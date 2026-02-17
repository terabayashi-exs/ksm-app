import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * GET /api/admin/operators
 * 管理者配下の運営者一覧を取得
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者IDを取得
    const adminResult = await db.execute({
      sql: 'SELECT administrator_id FROM m_administrators WHERE admin_login_id = ?',
      args: [session.user.id]
    });

    if (adminResult.rows.length === 0) {
      return NextResponse.json({ error: '管理者が見つかりません' }, { status: 404 });
    }

    const administratorId = adminResult.rows[0].administrator_id as string;

    // 管理者配下の運営者を取得
    const operatorsResult = await db.execute({
      sql: `SELECT
              operator_id,
              operator_login_id,
              operator_name,
              administrator_id,
              is_active,
              created_at,
              updated_at
            FROM m_operators
            WHERE administrator_id = ?`,
      args: [administratorId]
    });

    // アクセス可能な部門を取得
    const operators = await Promise.all(
      operatorsResult.rows.map(async (operator) => {
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
          args: [operator.operator_id]
        });

        return {
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
        };
      })
    );

    return NextResponse.json(operators);
  } catch (error) {
    console.error('運営者一覧取得エラー:', error);
    return NextResponse.json(
      { error: '運営者一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/operators
 * 新しい運営者を登録
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();

    // 管理者IDを取得
    const adminResult = await db.execute({
      sql: 'SELECT administrator_id FROM m_administrators WHERE admin_login_id = ?',
      args: [session.user.id]
    });

    if (adminResult.rows.length === 0) {
      return NextResponse.json({ error: '管理者が見つかりません' }, { status: 404 });
    }

    const administratorId = adminResult.rows[0].administrator_id as string;

    // ログインIDの重複チェック
    const duplicateCheck = await db.execute({
      sql: 'SELECT operator_id FROM m_operators WHERE operator_login_id = ?',
      args: [body.operatorLoginId]
    });

    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({ error: 'このログインIDは既に使用されています' }, { status: 400 });
    }

    // パスワードをハッシュ化
    const passwordHash = await bcrypt.hash(body.password, 10);

    // 運営者を登録
    const insertResult = await db.execute({
      sql: `INSERT INTO m_operators (
              operator_login_id,
              password_hash,
              operator_name,
              administrator_id,
              is_active
            ) VALUES (?, ?, ?, ?, ?)`,
      args: [
        body.operatorLoginId,
        passwordHash,
        body.operatorName,
        administratorId,
        1
      ]
    });

    const operatorId = Number(insertResult.lastInsertRowid);

    // 部門アクセス権を登録
    if (body.tournamentAccess && body.tournamentAccess.length > 0) {
      for (const access of body.tournamentAccess) {
        await db.execute({
          sql: 'INSERT INTO t_operator_tournament_access (operator_id, tournament_id, permissions) VALUES (?, ?, ?)',
          args: [operatorId, access.tournamentId, JSON.stringify(access.permissions)]
        });
      }
    }

    return NextResponse.json({
      message: '運営者を登録しました',
      operatorId
    });
  } catch (error) {
    console.error('運営者登録エラー:', error);
    return NextResponse.json(
      { error: '運営者の登録に失敗しました' },
      { status: 500 }
    );
  }
}
