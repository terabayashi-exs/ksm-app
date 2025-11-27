// app/api/tournaments/[id]/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { z } from 'zod';

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
    // 背番号の重複チェック
    const numbers = players.filter(p => p.jersey_number !== undefined).map(p => p.jersey_number);
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
        
        // 特定チーム編集時: 複雑な削除処理はスキップし、更新ベースで対応
        // 現在のスキーマでは特定チームの選手のみを削除することが困難なため、
        // 登録時にUPSERT処理で対応する
        console.log(`Specific team edit mode: will use UPSERT approach for players`);
        
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
          WHERE tournament_id = ? AND team_id = ?
        `, [data.tournament_team_name, data.tournament_team_omission, tournamentId, teamId]);
        
        // 既存の参加選手をすべて削除
        await db.execute(`
          DELETE FROM t_tournament_players 
          WHERE tournament_id = ? AND team_id = ?
        `, [tournamentId, teamId]);
        
        console.log('Updated team names and deleted existing tournament players for edit mode');
      }
    } else {
      // 新規参加の場合はチーム参加登録
      const joinResult = await db.execute(`
        INSERT INTO t_tournament_teams (
          tournament_id,
          team_id,
          team_name,
          team_omission,
          registration_method,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'self_registered', datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [tournamentId, teamId, data.tournament_team_name, data.tournament_team_omission]);

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
              updated_at = datetime('now', '+9 hours')
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
            ) VALUES (?, ?, 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
          `, [
            player.player_name,
            teamId
          ]);
          playerId = Number(newPlayerResult.lastInsertRowid);
          console.log(`New player created with ID: ${playerId}`);
        }

        // 大会参加選手テーブルに登録（背番号は大会専用）
        console.log(`Registering player ${playerId} for tournament ${tournamentId} with jersey ${player.jersey_number || 'null'}`);
        
        // 大会参加選手テーブルに登録 - 重複エラーをハンドリング
        try {
          // playerId が undefined でないことを確認
          if (!playerId) {
            throw new Error(`Player ID is undefined for player: ${player.player_name}`);
          }

          if (specificTeamIdFromData) {
            // 特定チーム編集時: 既存レコードがあれば更新、なければ挿入
            const existingPlayerCheck = await db.execute(`
              SELECT tournament_player_id FROM t_tournament_players
              WHERE tournament_id = ? AND team_id = ? AND player_id = ?
            `, [tournamentId, teamId, playerId]);

            if (existingPlayerCheck.rows.length > 0) {
              // 既存レコードを更新
              await db.execute(`
                UPDATE t_tournament_players SET
                  jersey_number = ?,
                  player_status = 'active',
                  updated_at = datetime('now', '+9 hours')
                WHERE tournament_id = ? AND team_id = ? AND player_id = ?
              `, [
                player.jersey_number !== undefined ? player.jersey_number : null,
                tournamentId, teamId, playerId
              ]);
              console.log(`Updated existing player ${playerId} registration`);
            } else {
              // 新規挿入
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
              console.log(`Inserted new player ${playerId} registration`);
            }
          } else {
            // 通常の新規登録
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
          }
        } catch (insertError) {
          if (insertError instanceof Error && insertError.message.includes('UNIQUE constraint failed')) {
            console.log(`Player ${playerId} already registered - skipping (this is expected behavior for existing players)`);
            // 既存選手の場合は背番号のみ更新
            try {
              if (!playerId) {
                throw new Error(`Player ID is undefined for player: ${player.player_name}`);
              }
              
              await db.execute(`
                UPDATE t_tournament_players SET
                  jersey_number = ?,
                  updated_at = datetime('now', '+9 hours')
                WHERE tournament_id = ? AND team_id = ? AND player_id = ?
              `, [
                player.jersey_number !== undefined ? player.jersey_number : null,
                tournamentId, teamId, playerId
              ]);
              console.log(`Updated jersey number for existing player ${playerId}`);
            } catch (updateError) {
              console.error(`Failed to update jersey number for player ${playerId}:`, updateError);
              // この場合でもエラーとしない（選手は既に登録済み）
            }
          } else {
            throw insertError; // その他のエラーは再スロー
          }
        }
        console.log(`Player ${playerId} successfully registered for tournament`);
        
      } catch (playerError) {
        console.error(`Error processing player ${i + 1}:`, playerError);
        throw new Error(`選手 ${player.player_name} の処理中にエラーが発生しました: ${playerError instanceof Error ? playerError.message : 'Unknown error'}`);
      }
    }
    
    console.log('All players processed successfully');

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