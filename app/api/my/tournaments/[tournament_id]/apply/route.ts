// app/api/my/tournaments/[tournament_id]/apply/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { sendEmail } from '@/lib/email/mailer';
import {
  generateTournamentApplicationConfirmation
} from '@/lib/email/templates';

interface RouteContext {
  params: Promise<{ tournament_id: string }>;
}

const tournamentJoinSchema = z.object({
  teamId: z.string().min(1, 'チームIDは必須です'),
  tournament_team_name: z.string()
    .min(1, '大会参加チーム名は必須です')
    .max(50, 'チーム名は50文字以内で入力してください'),
  tournament_team_omission: z.string()
    .min(1, 'チーム略称は必須です')
    .max(10, 'チーム略称は10文字以内で入力してください'),
  players: z.array(z.object({
    player_id: z.number().optional(),
    player_name: z.string()
      .min(1, '選手名は必須です')
      .max(50, '選手名は50文字以内で入力してください'),
    jersey_number: z.number()
      .min(1, '背番号は1以上で入力してください')
      .max(99, '背番号は99以下で入力してください')
      .optional(),
    is_participating: z.boolean().default(true)
  }))
  .max(20, '選手は最大20人まで登録可能です')
  .refine((players) => {
    if (players.length === 0) return true;
    const participatingPlayers = players.filter(p => p.is_participating);
    const names = participatingPlayers.map(p => p.player_name);
    const uniqueNames = new Set(names);
    return names.length === uniqueNames.size;
  }, {
    message: '同じ名前の選手が重複しています'
  })
  .refine((players) => {
    if (players.length === 0) return true;
    const participatingPlayers = players.filter(p => p.is_participating);
    const numbers = participatingPlayers.filter(p => p.jersey_number !== undefined).map(p => p.jersey_number);
    const uniqueNumbers = new Set(numbers);
    return numbers.length === uniqueNumbers.size;
  }, {
    message: '背番号が重複しています'
  }),
  isEditMode: z.boolean().optional(),
});

async function checkTeamNameDuplication(
  tournamentId: number,
  teamName: string,
  teamOmission: string,
  currentTournamentTeamId?: number
) {
  const duplicateCheck = await db.execute(`
    SELECT
      tt.tournament_team_id,
      tt.team_name,
      tt.team_omission,
      tt.team_id,
      m.team_name as master_team_name
    FROM t_tournament_teams tt
    LEFT JOIN m_teams m ON tt.team_id = m.team_id
    WHERE tt.tournament_id = ?
      AND (
        tt.team_name = ? OR tt.team_omission = ?
      )
      ${currentTournamentTeamId ? 'AND tt.tournament_team_id != ?' : ''}
  `, currentTournamentTeamId ? [tournamentId, teamName, teamOmission, currentTournamentTeamId] : [tournamentId, teamName, teamOmission]);

  if (duplicateCheck.rows.length > 0) {
    const duplicate = duplicateCheck.rows[0];
    if (duplicate.team_name === teamName) {
      return {
        isDuplicate: true,
        message: `チーム名「${teamName}」は既に使用されています（登録チーム：${duplicate.master_team_name}）`
      };
    }
    if (duplicate.team_omission === teamOmission) {
      return {
        isDuplicate: true,
        message: `チーム略称「${teamOmission}」は既に使用されています（登録チーム：${duplicate.master_team_name}）`
      };
    }
  }

  return { isDuplicate: false };
}

async function checkPlayerDuplication(
  tournamentId: number,
  playerIds: number[],
  currentTournamentTeamId?: number
) {
  if (playerIds.length === 0) return { isDuplicate: false };

  const duplicatePlayerCheck = await db.execute(`
    SELECT
      tp.tournament_team_id,
      tp.player_id,
      tp.team_id,
      m.team_name as master_team_name,
      tt.team_name as tournament_team_name,
      p.player_name
    FROM t_tournament_players tp
    LEFT JOIN m_teams m ON tp.team_id = m.team_id
    LEFT JOIN t_tournament_teams tt ON tp.tournament_id = tt.tournament_id AND tp.tournament_team_id = tt.tournament_team_id
    LEFT JOIN m_players p ON tp.player_id = p.player_id
    WHERE tp.tournament_id = ?
      AND tp.player_id IN (${playerIds.map(() => '?').join(',')})
      ${currentTournamentTeamId ? 'AND tp.tournament_team_id != ?' : ''}
  `, currentTournamentTeamId ? [tournamentId, ...playerIds, currentTournamentTeamId] : [tournamentId, ...playerIds]);

  if (duplicatePlayerCheck.rows.length > 0) {
    const duplicatePlayers = duplicatePlayerCheck.rows.map(row => ({
      playerName: row.player_name,
      teamName: row.tournament_team_name || row.master_team_name
    }));

    return {
      isDuplicate: true,
      message: `以下の選手は既に他のチームで参加登録されています：${duplicatePlayers.map(p => `${p.playerName}（${p.teamName}）`).join(', ')}`
    };
  }

  return { isDuplicate: false };
}

