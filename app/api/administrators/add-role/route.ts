// app/api/administrators/add-role/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// 既存ユーザーに admin ロールを付与する
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { login_user_id } = body;

    if (!login_user_id) {
      return NextResponse.json(
        { success: false, error: 'ユーザーIDが必要です' },
        { status: 400 }
      );
    }

    // ユーザー存在確認
    const userResult = await db.execute(`
      SELECT login_user_id, display_name, email FROM m_login_users WHERE login_user_id = ?
    `, [login_user_id]);

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ユーザーが見つかりません' },
        { status: 404 }
      );
    }

    // 既に admin ロールを持っていないか再確認（二重付与防止）
    const roleResult = await db.execute(`
      SELECT id FROM m_login_user_roles WHERE login_user_id = ? AND role = 'admin'
    `, [login_user_id]);

    if (roleResult.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'このユーザーは既に管理者として登録されています' },
        { status: 400 }
      );
    }

    // admin ロールを付与
    await db.execute(`
      INSERT INTO m_login_user_roles (login_user_id, role, created_at)
      VALUES (?, 'admin', datetime('now', '+9 hours'))
    `, [login_user_id]);

    // フリープランを設定（current_plan_id が未設定の場合のみ）
    await db.execute(`
      UPDATE m_login_users
      SET current_plan_id = 1, updated_at = datetime('now', '+9 hours')
      WHERE login_user_id = ? AND current_plan_id IS NULL
    `, [login_user_id]);

    const user = userResult.rows[0];
    return NextResponse.json({
      success: true,
      data: {
        login_user_id: Number(user.login_user_id),
        display_name: String(user.display_name),
        email: String(user.email),
      },
      message: `${String(user.display_name)} を管理者として追加しました`
    });

  } catch (error) {
    console.error('ロール付与エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '管理者ロールの付与に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
