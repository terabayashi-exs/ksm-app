// lib/withdrawal-notifications.ts
// 辞退申請関連の通知機能

import { sendEmail } from './email-service';
import { 
  getWithdrawalApprovedTemplate, 
  getWithdrawalRejectedTemplate, 
  getWithdrawalReceivedTemplate,
  WithdrawalEmailVariables 
} from './email-templates';
import { db } from './db';

interface WithdrawalNotificationData {
  tournamentTeamId: number;
  action: 'received' | 'approved' | 'rejected';
  adminComment?: string;
  adminEmail?: string;
}

/**
 * 辞退申請通知の送信
 */
export async function sendWithdrawalNotification(data: WithdrawalNotificationData): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    // チーム・大会情報を取得
    const teamInfo = await getWithdrawalTeamInfo(data.tournamentTeamId);
    if (!teamInfo) {
      throw new Error('チーム情報が見つかりません');
    }

    // メールテンプレートの選択
    let template;
    switch (data.action) {
      case 'received':
        template = getWithdrawalReceivedTemplate();
        break;
      case 'approved':
        template = getWithdrawalApprovedTemplate();
        break;
      case 'rejected':
        template = getWithdrawalRejectedTemplate();
        break;
      default:
        throw new Error(`未対応のアクション: ${data.action}`);
    }

    // テンプレート変数の準備
    const variables: WithdrawalEmailVariables = {
      teamName: teamInfo.team_name,
      tournamentName: teamInfo.tournament_name,
      contactPerson: teamInfo.contact_person,
      adminComment: data.adminComment,
      withdrawalReason: teamInfo.withdrawal_reason || undefined,
      processedDate: new Date().toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tokyo'
      }),
      tournamentDate: teamInfo.tournament_dates ? formatTournamentDates(teamInfo.tournament_dates) : undefined,
      venueInfo: teamInfo.venue_name || undefined,
      contactEmail: data.adminEmail || process.env.ADMIN_EMAIL,
      contactPhone: process.env.ADMIN_PHONE
    };

    // Handlebarライクなテンプレート処理用の変数変換
    const templateVariables = convertToTemplateVariables(variables);

    // メール送信
    const result = await sendEmail({
      to: teamInfo.contact_email,
      toName: teamInfo.contact_person,
      template,
      variables: templateVariables
    });

    // 送信ログを記録
    await logNotificationSent(data.tournamentTeamId, data.action, result);

    return result;

  } catch (error) {
    console.error('辞退通知送信エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * チーム・大会情報の取得
 */
async function getWithdrawalTeamInfo(tournamentTeamId: number) {
  const result = await db.execute(`
    SELECT 
      tt.team_name,
      tt.withdrawal_reason,
      tt.withdrawal_requested_at,
      t.tournament_name,
      t.tournament_dates,
      v.venue_name,
      mt.contact_person,
      mt.contact_email,
      mt.contact_phone
    FROM t_tournament_teams tt
    INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
    LEFT JOIN m_venues v ON t.venue_id = v.venue_id
    INNER JOIN m_teams mt ON tt.team_id = mt.team_id
    WHERE tt.tournament_team_id = ?
  `, [tournamentTeamId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    team_name: String(row.team_name),
    withdrawal_reason: row.withdrawal_reason ? String(row.withdrawal_reason) : null,
    withdrawal_requested_at: row.withdrawal_requested_at ? String(row.withdrawal_requested_at) : null,
    tournament_name: String(row.tournament_name),
    tournament_dates: row.tournament_dates ? String(row.tournament_dates) : null,
    venue_name: row.venue_name ? String(row.venue_name) : null,
    contact_person: String(row.contact_person),
    contact_email: String(row.contact_email),
    contact_phone: row.contact_phone ? String(row.contact_phone) : null
  };
}

/**
 * 大会日程のフォーマット
 */
function formatTournamentDates(datesJson: string): string {
  try {
    const dates = JSON.parse(datesJson);
    if (Array.isArray(dates) && dates.length > 0) {
      const sortedDates = dates.sort();
      if (sortedDates.length === 1) {
        return new Date(sortedDates[0]).toLocaleDateString('ja-JP');
      } else {
        const start = new Date(sortedDates[0]).toLocaleDateString('ja-JP');
        const end = new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString('ja-JP');
        return `${start} ～ ${end}`;
      }
    }
  } catch (error) {
    console.error('日程フォーマットエラー:', error);
  }
  return '未定';
}

/**
 * Handlebarライクなテンプレート処理用の変数変換
 */
function convertToTemplateVariables(variables: WithdrawalEmailVariables): Record<string, string> {
  const converted: Record<string, string> = {};
  
  Object.entries(variables).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      converted[key] = String(value);
    }
  });

  // 条件分岐用のフラグを追加
  if (variables.adminComment) {
    converted['#if adminComment'] = 'true';
    converted['/if'] = '';
  }
  if (variables.withdrawalReason) {
    converted['#if withdrawalReason'] = 'true';
  }
  if (variables.tournamentDate) {
    converted['#if tournamentDate'] = 'true';
  }
  if (variables.venueInfo) {
    converted['#if venueInfo'] = 'true';
  }
  if (variables.contactEmail) {
    converted['#if contactEmail'] = 'true';
  }
  if (variables.contactPhone) {
    converted['#if contactPhone'] = 'true';
  }

  return converted;
}

