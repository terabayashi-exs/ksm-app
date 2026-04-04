import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// GET: チームの現在の担当者一覧を取得
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const roles = (session?.user?.roles ?? []) as string[];
    const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
    if (!roles.includes('admin') && !isSuperadmin) {
      return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ success: false, error: 'team_id が必要です' }, { status: 400 });
    }

    const result = await db.execute(`
      SELECT
        tm.id AS member_id,
        tm.login_user_id,
        tm.member_role,
        u.email,
        u.display_name
      FROM m_team_members tm
      JOIN m_login_users u ON tm.login_user_id = u.login_user_id
      WHERE tm.team_id = ? AND tm.is_active = 1
      ORDER BY tm.created_at ASC
    `, [teamId]);

    return NextResponse.json({
      success: true,
      data: result.rows.map(row => ({
        member_id: Number(row.member_id),
        login_user_id: Number(row.login_user_id),
        member_role: String(row.member_role),
        email: String(row.email),
        display_name: String(row.display_name ?? ''),
      })),
    });
  } catch (error) {
    console.error('[DATA_REG] team-members GET error:', error);
    return NextResponse.json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// DELETE: チームの担当者を削除
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    const roles = (session?.user?.roles ?? []) as string[];
    const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
    if (!roles.includes('admin') && !isSuperadmin) {
      return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
    }

    const { team_id, login_user_id } = await request.json();

    if (!team_id || !login_user_id) {
      return NextResponse.json(
        { success: false, error: 'team_id と login_user_id が必要です' },
        { status: 400 }
      );
    }

    // 対象レコードの存在確認
    const existing = await db.execute(
      `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
      [team_id, login_user_id]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '指定された担当者が見つかりません' },
        { status: 404 }
      );
    }

    // is_active = 0 に設定（論理削除）
    await db.execute(
      `UPDATE m_team_members SET is_active = 0, updated_at = datetime('now', '+9 hours') WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
      [team_id, login_user_id]
    );

    // このユーザーが他にアクティブなチームメンバーシップを持っているか確認
    const otherMemberships = await db.execute(
      `SELECT id FROM m_team_members WHERE login_user_id = ? AND is_active = 1`,
      [login_user_id]
    );

    // 他にチームがなければ team ロールを削除
    if (otherMemberships.rows.length === 0) {
      await db.execute(
        `DELETE FROM m_login_user_roles WHERE login_user_id = ? AND role = 'team'`,
        [login_user_id]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DATA_REG] team-members DELETE error:', error);
    return NextResponse.json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
