// app/api/my/teams/invite/route.ts
// チーム担当者招待メールの送信（POST）と招待一覧取得（GET）
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { randomUUID } from 'crypto';
import { sendEmail } from '@/lib/email/mailer';

// GET: 指定チームの招待一覧を取得
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');
  if (!teamId) {
    return NextResponse.json({ success: false, error: 'team_id が必要です' }, { status: 400 });
  }

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
      i.id,
      i.invited_email,
      i.status,
      i.expires_at,
      i.accepted_at,
      i.created_at,
      u.display_name AS invited_by_name
    FROM t_team_invitations i
    LEFT JOIN m_login_users u ON i.invited_by_login_user_id = u.login_user_id
    WHERE i.team_id = ?
    ORDER BY i.created_at DESC
  `, [teamId]);

  return NextResponse.json({
    success: true,
    data: result.rows.map(row => ({
      id: Number(row.id),
      invited_email: String(row.invited_email),
      status: String(row.status),
      expires_at: String(row.expires_at),
      accepted_at: row.accepted_at ? String(row.accepted_at) : null,
      created_at: String(row.created_at),
      invited_by_name: row.invited_by_name ? String(row.invited_by_name) : null,
    })),
  });
}

// POST: 招待メールを送信
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const loginUserId = session.user.loginUserId;
  const { team_id, invited_email } = await request.json();

  if (!team_id || !invited_email) {
    return NextResponse.json({ success: false, error: 'team_id と invited_email が必要です' }, { status: 400 });
  }

  // メールアドレス形式チェック
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(invited_email)) {
    return NextResponse.json({ success: false, error: '有効なメールアドレスを入力してください' }, { status: 400 });
  }

  // 自分がこのチームの担当者かチェック
  const memberCheck = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [team_id, loginUserId]
  );
  if (memberCheck.rows.length === 0) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  // チーム情報取得
  const teamResult = await db.execute(
    `SELECT team_name FROM m_teams WHERE team_id = ? AND is_active = 1`,
    [team_id]
  );
  if (teamResult.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'チームが見つかりません' }, { status: 404 });
  }
  const teamName = String(teamResult.rows[0].team_name);

  // 担当者数チェック（最大2名）
  const managerCount = await db.execute(
    `SELECT COUNT(*) AS cnt FROM m_team_members WHERE team_id = ? AND is_active = 1`,
    [team_id]
  );
  if (Number(managerCount.rows[0].cnt) >= 2) {
    return NextResponse.json({ success: false, error: 'このチームの担当者はすでに2名います' }, { status: 400 });
  }

  // 招待先がアカウント保有者かチェック
  const userCheck = await db.execute(
    `SELECT login_user_id FROM m_login_users WHERE email = ?`,
    [invited_email]
  );
  if (userCheck.rows.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'このメールアドレスはアカウント登録されていません。招待を送信するには、相手が先に大会GOにアカウント登録している必要があります。'
    }, { status: 400 });
  }

  const invitedUserId = Number(userCheck.rows[0].login_user_id);

  // 招待先が既にこのチームの担当者かチェック
  const existingMember = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [team_id, invitedUserId]
  );
  if (existingMember.rows.length > 0) {
    return NextResponse.json({ success: false, error: 'このメールアドレスはすでに担当者として登録されています' }, { status: 400 });
  }

  // 招待先が既に別のチームの担当者でないかチェック（1アカウント1チームのみ）
  const otherTeam = await db.execute(
    `SELECT COUNT(*) AS cnt FROM m_team_members WHERE login_user_id = ? AND is_active = 1`,
    [invitedUserId]
  );
  if (Number(otherTeam.rows[0]?.cnt ?? 0) > 0) {
    return NextResponse.json({
      success: false,
      error: 'このメールアドレスは既に別のチームの担当者として登録されています。1つのアカウントで複数のチームを管理することはできません。'
    }, { status: 400 });
  }

  // 既存の有効な招待がないかチェック
  const existingInvite = await db.execute(`
    SELECT id FROM t_team_invitations
    WHERE team_id = ? AND invited_email = ? AND status = 'pending'
      AND expires_at > datetime('now', '+9 hours')
  `, [team_id, invited_email]);
  if (existingInvite.rows.length > 0) {
    return NextResponse.json({ success: false, error: 'このメールアドレスにはすでに招待を送信しています' }, { status: 400 });
  }

  // 招待トークン発行（有効期限72時間）
  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 72 + 9); // UTC+9時間 + 72時間
  const expiresAtStr = expiresAt.toISOString().replace('T', ' ').split('.')[0];

  await db.execute(`
    INSERT INTO t_team_invitations
      (team_id, invited_by_login_user_id, invited_email, token, status, expires_at, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, datetime('now', '+9 hours'))
  `, [team_id, loginUserId, invited_email, token, expiresAtStr]);

  // 招待メール送信
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const acceptUrl = `${baseUrl}/my/teams/invite/accept?token=${token}`;
  const inviterName = session.user.name || '担当者';

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #16a34a;">チーム担当者への招待</h2>
      <p>${inviterName}さんから、チーム「<strong>${teamName}</strong>」の担当者として招待が届いています。</p>
      <p>以下のボタンから招待を承認してください。</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${acceptUrl}"
          style="background-color: #16a34a; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          招待を承認する
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        ※ この招待リンクは72時間有効です。<br>
        ※ 招待を承認するにはアカウントへのログインが必要です。アカウントをお持ちでない場合は、先にアカウントを作成してください。
      </p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">
        このメールに心当たりがない場合は、無視してください。
      </p>
    </div>
  `;

  try {
    await sendEmail({
      to: invited_email,
      subject: `【チーム担当者招待】${teamName} への招待`,
      text: `${inviterName}さんからチーム「${teamName}」の担当者として招待が届いています。\n\n以下のURLから招待を承認してください。\n${acceptUrl}\n\n※このリンクは72時間有効です。`,
      html: emailHtml,
    });
  } catch (err) {
    console.error('招待メール送信エラー:', err);
    return NextResponse.json({ success: false, error: '招待メールの送信に失敗しました' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: '招待メールを送信しました' });
}

// DELETE: 招待をキャンセル
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const loginUserId = session.user.loginUserId;
  const { invitation_id } = await request.json();

  if (!invitation_id) {
    return NextResponse.json({ success: false, error: 'invitation_id が必要です' }, { status: 400 });
  }

  // 招待情報取得
  const inviteResult = await db.execute(
    `SELECT team_id FROM t_team_invitations WHERE id = ? AND status = 'pending'`,
    [invitation_id]
  );
  if (inviteResult.rows.length === 0) {
    return NextResponse.json({ success: false, error: '招待が見つかりません' }, { status: 404 });
  }

  const teamId = String(inviteResult.rows[0].team_id);

  // 自分がこのチームの担当者かチェック
  const memberCheck = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, loginUserId]
  );
  if (memberCheck.rows.length === 0) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  await db.execute(
    `UPDATE t_team_invitations SET status = 'cancelled' WHERE id = ?`,
    [invitation_id]
  );

  return NextResponse.json({ success: true, message: '招待をキャンセルしました' });
}
