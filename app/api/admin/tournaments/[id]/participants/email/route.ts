// app/api/admin/tournaments/[id]/participants/email/route.ts
// チーム代表者へのメール一括送信API

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email/mailer';
import { generateCustomBroadcastEmail } from '@/lib/email/templates-broadcast';

interface EmailRequest {
  tournamentTeamIds: string[]; // tournament_team_id の配列
  title: string;
  body: string;
  tournamentName?: string;
  organizerEmail?: string; // 大会運営者メールアドレス
  preset_id?: string; // 使用したテンプレートID
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json({ error: '無効な大会IDです' }, { status: 400 });
    }

    // リクエストボディ取得
    const body: EmailRequest = await request.json();
    const { tournamentTeamIds, title, body: emailBody, tournamentName, organizerEmail } = body;

    // バリデーション
    if (!tournamentTeamIds || !Array.isArray(tournamentTeamIds) || tournamentTeamIds.length === 0) {
      return NextResponse.json({ error: '送信先チームが指定されていません' }, { status: 400 });
    }

    if (tournamentTeamIds.length > 5) {
      return NextResponse.json({ error: '一度に送信できるチーム数は5件までです' }, { status: 400 });
    }

    if (!title || !emailBody) {
      return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 });
    }

    // 選択されたチームの情報を取得（tournament_team_id ベース）
    const placeholders = tournamentTeamIds.map(() => '?').join(',');
    const teamsResult = await db.execute(
      `
      SELECT
        tt.tournament_team_id,
        tt.team_id,
        tt.team_name as tournament_team_name,
        m.team_name as master_team_name,
        m.contact_email,
        m.contact_person,
        tt.participation_status
      FROM t_tournament_teams tt
      INNER JOIN m_teams m ON tt.team_id = m.team_id
      WHERE tt.tournament_id = ? AND tt.tournament_team_id IN (${placeholders})
      `,
      [tournamentId, ...tournamentTeamIds]
    );

    if (teamsResult.rows.length === 0) {
      return NextResponse.json({ error: '指定されたチームが見つかりません' }, { status: 404 });
    }

    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'rakusyogo-official@rakusyo-go.com';

    // {{teamName}} プレースホルダーが含まれているかチェック
    const hasTeamNamePlaceholder = emailBody.includes('{{teamName}}');

    if (hasTeamNamePlaceholder) {
      // チーム名プレースホルダーがある場合：チームごとに個別送信（重複除去なし）
      let successCount = 0;
      const errors: string[] = [];

      for (const team of teamsResult.rows) {
        try {
          const teamName = (team.tournament_team_name || team.master_team_name || '') as string;

          // チーム名を置換したメール本文を生成
          const personalizedBody = emailBody.replace(/\{\{teamName\}\}/g, teamName);

          const emailTemplate = generateCustomBroadcastEmail({
            title,
            body: personalizedBody,
            tournamentName,
            organizerEmail,
            tournamentId,
          });

          await sendEmail({
            to: fromEmail, // 自分宛（送信記録用）
            subject: emailTemplate.subject,
            text: emailTemplate.text,
            html: emailTemplate.html,
            bcc: [team.contact_email as string], // BCCで各チーム代表者に送信
          });

          // メール送信履歴を記録
          try {
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
              team.tournament_team_id,
              session.user.id,
              body.preset_id || 'custom', // プリセットIDがあれば記録
              emailTemplate.subject
            ]);
          } catch (historyError) {
            console.error(`履歴記録失敗 (${team.tournament_team_name}):`, historyError);
            // 履歴記録失敗してもメール送信は成功とする
          }

          successCount++;
        } catch (error) {
          console.error(`メール送信失敗 (${team.tournament_team_name}):`, error);
          errors.push(`${team.tournament_team_name}: ${error instanceof Error ? error.message : '不明なエラー'}`);
        }
      }

      if (successCount === 0) {
        return NextResponse.json(
          { error: 'すべてのメール送信に失敗しました', details: errors.join(', ') },
          { status: 500 }
        );
      }

      // 成功レスポンス（個別送信）
      return NextResponse.json({
        success: true,
        successCount,
        teamCount: teamsResult.rows.length,
        message: errors.length > 0
          ? `${successCount}/${teamsResult.rows.length}件のメール送信に成功しました（一部失敗: ${errors.length}件）`
          : `${successCount}件のメールを個別に送信しました`,
        errors: errors.length > 0 ? errors : undefined,
      });
    } else {
      // チーム名プレースホルダーがない場合：従来通りBCC一括送信（重複除去あり）
      const emailTemplate = generateCustomBroadcastEmail({
        title,
        body: emailBody,
        tournamentName,
        organizerEmail,
        tournamentId,
      });

      // BCC用のメールアドレスリスト作成（重複除去）
      const bccAddresses = [...new Set(
        teamsResult.rows.map((row) => row.contact_email as string)
      )];

      // メール送信
      await sendEmail({
        to: fromEmail, // 自分宛（送信記録用）
        subject: emailTemplate.subject,
        text: emailTemplate.text,
        html: emailTemplate.html,
        bcc: bccAddresses, // BCCで各チーム代表者に送信（重複除去済み）
      });

      // メール送信履歴を記録（BCC一括送信でも各チームに記録）
      let historySuccessCount = 0;
      for (const team of teamsResult.rows) {
        try {
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
            team.tournament_team_id,
            session.user.id,
            body.preset_id || 'custom', // プリセットIDがあれば記録
            emailTemplate.subject
          ]);
          historySuccessCount++;
        } catch (historyError) {
          console.error(`履歴記録失敗 (${team.tournament_team_name || team.master_team_name}):`, historyError);
          // 履歴記録失敗してもメール送信は成功とする
        }
      }

      console.log(`✅ BCC一括送信: ${bccAddresses.length}件のメール送信、${historySuccessCount}/${teamsResult.rows.length}件の履歴記録完了`);

      // 成功レスポンス（BCC一括送信）
      return NextResponse.json({
        success: true,
        successCount: bccAddresses.length,
        teamCount: teamsResult.rows.length,
        message: bccAddresses.length !== teamsResult.rows.length
          ? `${bccAddresses.length}件のメールアドレスに送信しました（${teamsResult.rows.length}チーム選択、重複除去済み）`
          : `${bccAddresses.length}件のメールを送信しました`,
      });
    }
  } catch (error) {
    console.error('メール送信エラー:', error);
    return NextResponse.json(
      {
        error: 'メール送信に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    );
  }
}
