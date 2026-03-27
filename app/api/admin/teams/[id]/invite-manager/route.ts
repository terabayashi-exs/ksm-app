import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { randomUUID } from 'crypto';
import { sendEmail } from '@/lib/email/mailer';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST: チーム担当者招待メール送信
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json({ success: false, error: '権限がありません' }, { status: 401 });
    }

    const { id: teamId } = await context.params;
    const { email } = await request.json();

    if (!email || !email.trim()) {
      return NextResponse.json({ success: false, error: 'メールアドレスを入力してください' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ success: false, error: '有効なメールアドレスを入力してください' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // チーム存在確認
    const teamResult = await db.execute(
      `SELECT team_id, team_name FROM m_teams WHERE team_id = ?`,
      [teamId]
    );
    if (teamResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'チームが見つかりません' }, { status: 404 });
    }
    const teamName = String(teamResult.rows[0].team_name);

    // 既にこのチームの担当者か確認
    const existingMember = await db.execute(
      `SELECT tm.id FROM m_team_members tm
       INNER JOIN m_login_users u ON tm.login_user_id = u.login_user_id
       WHERE tm.team_id = ? AND u.email = ? AND tm.is_active = 1`,
      [teamId, trimmedEmail]
    );
    if (existingMember.rows.length > 0) {
      return NextResponse.json({ success: false, error: 'このメールアドレスは既にこのチームの担当者として登録されています' }, { status: 400 });
    }

    // 既に別チームのprimary担当者か確認
    const existingPrimary = await db.execute(
      `SELECT tm.team_id, t.team_name FROM m_team_members tm
       INNER JOIN m_login_users u ON tm.login_user_id = u.login_user_id
       INNER JOIN m_teams t ON tm.team_id = t.team_id
       WHERE u.email = ? AND tm.member_role = 'primary' AND tm.is_active = 1`,
      [trimmedEmail]
    );
    if (existingPrimary.rows.length > 0) {
      const otherTeamName = String(existingPrimary.rows[0].team_name);
      return NextResponse.json({
        success: false,
        error: `このメールアドレスは既に「${otherTeamName}」の主担当者として登録されています`,
      }, { status: 400 });
    }

    // 既存の未処理招待を無効化
    await db.execute(
      `UPDATE t_team_invitations SET status = 'cancelled'
       WHERE team_id = ? AND invited_email = ? AND status = 'pending'`,
      [teamId, trimmedEmail]
    );

    // トークン生成・招待レコード作成
    const token = randomUUID();
    const adminLoginUserId = (session.user as { loginUserId?: number }).loginUserId || 0;

    await db.execute(
      `INSERT INTO t_team_invitations (team_id, invited_by_login_user_id, invited_email, token, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, 'pending', datetime('now', '+9 hours', '+7 days'), datetime('now', '+9 hours'))`,
      [teamId, adminLoginUserId, trimmedEmail, token]
    );

    // 認証メール送信
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/my/teams/invite/accept-manager?token=${token}`;

    await sendEmail({
      to: trimmedEmail,
      subject: `【チーム担当者登録】${teamName} の担当者として登録してください`,
      text: `チーム「${teamName}」の担当者として招待されました。以下のリンクから登録を完了してください。\n\n${acceptUrl}\n\nこのリンクの有効期限は7日間です。`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>チーム担当者登録のご案内</h2>
          <p>あなたは「<strong>${teamName}</strong>」のチーム担当者として招待されました。</p>
          <p>以下のリンクをクリックして、担当者登録を完了してください。</p>
          <div style="margin: 24px 0;">
            <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
              担当者として登録する
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">このリンクの有効期限は7日間です。</p>
          <p style="color: #666; font-size: 14px;">アカウントをお持ちでない場合も、リンクから新規アカウントを作成して登録できます。</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">このメールに心当たりがない場合は無視してください。</p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: `${trimmedEmail} に認証メールを送信しました`,
    });
  } catch (error) {
    console.error('担当者招待エラー:', error);
    return NextResponse.json({ success: false, error: '担当者招待の処理に失敗しました' }, { status: 500 });
  }
}
