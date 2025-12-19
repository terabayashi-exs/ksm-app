// app/api/tournaments/[id]/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { sendEmail } from '@/lib/email/mailer';
import {
  generateTournamentApplicationConfirmation
} from '@/lib/email/templates';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 大会参加申し込み用のスキーマ
const tournamentJoinSchema = z.object({
  tournament_team_name: z.string()
    .min(1, '大会参加チーム名は必須です')
    .max(50, 'チーム名は50文字以内で入力してください'),
  tournament_team_omission: z.string()
    .min(1, 'チーム略称は必須です')
    .max(10, 'チーム略称は10文字以内で入力してください'),
  players: z.array(z.object({
    player_id: z.number().optional(), // 既存選手の場合
    player_name: z.string()
      .min(1, '選手名は必須です')
      .max(50, '選手名は50文字以内で入力してください'),
    jersey_number: z.number()
      .min(1, '背番号は1以上で入力してください')
      .max(99, '背番号は99以下で入力してください')
      .optional(),
    is_participating: z.boolean().default(true) // 参加フラグ
  }))
  .min(1, '最低1人の選手が必要です')
  .max(20, '選手は最大20人まで登録可能です')
  .refine((players) => {
    // 選手名の重複チェック（参加する選手のみ）
    const participatingPlayers = players.filter(p => p.is_participating);
    const names = participatingPlayers.map(p => p.player_name);
    const uniqueNames = new Set(names);
    return names.length === uniqueNames.size;
  }, {
    message: '同じ名前の選手が重複しています'
  })
  .refine((players) => {
    // 背番号の重複チェック（参加する選手のみ）
    const participatingPlayers = players.filter(p => p.is_participating);
    const numbers = participatingPlayers.filter(p => p.jersey_number !== undefined).map(p => p.jersey_number);
    const uniqueNumbers = new Set(numbers);
    return numbers.length === uniqueNumbers.size;
  }, {
    message: '背番号が重複しています'
  }),
  isEditMode: z.boolean().optional(), // 編集モードフラグ
  isNewTeamMode: z.boolean().optional(), // 新チーム追加モードフラグ
  specificTeamId: z.number().optional() // 特定チーム編集用ID
});

