import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import nodemailer from 'nodemailer';
import { hasOperatorPermission } from '@/lib/operator-permission-check';

/**
 * POST /api/admin/operators/assign-role
 * 既存ユーザーに運営者ロールを付与
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const adminLoginUserId = (session.user as { loginUserId?: number }).loginUserId;
    const roles = (session.user as { roles?: string[] }).roles || [];
    const isAdmin = roles.includes('admin');
    const isOperatorWithPerm = roles.includes('operator') && adminLoginUserId
      ? await hasOperatorPermission(adminLoginUserId, 'canManageOperators')
      : false;

    if (!isAdmin && !isOperatorWithPerm) {
      return NextResponse.json({ error: '権限がありません' }, { status: 401 });
    }

    if (!adminLoginUserId) {
      return NextResponse.json({ error: '管理者情報が見つかりません' }, { status: 404 });
    }

    const body = await request.json();
    const { loginUserId, tournamentAccess, sendNotification = true } = body;

    if (!loginUserId) {
      return NextResponse.json({ error: 'ユーザーIDが必要です' }, { status: 400 });
    }

    if (!tournamentAccess || !Array.isArray(tournamentAccess) || tournamentAccess.length === 0) {
      return NextResponse.json({ error: '部門アクセス権を設定してください' }, { status: 400 });
    }

    // ユーザーの存在確認
    const userResult = await db.execute({
      sql: 'SELECT login_user_id, email, display_name FROM m_login_users WHERE login_user_id = ?',
      args: [loginUserId]
    });

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const user = userResult.rows[0];

    // 既に運営者ロールを持っているかチェック
    const roleResult = await db.execute({
      sql: 'SELECT id FROM m_login_user_roles WHERE login_user_id = ? AND role = ?',
      args: [loginUserId, 'operator']
    });

    // 運営者ロールがなければ追加
    if (roleResult.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO m_login_user_roles (login_user_id, role, created_at)
              VALUES (?, 'operator', datetime('now', '+9 hours'))`,
        args: [loginUserId]
      });
    }

    // 作成者情報を更新（まだ設定されていない場合）
    await db.execute({
      sql: `UPDATE m_login_users
            SET created_by_login_user_id = COALESCE(created_by_login_user_id, ?),
                updated_at = datetime('now', '+9 hours')
            WHERE login_user_id = ?`,
      args: [adminLoginUserId, loginUserId]
    });

    // 部門アクセス権を登録（既になければ追加、あれば更新）
    for (const access of tournamentAccess) {
      try {
        const existingAccess = await db.execute({
          sql: 'SELECT access_id FROM t_operator_tournament_access WHERE operator_id = ? AND tournament_id = ?',
          args: [loginUserId, access.tournamentId]
        });

        if (existingAccess.rows.length === 0) {
          // 新規登録（誰が付与したかも記録）
          await db.execute({
            sql: 'INSERT INTO t_operator_tournament_access (operator_id, tournament_id, permissions, assigned_by_login_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\', \'+9 hours\'), datetime(\'now\', \'+9 hours\'))',
            args: [loginUserId, access.tournamentId, JSON.stringify(access.permissions), adminLoginUserId]
          });
          console.log(`部門アクセス権を追加: operator_id=${loginUserId}, tournament_id=${access.tournamentId}, assigned_by=${adminLoginUserId}`);
        } else {
          // 既存の権限を更新（権限を更新した管理者も更新）
          await db.execute({
            sql: 'UPDATE t_operator_tournament_access SET permissions = ?, assigned_by_login_user_id = ?, updated_at = datetime(\'now\', \'+9 hours\') WHERE operator_id = ? AND tournament_id = ?',
            args: [JSON.stringify(access.permissions), adminLoginUserId, loginUserId, access.tournamentId]
          });
          console.log(`部門アクセス権を更新: operator_id=${loginUserId}, tournament_id=${access.tournamentId}, assigned_by=${adminLoginUserId}`);
        }
      } catch (accessError) {
        console.error(`部門アクセス権の登録エラー (operator_id=${loginUserId}, tournament_id=${access.tournamentId}):`, accessError);
        // エラーが発生してもスキップして続行
      }
    }

    // 通知メールを送信
    if (sendNotification) {
      try {
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        // 大会名リストを取得
        const tournamentNames = await Promise.all(
          tournamentAccess.map(async (access: { tournamentId: number }) => {
            const result = await db.execute({
              sql: 'SELECT tournament_name, category_name FROM t_tournaments WHERE tournament_id = ?',
              args: [access.tournamentId]
            });
            if (result.rows.length > 0) {
              const row = result.rows[0];
              return `${row.tournament_name} - ${row.category_name}`;
            }
            return '';
          })
        );

        const mailOptions = {
          from: `"大会GO運営" <${process.env.EMAIL_USER}>`,
          to: String(user.email),
          subject: '【大会GO】運営者権限が付与されました',
          text: `
${user.display_name} 様

大会GOの運営者として権限が付与されました。

アクセス可能な部門：
${tournamentNames.filter(name => name).join('\n')}

マイダッシュボードから運営者タブにアクセスできます。
https://${process.env.NEXT_PUBLIC_SITE_URL || 'localhost:3000'}/my?tab=operator

何かご不明な点がございましたら、お気軽にお問い合わせください。

---
大会GO運営チーム
          `.trim()
        };

        await transporter.sendMail(mailOptions);
      } catch (emailError) {
        console.error('通知メール送信エラー:', emailError);
        // メール送信失敗してもエラーにしない（ロール付与は成功しているため）
      }
    }

    return NextResponse.json({
      message: '運営者権限を付与しました',
      operatorId: loginUserId
    });
  } catch (error) {
    console.error('ロール付与エラー:', error);
    return NextResponse.json(
      { error: '運営者権限の付与に失敗しました' },
      { status: 500 }
    );
  }
}
