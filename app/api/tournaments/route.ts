// app/api/tournaments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { tournamentCreateSchema } from '@/lib/validations';
import { Tournament, MatchTemplate } from '@/lib/types';
import { calculateTournamentSchedule, ScheduleSettings } from '@/lib/schedule-calculator';
import { ArchiveVersionManager } from '@/lib/archive-version-manager';
import type { TournamentStatus } from '@/lib/tournament-status';

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
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

    // tournament_datesをJSONに変換
    const tournamentDatesJson = JSON.stringify(
      data.tournament_dates.reduce((acc, td) => {
        acc[td.dayNumber.toString()] = td.date;
        return acc;
      }, {} as Record<string, string>)
    );

    // 現在のアーカイブUIバージョンを取得
    const currentArchiveVersion = ArchiveVersionManager.getCurrentVersion();

    // 大会作成
    const result = await db.execute(`
      INSERT INTO t_tournaments (
        tournament_name,
        format_id,
        venue_id,
        team_count,
        court_count,
        tournament_dates,
        match_duration_minutes,
        break_duration_minutes,
        status,
        visibility,
        public_start_date,
        recruitment_start_date,
        recruitment_end_date,
        created_by,
        archive_ui_version,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      data.tournament_name,
      data.format_id,
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
      session.user.id,
      currentArchiveVersion
    ]);

    const tournamentId = result.lastInsertRowid;

    // テンプレートからマッチブロックとマッチを生成（スケジュール計算付き）
    try {
      const customSchedule = (body as { customSchedule?: Array<{ match_number: number; start_time: string; court_number: number; }> }).customSchedule || [];
      const typedCustomSchedule = customSchedule as Array<{
        match_number: number;
        start_time: string;
        court_number: number;
      }> | undefined;
      
      await generateMatchesFromTemplate(Number(tournamentId), data.format_id, data.tournament_dates, {
        courtCount: data.court_count,
        matchDurationMinutes: data.match_duration_minutes,
        breakDurationMinutes: data.break_duration_minutes,
        startTime: '09:00',
        tournamentDates: data.tournament_dates
      }, typedCustomSchedule);
      
      // Match generation completed for tournament
    } catch (matchError) {
      console.error('マッチ生成エラー（大会作成は継続）:', matchError);
      // マッチ生成に失敗しても大会作成は成功とする
    }

    // 作成された大会の詳細を取得
    const tournamentResult = await db.execute(`
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
        t.archive_ui_version,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [Number(tournamentId)]);

    const row = tournamentResult.rows[0];
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
      message: '大会が正常に作成されました'
    });

  } catch (error) {
    console.error('大会作成エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '大会の作成に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const isPublic = searchParams.get('public');
    const limit = searchParams.get('limit');

    let query = `
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
        t.archive_ui_version,
        t.group_id,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
    `;

    const params: (string | number)[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }

    if (isPublic !== null) {
      conditions.push('t.visibility = ?');
      params.push(isPublic === 'true' ? 'open' : 'preparing');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.created_at DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(parseInt(limit));
    }

    const result = await db.execute(query, params);
    const tournaments = result.rows.map(row => ({
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
      group_id: row.group_id ? Number(row.group_id) : null,
      visibility: row.visibility === 'open' ? 1 : 0,
      public_start_date: row.public_start_date as string,
      recruitment_start_date: row.recruitment_start_date as string,
      recruitment_end_date: row.recruitment_end_date as string,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      venue_name: row.venue_name as string,
      format_name: row.format_name as string
    })) as Tournament[];

    return NextResponse.json({
      success: true,
      data: tournaments
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

// テンプレートからマッチブロックとマッチを生成する関数
async function generateMatchesFromTemplate(
  tournamentId: number, 
  formatId: number, 
  tournamentDates: Array<{ dayNumber: number; date: string }>,
  scheduleSettings?: ScheduleSettings,
  customSchedule?: Array<{
    match_number: number;
    start_time: string;
    court_number: number;
  }>
) {
  try {
    // フォーマットIDに対応するテンプレートを取得
    const templatesResult = await db.execute(`
      SELECT 
        template_id, format_id, match_number, match_code, match_type, 
        phase, round_name, block_name, team1_source, team2_source, 
        team1_display_name, team2_display_name, day_number, 
        execution_priority, court_number, suggested_start_time, 
        period_count, created_at, updated_at
      FROM m_match_templates 
      WHERE format_id = ? 
      ORDER BY execution_priority ASC
    `, [formatId]);
    
    const templates = templatesResult.rows.map(row => ({
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
      court_number: row.court_number ? Number(row.court_number) : undefined,
      suggested_start_time: row.suggested_start_time as string | undefined,
      period_count: row.period_count ? Number(row.period_count) : undefined,
      created_at: String(row.created_at)
    }));
    if (templates.length === 0) {
      console.warn(`フォーマットID ${formatId} のテンプレートが見つかりません`);
      return;
    }

    // 日程マッピングを作成
    const dateMapping = tournamentDates.reduce((acc, td) => {
      acc[td.dayNumber] = td.date;
      return acc;
    }, {} as Record<number, string>);

    // 順位管理単位としてのブロックを作成
    // 1. 予選ブロック（A, B, C, D など）
    // 2. 決勝トーナメント（1つのブロック）
    const blockIdMapping = new Map<string, number>();
    let blockOrder = 0;

    // 予選ブロックを抽出・作成
    const preliminaryBlocks = new Set<string>();
    templates.forEach(template => {
      if (template.phase === 'preliminary' && template.block_name) {
        preliminaryBlocks.add(template.block_name);
      }
    });

    // 予選ブロック毎にt_match_blocksに登録
    for (const blockName of Array.from(preliminaryBlocks).sort()) {
      const blockResult = await db.execute(`
        INSERT INTO t_match_blocks (
          tournament_id,
          phase,
          display_round_name,
          block_name,
          match_type,
          block_order
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        tournamentId,
        'preliminary',
        `予選${blockName}ブロック`,
        blockName,
        '通常',
        blockOrder++
      ]);

      const blockId = Number(blockResult.lastInsertRowid);
      blockIdMapping.set(`preliminary_${blockName}`, blockId);
    }

    // 決勝ブロックを抽出・作成（round_nameまたはblock_nameでグループ化）
    const finalBlocks = new Map<string, string>(); // key: ユニークキー, value: 表示名
    templates.forEach(template => {
      if (template.phase === 'final') {
        // round_nameを優先、なければblock_name、どちらもなければデフォルト
        const displayName = template.round_name || template.block_name || '決勝トーナメント';
        const blockKey = template.block_name || displayName;
        finalBlocks.set(blockKey, displayName);
      }
    });

    // 決勝ブロック毎にt_match_blocksに登録
    for (const [blockKey, displayName] of Array.from(finalBlocks.entries()).sort()) {
      const finalBlockResult = await db.execute(`
        INSERT INTO t_match_blocks (
          tournament_id,
          phase,
          display_round_name,
          block_name,
          match_type,
          block_order
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        tournamentId,
        'final',
        displayName,
        blockKey,
        '通常',
        blockOrder++
      ]);

      const finalBlockId = Number(finalBlockResult.lastInsertRowid);
      blockIdMapping.set(`final_${blockKey}`, finalBlockId);
    }

    // スケジュール情報の準備
    const scheduleMap = new Map<number, { courtNumber: number; startTime: string }>();
    
    if (customSchedule && customSchedule.length > 0) {
      // カスタムスケジュールが指定されている場合はそれを使用
      customSchedule.forEach(custom => {
        scheduleMap.set(custom.match_number, {
          courtNumber: custom.court_number,
          startTime: custom.start_time
        });
      });
      // Custom schedule applied to matches
    } else if (scheduleSettings) {
      // カスタムスケジュールがない場合は計算を実行
      try {
        const templateModels: MatchTemplate[] = templates.map(template => ({
          template_id: template.template_id,
          format_id: template.format_id,
          match_number: template.match_number,
          match_code: template.match_code,
          match_type: template.match_type,
          phase: template.phase,
          round_name: template.round_name,
          block_name: template.block_name,
          team1_source: template.team1_source,
          team2_source: template.team2_source,
          team1_display_name: template.team1_display_name,
          team2_display_name: template.team2_display_name,
          day_number: template.day_number,
          execution_priority: template.execution_priority,
          created_at: template.created_at
        }));

        const schedule = calculateTournamentSchedule(templateModels, scheduleSettings);
        
        // スケジュール計算結果をマップに保存
        schedule.days.forEach(day => {
          day.matches.forEach(match => {
            scheduleMap.set(match.template.match_number, {
              courtNumber: match.courtNumber,
              startTime: match.startTime
            });
          });
        });

        // Schedule calculation completed
      } catch (scheduleError) {
        console.error('スケジュール計算エラー:', scheduleError);
        // スケジュール計算に失敗してもマッチ作成は継続
      }
    }

    // マッチを作成
    for (const template of templates) {
      // 新しいブロック構造に合わせてブロックIDを取得
      let blockId: number | undefined;

      if (template.phase === 'preliminary') {
        blockId = blockIdMapping.get(`preliminary_${template.block_name}`);
      } else if (template.phase === 'final') {
        // block_nameを使ってブロックIDを取得（round_nameまたはblock_nameでグループ化されたブロック）
        const blockKey = template.block_name || (template.round_name || '決勝トーナメント');
        blockId = blockIdMapping.get(`final_${blockKey}`);
      }

      if (!blockId) {
        console.error(`ブロックID が見つかりません: ${template.phase}_${template.block_name}`);
        continue;
      }

      // テンプレートの day_number に対応する実際の日付を取得
      const tournamentDate = dateMapping[template.day_number];
      if (!tournamentDate) {
        console.warn(`day_number ${template.day_number} に対応する日付が見つかりません`);
        continue;
      }

      // スケジュール計算結果からコート番号と開始時刻を取得
      const scheduleInfo = scheduleMap.get(template.match_number);
      const courtNumber = scheduleInfo?.courtNumber || null;
      const startTime = scheduleInfo?.startTime || null;

      // テンプレートのperiod_count設定を取得（未設定の場合は1）
      const periodCount = template.period_count && Number(template.period_count) > 0 
        ? Number(template.period_count) 
        : 1;

      await db.execute(`
        INSERT INTO t_matches_live (
          match_block_id,
          tournament_date,
          match_number,
          match_code,
          team1_id,
          team2_id,
          team1_tournament_team_id,
          team2_tournament_team_id,
          team1_display_name,
          team2_display_name,
          court_number,
          start_time,
          team1_scores,
          team2_scores,
          period_count,
          winner_team_id,
          winner_tournament_team_id,
          remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        blockId,
        tournamentDate,
        template.match_number,
        template.match_code,
        template.team1_source || null, // 初期状態では未確定
        template.team2_source || null, // 初期状態では未確定
        null, // team1_tournament_team_id - 組合せ確定時に設定
        null, // team2_tournament_team_id - 組合せ確定時に設定
        template.team1_display_name,
        template.team2_display_name,
        courtNumber, // スケジュール計算結果から設定
        startTime,   // スケジュール計算結果から設定
        null, // team1_scores は初期状態でnull
        null, // team2_scores は初期状態でnull
        periodCount, // テンプレートから取得したperiod_count
        null, // winner_team_id は結果確定時に設定
        null, // winner_tournament_team_id は結果確定時に設定
        null  // remarks
      ]);
    }

    // Tournament matches and blocks generated successfully

  } catch (error) {
    console.error('マッチ生成エラー:', error);
    throw error;
  }
}