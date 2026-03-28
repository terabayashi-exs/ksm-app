import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { randomUUID } from 'crypto';
import { sendEmail } from '@/lib/email/mailer';
import { hasOperatorPermission, getMergedOperatorPermissions, validatePermissionScope } from '@/lib/operator-permission-check';

/**
 * POST /api/admin/operators/invite
 * 新規ユーザーに運営者招待メールを送信
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const adminLoginUserId = (session.user as { loginUserId?: number }).loginUserId;
    const isAdmin = session.user.role === 'admin';
    const isOperatorWithPerm = session.user.role === 'operator' && adminLoginUserId
      ? await hasOperatorPermission(adminLoginUserId, 'canManageOperators')
      : false;

    if (!isAdmin && !isOperatorWithPerm) {
      return NextResponse.json({ error: '権限がありません' }, { status: 401 });
    }

    if (!adminLoginUserId) {
      return NextResponse.json({ error: '管理者情報が見つかりません' }, { status: 404 });
    }

    const body = await request.json();
    const { email, tournamentAccess } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'メールアドレスを入力してください' }, { status: 400 });
    }

    // メールアドレス形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400 });
    }

    if (!tournamentAccess || !Array.isArray(tournamentAccess) || tournamentAccess.length === 0) {
      return NextResponse.json({ error: '部門アクセス権を設定してください' }, { status: 400 });
    }

    // 運営者による招待の場合、権限範囲チェック
    if (isOperatorWithPerm) {
      const myPerms = await getMergedOperatorPermissions(adminLoginUserId);
      for (const access of tournamentAccess) {
        const violations = validatePermissionScope(myPerms, access.permissions || {});
        if (violations.length > 0) {
          return NextResponse.json({
            error: `自分が持っていない権限は付与できません: ${violations.join(', ')}`,
          }, { status: 403 });
        }
      }
    }

    // 既に登録済みのメールアドレスかチェック
    const existingUserResult = await db.execute({
      sql: 'SELECT login_user_id FROM m_login_users WHERE email = ?',
      args: [email.trim()]
    });

    if (existingUserResult.rows.length > 0) {
      return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 400 });
    }

    // 既に招待中（pending）の招待があるかチェック
    const existingInvitationResult = await db.execute({
      sql: `SELECT id FROM t_operator_invitations
            WHERE email = ? AND status = 'pending' AND expires_at > datetime('now', '+9 hours')`,
      args: [email.trim()]
    });

    if (existingInvitationResult.rows.length > 0) {
      return NextResponse.json({ error: 'このメールアドレスには既に招待メールが送信されています' }, { status: 400 });
    }

    // 招待トークンを生成
    const token = randomUUID();

    // 有効期限を7日後に設定
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const expiresAtStr = expiresAt.toISOString().replace('T', ' ').substring(0, 19);

    // 招待データを保存
    const insertResult = await db.execute({
      sql: `INSERT INTO t_operator_invitations (
              email,
              invited_by_login_user_id,
              tournament_access,
              token,
              expires_at,
              status,
              created_at
            ) VALUES (?, ?, ?, ?, ?, 'pending', datetime('now', '+9 hours'))`,
      args: [
        email.trim(),
        adminLoginUserId,
        JSON.stringify(tournamentAccess),
        token,
        expiresAtStr
      ]
    });

    // 大会名・部門名リストを取得
    const tournamentNames = await Promise.all(
      tournamentAccess.map(async (access: { tournamentId: number }) => {
        const result = await db.execute({
          sql: `SELECT
                  t.tournament_name,
                  tg.group_name
                FROM t_tournaments t
                LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
                WHERE t.tournament_id = ?`,
          args: [access.tournamentId]
        });
        if (result.rows.length > 0) {
          const row = result.rows[0];
          const groupName = row.group_name || '大会名未設定';
          const tournamentName = row.tournament_name || '部門名未設定';
          return `${groupName} ${tournamentName}`;
        }
        return '';
      })
    );

    // 招待URLを生成
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/operators/invite/accept?token=${token}`;

    // 招待メールを送信
    try {
      const emailText = `
大会GOの運営者としてご招待します。

アクセス可能な部門：
${tournamentNames.filter(name => name).join('\n')}

以下のリンクから7日以内にアカウント登録を完了してください：
${inviteUrl}

※このリンクの有効期限は ${expiresAtStr} までです。

何かご不明な点がございましたら、お気軽にお問い合わせください。

---
大会GO運営チーム
      `.trim();

      await sendEmail({
        to: email.trim(),
        subject: '【大会GO】運営者としてご招待',
        text: emailText,
        html: emailText.replace(/\n/g, '<br>')
      });
    } catch (emailError) {
      console.error('招待メール送信エラー:', emailError);
      // 招待データは保存済みなので、メール送信失敗してもエラーにしない
      // （管理者が手動でリンクを共有できる）
    }

    return NextResponse.json({
      message: '招待メールを送信しました',
      invitationId: Number(insertResult.lastInsertRowid),
      inviteUrl // デバッグ用（本番では削除可能）
    });
  } catch (error) {
    console.error('招待エラー:', error);
    return NextResponse.json(
      { error: '招待の送信に失敗しました' },
      { status: 500 }
    );
  }
}
