// app/api/my/teams/[id]/leave/route.ts
// チーム担当者の脱退処理
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const { id: teamId } = await context.params;
  const loginUserId = session.user.loginUserId;

  // 自分がこのチームの担当者かチェック
  const memberCheck = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, loginUserId]
  );
  if (memberCheck.rows.length === 0) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  // 担当者の紐づけを解除（論理削除）
  await db.execute(
    `UPDATE m_team_members SET is_active = 0, updated_at = datetime('now', '+9 hours') WHERE team_id = ? AND login_user_id = ?`,
    [teamId, loginUserId]
  );

  // ロールから "team" を削除（他にチームがなければ）
  const otherTeams = await db.execute(
    `SELECT COUNT(*) AS cnt FROM m_team_members WHERE login_user_id = ? AND is_active = 1`,
    [loginUserId]
  );
  if (Number(otherTeams.rows[0].cnt) === 0) {
    await db.execute(
      `DELETE FROM m_login_user_roles WHERE login_user_id = ? AND role = 'team'`,
      [loginUserId]
    );
  }

  return NextResponse.json({
    success: true,
    message: 'チームの紐づけを解除しました。再度このチームの担当者となる場合は、チームID をお控えのうえ「チームIDで紐づける」から操作してください。',
    teamDeleted: false,
    teamId
  });
}
