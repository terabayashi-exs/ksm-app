// app/api/tournaments/[id]/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 大会参加申し込み用のスキーマ
const tournamentJoinSchema = z.object({
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
    // 背番号の重複チェック
    const numbers = players.filter(p => p.jersey_number !== undefined).map(p => p.jersey_number);
    const uniqueNumbers = new Set(numbers);
    return numbers.length === uniqueNumbers.size;
  }, {
    message: '背番号が重複しています'
  }),
  isEditMode: z.boolean().optional() // 編集モードフラグ
});

async function handleTournamentJoin(
  request: NextRequest,
  params: RouteParams,
  isEditMode: boolean = false
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'team') {
      return NextResponse.json(
        { success: false, error: 'チーム権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);
    const teamId = session.user.teamId;

    if (isNaN(tournamentId) || !teamId) {
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
          details: validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const editModeFromData = data.isEditMode || false;
    const actualEditMode = isEditMode || editModeFromData;

    // 大会の存在と募集期間をチェック
    const tournamentResult = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        recruitment_start_date,
        recruitment_end_date,
        status
      FROM t_tournaments 
      WHERE tournament_id = ? AND visibility = 'open'
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

    if (!actualEditMode && alreadyJoined) {
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
      // 編集モードの場合は既存のチーム参加情報を取得
      tournamentTeamId = Number(existingJoinResult.rows[0].tournament_team_id);
      
      // 既存の参加選手をすべて削除
      await db.execute(`
        DELETE FROM t_tournament_players 
        WHERE tournament_id = ? AND team_id = ?
      `, [tournamentId, teamId]);
      
      console.log('Deleted existing tournament players for edit mode');
    } else {
      // 新規参加の場合はチーム参加登録
      const joinResult = await db.execute(`
        INSERT INTO t_tournament_teams (
          tournament_id,
          team_id,
          created_at,
          updated_at
        ) VALUES (?, ?, datetime('now'), datetime('now'))
      `, [tournamentId, teamId]);

      tournamentTeamId = Number(joinResult.lastInsertRowid);
    }

    // 参加選手の処理
    console.log('Processing players:', data.players.length);
    
    for (let i = 0; i < data.players.length; i++) {
      const player = data.players[i];
      let playerId = player.player_id;
      
      console.log(`Processing player ${i + 1}:`, {
        player_id: player.player_id,
        player_name: player.player_name,
        jersey_number: player.jersey_number
      });
      
      try {
        if (player.player_id) {
          // 既存選手の場合、有効フラグを更新（背番号は大会用テーブルで管理）
          console.log(`Updating existing player ${player.player_id}`);
          await db.execute(`
            UPDATE m_players SET
              is_active = 1,
              updated_at = datetime('now')
            WHERE player_id = ? AND current_team_id = ?
          `, [
            player.player_id,
            teamId
          ]);
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
            ) VALUES (?, ?, 1, datetime('now'), datetime('now'))
          `, [
            player.player_name,
            teamId
          ]);
          playerId = Number(newPlayerResult.lastInsertRowid);
          console.log(`New player created with ID: ${playerId}`);
        }

        // 大会参加選手テーブルに登録（背番号は大会専用）
        console.log(`Registering player ${playerId} for tournament ${tournamentId} with jersey ${player.jersey_number || 'null'}`);
        await db.execute(`
          INSERT INTO t_tournament_players (
            tournament_id,
            team_id,
            player_id,
            jersey_number,
            player_status,
            registration_date,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'), datetime('now'))
        `, [
          tournamentId,
          teamId,
          playerId,
          player.jersey_number || null
        ]);
        console.log(`Player ${playerId} successfully registered for tournament`);
        
      } catch (playerError) {
        console.error(`Error processing player ${i + 1}:`, playerError);
        throw new Error(`選手 ${player.player_name} の処理中にエラーが発生しました: ${playerError instanceof Error ? playerError.message : 'Unknown error'}`);
      }
    }
    
    console.log('All players processed successfully');

    return NextResponse.json({
      success: true,
      message: actualEditMode ? '参加選手の変更が完了しました' : '大会への参加申し込みが完了しました',
      data: {
        tournament_id: tournamentId,
        tournament_name: String(tournament.tournament_name),
        tournament_team_id: Number(tournamentTeamId),
        players_count: data.players.length,
        is_edit_mode: actualEditMode
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
  context: RouteParams
) {
  return handleTournamentJoin(request, context, false);
}

export async function PUT(
  request: NextRequest,
  context: RouteParams
) {
  return handleTournamentJoin(request, context, true);
}