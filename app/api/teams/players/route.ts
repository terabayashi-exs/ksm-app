// app/api/teams/players/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { z } from 'zod';

// 選手更新用のスキーマ
const playersUpdateSchema = z.object({
  players: z.array(z.object({
    player_id: z.number().optional(),
    player_name: z.string()
      .min(1, '選手名は必須です')
      .max(50, '選手名は50文字以内で入力してください'),
    jersey_number: z.number()
      .int('背番号は整数で入力してください')
      .min(1, '背番号は1以上で入力してください')
      .max(99, '背番号は99以下で入力してください')
      .optional()
      .or(z.undefined()),
    is_active: z.boolean().default(true)
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
  })
});

// テスト用のGETハンドラー
export async function GET() {
  try {
    console.log('GET /api/teams/players - Test endpoint');
    return NextResponse.json({
      success: true,
      message: 'API endpoint is working'
    });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Test endpoint failed' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    console.log('PUT /api/teams/players - Request received');
    
    // 認証チェック
    const session = await auth();
    console.log('Session:', session ? { 
      role: session.user.role, 
      teamId: session.user.teamId,
      id: session.user.id 
    } : 'No session');
    
    if (!session || session.user.role !== 'team') {
      console.log('Authentication failed - no session or wrong role');
      return NextResponse.json(
        { success: false, error: 'チーム権限が必要です' },
        { status: 401 }
      );
    }

    const teamId = session.user.teamId;
    if (!teamId) {
      console.log('No team ID found in session');
      return NextResponse.json(
        { success: false, error: 'チームIDが見つかりません' },
        { status: 400 }
      );
    }
    
    console.log('Authentication successful for team:', teamId);

    const body = await request.json();
    console.log('Request body:', body);
    
    const validationResult = playersUpdateSchema.safeParse(body);
    console.log('Validation result:', validationResult.success);
    
    if (!validationResult.success) {
      console.log('Validation errors:', validationResult.error.issues);
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
    console.log('Players update request:', data);

    try {
      // 既存の選手を取得
      console.log('Fetching existing players for team:', teamId);
      const existingPlayersResult = await db.execute(`
        SELECT player_id, player_name, jersey_number 
        FROM m_players 
        WHERE current_team_id = ? AND is_active = 1
      `, [teamId]);

      const existingPlayers = existingPlayersResult.rows.map(row => ({
        player_id: Number(row.player_id),
        player_name: String(row.player_name),
        jersey_number: row.jersey_number ? Number(row.jersey_number) : null
      }));
      console.log('Existing players:', existingPlayers);

      // 更新・追加・削除処理
      const updatedPlayerIds: number[] = [];

      for (const player of data.players) {
        console.log('Processing player:', player);
        if (player.player_id) {
          // 既存選手の更新
          console.log('Updating existing player:', player.player_id);
          await db.execute(`
            UPDATE m_players SET
              player_name = ?,
              jersey_number = ?,
              updated_at = datetime('now', '+9 hours')
            WHERE player_id = ? AND current_team_id = ?
          `, [
            player.player_name,
            player.jersey_number || null,
            player.player_id,
            teamId
          ]);
          updatedPlayerIds.push(player.player_id);
        } else {
          // 新しい選手の追加
          console.log('Adding new player:', player.player_name);
          const result = await db.execute(`
            INSERT INTO m_players (
              player_name,
              jersey_number,
              current_team_id,
              is_active,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
          `, [
            player.player_name,
            player.jersey_number || null,
            teamId
          ]);
          const newPlayerId = Number(result.lastInsertRowid);
          console.log('New player added with ID:', newPlayerId);
          updatedPlayerIds.push(newPlayerId);
        }
      }

      // 削除された選手を無効化
      const playersToDeactivate = existingPlayers.filter(
        existing => !updatedPlayerIds.includes(existing.player_id)
      );
      console.log('Players to deactivate:', playersToDeactivate);

      for (const player of playersToDeactivate) {
        console.log('Deactivating player:', player.player_id);
        await db.execute(`
          UPDATE m_players SET
            is_active = 0,
            updated_at = datetime('now', '+9 hours')
          WHERE player_id = ? AND current_team_id = ?
        `, [player.player_id, teamId]);
      }

      console.log('Players update completed successfully');
      return NextResponse.json({
        success: true,
        message: '選手情報が正常に更新されました',
        data: {
          updated_count: data.players.length,
          deactivated_count: playersToDeactivate.length
        }
      });

    } catch (error) {
      console.error('Players update operation error:', error);
      throw error;
    }

  } catch (error) {
    console.error('Players update error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '選手情報の更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}