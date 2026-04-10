// lib/withdrawal-notifications.ts
// 辞退申請関連の通知機能

import { db } from "./db";
import { sendEmail } from "./email/mailer";
import {
  getWithdrawalApprovedTemplate,
  getWithdrawalReceivedTemplate,
  getWithdrawalRejectedTemplate,
  WithdrawalEmailVariables,
} from "./email-templates";

interface WithdrawalNotificationData {
  tournamentTeamId: number;
  action: "received" | "approved" | "rejected";
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
      throw new Error("チーム情報が見つかりません");
    }

    // メールテンプレートの選択
    let template;
    switch (data.action) {
      case "received":
        template = getWithdrawalReceivedTemplate();
        break;
      case "approved":
        template = getWithdrawalApprovedTemplate();
        break;
      case "rejected":
        template = getWithdrawalRejectedTemplate();
        break;
      default:
        throw new Error(`未対応のアクション: ${data.action}`);
    }

    // テンプレート変数の準備
    const variables: WithdrawalEmailVariables = {
      teamName: teamInfo.team_name,
      tournamentName: teamInfo.tournament_name, // 部門名（t_tournaments.tournament_name）
      groupName: teamInfo.group_name || undefined, // グループ大会名（t_tournament_groups.group_name）
      categoryName: teamInfo.tournament_name, // tournament_nameを部門名として使用（後方互換性のため）
      adminComment: data.adminComment,
      withdrawalReason: teamInfo.withdrawal_reason || undefined,
      processedDate: new Date().toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Tokyo",
      }),
      tournamentDate: teamInfo.tournament_dates
        ? formatTournamentDates(teamInfo.tournament_dates)
        : undefined,
      venueInfo: teamInfo.venue_name || undefined,
      contactEmail: data.adminEmail || process.env.ADMIN_EMAIL,
      contactPhone: process.env.ADMIN_PHONE,
      organizationName: teamInfo.organization_name || undefined,
    };

    // デバッグログ
    console.log("📧 [DEBUG] Email Variables:", {
      tournamentName: variables.tournamentName,
      groupName: variables.groupName,
      teamInfo_tournament_name: teamInfo.tournament_name,
      teamInfo_group_name: teamInfo.group_name,
    });

    // Handlebarライクなテンプレート処理用の変数変換
    const templateVariables = convertToTemplateVariables(variables);

    console.log("📧 [DEBUG] Template Variables:", {
      tournamentName: templateVariables.tournamentName,
      groupName: templateVariables.groupName,
      hasGroupNameFlag: templateVariables["#if groupName"],
    });

    // テンプレート処理（Handlebars風の変数置換）
    const processTemplate = (text: string): string => {
      let processed = text;

      // 1. {{#if key}} ... {{else}} ... {{/if}} の処理（最も具体的なパターンから処理）
      let changed = true;
      while (changed) {
        changed = false;
        // #if フラグを持つキーのみ処理（'#if 'で始まるキーはスキップ）
        Object.entries(templateVariables).forEach(([key, value]) => {
          if (key.startsWith("#if ")) return; // フラグキーはスキップ

          const ifElseRegex = new RegExp(
            `\\{\\{#if ${key}\\}\\}([\\s\\S]*?)\\{\\{else\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`,
            "g",
          );
          const newProcessed = processed.replace(ifElseRegex, (_match, truePart, falsePart) => {
            changed = true;
            // 実際の値の存在をチェック
            return value ? truePart : falsePart;
          });
          processed = newProcessed;
        });
      }

      // 2. {{#if key}} ... {{/if}} の処理（elseなし）
      changed = true;
      while (changed) {
        changed = false;
        Object.entries(templateVariables).forEach(([key, value]) => {
          if (key.startsWith("#if ")) return; // フラグキーはスキップ

          const ifRegex = new RegExp(`\\{\\{#if ${key}\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`, "g");
          const newProcessed = processed.replace(ifRegex, (_match, content) => {
            changed = true;
            return value ? content : "";
          });
          processed = newProcessed;
        });
      }

      // 3. {{key}} 形式の単純な変数置換（フラグキーは除外）
      Object.entries(templateVariables).forEach(([key, value]) => {
        if (key.startsWith("#if ") || key === "/if") return; // フラグキーはスキップ

        const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
        processed = processed.replace(regex, value || "");
      });

      return processed;
    };

    // メール送信先がない場合はスキップ
    if (!teamInfo.contact_email) {
      console.log(
        `📧 送信先メールアドレスなし: チーム ${teamInfo.team_name} にはm_team_members経由のユーザーが紐付いていないためスキップ`,
      );
      return { success: true, messageId: `withdrawal-${data.action}-skipped-no-email` };
    }

    // メール送信
    try {
      // テンプレート処理後のメール内容
      const processedSubject = processTemplate(template.subject);
      const processedText = processTemplate(template.textBody);
      const processedHtml = processTemplate(template.htmlBody);

      // デバッグ: HTMLの大会情報セクションを抽出
      const tournamentInfoMatch = processedHtml.match(/<h2>🏢 大会情報<\/h2>([\s\S]{0,300})/);
      console.log(
        "📧 [DEBUG] Processed HTML Tournament Info Section:",
        tournamentInfoMatch ? tournamentInfoMatch[0] : "NOT FOUND",
      );

      // デバッグ: メールHTMLを一時ファイルに保存
      try {
        const fs = await import("fs/promises");
        await fs.writeFile(
          `/tmp/withdrawal-email-${data.tournamentTeamId}-${Date.now()}.html`,
          processedHtml,
          "utf-8",
        );
        console.log(
          `📧 [DEBUG] メールHTMLを保存: /tmp/withdrawal-email-${data.tournamentTeamId}-${Date.now()}.html`,
        );
      } catch (fsError) {
        console.error("ファイル保存エラー:", fsError);
      }

      // BCC送信先を準備（運営アドレス + 大会作成管理者）
      const bccAddresses: string[] = [];
      const bccEmail = process.env.SMTP_BCC_EMAIL || "taikaigo-mail@taikai-go.com";
      bccAddresses.push(bccEmail);

      // 大会作成管理者のメールアドレスがあれば追加
      if (teamInfo.admin_email && teamInfo.admin_email !== bccEmail) {
        bccAddresses.push(teamInfo.admin_email);
      }

      await sendEmail({
        to: teamInfo.contact_email,
        subject: processedSubject,
        text: processedText,
        html: processedHtml,
        bcc: bccAddresses,
      });

      // 送信成功
      const result = {
        success: true,
        messageId: `withdrawal-${data.action}-${Date.now()}`,
        subject: processedSubject, // 実際のメールタイトルを追加
        // デバッグ情報
        debug: {
          tournamentName: variables.tournamentName,
          groupName: variables.groupName,
          hasGroupName: !!variables.groupName,
        },
      };

      // 送信ログを記録
      await logNotificationSent(data.tournamentTeamId, data.action, result);

      return result;
    } catch (emailError) {
      console.error("メール送信実行エラー:", emailError);
      const result = {
        success: false,
        error: emailError instanceof Error ? emailError.message : "Email sending failed",
        subject: processTemplate(template.subject), // エラー時もタイトルを記録
      };

      // 失敗ログを記録
      await logNotificationSent(data.tournamentTeamId, data.action, result);

      return result;
    }
  } catch (error) {
    console.error("辞退通知送信エラー:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * チーム・大会情報の取得
 */
async function getWithdrawalTeamInfo(tournamentTeamId: number) {
  const result = await db.execute(
    `
    SELECT
      tt.team_name,
      tt.withdrawal_reason,
      tt.withdrawal_requested_at,
      t.tournament_name,
      t.created_by,
      tg.group_name,
      t.tournament_dates,
      v.venue_name,
      lu.email as admin_email,
      COALESCE(lu.display_name, lu.organization_name) as organization_name
    FROM t_tournament_teams tt
    INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
    LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
    LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
    LEFT JOIN m_login_users lu ON tg.login_user_id = lu.login_user_id
    WHERE tt.tournament_team_id = ?
  `,
    [tournamentTeamId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // チームに紐付くユーザーのメールアドレスを m_team_members + m_login_users 経由で取得
  const emailResult = await db.execute(
    `
    SELECT lu.email
    FROM m_team_members tm
    INNER JOIN m_login_users lu ON tm.login_user_id = lu.login_user_id
    INNER JOIN t_tournament_teams tt ON tt.team_id = tm.team_id
    WHERE tt.tournament_team_id = ? AND tm.is_active = 1
    ORDER BY tm.member_role DESC
    LIMIT 1
  `,
    [tournamentTeamId],
  );

  const contactEmail = emailResult.rows.length > 0 ? String(emailResult.rows[0].email) : null;

  return {
    team_name: String(row.team_name),
    withdrawal_reason: row.withdrawal_reason ? String(row.withdrawal_reason) : null,
    withdrawal_requested_at: row.withdrawal_requested_at
      ? String(row.withdrawal_requested_at)
      : null,
    tournament_name: String(row.tournament_name),
    group_name: row.group_name ? String(row.group_name) : null,
    tournament_dates: row.tournament_dates ? String(row.tournament_dates) : null,
    venue_name: row.venue_name ? String(row.venue_name) : null,
    contact_email: contactEmail,
    admin_email: row.admin_email ? String(row.admin_email) : null,
    organization_name: row.organization_name ? String(row.organization_name) : null,
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
        return new Date(sortedDates[0]).toLocaleDateString("ja-JP");
      } else {
        const start = new Date(sortedDates[0]).toLocaleDateString("ja-JP");
        const end = new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString("ja-JP");
        return `${start} ～ ${end}`;
      }
    }
  } catch (error) {
    console.error("日程フォーマットエラー:", error);
  }
  return "未定";
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
  if (variables.groupName) {
    converted["#if groupName"] = "true";
  }
  if (variables.adminComment) {
    converted["#if adminComment"] = "true";
  }
  if (variables.withdrawalReason) {
    converted["#if withdrawalReason"] = "true";
  }
  if (variables.tournamentDate) {
    converted["#if tournamentDate"] = "true";
  }
  if (variables.venueInfo) {
    converted["#if venueInfo"] = "true";
  }
  if (variables.contactEmail) {
    converted["#if contactEmail"] = "true";
  }
  if (variables.contactPhone) {
    converted["#if contactPhone"] = "true";
  }
  if (variables.organizationName) {
    converted["#if organizationName"] = "true";
  }

  return converted;
}

/**
 * 通知送信ログの記録
 */
async function logNotificationSent(
  tournamentTeamId: number,
  action: string,
  result: { success: boolean; messageId?: string; error?: string; subject?: string },
): Promise<void> {
  try {
    // チーム・大会情報を取得
    const teamInfoResult = await db.execute(
      `
      SELECT
        tt.tournament_id
      FROM t_tournament_teams tt
      WHERE tt.tournament_team_id = ?
    `,
      [tournamentTeamId],
    );

    if (teamInfoResult.rows.length === 0) {
      console.error("通知ログ記録エラー: チーム情報が見つかりません");
      return;
    }

    const teamInfo = teamInfoResult.rows[0];

    // 実際のメールタイトルを使用（result.subjectが存在する場合）
    const subject =
      result.subject ||
      (() => {
        // フォールバック: result.subjectがない場合の件名
        switch (action) {
          case "received":
            return "辞退申請受付確認";
          case "approved":
            return "辞退申請承認通知";
          case "rejected":
            return "辞退申請却下通知";
          default:
            return "辞退関連通知";
        }
      })();

    // template_idを決定（参加申請と区別できるように）
    let templateId = "";
    switch (action) {
      case "received":
        templateId = "auto_withdrawal_received"; // 辞退申請受付自動通知
        break;
      case "approved":
        templateId = "auto_withdrawal_approved"; // 辞退承認自動通知
        break;
      case "rejected":
        templateId = "auto_withdrawal_rejected"; // 辞退却下自動通知
        break;
      default:
        templateId = "auto_withdrawal_other";
    }

    // t_email_send_historyに記録（テーブルスキーマに合わせた形式）
    await db.execute(
      `
      INSERT INTO t_email_send_history (
        tournament_id,
        tournament_team_id,
        sent_by,
        template_id,
        subject,
        sent_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now', '+9 hours'))
    `,
      [teamInfo.tournament_id, tournamentTeamId, "system", templateId, subject],
    );

    const logMessage = result.success
      ? `辞退通知送信成功 (${action}): ${result.messageId}`
      : `辞退通知送信失敗 (${action}): ${result.error}`;

    console.log(`📧 通知ログ記録: ${logMessage}`);
  } catch (error) {
    console.error("通知ログ記録エラー:", error);
  }
}

/**
 * 辞退申請受付時の自動通知
 */
export async function sendWithdrawalReceivedNotification(tournamentTeamId: number): Promise<void> {
  console.log(`📧 辞退申請受付通知送信: ${tournamentTeamId}`);

  const result = await sendWithdrawalNotification({
    tournamentTeamId,
    action: "received",
  });

  if (!result.success) {
    console.error("辞退申請受付通知送信エラー:", result.error);
  }
}

/**
 * 辞退申請承認時の自動通知
 */
export async function sendWithdrawalApprovedNotification(
  tournamentTeamId: number,
  adminComment?: string,
  adminEmail?: string,
): Promise<void> {
  console.log(`📧 辞退申請承認通知送信: ${tournamentTeamId}`);

  const result = await sendWithdrawalNotification({
    tournamentTeamId,
    action: "approved",
    adminComment,
    adminEmail,
  });

  if (!result.success) {
    console.error("辞退申請承認通知送信エラー:", result.error);
  }
}

/**
 * 辞退申請却下時の自動通知
 */
export async function sendWithdrawalRejectedNotification(
  tournamentTeamId: number,
  adminComment?: string,
  adminEmail?: string,
): Promise<void> {
  console.log(`📧 辞退申請却下通知送信: ${tournamentTeamId}`);

  const result = await sendWithdrawalNotification({
    tournamentTeamId,
    action: "rejected",
    adminComment,
    adminEmail,
  });

  if (!result.success) {
    console.error("辞退申請却下通知送信エラー:", result.error);
  }
}
