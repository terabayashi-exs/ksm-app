// app/api/teams/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { teamWithPlayersRegisterSchema } from '@/lib/validations';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // バリデーション
    const validationResult = teamWithPlayersRegisterSchema.safeParse(body);
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

    // チームIDの重複チェック
    console.log('Checking team ID:', data.team_id);
    const existingTeam = await db.execute(
      'SELECT team_id FROM m_teams WHERE team_id = ?',
      [data.team_id]
    );

    if (existingTeam.rows.length > 0) {
      console.log('Team ID already exists:', data.team_id);
      return NextResponse.json(
        { 
          success: false, 
          error: 'このチームIDは既に登録されています。別のチームIDをお選びください。',
          field: 'team_id'
        },
        { status: 409 }
      );
    }

    // メールアドレスの重複チェック
    console.log('Checking email:', data.contact_email);
    const existingEmail = await db.execute(
      'SELECT contact_email FROM m_teams WHERE contact_email = ?',
      [data.contact_email]
    );

    if (existingEmail.rows.length > 0) {
      console.log('Email already exists:', data.contact_email);
      return NextResponse.json(
        { 
          success: false, 
          error: 'このメールアドレスは既に登録されています。別のメールアドレスをご使用ください。',
          field: 'contact_email'
        },
        { status: 409 }
      );
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(data.password, 12);

    let teamInserted = false;
    
    try {
      // チーム登録
      console.log('Inserting team:', data.team_id);
      await db.execute(
        `INSERT INTO m_teams (
          team_id, 
          team_name, 
          team_omission, 
          contact_person, 
          contact_email, 
          contact_phone, 
          password_hash, 
          is_active,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
        [
          data.team_id,
          data.team_name,
          data.team_omission || null,
          data.contact_person,
          data.contact_email,
          data.contact_phone || null,
          hashedPassword
        ]
      );
      teamInserted = true;
      console.log('Team inserted successfully');

      // 選手登録
      console.log('Inserting players:', data.players.length);
      for (let i = 0; i < data.players.length; i++) {
        const player = data.players[i];
        console.log(`Inserting player ${i + 1}:`, player.player_name);
        await db.execute(
          `INSERT INTO m_players (
            player_name,
            jersey_number,
            current_team_id,
            is_active,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
          [
            player.player_name,
            player.player_number || null,
            data.team_id
          ]
        );
      }
      console.log('All players inserted successfully');

      return NextResponse.json({
        success: true,
        message: 'チーム・選手登録が完了しました',
        data: {
          team_id: data.team_id,
          team_name: data.team_name,
          contact_email: data.contact_email,
          players_count: data.players.length
        }
      });

    } catch (error) {
      // エラー時のクリーンアップ
      console.error('Registration error:', error);
      if (teamInserted) {
        try {
          console.log('Cleaning up inserted team...');
          await db.execute('DELETE FROM m_players WHERE current_team_id = ?', [data.team_id]);
          await db.execute('DELETE FROM m_teams WHERE team_id = ?', [data.team_id]);
          console.log('Cleanup completed');
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
      throw error;
    }

  } catch (error) {
    console.error('Team registration error:', error);
    
    // エラーの詳細を解析
    let errorMessage = 'チーム登録に失敗しました';
    let details = 'Unknown error';
    
    if (error instanceof Error) {
      details = error.message;
      
      // SQLiteエラーの場合
      if (error.message.includes('UNIQUE constraint failed')) {
        if (error.message.includes('team_id')) {
          errorMessage = 'このチームIDは既に使用されています';
        } else if (error.message.includes('contact_email')) {
          errorMessage = 'このメールアドレスは既に使用されています';
        } else {
          errorMessage = '重複するデータが存在します';
        }
      }
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        details: details
      },
      { status: 500 }
    );
  }
}