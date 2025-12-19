// app/api/admin/tournaments/[id]/participants/route.ts
// 参加チーム管理API（統合版）

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/email/mailer';
import {
  generateParticipationConfirmedNotification,
  generateParticipationCancelledNotification,
  generateWaitlistNotification
} from '@/lib/email/templates';
import {
  getWithdrawalApprovedTemplate,
  getWithdrawalRejectedTemplate
} from '@/lib/email-templates';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET: 参加チーム一覧取得
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 大会情報取得
    const tournamentResult = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.team_count as max_teams,
        t.status,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const tournament = tournamentResult.rows[0];

    // 参加チーム一覧取得（詳細情報付き）
    const participantsResult = await db.execute(`
      SELECT
        tt.tournament_team_id,
        tt.tournament_id,
        tt.team_id,
        tt.team_name as tournament_team_name,
        tt.team_omission as tournament_team_omission,
        tt.participation_status,
        tt.withdrawal_status,
        tt.withdrawal_reason,
        tt.withdrawal_requested_at,
        tt.withdrawal_processed_at,
        tt.withdrawal_processed_by,
        tt.withdrawal_admin_comment,
        tt.assigned_block,
        tt.block_position,
        tt.created_at,
        m.team_name as master_team_name,
        m.contact_person,
        m.contact_email,
        m.contact_phone,
        (SELECT COUNT(*) FROM t_tournament_players tp
         WHERE tp.tournament_id = tt.tournament_id
         AND tp.team_id = tt.team_id) as player_count,
        (SELECT COUNT(*) FROM t_matches_final mf
         INNER JOIN t_matches_live ml ON mf.match_id = ml.match_id
         INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
         WHERE (ml.team1_id = tt.team_id OR ml.team2_id = tt.team_id)
         AND mb.tournament_id = tt.tournament_id) as completed_matches
      FROM t_tournament_teams tt
      LEFT JOIN m_teams m ON tt.team_id = m.team_id
      WHERE tt.tournament_id = ?
      ORDER BY
        CASE tt.participation_status
          WHEN 'confirmed' THEN 1
          WHEN 'waitlisted' THEN 2
          WHEN 'cancelled' THEN 3
        END,
        CASE tt.withdrawal_status
          WHEN 'withdrawal_requested' THEN 1
          ELSE 2
        END,
        tt.created_at ASC
    `, [tournamentId]);

    // 各チームのメール送信履歴を取得
    const emailHistoryResult = await db.execute(`
      SELECT
        tournament_team_id,
        template_id,
        subject,
        sent_at
      FROM t_email_send_history
      WHERE tournament_id = ?
      ORDER BY sent_at DESC
    `, [tournamentId]);

    // チームIDごとに送信履歴をグループ化
    const emailHistoryByTeam = new Map<number, Array<{template_id: string; subject: string; sent_at: string}>>();
    for (const row of emailHistoryResult.rows) {
      const teamId = Number(row.tournament_team_id);
      if (!emailHistoryByTeam.has(teamId)) {
        emailHistoryByTeam.set(teamId, []);
      }
      emailHistoryByTeam.get(teamId)!.push({
        template_id: String(row.template_id),
        subject: String(row.subject),
        sent_at: String(row.sent_at)
      });
    }

    // 統計情報を計算
    const participants = participantsResult.rows;
    const statistics = {
      confirmed: participants.filter(p => p.participation_status === 'confirmed').length,
      waitlisted: participants.filter(p => p.participation_status === 'waitlisted').length,
      withdrawal_requested: participants.filter(p => p.withdrawal_status === 'withdrawal_requested').length,
      cancelled: participants.filter(p => p.participation_status === 'cancelled').length,
      total: participants.length,
      max_teams: Number(tournament.max_teams)
    };

    // キャンセル待ち順位を計算
    const waitlistedTeams = participants.filter(p => p.participation_status === 'waitlisted');
    const participantsWithPosition = participants.map(p => {
      if (p.participation_status === 'waitlisted') {
        const position = waitlistedTeams.findIndex(t => t.tournament_team_id === p.tournament_team_id) + 1;
        return { ...p, waitlist_position: position };
      }
      return p;
    });

    // 試合予定数を計算（フォーマットから）
    const scheduledMatches = 8; // TODO: フォーマット別に計算

    // 辞退影響度を計算し、メール送信履歴を追加
    const participantsWithImpact = participantsWithPosition.map(p => {
      const tournamentTeamId = Number(p.tournament_team_id);
      const emailHistory = emailHistoryByTeam.get(tournamentTeamId) || [];

      if (p.withdrawal_status === 'withdrawal_requested') {
        const completedRatio = Number(p.completed_matches) / scheduledMatches;
        let impact: 'low' | 'medium' | 'high' = 'low';

        if (completedRatio > 0.5) {
          impact = 'high';
        } else if (completedRatio > 0.2) {
          impact = 'medium';
        }

        return {
          ...p,
          scheduled_matches: scheduledMatches,
          withdrawal_impact: impact,
          email_history: emailHistory
        };
      }
      return {
        ...p,
        scheduled_matches: scheduledMatches,
        email_history: emailHistory
      };
    });

    // 管理者メールアドレス取得（大会運営者として使用）
    let adminEmail: string | null = null;
    try {
      const adminResult = await db.execute(`
        SELECT email FROM m_administrators LIMIT 1
      `);
      if (adminResult.rows.length > 0) {
        adminEmail = String(adminResult.rows[0].email);
      }
    } catch (adminError) {
      console.error('管理者メールアドレス取得エラー:', adminError);
      // エラーが発生してもメイン処理は続行
    }

    return NextResponse.json({
      success: true,
      data: {
        participants: participantsWithImpact,
        statistics,
        tournament: {
          tournament_id: Number(tournament.tournament_id),
          tournament_name: String(tournament.tournament_name),
          team_count: Number(tournament.max_teams),
          status: String(tournament.status),
          format_name: tournament.format_name ? String(tournament.format_name) : null
        },
        adminEmail: adminEmail
      }
    });

  } catch (error) {
    console.error('参加チーム取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '参加チーム情報の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT: 参加チーム状態更新
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { tournament_team_id, action, admin_comment, send_notification = false } = body;

    if (!tournament_team_id || !action) {
      return NextResponse.json(
        { success: false, error: 'tournament_team_id と action は必須です' },
        { status: 400 }
      );
    }

    // チーム情報取得
    const teamResult = await db.execute(`
      SELECT
        tt.*,
        m.contact_email,
        m.contact_person,
        t.tournament_name
      FROM t_tournament_teams tt
      LEFT JOIN m_teams m ON tt.team_id = m.team_id
      LEFT JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      WHERE tt.tournament_team_id = ? AND tt.tournament_id = ?
    `, [tournament_team_id, tournamentId]);

    if (teamResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'チームが見つかりません' },
        { status: 404 }
      );
    }

    const team = teamResult.rows[0];
    let updateQuery = '';
    let updateParams: (string | number | null)[] = [];
    let emailTemplate = null;
    let successMessage = '';

    switch (action) {
      case 'confirm':
        // キャンセル待ち→参加確定
        updateQuery = `
          UPDATE t_tournament_teams
          SET participation_status = 'confirmed',
              updated_at = datetime('now', '+9 hours')
          WHERE tournament_team_id = ?
        `;
        updateParams = [tournament_team_id];
        successMessage = 'チームを参加確定に変更しました';

        if (send_notification) {
          emailTemplate = generateParticipationConfirmedNotification({
            teamName: String(team.team_name),
            tournamentName: String(team.tournament_name),
            adminComment: admin_comment
          });
        }
        break;

      case 'waitlist':
        // 参加確定→キャンセル待ち
        updateQuery = `
          UPDATE t_tournament_teams
          SET participation_status = 'waitlisted',
              updated_at = datetime('now', '+9 hours')
          WHERE tournament_team_id = ?
        `;
        updateParams = [tournament_team_id];
        successMessage = 'チームをキャンセル待ちに変更しました';

        if (send_notification) {
          emailTemplate = generateWaitlistNotification({
            teamName: String(team.team_name),
            tournamentName: String(team.tournament_name),
            adminComment: admin_comment
          });
        }
        break;

      case 'cancel':
        // キャンセル済みに変更
        updateQuery = `
          UPDATE t_tournament_teams
          SET participation_status = 'cancelled',
              updated_at = datetime('now', '+9 hours')
          WHERE tournament_team_id = ?
        `;
        updateParams = [tournament_team_id];
        successMessage = 'チームをキャンセル済みに変更しました';

        if (send_notification) {
          emailTemplate = generateParticipationCancelledNotification({
            teamName: String(team.team_name),
            tournamentName: String(team.tournament_name),
            adminComment: admin_comment
          });
        }
        break;

      case 'approve_withdrawal':
        // 辞退申請承認
        updateQuery = `
          UPDATE t_tournament_teams
          SET participation_status = 'cancelled',
              withdrawal_status = 'withdrawal_approved',
              withdrawal_processed_at = datetime('now', '+9 hours'),
              withdrawal_processed_by = ?,
              withdrawal_admin_comment = ?,
              updated_at = datetime('now', '+9 hours')
          WHERE tournament_team_id = ?
        `;
        updateParams = [session.user.email, admin_comment || null, tournament_team_id];
        successMessage = '辞退申請を承認しました';

        if (send_notification) {
          const template = getWithdrawalApprovedTemplate();
          emailTemplate = {
            subject: template.subject
              .replace('{{tournamentName}}', String(team.tournament_name))
              .replace('{{teamName}}', String(team.team_name)),
            html: template.htmlBody
              .replace(/{{tournamentName}}/g, String(team.tournament_name))
              .replace(/{{teamName}}/g, String(team.team_name))
              .replace(/{{contactPerson}}/g, String(team.contact_person))
              .replace(/{{processedDate}}/g, new Date().toLocaleString('ja-JP'))
              .replace(/{{adminComment}}/g, admin_comment || ''),
            text: template.textBody
              .replace(/{{tournamentName}}/g, String(team.tournament_name))
              .replace(/{{teamName}}/g, String(team.team_name))
              .replace(/{{contactPerson}}/g, String(team.contact_person))
              .replace(/{{processedDate}}/g, new Date().toLocaleString('ja-JP'))
              .replace(/{{adminComment}}/g, admin_comment || '')
          };
        }
        break;

      case 'reject_withdrawal':
        // 辞退申請却下
        updateQuery = `
          UPDATE t_tournament_teams
          SET withdrawal_status = 'withdrawal_rejected',
              withdrawal_processed_at = datetime('now', '+9 hours'),
              withdrawal_processed_by = ?,
              withdrawal_admin_comment = ?,
              updated_at = datetime('now', '+9 hours')
          WHERE tournament_team_id = ?
        `;
        updateParams = [session.user.email, admin_comment || null, tournament_team_id];
        successMessage = '辞退申請を却下しました';

        if (send_notification) {
          const template = getWithdrawalRejectedTemplate();
          emailTemplate = {
            subject: template.subject
              .replace('{{tournamentName}}', String(team.tournament_name))
              .replace('{{teamName}}', String(team.team_name)),
            html: template.htmlBody
              .replace(/{{tournamentName}}/g, String(team.tournament_name))
              .replace(/{{teamName}}/g, String(team.team_name))
              .replace(/{{contactPerson}}/g, String(team.contact_person))
              .replace(/{{processedDate}}/g, new Date().toLocaleString('ja-JP'))
              .replace(/{{adminComment}}/g, admin_comment || ''),
            text: template.textBody
              .replace(/{{tournamentName}}/g, String(team.tournament_name))
              .replace(/{{teamName}}/g, String(team.team_name))
              .replace(/{{contactPerson}}/g, String(team.contact_person))
              .replace(/{{processedDate}}/g, new Date().toLocaleString('ja-JP'))
              .replace(/{{adminComment}}/g, admin_comment || '')
          };
        }
        break;

      default:
        return NextResponse.json(
          { success: false, error: '無効なアクションです' },
          { status: 400 }
        );
    }

    // データベース更新
    await db.execute(updateQuery, updateParams);

    // メール送信（エラーが発生しても処理は継続）
    if (emailTemplate && team.contact_email) {
      try {
        await sendEmail({
          to: String(team.contact_email),
          subject: emailTemplate.subject,
          text: emailTemplate.text,
          html: emailTemplate.html
        });
        console.log(`✅ 通知メール送信成功: ${team.contact_email}`);

        // メール送信履歴を記録
        try {
          // template_id を action から判定
          let templateId = 'custom';
          switch (action) {
            case 'confirm':
              templateId = 'participationConfirmed';
              break;
            case 'waitlist':
              templateId = 'waitlist';
              break;
            case 'cancel':
              templateId = 'participationCancelled';
              break;
            case 'approve_withdrawal':
              templateId = 'withdrawal_approved';
              break;
            case 'reject_withdrawal':
              templateId = 'withdrawal_rejected';
              break;
          }

          await db.execute(`
            INSERT INTO t_email_send_history (
              tournament_id,
              tournament_team_id,
              sent_by,
              template_id,
              subject
            ) VALUES (?, ?, ?, ?, ?)
          `, [
            tournamentId,
            tournament_team_id,
            session.user.id,
            templateId,
            emailTemplate.subject
          ]);
          console.log(`✅ メール送信履歴記録完了: ${templateId}`);
        } catch (historyError) {
          console.error('❌ メール送信履歴記録エラー:', historyError);
          // 履歴記録失敗してもメール送信は成功とする
        }
      } catch (emailError) {
        console.error('❌ メール送信エラー:', emailError);
        // メール送信失敗してもAPIレスポンスは成功として返す
      }
    }

    return NextResponse.json({
      success: true,
      message: successMessage,
      data: {
        tournament_team_id: Number(tournament_team_id),
        action
      }
    });

  } catch (error) {
    console.error('参加チーム更新エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '参加チーム情報の更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
