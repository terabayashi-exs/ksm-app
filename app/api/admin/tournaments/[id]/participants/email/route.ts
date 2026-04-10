// app/api/admin/tournaments/[id]/participants/email/route.ts
// チーム代表者へのメール一括送信API

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/mailer";
import { generateCustomBroadcastEmail } from "@/lib/email/templates-broadcast";

interface EmailRequest {
  tournamentTeamIds: string[]; // tournament_team_id の配列
  title: string;
  body: string;
  tournamentName?: string;
  organizerEmail?: string; // 大会運営者メールアドレス
  preset_id?: string; // 使用したテンプレートID
}

interface TeamWithEmails {
  tournament_team_id: number;
  team_id: string;
  tournament_team_name: string;
  master_team_name: string;
  participation_status: string;
  tournament_name: string;
  group_name: string | null;
  organization_name: string | null;
  all_emails: string[];
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json({ error: "無効な大会IDです" }, { status: 400 });
    }

    // リクエストボディ取得
    const body: EmailRequest = await request.json();
    const { tournamentTeamIds, title, body: emailBody, organizerEmail } = body;

    // バリデーション
    if (!tournamentTeamIds || !Array.isArray(tournamentTeamIds) || tournamentTeamIds.length === 0) {
      return NextResponse.json({ error: "送信先チームが指定されていません" }, { status: 400 });
    }

    if (tournamentTeamIds.length > 5) {
      return NextResponse.json({ error: "一度に送信できるチーム数は5件までです" }, { status: 400 });
    }

    if (!title || !emailBody) {
      return NextResponse.json({ error: "タイトルと本文は必須です" }, { status: 400 });
    }

    // 選択されたチームの情報を取得（tournament_team_id ベース）
    const placeholders = tournamentTeamIds.map(() => "?").join(",");
    const teamsResult = await db.execute(
      `
      SELECT
        tt.tournament_team_id,
        tt.team_id,
        tt.team_name as tournament_team_name,
        m.team_name as master_team_name,
        tt.participation_status,
        t.tournament_name,
        tg.group_name,
        COALESCE(lu.display_name, lu.organization_name) as organization_name
      FROM t_tournament_teams tt
      INNER JOIN m_teams m ON tt.team_id = m.team_id
      INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
      LEFT JOIN m_login_users lu ON tg.login_user_id = lu.login_user_id
      WHERE tt.tournament_id = ? AND tt.tournament_team_id IN (${placeholders})
      `,
      [tournamentId, ...tournamentTeamIds],
    );

    if (teamsResult.rows.length === 0) {
      return NextResponse.json({ error: "指定されたチームが見つかりません" }, { status: 404 });
    }

    // 各チームのメンバーメールアドレスを取得
    const teamIds = teamsResult.rows.map((row) => row.team_id);
    const teamIdsPlaceholders = teamIds.map(() => "?").join(",");
    const teamMembersResult = await db.execute(
      `
      SELECT
        tm.team_id,
        u.email,
        u.display_name,
        tm.member_role
      FROM m_team_members tm
      JOIN m_login_users u ON tm.login_user_id = u.login_user_id
      WHERE tm.is_active = 1 AND tm.team_id IN (${teamIdsPlaceholders})
      ORDER BY tm.member_role DESC, tm.created_at ASC
    `,
      teamIds,
    );

    // team_idごとにメンバー情報をグループ化
    const membersByTeam = new Map<string, Array<{ email: string; display_name: string }>>();
    for (const row of teamMembersResult.rows) {
      const teamId = String(row.team_id);
      if (!membersByTeam.has(teamId)) {
        membersByTeam.set(teamId, []);
      }
      membersByTeam.get(teamId)!.push({
        email: String(row.email),
        display_name: String(row.display_name),
      });
    }

    // チーム情報にメンバーメールアドレスを追加
    const teamsWithEmails = teamsResult.rows.map((team): TeamWithEmails => {
      const teamId = String(team.team_id);
      const members = membersByTeam.get(teamId) || [];

      return {
        tournament_team_id: Number(team.tournament_team_id),
        team_id: String(team.team_id),
        tournament_team_name: String(team.tournament_team_name),
        master_team_name: String(team.master_team_name),
        participation_status: String(team.participation_status),
        tournament_name: String(team.tournament_name),
        group_name: team.group_name ? String(team.group_name) : null,
        organization_name: team.organization_name ? String(team.organization_name) : null,
        all_emails: members.map((m) => m.email),
      };
    });

    // 運営メールアドレス（BCC送信先）
    const bccEmail = process.env.SMTP_BCC_EMAIL || "taikaigo-mail@taikai-go.com";

    // {{teamName}} プレースホルダーが含まれているかチェック
    const hasTeamNamePlaceholder = emailBody.includes("{{teamName}}");

    if (hasTeamNamePlaceholder) {
      // チーム名プレースホルダーがある場合：チームごとに個別送信（重複除去なし）
      let successCount = 0;
      const errors: string[] = [];

      for (const team of teamsWithEmails) {
        try {
          const teamName = (team.tournament_team_name || team.master_team_name || "") as string;

          // チーム名を置換したメール本文を生成
          const personalizedBody = emailBody.replace(/\{\{teamName\}\}/g, teamName);

          const emailTemplate = generateCustomBroadcastEmail({
            title,
            body: personalizedBody,
            tournamentName: teamsWithEmails[0].tournament_name as string, // 部門名
            groupName: teamsWithEmails[0].group_name as string | undefined, // 大会名
            organizerEmail,
            organizationName: teamsWithEmails[0].organization_name as string | undefined, // 大会管理者の組織名
            tournamentId,
          });

          // チームメンバー全員にメール送信（最大2人、Toに設定）
          const recipientEmails = (team.all_emails as string[]).slice(0, 2);

          await sendEmail({
            to: recipientEmails, // 代表者全員（最大2人）をToに設定
            subject: emailTemplate.subject,
            text: emailTemplate.text,
            html: emailTemplate.html,
            bcc: [bccEmail], // BCCで運営アドレスに送信（送信記録用）
          });

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
                team.tournament_team_id,
                session.user.id,
                body.preset_id || "custom", // プリセットIDがあれば記録
                emailTemplate.subject,
              ],
            );
          } catch (historyError) {
            console.error(`履歴記録失敗 (${team.tournament_team_name}):`, historyError);
            // 履歴記録失敗してもメール送信は成功とする
          }

          successCount++;
        } catch (error) {
          console.error(`メール送信失敗 (${team.tournament_team_name}):`, error);
          errors.push(
            `${team.tournament_team_name}: ${error instanceof Error ? error.message : "不明なエラー"}`,
          );
        }
      }

      if (successCount === 0) {
        return NextResponse.json(
          { error: "すべてのメール送信に失敗しました", details: errors.join(", ") },
          { status: 500 },
        );
      }

      // 成功レスポンス（個別送信）
      return NextResponse.json({
        success: true,
        successCount,
        teamCount: teamsWithEmails.length,
        message:
          errors.length > 0
            ? `${successCount}/${teamsWithEmails.length}件のメール送信に成功しました（一部失敗: ${errors.length}件）`
            : `${successCount}件のメールを個別に送信しました`,
        errors: errors.length > 0 ? errors : undefined,
      });
    } else {
      // チーム名プレースホルダーがない場合
      const emailTemplate = generateCustomBroadcastEmail({
        title,
        body: emailBody,
        tournamentName: teamsWithEmails[0].tournament_name as string, // 部門名
        groupName: teamsWithEmails[0].group_name as string | undefined, // 大会名
        organizerEmail,
        organizationName: teamsWithEmails[0].organization_name as string | undefined, // 大会管理者の組織名
        tournamentId,
      });

      // 送信先チーム数で送信方法を分岐
      if (teamsWithEmails.length === 1) {
        // 1件のみの場合：To = チーム代表者全員（最大2人）、BCC = 運営アドレス
        const recipientEmails = (teamsWithEmails[0].all_emails as string[]).slice(0, 2);

        await sendEmail({
          to: recipientEmails, // 代表者全員（最大2人）をToに設定
          subject: emailTemplate.subject,
          text: emailTemplate.text,
          html: emailTemplate.html,
          bcc: [bccEmail],
        });
      } else {
        // 複数件の場合：To = 運営アドレス、BCC = 全チーム代表者（各チーム最大2名、重複除去）
        const allEmails: string[] = [];
        for (const team of teamsWithEmails) {
          // 各チームから最大2名の代表者を取得
          const teamEmails = (team.all_emails as string[]).slice(0, 2);
          allEmails.push(...teamEmails);
        }
        const bccAddresses = [...new Set(allEmails)].slice(0, 50); // Gmail制限対策：最大50件

        await sendEmail({
          to: bccEmail, // 運営アドレス
          subject: emailTemplate.subject,
          text: emailTemplate.text,
          html: emailTemplate.html,
          bcc: bccAddresses, // BCCで各チーム代表者に送信（重複除去済み、各チーム最大2名）
        });
      }

      // メール送信履歴を記録（BCC一括送信でも各チームに記録）
      let historySuccessCount = 0;
      for (const team of teamsWithEmails) {
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
              team.tournament_team_id,
              session.user.id,
              body.preset_id || "custom", // プリセットIDがあれば記録
              emailTemplate.subject,
            ],
          );
          historySuccessCount++;
        } catch (historyError) {
          console.error(
            `履歴記録失敗 (${team.tournament_team_name || team.master_team_name}):`,
            historyError,
          );
          // 履歴記録失敗してもメール送信は成功とする
        }
      }

      // 成功レスポンス
      const successMessage =
        teamsWithEmails.length === 1
          ? "1件のメールを送信しました"
          : `${teamsWithEmails.length}件のメールをBCCで一括送信しました`;

      console.log(
        `✅ メール送信完了: ${successMessage}、${historySuccessCount}/${teamsWithEmails.length}件の履歴記録完了`,
      );

      return NextResponse.json({
        success: true,
        successCount: teamsWithEmails.length,
        teamCount: teamsWithEmails.length,
        message: successMessage,
      });
    }
  } catch (error) {
    console.error("メール送信エラー:", error);
    return NextResponse.json(
      {
        error: "メール送信に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      },
      { status: 500 },
    );
  }
}
