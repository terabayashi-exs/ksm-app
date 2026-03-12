// app/api/my/teams/[id]/managers/route.ts
// チームの担当者一覧を取得
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const { id: teamId } = await params;
  const loginUserId = session.user.loginUserId;

  // 自分がこのチームの担当者かチェック
  const memberCheck = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, loginUserId]
  );
  if (memberCheck.rows.length === 0) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  const result = await db.execute(`
    SELECT
      u.login_user_id,
      u.display_name,
      u.email,
      tm.member_role,
      tm.created_at AS joined_at
    FROM m_team_members tm
    JOIN m_login_users u ON tm.login_user_id = u.login_user_id
    WHERE tm.team_id = ? AND tm.is_active = 1
    ORDER BY tm.member_role DESC, tm.created_at ASC
  `, [teamId]);

  return NextResponse.json({
    success: true,
    data: result.rows.map(row => ({
      login_user_id: Number(row.login_user_id),
      display_name: String(row.display_name),
      email: String(row.email),
      member_role: String(row.member_role) as 'primary' | 'secondary',
      joined_at: String(row.joined_at),
    })),
  });
}
