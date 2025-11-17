// app/api/tournaments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { tournamentCreateSchema } from '@/lib/validations';
import { Tournament, MatchTemplate } from '@/lib/types';
import { calculateTournamentSchedule, ScheduleSettings } from '@/lib/schedule-calculator';
import type { TournamentStatus } from '@/lib/tournament-status';

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
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.sport_type_id,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name,
        f.preliminary_format_type,
        f.final_format_type
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
      status: row.status as TournamentStatus,
      visibility: row.visibility === 'open' ? 1 : 0,
      public_start_date: row.public_start_date as string,
      recruitment_start_date: row.recruitment_start_date as string,
      recruitment_end_date: row.recruitment_end_date as string,
      sport_type_id: row.sport_type_id ? Number(row.sport_type_id) : undefined,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      venue_name: row.venue_name as string,
      format_name: row.format_name as string,
      preliminary_format_type: row.preliminary_format_type as string | undefined,
      final_format_type: row.final_format_type as string | undefined
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
    console.log('[TOURNAMENT_EDIT] 受信データ:', {
      tournamentId,
      bodyKeys: Object.keys(body),
      tournament_name: body.tournament_name,
      format_id: body.format_id,
      venue_id: body.venue_id,
      is_public: body.is_public,
      tournament_dates: body.tournament_dates
    });
    
    const validationResult = tournamentCreateSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('[TOURNAMENT_EDIT] バリデーションエラー:', {
        tournamentId,
        errors: validationResult.error.issues,
        receivedData: body
      });
      
      return NextResponse.json(
        { 
          success: false, 
          error: '入力データが不正です',
          details: validationResult.error.issues,
          message: `バリデーションエラー: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`
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
        visibility = ?,
        public_start_date = ?,
        recruitment_start_date = ?,
        recruitment_end_date = ?,
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
      data.is_public ? 'open' : 'preparing',
      data.public_start_date,
      data.recruitment_start_date,
      data.recruitment_end_date,
      tournamentId
    ]);

    // スケジュール再計算と更新
    try {
      const customMatches = (body as { customMatches?: Array<{ match_id: number; start_time: string; court_number: number; }> }).customMatches || [];
      const typedCustomMatches = customMatches as Array<{
        match_id: number;
        start_time: string; 
        court_number: number;
      }> | undefined;
      
      // Custom match data received for tournament update
      
      if (typedCustomMatches && typedCustomMatches.length > 0) {
        // カスタムスケジュールが指定されている場合、それを適用
        // Applying custom schedule to matches
        await applyCustomSchedule(tournamentId, typedCustomMatches);
        // Custom schedule applied successfully
      } else {
        // カスタムスケジュールがない場合でも既存の試合時間を保持する
        console.log('[TOURNAMENT_EDIT] カスタムスケジュールなし - 既存の試合時間を保持');
        // スケジュール再計算をスキップして既存データを維持
        // 必要に応じて、コート数や時間設定のみを更新
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
      status: row.status as TournamentStatus,
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

    // 大会削除処理：正しい順序で依存データを削除
    console.log(`大会削除開始 (ID: ${tournamentId})`);
    
    try {
      // Step 1: 試合関連データを削除（match_block_idへの依存）
      console.log('Step 1: 試合関連データ削除中...');
      
      // t_match_status から削除（テーブルが存在する場合のみ）
      try {
        await db.execute(`
          DELETE FROM t_match_status 
          WHERE match_block_id IN (
            SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
          )
        `, [tournamentId]);
        console.log('✓ t_match_status削除完了');
      } catch {
        console.log('t_match_status テーブルが存在しないか、データがありません');
      }
      
      // t_matches_final から削除（テーブルが存在する場合のみ）
      try {
        await db.execute(`
          DELETE FROM t_matches_final 
          WHERE match_block_id IN (
            SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
          )
        `, [tournamentId]);
        console.log('✓ t_matches_final削除完了');
      } catch {
        console.log('t_matches_final テーブルが存在しないか、データがありません');
      }
      
      // t_matches_live から削除
      try {
        await db.execute(`
          DELETE FROM t_matches_live 
          WHERE match_block_id IN (
            SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
          )
        `, [tournamentId]);
        console.log('✓ t_matches_live削除完了');
      } catch (err) {
        console.log('t_matches_live削除エラー:', err);
        // t_matches_liveは重要なので、エラーの場合は処理を続行しない
        throw err;
      }

      // t_match_status から削除（match_block_id外部キー制約のため）
      try {
        await db.execute(`
          DELETE FROM t_match_status 
          WHERE match_block_id IN (
            SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
          )
        `, [tournamentId]);
        console.log('✓ t_match_status削除完了');
      } catch (err) {
        console.log('t_match_status削除エラー:', err);
        // このテーブルは外部キー制約があるため重要
        throw err;
      }

      // Step 2: 大会直接依存データを削除（tournament_idへの依存）
      console.log('Step 2: 大会関連データ削除中...');
      
      // t_tournament_notifications から削除
      try {
        await db.execute(`
          DELETE FROM t_tournament_notifications WHERE tournament_id = ?
        `, [tournamentId]);
        console.log('✓ t_tournament_notifications削除完了');
      } catch (err) {
        console.log('t_tournament_notifications削除エラー（テーブルが存在しない可能性）:', err);
      }
      
      // t_tournament_rules から削除
      try {
        await db.execute(`
          DELETE FROM t_tournament_rules WHERE tournament_id = ?
        `, [tournamentId]);
        console.log('✓ t_tournament_rules削除完了');
      } catch (err) {
        console.log('t_tournament_rules削除エラー（テーブルが存在しない可能性）:', err);
      }
      
      // t_tournament_players から削除  
      await db.execute(`
        DELETE FROM t_tournament_players WHERE tournament_id = ?
      `, [tournamentId]);
      console.log('✓ t_tournament_players削除完了');
      
      // t_tournament_teams から削除
      await db.execute(`
        DELETE FROM t_tournament_teams WHERE tournament_id = ?
      `, [tournamentId]);
      console.log('✓ t_tournament_teams削除完了');

      // Step 3: マッチブロックを削除（依存が解消された後）
      console.log('Step 3: マッチブロック削除中...');
      await db.execute(`
        DELETE FROM t_match_blocks WHERE tournament_id = ?
      `, [tournamentId]);

      // Step 4: 大会本体を削除
      console.log('Step 4: 大会本体削除中...');
      await db.execute(`
        DELETE FROM t_tournaments WHERE tournament_id = ?
      `, [tournamentId]);
      
      console.log('大会削除完了');
      
    } catch (deleteError) {
      console.error('大会削除処理中にエラーが発生:', deleteError);
      throw new Error(`大会削除に失敗しました: ${deleteError instanceof Error ? deleteError.message : 'Unknown error'}`);
    }

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

// 大会のスケジュールを更新する関数（現在は未使用）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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