/**
 * 通知送信ログの記録
 */
async function logNotificationSent(
  tournamentTeamId: number,
  action: string,
  result: { success: boolean; messageId?: string; error?: string }
): Promise<void> {
  try {
    const logMessage = result.success 
      ? `辞退通知送信成功 (${action}): ${result.messageId}`
      : `辞退通知送信失敗 (${action}): ${result.error}`;
    
    await db.execute(`
      UPDATE t_tournament_teams
      SET 
        remarks = CASE 
          WHEN remarks IS NULL OR remarks = '' 
          THEN ? || ' (' || datetime('now', '+9 hours') || ')'
          ELSE remarks || ' | ' || ? || ' (' || datetime('now', '+9 hours') || ')'
        END,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_team_id = ?
    `, [logMessage, logMessage, tournamentTeamId]);

    console.log(`📧 通知ログ記録: ${logMessage}`);
  } catch (error) {
    console.error('通知ログ記録エラー:', error);
  }
}

/**
 * 辞退申請受付時の自動通知
 */
export async function sendWithdrawalReceivedNotification(
  tournamentTeamId: number
): Promise<void> {
  console.log(`📧 辞退申請受付通知送信: ${tournamentTeamId}`);
  
  const result = await sendWithdrawalNotification({
    tournamentTeamId,
    action: 'received'
  });

  if (!result.success) {
    console.error('辞退申請受付通知送信エラー:', result.error);
  }
}

/**
 * 辞退申請承認時の自動通知
 */
export async function sendWithdrawalApprovedNotification(
  tournamentTeamId: number,
  adminComment?: string,
  adminEmail?: string
): Promise<void> {
  console.log(`📧 辞退申請承認通知送信: ${tournamentTeamId}`);
  
  const result = await sendWithdrawalNotification({
    tournamentTeamId,
    action: 'approved',
    adminComment,
    adminEmail
  });

  if (!result.success) {
    console.error('辞退申請承認通知送信エラー:', result.error);
  }
}

/**
 * 辞退申請却下時の自動通知
 */
export async function sendWithdrawalRejectedNotification(
  tournamentTeamId: number,
  adminComment?: string,
  adminEmail?: string
): Promise<void> {
  console.log(`📧 辞退申請却下通知送信: ${tournamentTeamId}`);
  
  const result = await sendWithdrawalNotification({
    tournamentTeamId,
    action: 'rejected',
    adminComment,
    adminEmail
  });

  if (!result.success) {
    console.error('辞退申請却下通知送信エラー:', result.error);
  }
}