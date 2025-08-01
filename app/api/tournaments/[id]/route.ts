// app/api/tournaments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { tournamentCreateSchema } from '@/lib/validations';
import { Tournament, MatchTemplate } from '@/lib/types';
import { calculateTournamentSchedule, ScheduleSettings } from '@/lib/schedule-calculator';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 個別大会の取得
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    const result = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.win_points,
        t.draw_points,
        t.loss_points,
        t.walkover_winner_goals,
        t.walkover_loser_goals,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const tournament: Tournament = {
      tournament_id: Number(row.tournament_id),
      tournament_name: String(row.tournament_name),
      format_id: Number(row.format_id),
      venue_id: Number(row.venue_id),
      team_count: Number(row.team_count),
      court_count: Number(row.court_count),
      tournament_dates: row.tournament_dates as string,
      match_duration_minutes: Number(row.match_duration_minutes),
      break_duration_minutes: Number(row.break_duration_minutes),
      win_points: Number(row.win_points),
      draw_points: Number(row.draw_points),
      loss_points: Number(row.loss_points),
      walkover_winner_goals: Number(row.walkover_winner_goals),
      walkover_loser_goals: Number(row.walkover_loser_goals),
      status: row.status as 'planning' | 'ongoing' | 'completed',
      visibility: row.visibility === 'open' ? 1 : 0,
      public_start_date: row.public_start_date as string,
      recruitment_start_date: row.recruitment_start_date as string,
      recruitment_end_date: row.recruitment_end_date as string,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      venue_name: row.venue_name as string,
      format_name: row.format_name as string
    };

    return NextResponse.json({
      success: true,
      data: tournament
    });

  } catch (error) {
    console.error('大会取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '大会データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// 大会の更新
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // リクエストボディの取得と検証
    const body = await request.json();
    const validationResult = tournamentCreateSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: '入力データが不正です',
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // 大会が存在するかチェック
    const existingTournament = await db.execute(`
      SELECT tournament_id, status FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (existingTournament.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    // tournament_datesをJSONに変換
    const tournamentDatesJson = JSON.stringify(
      data.tournament_dates.reduce((acc, td) => {
        acc[td.dayNumber.toString()] = td.date;
        return acc;
      }, {} as Record<string, string>)
    );

    // 大会情報を更新
    await db.execute(`
      UPDATE t_tournaments SET
        tournament_name = ?,
        venue_id = ?,
        team_count = ?,
        court_count = ?,
        tournament_dates = ?,
        match_duration_minutes = ?,
        break_duration_minutes = ?,
        win_points = ?,
        draw_points = ?,
        loss_points = ?,
        walkover_winner_goals = ?,
        walkover_loser_goals = ?,
        visibility = ?,
        updated_at = datetime('now', 'localtime')
      WHERE tournament_id = ?
    `, [
      data.tournament_name,
      data.venue_id,
      data.team_count,
      data.court_count,
      tournamentDatesJson,
      data.match_duration_minutes,
      data.break_duration_minutes,
      data.win_points,
      data.draw_points,
      data.loss_points,
      data.walkover_winner_goals,
      data.walkover_loser_goals,
      data.is_public ? 'open' : 'preparing',
      tournamentId
    ]);

    // スケジュール再計算と更新
    try {
      const customMatches = (body as any).customMatches as Array<{
        match_id: number;
        start_time: string; 
        court_number: number;
      }> | undefined;
      
      // Custom match data received for tournament update
      
      if (customMatches && customMatches.length > 0) {
        // カスタムスケジュールが指定されている場合、それを適用
        // Applying custom schedule to matches
        await applyCustomSchedule(tournamentId, customMatches);
        // Custom schedule applied successfully
      } else {
        // カスタムスケジュールがない場合は従来通りスケジュール再計算
        await updateTournamentSchedule(tournamentId, data.format_id, data.tournament_dates, {
          courtCount: data.court_count,
          matchDurationMinutes: data.match_duration_minutes,
          breakDurationMinutes: data.break_duration_minutes,
          startTime: '09:00',
          tournamentDates: data.tournament_dates
        });
        // Schedule update completed
      }
    } catch (scheduleError) {
      console.error('スケジュール更新エラー（大会更新は継続）:', scheduleError);
      // スケジュール更新に失敗しても大会更新は成功とする
    }

    // 更新された大会の詳細を取得
    const updatedResult = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.win_points,
        t.draw_points,
        t.loss_points,
        t.walkover_winner_goals,
        t.walkover_loser_goals,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    const row = updatedResult.rows[0];
    const tournament: Tournament = {
      tournament_id: Number(row.tournament_id),
      tournament_name: String(row.tournament_name),
      format_id: Number(row.format_id),
      venue_id: Number(row.venue_id),
      team_count: Number(row.team_count),
      court_count: Number(row.court_count),
      tournament_dates: row.tournament_dates as string,
      match_duration_minutes: Number(row.match_duration_minutes),
      break_duration_minutes: Number(row.break_duration_minutes),
      win_points: Number(row.win_points),
      draw_points: Number(row.draw_points),
      loss_points: Number(row.loss_points),
      walkover_winner_goals: Number(row.walkover_winner_goals),
      walkover_loser_goals: Number(row.walkover_loser_goals),
      status: row.status as 'planning' | 'ongoing' | 'completed',
      visibility: row.visibility === 'open' ? 1 : 0,
      public_start_date: row.public_start_date as string,
      recruitment_start_date: row.recruitment_start_date as string,
      recruitment_end_date: row.recruitment_end_date as string,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      venue_name: row.venue_name as string,
      format_name: row.format_name as string
    };

    return NextResponse.json({
      success: true,
      data: tournament,
      message: '大会情報が正常に更新されました'
    });

  } catch (error) {
    console.error('大会更新エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '大会の更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// 大会の削除
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // 大会が存在するかチェック
    const existingTournament = await db.execute(`
      SELECT tournament_id, status FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (existingTournament.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    // 関連するマッチデータがある場合は削除を拒否（安全のため）
    const matchesResult = await db.execute(`
      SELECT COUNT(*) as count 
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);

    const matchCount = Number(matchesResult.rows[0]?.count) || 0;
    if (matchCount > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'この大会にはマッチデータが存在するため削除できません。先にマッチデータを削除してください。'
        },
        { status: 400 }
      );
    }

    // マッチブロックを削除
    await db.execute(`
      DELETE FROM t_match_blocks WHERE tournament_id = ?
    `, [tournamentId]);

    // 大会を削除
    await db.execute(`
      DELETE FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    return NextResponse.json({
      success: true,
      message: '大会が正常に削除されました'
    });

  } catch (error) {
    console.error('大会削除エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '大会の削除に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// カスタムスケジュールを適用する関数
async function applyCustomSchedule(
  tournamentId: number,
  customMatches: Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>
) {
  try {
    // Starting custom schedule application
    
    for (const match of customMatches) {
      await db.execute(`
        UPDATE t_matches_live 
        SET court_number = ?, start_time = ?, updated_at = datetime('now', 'localtime')
        WHERE match_id = ?
      `, [
        match.court_number,
        match.start_time,
        match.match_id
      ]);
    }

    // Custom schedule application completed
  } catch (error) {
    console.error('カスタムスケジュール適用エラー:', error);
    throw error;
  }
}

// 大会のスケジュールを更新する関数
async function updateTournamentSchedule(
  tournamentId: number,
  formatId: number,
  tournamentDates: Array<{ dayNumber: number; date: string }>,
  scheduleSettings: ScheduleSettings
) {
  try {
    // フォーマットIDに対応するテンプレートを取得
    const templatesResult = await db.execute(`
      SELECT * FROM m_match_templates 
      WHERE format_id = ? 
      ORDER BY execution_priority ASC
    `, [formatId]);
    
    const templates: MatchTemplate[] = templatesResult.rows.map(row => ({
      template_id: Number(row.template_id),
      format_id: Number(row.format_id),
      match_number: Number(row.match_number),
      match_code: String(row.match_code),
      match_type: String(row.match_type),
      phase: String(row.phase),
      round_name: row.round_name as string | undefined,
      block_name: row.block_name as string | undefined,
      team1_source: row.team1_source as string | undefined,
      team2_source: row.team2_source as string | undefined,
      team1_display_name: String(row.team1_display_name),
      team2_display_name: String(row.team2_display_name),
      day_number: Number(row.day_number),
      execution_priority: Number(row.execution_priority),
      created_at: String(row.created_at)
    }));

    if (templates.length === 0) {
      console.warn(`フォーマットID ${formatId} のテンプレートが見つかりません`);
      return;
    }

    // スケジュール計算を実行
    const schedule = calculateTournamentSchedule(templates, scheduleSettings);
    
    // スケジュール計算結果をマップに保存
    const scheduleMap = new Map<number, { courtNumber: number; startTime: string }>();
    schedule.days.forEach(day => {
      day.matches.forEach(match => {
        scheduleMap.set(match.template.match_number, {
          courtNumber: match.courtNumber,
          startTime: match.startTime
        });
      });
    });

    // Schedule calculation completed

    // 既存の試合データのコート番号と開始時刻を更新
    for (const [matchNumber, scheduleInfo] of scheduleMap.entries()) {
      await db.execute(`
        UPDATE t_matches_live 
        SET court_number = ?, start_time = ?
        WHERE match_block_id IN (
          SELECT mb.match_block_id 
          FROM t_match_blocks mb 
          WHERE mb.tournament_id = ?
        ) AND match_number = ?
      `, [
        scheduleInfo.courtNumber,
        scheduleInfo.startTime,
        tournamentId,
        matchNumber
      ]);
    }

    // Schedule updates completed for tournament

  } catch (error) {
    console.error('スケジュール更新エラー:', error);
    throw error;
  }
}