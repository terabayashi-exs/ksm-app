// app/api/administrators/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// 利用者一覧の取得
export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const result = await db.execute(`
      SELECT
        u.login_user_id,
        u.display_name,
        u.email,
        u.is_active,
        u.is_superadmin,
        u.organization_name,
        u.created_at,
        u.updated_at
      FROM m_login_users u
      INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
      WHERE r.role = 'admin'
      ORDER BY u.created_at DESC
    `);

    const administrators = result.rows.map(row => ({
      admin_id: Number(row.login_user_id),
      admin_name: String(row.display_name),
      email: String(row.email),
      role: 'admin',
      is_active: Number(row.is_active) === 1,
      is_superadmin: Number(row.is_superadmin) === 1,
      organization_name: row.organization_name ? String(row.organization_name) : '',
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    }));

    return NextResponse.json({
      success: true,
      data: administrators
    });

  } catch (error) {
    console.error('利用者一覧取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '利用者データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// 新規利用者の作成
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { admin_name, email, password, is_active, is_superadmin, organization_name } = body;

    // バリデーション
    if (!admin_name || !admin_name.trim()) {
      return NextResponse.json(
        { success: false, error: '管理者名を入力してください' },
        { status: 400 }
      );
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { success: false, error: 'メールアドレスを入力してください' },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'パスワードは6文字以上で入力してください' },
        { status: 400 }
      );
    }

    // メールアドレスの重複チェック
    const existingByEmail = await db.execute(`
      SELECT login_user_id FROM m_login_users WHERE email = ?
    `, [email.trim()]);

    if (existingByEmail.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: '同じメールアドレスが既に登録されています' },
        { status: 400 }
      );
    }

    // パスワードをハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // m_login_users に登録（フリープランを初期設定）
    const insertResult = await db.execute(`
      INSERT INTO m_login_users (email, password_hash, display_name, is_superadmin, is_active, current_plan_id, organization_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      email.trim(),
      hashedPassword,
      admin_name.trim(),
      is_superadmin === true ? 1 : 0,
      is_active === false ? 0 : 1,
      organization_name?.trim() || null
    ]);

    const loginUserId = Number(insertResult.lastInsertRowid);

    // m_login_user_roles に admin ロールを付与
    await db.execute(`
      INSERT INTO m_login_user_roles (login_user_id, role, created_at)
      VALUES (?, 'admin', datetime('now', '+9 hours'))
    `, [loginUserId]);

    return NextResponse.json({
      success: true,
      data: {
        admin_id: Number(loginUserId),
        admin_name: admin_name.trim(),
        email: email.trim(),
        role: 'admin',
        is_active: is_active !== false
      },
      message: '利用者が正常に作成されました'
    });

  } catch (error) {
    console.error('利用者作成エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '利用者の作成に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
