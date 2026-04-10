// app/api/my/teams/[id]/tournaments/[tournament_team_id]/withdraw/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/mailer";
import { getWithdrawalReceivedTemplate, WithdrawalEmailVariables } from "@/lib/email-templates";

interface RouteContext {
  params: Promise<{ id: string; tournament_team_id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
    }

    const roles = (session.user.roles ?? []) as ("admin" | "operator" | "team")[];
    const teamIds = (session.user.teamIds ?? []) as string[];

    if (!roles.includes("team") && teamIds.length === 0) {
      return NextResponse.json({ success: false, error: "チーム権限が必要です" }, { status: 401 });
    }

    const resolvedParams = await context.params;
    const teamId = resolvedParams.id;
    const tournamentTeamId = parseInt(resolvedParams.tournament_team_id, 10);

    if (isNaN(tournamentTeamId)) {
      return NextResponse.json({ success: false, error: "無効なパラメータです" }, { status: 400 });
    }

    // リクエストボディから辞退理由を取得
    const body = await request.json();
    const withdrawalReason = body.withdrawal_reason?.trim() || "";

    // 辞退理由のバリデーション
    if (!withdrawalReason) {
      return NextResponse.json({ success: false, error: "辞退理由は必須です" }, { status: 400 });
    }

    if (withdrawalReason.length < 5) {
      return NextResponse.json(
        { success: false, error: "辞退理由は5文字以上で入力してください" },
        { status: 400 },
      );
    }

    if (withdrawalReason.length > 50) {
      return NextResponse.json(
        { success: false, error: "辞退理由は50文字以内で入力してください" },
        { status: 400 },
      );
    }

    // チーム所有権チェック
    if (!teamIds.includes(teamId)) {
      return NextResponse.json(
        { success: false, error: "チームへのアクセス権限がありません" },
        { status: 403 },
      );
    }

    // 参加チーム情報を取得
    const teamResult = await db.execute(
      `
      SELECT
        tt.tournament_team_id,
        tt.tournament_id,
        tt.team_id,
        tt.team_name,
        tt.participation_status,
        tt.withdrawal_status,
        t.tournament_name,
        t.status as tournament_status
      FROM t_tournament_teams tt
      LEFT JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      WHERE tt.tournament_team_id = ? AND tt.team_id = ?
    `,
      [tournamentTeamId, teamId],
    );

