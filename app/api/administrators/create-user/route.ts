// app/api/administrators/create-user/route.ts
// 一般ユーザーアカウント作成（管理者による代行登録）
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import bcrypt from 'bcryptjs';

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
    const { display_name, email, password } = body;

    if (!display_name || !display_name.trim()) {
      return NextResponse.json(
        { success: false, error: '表示名を入力してください' },
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
    const existing = await db.execute(
      `SELECT login_user_id FROM m_login_users WHERE email = ?`,
      [email.trim()]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: '同じメールアドレスが既に登録されています' },
        { status: 400 }
      );
    }

    // パスワードをハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // m_login_users に登録（ロール付与なし）
    await db.execute(`
      INSERT INTO m_login_users (email, password_hash, display_name, is_superadmin, is_active, current_plan_id, created_at, updated_at)
      VALUES (?, ?, ?, 0, 1, 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [email.trim(), hashedPassword, display_name.trim()]);

    return NextResponse.json({
      success: true,
      message: `一般ユーザー「${display_name.trim()}」を登録しました`,
    });

  } catch (error) {
    console.error('一般ユーザー作成エラー:', error);
    return NextResponse.json(
      { success: false, error: '一般ユーザーの作成に失敗しました' },
      { status: 500 }
    );
  }
}

// 既存一般ユーザーの表示名・パスワード更新（管理者による代行編集）
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { login_user_id, display_name, password } = body;

    if (!login_user_id) {
      return NextResponse.json(
        { success: false, error: 'ユーザーIDが必要です' },
        { status: 400 }
      );
    }

    // ユーザー存在確認
    const existing = await db.execute(
      `SELECT login_user_id FROM m_login_users WHERE login_user_id = ?`,
      [login_user_id]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ユーザーが見つかりません' },
        { status: 404 }
      );
    }

    // 表示名の更新
    if (display_name && display_name.trim()) {
      await db.execute(
        `UPDATE m_login_users SET display_name = ?, updated_at = datetime('now', '+9 hours') WHERE login_user_id = ?`,
        [display_name.trim(), login_user_id]
      );
    }

    // パスワードの更新（指定された場合のみ）
    if (password) {
      if (password.length < 6) {
        return NextResponse.json(
          { success: false, error: 'パスワードは6文字以上で入力してください' },
          { status: 400 }
        );
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.execute(
        `UPDATE m_login_users SET password_hash = ?, updated_at = datetime('now', '+9 hours') WHERE login_user_id = ?`,
        [hashedPassword, login_user_id]
      );
    }

    return NextResponse.json({
      success: true,
      message: 'ユーザー情報を更新しました',
    });

  } catch (error) {
    console.error('一般ユーザー更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ユーザー情報の更新に失敗しました' },
      { status: 500 }
    );
  }
}
