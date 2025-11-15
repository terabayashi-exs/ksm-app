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
    .max(100, 'チーム名は100文字以内で入力してください'),
  team_omission: z.string()
    .min(1, 'チーム略称は必須です')
    .max(30, 'チーム略称は30文字以内で入力してください'),
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
    .max(100, '大会参加チーム名は100文字以内で入力してください'),
  tournament_team_omission: z.string()
    .min(1, '大会参加チーム略称は必須です')
    .max(30, '大会参加チーム略称は30文字以内で入力してください'),
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

    // 大会の参加チーム一覧を取得（選手情報含む）
    const teamsResult = await db.execute(`
      SELECT
        tt.tournament_team_id,
        tt.team_id,
        tt.tournament_id,
        tt.team_name,
        tt.team_omission,
        tt.withdrawal_status,
        tt.registration_method,
        tt.created_at as joined_at,
        m.contact_person,
        m.contact_email,
        m.contact_phone,
        m.team_name as master_team_name,
        COUNT(tp.tournament_player_id) as player_count
      FROM t_tournament_teams tt
      INNER JOIN m_teams m ON tt.team_id = m.team_id
      LEFT JOIN t_tournament_players tp ON (tt.tournament_id = tp.tournament_id AND tt.team_id = tp.team_id)
      WHERE tt.tournament_id = ?
      GROUP BY
        tt.tournament_team_id,
        tt.team_id,
        tt.tournament_id,
        tt.team_name,
        tt.team_omission,
        tt.withdrawal_status,
        tt.registration_method,
        tt.created_at,
        m.contact_person,
        m.contact_email,
        m.contact_phone,
        m.team_name
      ORDER BY tt.created_at ASC
    `, [tournamentId]);

    // 各チームの選手詳細情報を取得
    const teams = await Promise.all(
      teamsResult.rows.map(async (teamRow) => {
        const team = teamRow as unknown as {
          tournament_team_id: number;
          team_id: string;
          tournament_id: number;
          team_name: string;
          team_omission: string;
          withdrawal_status: string;
          registration_method: string;
          joined_at: string;
          contact_person: string;
          contact_email: string;
          contact_phone: string | null;
          master_team_name: string;
          player_count: number;
        };
        const playersResult = await db.execute(`
          SELECT 
            tp.tournament_player_id,
            mp.player_id,
            mp.player_name,
            tp.jersey_number
          FROM t_tournament_players tp
          INNER JOIN m_players mp ON tp.player_id = mp.player_id
          WHERE tp.tournament_id = ? AND tp.team_id = ?
          ORDER BY tp.jersey_number ASC, mp.player_name ASC
        `, [team.tournament_id, team.team_id]);

        return {
          tournament_team_id: team.tournament_team_id,
          team_id: team.team_id,
          team_name: team.team_name,
          team_omission: team.team_omission,
          master_team_name: team.master_team_name,
          contact_person: team.contact_person,
          contact_email: team.contact_email,
          contact_phone: team.contact_phone,
          registration_type: team.registration_method || 'self_registered',
          withdrawal_status: team.withdrawal_status || 'active',
          joined_at: team.joined_at,
          player_count: team.player_count || 0,
          players: playersResult.rows.map((playerRow) => {
            const player = playerRow as unknown as {
              tournament_player_id: number;
              player_id: string;
              player_name: string;
              jersey_number: number | null;
            };
            return {
              tournament_player_id: player.tournament_player_id,
              player_id: player.player_id,
              player_name: player.player_name,
              jersey_number: player.jersey_number,
              position: null // positionカラムは存在しないためnull
            };
          })
        };
      })
    );

    // 大会情報をオブジェクトとして作成
    const tournament = tournamentResult.rows[0] as unknown as {
      tournament_id: number;
      tournament_name: string;
      recruitment_start_date: string | null;
      recruitment_end_date: string | null;
      status: string;
      format_name: string | null;
      venue_name: string | null;
    };

    return NextResponse.json({
      success: true,
      data: {
        tournament: {
          tournament_id: tournament.tournament_id,
          tournament_name: tournament.tournament_name,
          format_name: tournament.format_name || '',
          venue_name: tournament.venue_name || '',
          team_count: teams.length
        },
        teams: teams
      },
      count: teams.length
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

    // 1. メールアドレスで既存マスターチームをチェック
    const existingByEmail = await db.execute(`
      SELECT team_id, team_name, team_omission FROM m_teams
      WHERE contact_email = ?
    `, [data.contact_email]);

    // 2. 異なるメールアドレスで同じチーム名・略称が存在しないかチェック
    const existingByName = await db.execute(`
      SELECT team_id, contact_email FROM m_teams
      WHERE (team_name = ? OR team_omission = ?) AND contact_email != ?
    `, [data.team_name, data.team_omission, data.contact_email]);

    if (existingByName.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: `チーム名またはチーム略称が別の組織によって既に使用されています` },
        { status: 409 }
      );
    }

    // 3. 既存マスターチームの場合、既にこの大会に参加していないかチェック
    let teamId = '';
    let isExistingMasterTeam = false;

    if (existingByEmail.rows.length > 0) {
      const existingTeam = existingByEmail.rows[0] as unknown as { team_id: string; team_name: string; team_omission: string };
      teamId = existingTeam.team_id;
      isExistingMasterTeam = true;

      // 既にこの大会に参加していないかチェック
      const alreadyJoined = await db.execute(`
        SELECT tournament_team_id FROM t_tournament_teams
        WHERE tournament_id = ? AND team_id = ?
      `, [tournamentId, teamId]);

      if (alreadyJoined.rows.length > 0) {
        return NextResponse.json(
          { success: false, error: `このチーム（${existingTeam.team_name}）は既にこの大会に参加しています` },
          { status: 409 }
        );
      }

      console.log('Using existing master team:', {
        teamId,
        teamName: existingTeam.team_name,
        contactEmail: data.contact_email
      });
    }

    // 4. 大会参加チーム名の重複チェック（同じ大会内で重複不可）
    const tournamentTeamNameCheck = await db.execute(`
      SELECT team_name, team_omission FROM t_tournament_teams
      WHERE tournament_id = ? AND (team_name = ? OR team_omission = ?)
    `, [tournamentId, data.tournament_team_name, data.tournament_team_omission]);

    if (tournamentTeamNameCheck.rows.length > 0) {
      const duplicate = tournamentTeamNameCheck.rows[0] as unknown as { team_name: string; team_omission: string };
      return NextResponse.json(
        { success: false, error: `大会参加チーム名「${duplicate.team_name}」または略称「${duplicate.team_omission}」が既にこの大会で使用されています` },
        { status: 409 }
      );
    }

    // 5. 新規マスターチームの場合のみ、チームIDを生成して作成
    if (!isExistingMasterTeam) {
      // 一意なチームIDを生成
      // より識別しやすいIDを生成するため、複数のソースから抽出
      let baseTeamId = '';

      // 1. 略称から英数字を抽出
      const omissionAlphaNum = data.team_omission.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      if (omissionAlphaNum && omissionAlphaNum.length >= 2) {
        baseTeamId = omissionAlphaNum.substring(0, 8);
      } else {
        // 2. チーム名から英数字を抽出
        const teamNameAlphaNum = data.team_name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        if (teamNameAlphaNum && teamNameAlphaNum.length >= 2) {
          baseTeamId = teamNameAlphaNum.substring(0, 8);
        } else {
          // 3. メールアドレスのユーザー名部分を使用
          const emailUser = data.contact_email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
          if (emailUser && emailUser.length >= 2) {
            baseTeamId = emailUser.substring(0, 8);
          } else {
            // 4. 最終的に"team" + ランダム文字列
            const randomSuffix = Math.random().toString(36).substring(2, 6);
            baseTeamId = `team${randomSuffix}`;
          }
        }
      }

      teamId = baseTeamId;
      let counter = 1;

      while (true) {
        const existingTeamCheck = await db.execute(`
          SELECT team_id FROM m_teams WHERE team_id = ?
        `, [teamId]);

        if (existingTeamCheck.rows.length === 0) {
          break;
        }

        // カウンターを追加して一意性を確保
        teamId = `${baseTeamId}${counter}`;
        counter++;

        // 無限ループを防ぐため、カウンターが999を超えたらランダム文字列を使用
        if (counter > 999) {
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          teamId = `team${randomSuffix}`;
          break;
        }
      }

      // パスワードハッシュ化
      const passwordHash = await bcrypt.hash(data.temporary_password, 12);

      console.log('Creating new admin proxy team registration:', {
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin_proxy', 1, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        teamId,
        data.team_name,
        data.team_omission,
        data.contact_person,
        data.contact_email,
        data.contact_phone || null,
        passwordHash
      ]);

      console.log('New master team created successfully');
    }

    // 選手をマスター選手テーブルに登録（選手がいる場合のみ）
    const playerIds: number[] = [];
    
    if (data.players.length > 0) {
      for (const player of data.players) {
        const playerResult = await db.execute(`
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
        
        playerIds.push(Number(playerResult.lastInsertRowid));
        console.log(`Created player: ${player.player_name} with ID: ${playerResult.lastInsertRowid}`);
      }
    }

    // 大会参加テーブルに登録
    const tournamentTeamResult = await db.execute(`
      INSERT INTO t_tournament_teams (
        tournament_id,
        team_id,
        team_name,
        team_omission,
        registration_method,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'admin_proxy', datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      tournamentId,
      teamId,
      data.tournament_team_name,
      data.tournament_team_omission
    ]);

    const tournamentTeamId = Number(tournamentTeamResult.lastInsertRowid);
    console.log('Tournament team registration created with ID:', tournamentTeamId);

    // 大会参加選手テーブルに登録（選手がいる場合のみ）
    if (data.players.length > 0) {
      for (let i = 0; i < data.players.length; i++) {
        const player = data.players[i];
        const playerId = playerIds[i];
        
        await db.execute(`
          INSERT INTO t_tournament_players (
            tournament_id,
            team_id,
            player_id,
            jersey_number,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
        `, [
          tournamentId,
          teamId,
          playerId,
          player.uniform_number || null
        ]);
        
        console.log(`Registered player ${playerId} for tournament with jersey ${player.uniform_number}`);
      }
    } else {
      console.log('No players to register for this team');
    }

    return NextResponse.json({
      success: true,
      message: isExistingMasterTeam
        ? '既存チームを使用して大会参加登録が完了しました'
        : '管理者代行でのチーム登録が完了しました',
      data: {
        team_id: teamId,
        team_name: data.team_name,
        tournament_team_id: tournamentTeamId,
        tournament_team_name: data.tournament_team_name,
        players_count: data.players.length,
        temporary_password: data.temporary_password,
        contact_email: data.contact_email,
        is_existing_team: isExistingMasterTeam
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