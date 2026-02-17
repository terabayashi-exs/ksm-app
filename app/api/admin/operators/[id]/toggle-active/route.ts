import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * PUT /api/admin/operators/[id]/toggle-active
 * 運営者の有効/無効を切り替え
 */
export async function PUT(
  _request: Request,
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
      sql: 'SELECT administrator_id, is_active FROM m_operators WHERE operator_id = ?',
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

    // 有効/無効を切り替え
    const newIsActive = operator.is_active === 1 ? 0 : 1;

    await db.execute({
      sql: 'UPDATE m_operators SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE operator_id = ?',
      args: [newIsActive, operatorId]
    });

    return NextResponse.json({
      message: newIsActive === 1 ? '運営者を有効にしました' : '運営者を無効にしました',
      isActive: newIsActive,
    });
  } catch (error) {
    console.error('運営者有効/無効切り替えエラー:', error);
    return NextResponse.json(
      { error: '運営者の有効/無効切り替えに失敗しました' },
      { status: 500 }
    );
  }
}
