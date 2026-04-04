import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const roles = (session?.user?.roles ?? []) as string[];
    const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
    if (!roles.includes('admin') && !isSuperadmin) {
      return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    if (!email || email.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'email が必要です' }, { status: 400 });
    }

    const userResult = await db.execute(
      `SELECT login_user_id, email, display_name, is_active FROM m_login_users WHERE email = ?`,
      [email.trim()]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: '指定されたメールアドレスのユーザーが見つかりません' }, { status: 404 });
    }

    const user = userResult.rows[0];
    const loginUserId = Number(user.login_user_id);

    const membershipsResult = await db.execute(`
      SELECT
        tm.team_id,
        tm.member_role,
        tm.is_active AS member_is_active,
        m.team_name
      FROM m_team_members tm
      JOIN m_teams m ON tm.team_id = m.team_id
      WHERE tm.login_user_id = ?
      ORDER BY tm.is_active DESC, tm.member_role DESC
    `, [loginUserId]);

    return NextResponse.json({
      success: true,
      data: {
        login_user_id: loginUserId,
        email: String(user.email),
        display_name: String(user.display_name ?? ''),
        is_active: Number(user.is_active ?? 1),
        memberships: membershipsResult.rows.map(row => ({
          team_id: String(row.team_id),
          team_name: String(row.team_name ?? ''),
          member_role: String(row.member_role),
          is_active: Number(row.member_is_active ?? 0),
        })),
      },
    });
  } catch (error) {
    console.error('[DATA_REG] search-user error:', error);
    return NextResponse.json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