async function handleTournamentJoin(
  request: NextRequest,
  context: RouteContext,
  isEditMode: boolean = false
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const roles = (session.user.roles ?? []) as ("admin" | "operator" | "team")[];
    let teamIds = (session.user.teamIds ?? []) as string[];
    const isAdmin = roles.includes("admin") || roles.includes("operator");

    if (!roles.includes("team") && !isAdmin && teamIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'チーム権限が必要です' },
        { status: 401 }
      );
    }

    // teamIdsがセッションにない管理者の場合、DBから取得
    if (teamIds.length === 0 && isAdmin && session.user.loginUserId) {
      const teamsResult = await db.execute(
        `SELECT team_id FROM m_team_members WHERE login_user_id = ? AND is_active = 1`,
        [session.user.loginUserId]
      );
      teamIds = teamsResult.rows.map(r => r.team_id as string);
    }

    const resolvedParams = await context.params;

    if (!resolvedParams || !resolvedParams.tournament_id) {
      return NextResponse.json(
        { success: false, error: 'パラメータが見つかりません' },
        { status: 400 }
      );
    }

    const tournamentId = parseInt(resolvedParams.tournament_id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validationResult = tournamentJoinSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'バリデーションエラー',
          details: validationResult.error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const teamId = data.teamId;
    const editModeFromData = data.isEditMode || false;
    const actualEditMode = isEditMode || editModeFromData;

    // チーム所有権チェック（管理者はスキップ）
    if (!isAdmin && !teamIds.includes(teamId)) {
      return NextResponse.json(
        { success: false, error: 'チームへのアクセス権限がありません' },
        { status: 403 }
      );
    }

    // 既に参加申し込みしているかチェック（編集モード時のみ）
    let existingJoinResult;
    let alreadyJoined = false;
    let currentTournamentTeamId: number | undefined;

    if (actualEditMode) {
      existingJoinResult = await db.execute(`
        SELECT tournament_team_id FROM t_tournament_teams
        WHERE tournament_id = ? AND team_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [tournamentId, teamId]);

      alreadyJoined = existingJoinResult.rows.length > 0;

      if (!alreadyJoined) {
        return NextResponse.json(
          { success: false, error: 'この大会に参加申し込みしていません' },
          { status: 404 }
        );
      }

      currentTournamentTeamId = Number(existingJoinResult.rows[0].tournament_team_id);
    }

    // チーム名・略称の重複チェック
    const teamNameCheck = await checkTeamNameDuplication(
      tournamentId,
      data.tournament_team_name,
      data.tournament_team_omission,
      currentTournamentTeamId
    );

    if (teamNameCheck.isDuplicate) {
      return NextResponse.json(
        { success: false, error: teamNameCheck.message },
        { status: 409 }
      );
    }

    // 選手の重複チェック
    const participatingPlayerIds = data.players
      .filter(p => p.player_id && p.is_participating)
      .map(p => p.player_id as number);

    if (participatingPlayerIds.length > 0) {
      const playerDuplicationCheck = await checkPlayerDuplication(
        tournamentId,
        participatingPlayerIds,
        currentTournamentTeamId
      );

      if (playerDuplicationCheck.isDuplicate) {
        return NextResponse.json(
          { success: false, error: playerDuplicationCheck.message },
          { status: 409 }
        );
      }
    }

    // 大会の存在と募集期間をチェック
    const tournamentResult = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.group_id,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.status,
        t.tournament_dates,
        t.team_count as max_teams,
        v.venue_name,
        g.group_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
      LEFT JOIN t_tournament_groups g ON t.group_id = g.group_id
      WHERE t.tournament_id = ? AND t.visibility = 'open'
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const tournament = tournamentResult.rows[0];

    // 募集期間チェック
    if (tournament.recruitment_start_date && tournament.recruitment_end_date) {
      const now = new Date();
      const startDate = new Date(String(tournament.recruitment_start_date));
      const endDate = new Date(String(tournament.recruitment_end_date));

      if (now < startDate || now > endDate) {
        return NextResponse.json(
          { success: false, error: '募集期間外です' },
          { status: 400 }
        );
      }
    }

    // 新規モードの場合は、同じteam_idでも複数エントリー可能（チーム名が異なれば登録可能）

    let tournamentTeamId: number;

    if (actualEditMode) {
      // 編集モードの場合
      tournamentTeamId = currentTournamentTeamId!;

      // チーム名・略称を更新
      await db.execute(`
        UPDATE t_tournament_teams SET
          team_name = ?,
          team_omission = ?,
          updated_at = datetime('now', '+9 hours')
        WHERE tournament_team_id = ?
      `, [data.tournament_team_name, data.tournament_team_omission, tournamentTeamId]);

      // 既存の参加選手を削除
      await db.execute(`
        DELETE FROM t_tournament_players
        WHERE tournament_id = ? AND team_id = ? AND tournament_team_id = ?
      `, [tournamentId, teamId, tournamentTeamId]);

    } else {
      // 新規参加の場合: 定員チェック
      const confirmedTeamsResult = await db.execute(`
        SELECT COUNT(*) as count
        FROM t_tournament_teams
        WHERE tournament_id = ? AND participation_status = 'confirmed'
      `, [tournamentId]);

      const confirmedCount = Number(confirmedTeamsResult.rows[0]?.count ?? 0);
      const maxTeams = tournament.max_teams ? Number(tournament.max_teams) : null;

      const participationStatus = maxTeams !== null && confirmedCount >= maxTeams
        ? 'waitlisted'
        : 'confirmed';

      // チーム登録
      const insertTeamResult = await db.execute(`
        INSERT INTO t_tournament_teams (
          tournament_id,
          team_id,
          team_name,
          team_omission,
          participation_status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        tournamentId,
        teamId,
        data.tournament_team_name,
        data.tournament_team_omission,
        participationStatus
      ]);

      tournamentTeamId = Number(insertTeamResult.lastInsertRowid);
    }

    // 選手の登録（参加する選手のみ）
    const participatingPlayers = data.players.filter(p => p.is_participating);

    for (const player of participatingPlayers) {
      let actualPlayerId = player.player_id;

      // player_idがない場合は新規選手として登録
      if (!actualPlayerId) {
        const insertPlayerResult = await db.execute(`
          INSERT INTO m_players (
            current_team_id,
            player_name,
            jersey_number,
            is_active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
        `, [teamId, player.player_name, player.jersey_number || null]);

        actualPlayerId = Number(insertPlayerResult.lastInsertRowid);
      }

      // t_tournament_playersに登録
      await db.execute(`
        INSERT INTO t_tournament_players (
          tournament_id,
          tournament_team_id,
          team_id,
          player_id,
          jersey_number,
          player_status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'active', datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [tournamentId, tournamentTeamId, teamId, actualPlayerId, player.jersey_number || null]);
    }

    // メール送信処理（参加確認メール）
    if (!actualEditMode) {
      try {
        // チーム担当者全員のメールアドレスを取得（m_team_members経由）
        const teamMembersResult = await db.execute(`
          SELECT
            u.email,
            u.display_name,
            tm.member_role
          FROM m_team_members tm
          JOIN m_login_users u ON tm.login_user_id = u.login_user_id
          WHERE tm.team_id = ? AND tm.is_active = 1
          ORDER BY tm.member_role DESC, tm.created_at ASC
        `, [teamId]);

        if (teamMembersResult.rows.length > 0) {
          // 大会日程を整形
          let tournamentDateStr = '未定';
          try {
            if (tournament.tournament_dates) {
              const datesData = typeof tournament.tournament_dates === 'string'
                ? JSON.parse(tournament.tournament_dates)
                : tournament.tournament_dates;
              const dates = Object.values(datesData).filter(d => d) as string[];
              if (dates.length > 0) {
                tournamentDateStr = dates
                  .map((d: string) => new Date(d).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  }))
                  .join('、');
              }
            }
          } catch (dateParseError) {
            console.error('Failed to parse tournament dates:', dateParseError);
          }

          // 大会詳細ページのURL
          const tournamentUrl = `${process.env.NEXTAUTH_URL}/tournaments/${tournamentId}`;

          // メールテンプレート生成
          const emailTemplate = await generateTournamentApplicationConfirmation({
            teamName: data.tournament_team_name,
            tournamentName: tournament.group_name ? String(tournament.group_name) : String(tournament.tournament_name),
            groupName: tournament.group_name ? String(tournament.group_name) : undefined,
            categoryName: String(tournament.tournament_name),
            tournamentDate: tournamentDateStr,
            venueName: tournament.venue_name ? String(tournament.venue_name) : undefined,
            contactEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'taikaigo-official@taikai-go.com',
            playerCount: participatingPlayers.length,
            tournamentUrl: tournamentUrl
          });

          // 各担当者にメール送信
          for (const member of teamMembersResult.rows) {
            const memberEmail = String(member.email);

            try {
              await sendEmail({
                to: memberEmail,
                subject: emailTemplate.subject,
                text: emailTemplate.text,
                html: emailTemplate.html,
              });

              console.log(`✅ Application confirmation email sent to ${memberEmail}`);

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
                  tournamentTeamId,
                  'system',
                  'auto_application',
                  emailTemplate.subject
                ]);
              } catch (historyError) {
                console.error('履歴記録失敗:', historyError);
              }
            } catch (memberEmailError) {
              console.error(`❌ Failed to send email to ${memberEmail}:`, memberEmailError);
            }
          }
        } else {
          console.warn('⚠️ No team members found, skipping email notification');
        }
      } catch (emailError) {
        console.error('❌ Email sending process failed:', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      message: actualEditMode ? '参加選手情報を更新しました' : '大会参加申し込みが完了しました',
      tournamentTeamId
    });

  } catch (error) {
    console.error('Tournament join error:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleTournamentJoin(request, context, false);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handleTournamentJoin(request, context, true);
}
