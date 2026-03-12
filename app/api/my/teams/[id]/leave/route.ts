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

  // 担当者数をカウント
  const managerCount = await db.execute(
    `SELECT COUNT(*) AS cnt FROM m_team_members WHERE team_id = ? AND is_active = 1`,
    [teamId]
  );
  const count = Number(managerCount.rows[0].cnt);

  // 担当者が1名の場合 → チーム削除（大会参加チェック）
  if (count === 1) {
    // 大会参加履歴チェック
    const tournamentCheck = await db.execute(
      `SELECT COUNT(*) AS cnt FROM t_tournament_teams WHERE team_id = ?`,
      [teamId]
    );
    if (Number(tournamentCheck.rows[0].cnt) > 0) {
      return NextResponse.json({
        success: false,
        error: 'このチームは大会にエントリーまたは参加履歴があるため削除できません。チームを削除したい場合は、管理者にお問い合わせください。'
      }, { status: 400 });
    }

    // チーム削除（カスケードで関連データも削除）
    await db.execute(`DELETE FROM m_teams WHERE team_id = ?`, [teamId]);

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
      message: 'チームを削除しました',
      teamDeleted: true
    });
  }

  // 担当者が2名の場合 → 自分だけ脱退
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
    message: 'チームから脱退しました',
    teamDeleted: false
  });
}
