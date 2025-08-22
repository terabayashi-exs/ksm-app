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
        admin_login_id,
        email,
        created_at,
        updated_at
      FROM m_administrators
      ORDER BY created_at DESC
    `);

    const administrators = result.rows.map(row => ({
      admin_id: String(row.admin_login_id), // admin_login_idをadmin_idとして使用
      admin_name: String(row.admin_login_id), // ログインIDを名前として表示
      email: String(row.email),
      role: 'admin', // 固定値
      is_active: true, // 固定値
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
    const { admin_name, email, password, role, is_active } = body;

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

    // メールアドレスとログインIDの重複チェック
    const existingByEmail = await db.execute(`
      SELECT admin_login_id FROM m_administrators WHERE email = ?
    `, [email.trim()]);

    if (existingByEmail.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: '同じメールアドレスが既に登録されています' },
        { status: 400 }
      );
    }

    // ログインIDとして管理者名を使用（一意性チェック）
    const existingByLoginId = await db.execute(`
      SELECT admin_login_id FROM m_administrators WHERE admin_login_id = ?
    `, [admin_name.trim()]);

    if (existingByLoginId.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: '同じ管理者名（ログインID）が既に登録されています' },
        { status: 400 }
      );
    }

    // パスワードをハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // 利用者を作成
    const result = await db.execute(`
      INSERT INTO m_administrators (admin_login_id, password_hash, email, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      admin_name.trim(),
      hashedPassword,
      email.trim()
    ]);

    return NextResponse.json({
      success: true,
      data: {
        admin_id: admin_name.trim(),
        admin_name: admin_name.trim(),
        email: email.trim(),
        role: 'admin',
        is_active: true
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