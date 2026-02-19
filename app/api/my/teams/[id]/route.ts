// app/api/my/teams/[id]/route.ts
// チーム情報取得（GET）/ チーム情報更新（PATCH）
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

async function verifyMembership(teamId: string, loginUserId: number): Promise<boolean> {
  const check = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, loginUserId]
  );
  return check.rows.length > 0;
}

// GET: チーム情報取得
export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const { id: teamId } = await context.params;
  const loginUserId = session.user.loginUserId;

  if (!(await verifyMembership(teamId, loginUserId))) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  const result = await db.execute(
    `SELECT team_id, team_name, team_omission FROM m_teams WHERE team_id = ? AND is_active = 1`,
    [teamId]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'チームが見つかりません' }, { status: 404 });
  }

  const row = result.rows[0];
  return NextResponse.json({
    success: true,
    data: {
      team_id: String(row.team_id),
      team_name: String(row.team_name),
      team_omission: row.team_omission ? String(row.team_omission) : null,
    },
  });
}

// PATCH: チーム情報更新（担当者全員が編集可能）
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const { id: teamId } = await context.params;
  const loginUserId = session.user.loginUserId;

  // 担当者であれば編集可能
  if (!(await verifyMembership(teamId, loginUserId))) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  let body: { team_name?: string; team_omission?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'リクエストの形式が不正です' }, { status: 400 });
  }

  const { team_name, team_omission } = body;

  if (!team_name || team_name.trim() === '') {
    return NextResponse.json({ success: false, error: 'チーム名は必須です' }, { status: 400 });
  }

  // 同名チームの重複チェック（自分のチーム以外で同名があればNG）
  const duplicate = await db.execute(`
    SELECT t.team_id FROM m_teams t
    JOIN m_team_members tm ON t.team_id = tm.team_id
    WHERE t.team_name = ? AND tm.login_user_id = ? AND tm.is_active = 1 AND t.is_active = 1
      AND t.team_id != ?
  `, [team_name.trim(), loginUserId, teamId]);
  if (duplicate.rows.length > 0) {
    return NextResponse.json({ success: false, error: '同じ名前のチームが既に存在します' }, { status: 400 });
  }

  const now = `datetime('now', '+9 hours')`;
  await db.execute(
    `UPDATE m_teams SET team_name = ?, team_omission = ?, updated_at = ${now} WHERE team_id = ?`,
    [team_name.trim(), team_omission?.trim() || null, teamId]
  );

  return NextResponse.json({ success: true, message: 'チーム情報を更新しました' });
}