    if (teamResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "参加チームが見つかりません" },
        { status: 404 },
      );
    }

    const tournamentTeam = teamResult.rows[0];
    const tournamentId = Number(tournamentTeam.tournament_id);

    // 既に辞退申請済みかチェック
    if (tournamentTeam.withdrawal_status !== "active") {
      return NextResponse.json(
        { success: false, error: "既に辞退申請が行われているか、処理済みです" },
        { status: 409 },
      );
    }

    // 大会が既に完了している場合は辞退不可
    if (tournamentTeam.tournament_status === "completed") {
      return NextResponse.json(
        { success: false, error: "完了済みの大会からは辞退できません" },
        { status: 400 },
      );
    }

    // t_tournament_teamsの辞退ステータスを更新
    await db.execute(
      `
      UPDATE t_tournament_teams
      SET
        withdrawal_status = 'withdrawal_requested',
        withdrawal_reason = ?,
        withdrawal_requested_at = datetime('now', '+9 hours'),
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_team_id = ?
    `,
      [withdrawalReason, tournamentTeamId],
    );

    // メール送信処理
    try {
      // チーム担当者全員のメールアドレスを取得
      const teamMembersResult = await db.execute(
        `
        SELECT
          u.email,
          u.display_name,
          tm.member_role
        FROM m_team_members tm
        JOIN m_login_users u ON tm.login_user_id = u.login_user_id
        WHERE tm.team_id = ? AND tm.is_active = 1
        ORDER BY tm.member_role DESC, tm.created_at ASC
      `,
        [teamId],
      );

      if (teamMembersResult.rows.length > 0) {
        // 大会情報とチーム情報を取得
        const infoResult = await db.execute(
          `
          SELECT
            tt.team_name,
            t.tournament_name,
            t.tournament_dates,
            tg.group_name,
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

        if (infoResult.rows.length > 0) {
          const info = infoResult.rows[0];

          // 大会日程をフォーマット
          let tournamentDateStr = "未定";
          try {
            if (info.tournament_dates) {
              const datesData =
                typeof info.tournament_dates === "string"
                  ? JSON.parse(info.tournament_dates)
                  : info.tournament_dates;
              const dates = Object.values(datesData).filter((d) => d) as string[];
              if (dates.length > 0) {
                tournamentDateStr = dates
                  .map((d: string) =>
                    new Date(d).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    }),
                  )
                  .join("、");
              }
            }
          } catch (dateParseError) {
            console.error("Failed to parse tournament dates:", dateParseError);
          }

          // メールテンプレート取得
          const template = getWithdrawalReceivedTemplate();

          // テンプレート変数の準備
          const variables: WithdrawalEmailVariables = {
            teamName: String(info.team_name),
            tournamentName: String(info.tournament_name),
            groupName: info.group_name ? String(info.group_name) : undefined,
            categoryName: String(info.tournament_name),
            withdrawalReason: withdrawalReason,
            processedDate: new Date().toLocaleString("ja-JP", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Tokyo",
            }),
            tournamentDate: tournamentDateStr,
            venueInfo: info.venue_name ? String(info.venue_name) : undefined,
            contactEmail:
              process.env.SMTP_FROM_EMAIL ||
              process.env.SMTP_USER ||
              "taikaigo-official@taikai-go.com",
            contactPhone: undefined, // 電話番号は現在未対応
            organizationName: info.organization_name ? String(info.organization_name) : undefined,
          };

          // テンプレート処理関数
          const processTemplate = (text: string): string => {
            let processed = text;

            // 条件分岐処理
            Object.entries(variables).forEach(([key, value]) => {
              const ifElseRegex = new RegExp(
                `\\{\\{#if ${key}\\}\\}([\\s\\S]*?)\\{\\{else\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`,
                "g",
              );
              processed = processed.replace(ifElseRegex, (_match, truePart, falsePart) => {
                return value ? truePart : falsePart;
              });

              const ifRegex = new RegExp(`\\{\\{#if ${key}\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`, "g");
              processed = processed.replace(ifRegex, (_match, content) => {
                return value ? content : "";
              });
            });

            // 変数置換
            Object.entries(variables).forEach(([key, value]) => {
              const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
              processed = processed.replace(regex, value || "");
            });

            return processed;
          };

          const processedSubject = processTemplate(template.subject);
          const processedText = processTemplate(template.textBody);
          const processedHtml = processTemplate(template.htmlBody);

          // BCC送信先を準備
          const bccAddresses: string[] = [];
          const bccEmail = process.env.SMTP_BCC_EMAIL || "taikaigo-mail@taikai-go.com";
          bccAddresses.push(bccEmail);

          // 大会作成管理者のメールアドレスがあれば追加
          if (info.admin_email && String(info.admin_email) !== bccEmail) {
            bccAddresses.push(String(info.admin_email));
          }

          // 各担当者にメール送信
          for (const member of teamMembersResult.rows) {
            const memberEmail = String(member.email);

            try {
              await sendEmail({
                to: memberEmail,
                subject: processedSubject,
                text: processedText,
                html: processedHtml,
                bcc: bccAddresses,
              });

              console.log(`✅ Withdrawal notification email sent to ${memberEmail}`);

              // メール送信履歴を記録
              try {
                await db.execute(
                  `
                  INSERT INTO t_email_send_history (
                    tournament_id,
                    tournament_team_id,
                    sent_by,
                    template_id,
                    subject
                  ) VALUES (?, ?, ?, ?, ?)
                `,
                  [
                    tournamentId,
                    tournamentTeamId,
                    "system",
                    "auto_withdrawal_received",
                    processedSubject,
                  ],
                );
              } catch (historyError) {
                console.error("履歴記録失敗:", historyError);
              }
            } catch (memberEmailError) {
              console.error(`❌ Failed to send email to ${memberEmail}:`, memberEmailError);
            }
          }
        }
      } else {
        console.warn("⚠️ No team members found, skipping email notification");
      }
    } catch (emailError) {
      console.error("❌ Email sending process failed:", emailError);
      // メール送信失敗はメイン処理に影響させない
    }

    return NextResponse.json({
      success: true,
      message:
        "辞退申請を受け付けました。管理者の承認をお待ちください。確認メールをお送りしました。",
    });
  } catch (error) {
    console.error("Withdrawal request error:", error);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
