// app/api/administrators/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import bcrypt from 'bcryptjs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 個別利用者の取得
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const adminId = resolvedParams.id;

    const result = await db.execute(`
      SELECT 
        admin_login_id,
        email,
        created_at,
        updated_at
      FROM m_administrators
      WHERE admin_login_id = ?
    `, [adminId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '利用者が見つかりません' },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const administrator = {
      admin_id: String(row.admin_login_id),
      admin_name: String(row.admin_login_id),
      email: String(row.email),
      role: 'admin',
      is_active: true,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    };

    return NextResponse.json({
      success: true,
      data: administrator
    });

  } catch (error) {
    console.error('利用者取得エラー:', error);
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

// 利用者の更新
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const adminId = resolvedParams.id;

    const body = await request.json();
    const { admin_name, email, password } = body;

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

    if (password && password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'パスワードは6文字以上で入力してください' },
        { status: 400 }
      );
    }

    // 利用者の存在確認
    const existingAdmin = await db.execute(`
      SELECT admin_login_id FROM m_administrators WHERE admin_login_id = ?
    `, [adminId]);

    if (existingAdmin.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '利用者が見つかりません' },
        { status: 404 }
      );
    }

    // メールアドレスの重複チェック（自分以外）
    const duplicateAdmin = await db.execute(`
      SELECT admin_login_id FROM m_administrators WHERE email = ? AND admin_login_id != ?
    `, [email.trim(), adminId]);

    if (duplicateAdmin.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: '同じメールアドレスが既に登録されています' },
        { status: 400 }
      );
    }

    // パスワード更新の場合はハッシュ化
    let updateQuery = '';
    let updateParams: (string | number | null)[] = [];

    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery = `
        UPDATE m_administrators 
        SET email = ?, password_hash = ?, updated_at = datetime('now', '+9 hours')
        WHERE admin_login_id = ?
      `;
      updateParams = [
        email.trim(),
        hashedPassword,
        adminId
      ];
    } else {
      updateQuery = `
        UPDATE m_administrators 
        SET email = ?, updated_at = datetime('now', '+9 hours')
        WHERE admin_login_id = ?
      `;
      updateParams = [
        email.trim(),
        adminId
      ];
    }

    // 利用者を更新
    await db.execute(updateQuery, updateParams);

    return NextResponse.json({
      success: true,
      message: '利用者が正常に更新されました'
    });

  } catch (error) {
    console.error('利用者更新エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '利用者の更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// 利用者の削除
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const adminId = resolvedParams.id;

    // 利用者の存在確認
    const existingAdmin = await db.execute(`
      SELECT admin_login_id FROM m_administrators WHERE admin_login_id = ?
    `, [adminId]);

    if (existingAdmin.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '利用者が見つかりません' },
        { status: 404 }
      );
    }

    // 管理者の数をチェック（最低1人必要）
    const totalAdminsCount = await db.execute(`
      SELECT COUNT(*) as count FROM m_administrators
    `);

    const totalCount = Number(totalAdminsCount.rows[0]?.count) || 0;

    // 管理者が1人しかいない場合、削除を防ぐ
    if (totalCount <= 1) {
      return NextResponse.json(
        { 
          success: false, 
          error: '利用者を全て削除することはできません。最低1人の管理者が必要です。'
        },
        { status: 400 }
      );
    }

    // 利用者を削除
    await db.execute(`
      DELETE FROM m_administrators WHERE admin_login_id = ?
    `, [adminId]);

    return NextResponse.json({
      success: true,
      message: '利用者が正常に削除されました'
    });

  } catch (error) {
    console.error('利用者削除エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '利用者の削除に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}