// チーム名・略称の重複チェック
async function checkTeamNameDuplication(
  tournamentId: number, 
  teamName: string, 
  teamOmission: string, 
  currentTeamId?: string
) {
  // 同一大会内での重複チェック
  const duplicateCheck = await db.execute(`
    SELECT 
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
      ${currentTeamId ? 'AND tt.team_id != ?' : ''}
  `, currentTeamId ? [tournamentId, teamName, teamOmission, currentTeamId] : [tournamentId, teamName, teamOmission]);

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

// 選手の重複チェック
async function checkPlayerDuplication(
  tournamentId: number,
  playerIds: number[],
  currentTeamId?: string
) {
  if (playerIds.length === 0) return { isDuplicate: false };

  // 同一大会内での選手重複チェック
  const duplicatePlayerCheck = await db.execute(`
    SELECT 
      tp.player_id,
      tp.team_id,
      m.team_name as master_team_name,
      tt.team_name as tournament_team_name,
      p.player_name
    FROM t_tournament_players tp
    LEFT JOIN m_teams m ON tp.team_id = m.team_id
    LEFT JOIN t_tournament_teams tt ON tp.tournament_id = tt.tournament_id AND tp.team_id = tt.team_id
    LEFT JOIN m_players p ON tp.player_id = p.player_id
    WHERE tp.tournament_id = ? 
      AND tp.player_id IN (${playerIds.map(() => '?').join(',')})
      ${currentTeamId ? 'AND tp.team_id != ?' : ''}
  `, currentTeamId ? [tournamentId, ...playerIds, currentTeamId] : [tournamentId, ...playerIds]);

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
  console.log('=== Tournament Join API Called ===', {
    method: request.method,
    url: request.url,
    isEditMode,
    contextType: typeof context,
    contextKeys: context ? Object.keys(context) : 'null',
    hasParams: 'params' in context
  });
  
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'team') {
      return NextResponse.json(
        { success: false, error: 'チーム権限が必要です' },
        { status: 401 }
      );
    }

    let resolvedParams;
    try {
      console.log('About to resolve params...');
      resolvedParams = await context.params;
      console.log('Raw params received:', resolvedParams, typeof resolvedParams);
    } catch (paramError) {
      console.error('Error resolving params:', paramError);
      return NextResponse.json(
        { success: false, error: 'パラメータ解析エラー' },
        { status: 400 }
      );
    }
    
    if (!resolvedParams || !resolvedParams.id) {
      console.error('No params or id received', { resolvedParams });
      return NextResponse.json(
        { success: false, error: 'パラメータが見つかりません' },
        { status: 400 }
      );
    }
    
    const tournamentId = parseInt(resolvedParams.id, 10);
    const teamId = session.user.teamId;
    
    console.log('API Debug - Tournament Join:', {
      rawParams: resolvedParams,
      rawId: resolvedParams.id,
      rawIdType: typeof resolvedParams.id,
      parsedTournamentId: tournamentId,
      isNaN: isNaN(tournamentId),
      teamId,
      sessionUser: session.user
    });

    if (isNaN(tournamentId) || !teamId) {
      console.error('Invalid parameters:', { 
        tournamentId, 
        isNaN: isNaN(tournamentId), 
        teamId, 
        sessionUser: session.user,
        sessionRole: session.user.role 
      });
      return NextResponse.json(
        { 
          success: false, 
          error: '無効なパラメータです',
          details: process.env.NODE_ENV === 'development' ? {
            tournamentId: tournamentId,
            tournamentIdValid: !isNaN(tournamentId),
            teamId: teamId,
            hasTeamId: !!teamId,
            userRole: session.user.role,
            userId: session.user.id
          } : undefined
        },
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
    const editModeFromData = data.isEditMode || false;
    const newTeamModeFromData = data.isNewTeamMode || false;
    const specificTeamIdFromData = data.specificTeamId;
    const actualEditMode = (isEditMode || editModeFromData) && !newTeamModeFromData;

    // チーム名・略称の重複チェック
    const teamNameCheck = await checkTeamNameDuplication(
      tournamentId,
      data.tournament_team_name,
      data.tournament_team_omission,
      actualEditMode ? teamId : undefined
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
        actualEditMode ? teamId : undefined
      );

      if (playerDuplicationCheck.isDuplicate) {
        return NextResponse.json(
          { success: false, error: playerDuplicationCheck.message },
          { status: 409 }
        );
      }
    }

    // 大会の存在と募集期間をチェック（会場情報・グループ情報も取得）
    const tournamentResult = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.category_name,
        t.group_id,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.status,
        t.tournament_dates,
        t.team_count as max_teams,
        v.venue_name,
        g.group_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
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
    const now = new Date().toISOString().split('T')[0];

    if (tournament.recruitment_start_date && tournament.recruitment_end_date) {
      if (now < tournament.recruitment_start_date || now > tournament.recruitment_end_date) {
        return NextResponse.json(
          { success: false, error: '募集期間外です' },
          { status: 400 }
        );
      }
    }

    // 既に参加申し込みしているかチェック
    const existingJoinResult = await db.execute(`
      SELECT tournament_team_id FROM t_tournament_teams 
      WHERE tournament_id = ? AND team_id = ?
    `, [tournamentId, teamId]);

    const alreadyJoined = existingJoinResult.rows.length > 0;

    // 新チーム追加モードの場合は既存参加チェックをスキップ
    if (!actualEditMode && !newTeamModeFromData && alreadyJoined) {
      return NextResponse.json(
        { success: false, error: '既にこの大会に参加申し込み済みです' },
        { status: 409 }
      );
    }

    if (actualEditMode && !alreadyJoined) {
      return NextResponse.json(
        { success: false, error: 'この大会に参加申し込みしていません' },
        { status: 404 }
      );
    }

    let tournamentTeamId: number;

    if (actualEditMode) {
      // 編集モードの場合の処理
      if (specificTeamIdFromData) {
        // 特定チーム編集モード
        tournamentTeamId = specificTeamIdFromData;
        
        // チーム名・略称を更新
        await db.execute(`
          UPDATE t_tournament_teams SET
            team_name = ?,
            team_omission = ?,
            updated_at = datetime('now', '+9 hours')
          WHERE tournament_team_id = ?
        `, [data.tournament_team_name, data.tournament_team_omission, specificTeamIdFromData]);

        // 特定チーム編集時: tournament_team_idで選手を削除
        await db.execute(`
          DELETE FROM t_tournament_players
          WHERE tournament_id = ? AND team_id = ? AND tournament_team_id = ?
        `, [tournamentId, teamId, specificTeamIdFromData]);

        console.log(`Updated specific team ${specificTeamIdFromData} and deleted its players`);
      } else {
        // 従来の編集モード（最初のチームを編集）
        tournamentTeamId = Number(existingJoinResult.rows[0].tournament_team_id);

        // チーム名・略称を更新
        await db.execute(`
          UPDATE t_tournament_teams SET
            team_name = ?,
            team_omission = ?,
            updated_at = datetime('now', '+9 hours')
          WHERE tournament_team_id = ?
        `, [data.tournament_team_name, data.tournament_team_omission, tournamentTeamId]);

        // 既存の参加選手を削除（tournament_team_idで特定）
        await db.execute(`
          DELETE FROM t_tournament_players
          WHERE tournament_id = ? AND team_id = ? AND tournament_team_id = ?
        `, [tournamentId, teamId, tournamentTeamId]);

        console.log('Updated team names and deleted existing tournament players for edit mode');
      }
    } else {
      // 新規参加の場合: 定員チェックしてparticipation_statusを決定
      const confirmedTeamsResult = await db.execute(`
        SELECT COUNT(*) as count
        FROM t_tournament_teams
        WHERE tournament_id = ? AND participation_status = 'confirmed'
      `, [tournamentId]);

      const confirmedCount = Number(confirmedTeamsResult.rows[0].count);
      const maxTeams = Number(tournament.max_teams);
      const isFull = confirmedCount >= maxTeams;
      const participationStatus = isFull ? 'waitlisted' : 'confirmed';

      console.log('定員チェック:', {
        confirmedCount,
        maxTeams,
        isFull,
        participationStatus
      });

      // チーム参加登録
      const joinResult = await db.execute(`
        INSERT INTO t_tournament_teams (
          tournament_id,
          team_id,
          team_name,
          team_omission,
          participation_status,
          registration_method,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, 'self_registered', datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [tournamentId, teamId, data.tournament_team_name, data.tournament_team_omission, participationStatus]);

      tournamentTeamId = Number(joinResult.lastInsertRowid);
    }

    // 参加選手の処理
    console.log('Processing players:', data.players.length);

    // 参加する選手のみ処理
    const participatingPlayers = data.players.filter(p => p.is_participating);
    console.log('Participating players:', participatingPlayers.length);

    for (let i = 0; i < participatingPlayers.length; i++) {
      const player = participatingPlayers[i];
      let playerId = player.player_id;

      console.log(`Processing player ${i + 1}:`, {
        player_id: player.player_id,
        player_name: player.player_name,
        jersey_number: player.jersey_number
      });

      try {
        if (actualEditMode) {
          // 編集モード時: 既存選手（player_idあり）のみ処理
          if (!player.player_id) {
            throw new Error('編集モード時は既存選手のみ選択可能です');
          }

          playerId = player.player_id;

          // 選手マスターの有効フラグを更新
          await db.execute(`
            UPDATE m_players SET
              is_active = 1,
              updated_at = datetime('now', '+9 hours')
            WHERE player_id = ? AND current_team_id = ?
          `, [playerId, teamId]);

        } else {
          // 新規登録時: 既存選手または新規選手
          if (player.player_id) {
            // 既存選手の場合、有効フラグを更新
            console.log(`Updating existing player ${player.player_id}`);
            await db.execute(`
              UPDATE m_players SET
                is_active = 1,
                updated_at = datetime('now', '+9 hours')
              WHERE player_id = ? AND current_team_id = ?
            `, [player.player_id, teamId]);

            playerId = player.player_id;
          } else {
            // 新規選手の場合、選手マスターに追加
            console.log(`Creating new player: ${player.player_name}`);
            const newPlayerResult = await db.execute(`
              INSERT INTO m_players (
                player_name,
                current_team_id,
                is_active,
                created_at,
                updated_at
              ) VALUES (?, ?, 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
            `, [player.player_name, teamId]);

            playerId = Number(newPlayerResult.lastInsertRowid);
            console.log(`New player created with ID: ${playerId}`);
          }
        }

        // playerId の確認
        if (!playerId) {
          throw new Error(`Player ID is undefined for player: ${player.player_name}`);
        }

        // 大会参加選手テーブルに登録
        // 編集モード時は既に全削除済みなので、単純にINSERTするだけ
        console.log(`Registering player ${playerId} for tournament ${tournamentId} with jersey ${player.jersey_number || 'null'}`);

        await db.execute(`
          INSERT INTO t_tournament_players (
            tournament_id,
            team_id,
            player_id,
            tournament_team_id,
            jersey_number,
            player_status,
            registration_date,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, 'active', datetime('now', '+9 hours'), datetime('now', '+9 hours'), datetime('now', '+9 hours'))
        `, [
          tournamentId, teamId, playerId, tournamentTeamId,
          player.jersey_number !== undefined ? player.jersey_number : null
        ]);

        console.log(`Player ${playerId} successfully registered for tournament`);

      } catch (playerError) {
        console.error(`Error processing player ${i + 1}:`, playerError);
        throw new Error(`選手 ${player.player_name} の処理中にエラーが発生しました: ${playerError instanceof Error ? playerError.message : 'Unknown error'}`);
      }
    }

    console.log('All players processed successfully');

    // 新規参加の場合のみメール送信（編集時は送信しない）
    console.log('Email sending check:', { actualEditMode, willSendEmail: !actualEditMode });
    if (!actualEditMode) {
      try {
        // チーム代表者のメールアドレスを取得
        const teamInfoResult = await db.execute(`
          SELECT contact_email, team_name
          FROM m_teams
          WHERE team_id = ?
        `, [teamId]);

        if (teamInfoResult.rows.length > 0) {
          const teamInfo = teamInfoResult.rows[0];
          const contactEmail = String(teamInfo.contact_email);

          // 大会日程を整形
          let tournamentDateStr = '未定';
          try {
            if (tournament.tournament_dates) {
              const datesData = JSON.parse(String(tournament.tournament_dates));
              // オブジェクト形式 {"day1": "2025-01-15", "day2": "2025-01-16"} の場合
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
          const tournamentUrl = `${process.env.NEXTAUTH_URL}/public/tournaments/${tournamentId}`;

          // メールテンプレート生成（統一版）
          const emailContent = generateTournamentApplicationConfirmation({
            teamName: data.tournament_team_name,
            tournamentName: String(tournament.tournament_name),
            groupName: tournament.group_name ? String(tournament.group_name) : undefined,
            categoryName: tournament.category_name ? String(tournament.category_name) : undefined,
            tournamentDate: tournamentDateStr,
            venueName: tournament.venue_name ? String(tournament.venue_name) : undefined,
            contactEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'rakusyogo-official@rakusyo-go.com',
            playerCount: data.players.length,
            tournamentUrl: tournamentUrl
          });

          // メール送信
          await sendEmail({
            to: contactEmail,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html
          });

          console.log(`✅ Application confirmation email sent to ${contactEmail}`);

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
              'system', // 自動送信
              'auto_application', // 自動申請受付メール
              emailContent.subject
            ]);
          } catch (historyError) {
            console.error('履歴記録失敗:', historyError);
            // 履歴記録失敗してもメール送信は成功とする
          }
        } else {
          console.warn('⚠️ Team contact email not found, skipping email notification');
        }
      } catch (emailError) {
        // メール送信エラーは処理を中断せずにログのみ出力
        console.error('❌ Failed to send confirmation email:', emailError);
        // エラーが発生してもユーザーには成功として返す（メールは補助的な機能）
      }
    }

    return NextResponse.json({
      success: true,
      message: actualEditMode
        ? '参加選手の変更が完了しました'
        : newTeamModeFromData
        ? '追加チームでの参加申し込みが完了しました'
        : '大会への参加申し込みが完了しました',
      data: {
        tournament_id: tournamentId,
        tournament_name: String(tournament.tournament_name),
        tournament_team_id: Number(tournamentTeamId),
        tournament_team_name: data.tournament_team_name,
        tournament_team_omission: data.tournament_team_omission,
        players_count: data.players.length,
        is_edit_mode: actualEditMode,
        is_new_team_mode: newTeamModeFromData
      }
    });

  } catch (error) {
    console.error('Tournament join error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '大会参加申し込みに失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  return handleTournamentJoin(request, context, false);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  return handleTournamentJoin(request, context, true);
}