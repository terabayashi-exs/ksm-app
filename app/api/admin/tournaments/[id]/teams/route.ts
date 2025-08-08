// app/api/admin/tournaments/[id]/teams/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 管理者代行チーム登録用のスキーマ
const adminTeamRegistrationSchema = z.object({
  team_name: z.string()
    .min(1, 'チーム名は必須です')
    .max(50, 'チーム名は50文字以内で入力してください'),
  team_omission: z.string()
    .min(1, 'チーム略称は必須です')
    .max(10, 'チーム略称は10文字以内で入力してください'),
  contact_person: z.string()
    .min(1, '代表者名は必須です')
    .max(50, '代表者名は50文字以内で入力してください'),
  contact_email: z.string()
    .email('有効なメールアドレスを入力してください')
    .max(100, 'メールアドレスは100文字以内で入力してください'),
  contact_phone: z.string()
    .max(20, '電話番号は20文字以内で入力してください')
    .optional(),
  tournament_team_name: z.string()
    .min(1, '大会参加チーム名は必須です')
    .max(50, '大会参加チーム名は50文字以内で入力してください'),
  tournament_team_omission: z.string()
    .min(1, '大会参加チーム略称は必須です')
    .max(10, '大会参加チーム略称は10文字以内で入力してください'),
  players: z.array(z.object({
    player_name: z.string()
      .min(1, '選手名は必須です')
      .max(50, '選手名は50文字以内で入力してください'),
    uniform_number: z.number()
      .min(1, '背番号は1以上で入力してください')
      .max(99, '背番号は99以下で入力してください')
      .optional(),
    position: z.string()
      .max(10, 'ポジションは10文字以内で入力してください')
      .optional()
  }))
  .min(1, '最低1人の選手が必要です')
  .max(20, '選手は最大20人まで登録可能です')
  .refine((players) => {
    // 背番号の重複チェック（背番号が設定されている選手のみ）
    const numbers = players.filter(p => p.uniform_number !== undefined).map(p => p.uniform_number);
    const uniqueNumbers = new Set(numbers);
    return numbers.length === uniqueNumbers.size;
  }, {
    message: '背番号が重複しています'
  }),
  temporary_password: z.string()
    .min(6, '仮パスワードは6文字以上で入力してください')
    .max(20, '仮パスワードは20文字以内で入力してください')
});

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // 認証チェック（管理者権限必須）
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 大会情報を取得
    const tournamentResult = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.status,
        f.format_name,
        v.venue_name
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const tournament = tournamentResult.rows[0];

    // 参加チーム一覧を取得
    const teamsResult = await db.execute(`
      SELECT 
        tt.tournament_team_id,
        tt.tournament_id,
        tt.team_id,
        tt.team_name,
        tt.team_omission,
        tt.created_at,
        m.team_name as master_team_name,
        m.contact_person,
        m.contact_email,
        m.contact_phone,
        m.registration_type,
        (SELECT COUNT(*) FROM t_tournament_players tp WHERE tp.tournament_id = tt.tournament_id AND tp.team_id = tt.team_id AND tp.player_status = 'active') as player_count
      FROM t_tournament_teams tt
      INNER JOIN m_teams m ON tt.team_id = m.team_id
      WHERE tt.tournament_id = ?
      ORDER BY tt.created_at DESC
    `, [tournamentId]);

    const teams = teamsResult.rows.map(row => ({
      tournament_team_id: Number(row.tournament_team_id),
      tournament_id: Number(row.tournament_id),
      team_id: String(row.team_id),
      team_name: String(row.team_name),
      team_omission: String(row.team_omission),
      master_team_name: String(row.master_team_name),
      contact_person: String(row.contact_person),
      contact_email: String(row.contact_email),
      contact_phone: row.contact_phone ? String(row.contact_phone) : null,
      registration_type: String(row.registration_type),
      player_count: Number(row.player_count),
      created_at: String(row.created_at)
    }));

    return NextResponse.json({
      success: true,
      data: {
        tournament: {
          tournament_id: Number(tournament.tournament_id),
          tournament_name: String(tournament.tournament_name),
          recruitment_start_date: tournament.recruitment_start_date ? String(tournament.recruitment_start_date) : null,
          recruitment_end_date: tournament.recruitment_end_date ? String(tournament.recruitment_end_date) : null,
          status: String(tournament.status),
          format_name: tournament.format_name ? String(tournament.format_name) : null,
          venue_name: tournament.venue_name ? String(tournament.venue_name) : null
        },
        teams: teams
      }
    });

  } catch (error) {
    console.error('Admin tournament teams fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '参加チーム情報の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 管理者認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validationResult = adminTeamRegistrationSchema.safeParse(body);
    
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

    // 大会の存在チェック
    const tournamentResult = await db.execute(`
      SELECT tournament_id, tournament_name, status
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    // チーム名・略称の重複チェック（マスター・大会内両方）
    const teamNameCheck = await db.execute(`
      SELECT 'master' as source, team_name, team_omission FROM m_teams 
      WHERE team_name = ? OR team_omission = ?
      UNION
      SELECT 'tournament' as source, team_name, team_omission FROM t_tournament_teams 
      WHERE tournament_id = ? AND (team_name = ? OR team_omission = ?)
    `, [data.team_name, data.team_omission, tournamentId, data.tournament_team_name, data.tournament_team_omission]);

    if (teamNameCheck.rows.length > 0) {
      const duplicate = teamNameCheck.rows[0];
      if (duplicate.team_name === data.team_name || duplicate.team_name === data.tournament_team_name) {
        return NextResponse.json(
          { success: false, error: `チーム名が既に使用されています: ${duplicate.team_name}` },
          { status: 409 }
        );
      }
      if (duplicate.team_omission === data.team_omission || duplicate.team_omission === data.tournament_team_omission) {
        return NextResponse.json(
          { success: false, error: `チーム略称が既に使用されています: ${duplicate.team_omission}` },
          { status: 409 }
        );
      }
    }

    // メールアドレスの重複チェック
    const emailCheck = await db.execute(`
      SELECT contact_email FROM m_teams WHERE contact_email = ?
    `, [data.contact_email]);

    if (emailCheck.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'メールアドレスが既に使用されています' },
        { status: 409 }
      );
    }

    // 一意なチームIDを生成
    let teamId = data.team_omission.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    const baseTeamId = teamId;
    let counter = 1;
    
    while (true) {
      const existingTeamCheck = await db.execute(`
        SELECT team_id FROM m_teams WHERE team_id = ?
      `, [teamId]);
      
      if (existingTeamCheck.rows.length === 0) {
        break;
      }
      
      teamId = `${baseTeamId}${counter}`;
      counter++;
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(data.temporary_password, 12);

    console.log('Creating admin proxy team registration:', {
      teamId,
      teamName: data.team_name,
      contactEmail: data.contact_email,
      playersCount: data.players.length
    });

    // マスターチームテーブルに登録
    await db.execute(`
      INSERT INTO m_teams (
        team_id,
        team_name,
        team_omission,
        contact_person,
        contact_email,
        contact_phone,
        password_hash,
        registration_type,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin_proxy', 1, datetime('now'), datetime('now'))
    `, [
      teamId,
      data.team_name,
      data.team_omission,
      data.contact_person,
      data.contact_email,
      data.contact_phone || null,
      passwordHash
    ]);

    console.log('Master team created successfully');

    // 選手をマスター選手テーブルに登録
    const playerIds: number[] = [];
    
    for (const player of data.players) {
      const playerResult = await db.execute(`
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
      
      playerIds.push(Number(playerResult.lastInsertRowid));
      console.log(`Created player: ${player.player_name} with ID: ${playerResult.lastInsertRowid}`);
    }

    // 大会参加テーブルに登録
    const tournamentTeamResult = await db.execute(`
      INSERT INTO t_tournament_teams (
        tournament_id,
        team_id,
        team_name,
        team_omission,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      tournamentId,
      teamId,
      data.tournament_team_name,
      data.tournament_team_omission
    ]);

    const tournamentTeamId = Number(tournamentTeamResult.lastInsertRowid);
    console.log('Tournament team registration created with ID:', tournamentTeamId);

    // 大会参加選手テーブルに登録
    for (let i = 0; i < data.players.length; i++) {
      const player = data.players[i];
      const playerId = playerIds[i];
      
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
        player.uniform_number || null
      ]);
      
      console.log(`Registered player ${playerId} for tournament with jersey ${player.uniform_number}`);
    }

    return NextResponse.json({
      success: true,
      message: '管理者代行でのチーム登録が完了しました',
      data: {
        team_id: teamId,
        team_name: data.team_name,
        tournament_team_id: tournamentTeamId,
        tournament_team_name: data.tournament_team_name,
        players_count: data.players.length,
        temporary_password: data.temporary_password,
        contact_email: data.contact_email
      }
    });

  } catch (error) {
    console.error('Admin team registration error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '管理者代行でのチーム登録に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}