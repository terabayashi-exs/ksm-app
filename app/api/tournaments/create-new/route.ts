import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "管理者権限が必要です" },
        { status: 401 }
      );
    }

    const data = await request.json();
    const {
      tournament_name,
      format_id,
      venue_id,
      team_count,
      court_count,
      tournament_dates,
      match_duration_minutes,
      break_duration_minutes,
      start_time,
      win_points = 3,
      draw_points = 1,
      loss_points = 0,
      walkover_winner_goals = 3,
      walkover_loser_goals = 0,
      is_public,
      public_start_date,
      recruitment_start_date,
      recruitment_end_date,
      event_start_date,
      custom_schedule = []
    } = data;

    // 入力値の基本バリデーション
    if (!tournament_name || !format_id || !venue_id || !team_count || !court_count) {
      return NextResponse.json(
        { success: false, error: "必須項目が不足しています" },
        { status: 400 }
      );
    }

    // 大会を作成 - 既存APIと同じフィールド構造を使用
    const tournamentResult = await db.execute(`
      INSERT INTO t_tournaments (
        tournament_name,
        format_id,
        venue_id,
        team_count,
        court_count,
        tournament_dates,
        match_duration_minutes,
        break_duration_minutes,
        win_points,
        draw_points,
        loss_points,
        walkover_winner_goals,
        walkover_loser_goals,
        status,
        visibility,
        public_start_date,
        recruitment_start_date,
        recruitment_end_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning', ?, ?, ?, ?)
    `, [
      tournament_name,
      format_id,
      venue_id,
      team_count,
      court_count,
      tournament_dates,
      match_duration_minutes,
      break_duration_minutes,
      win_points,
      draw_points,
      loss_points,
      walkover_winner_goals,
      walkover_loser_goals,
      is_public ? 'open' : 'preparing',
      public_start_date,
      recruitment_start_date,
      recruitment_end_date
    ]);

    const tournamentId = tournamentResult.lastInsertRowid;

    if (!tournamentId) {
      return NextResponse.json(
        { success: false, error: "大会作成に失敗しました" },
        { status: 500 }
      );
    }

    // 選択されたフォーマットの試合テンプレートを取得
    const templatesResult = await db.execute(`
      SELECT 
        template_id,
        match_number,
        match_code,
        match_type,
        phase,
        round_name,
        block_name,
        team1_source,
        team2_source,
        team1_display_name,
        team2_display_name,
        day_number,
        execution_priority,
        court_number,
        suggested_start_time
      FROM m_match_templates 
      WHERE format_id = ? 
      ORDER BY match_number
    `, [format_id]);

    if (templatesResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "選択されたフォーマットのテンプレートが見つかりません" },
        { status: 400 }
      );
    }

    // ブロック情報の作成とIDマップ
    const blockMap = new Map<string, number>();
    const uniqueBlocks = new Set<string>();

    // 全テンプレートからブロック情報を収集
    templatesResult.rows.forEach(template => {
      const blockKey = `${template.phase}_${template.block_name || 'default'}`;
      uniqueBlocks.add(blockKey);
    });

    // ブロックテーブルに登録
    for (const blockKey of uniqueBlocks) {
      const [phase, blockName] = blockKey.split('_');
      const displayName = blockName === 'default' ? phase : blockName;
      
      const blockResult = await db.execute(`
        INSERT INTO t_match_blocks (
          tournament_id,
          phase,
          display_round_name,
          block_name,
          match_type,
          block_order,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, '通常', 0, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [tournamentId, phase, phase, displayName]);
      
      blockMap.set(blockKey, Number(blockResult.lastInsertRowid));
    }

    // 試合スケジュールの生成
    console.log(`🎯 ${templatesResult.rows.length}個のテンプレートから試合を生成中...`);
    
    // 日程を解析
    let tournamentDatesObj: Record<string, string>;
    try {
      if (typeof tournament_dates === 'string') {
        tournamentDatesObj = JSON.parse(tournament_dates);
      } else if (Array.isArray(tournament_dates)) {
        // 新形式の日程データを変換
        tournamentDatesObj = {};
        tournament_dates.forEach((dateInfo: { dayNumber: number; date: string }) => {
          tournamentDatesObj[dateInfo.dayNumber.toString()] = dateInfo.date;
        });
      } else {
        tournamentDatesObj = { "1": event_start_date };
      }
    } catch {
      tournamentDatesObj = { "1": event_start_date };
    }

    // カスタムスケジュールのマップを作成
    const customScheduleMap = new Map<number, { start_time: string; court_number: number }>();
    if (Array.isArray(custom_schedule)) {
      custom_schedule.forEach((customMatch: { match_id: number; match_code: string; start_time: string; court_number: number }) => {
        customScheduleMap.set(customMatch.match_id, {
          start_time: customMatch.start_time,
          court_number: customMatch.court_number
        });
      });
    }

    // コート別の終了時刻を管理
    const courtEndTimes: Record<number, string> = {};
    for (let i = 1; i <= court_count; i++) {
      courtEndTimes[i] = start_time;
    }

    // 試合作成
    let matchesCreated = 0;
    
    for (const template of templatesResult.rows) {
      const blockKey = `${template.phase}_${template.block_name || 'default'}`;
      const matchBlockId = blockMap.get(blockKey);
      
      if (!matchBlockId) {
        console.error(`ブロックID が見つかりません: ${blockKey}`);
        continue;
      }

      // 時間とコートの決定ロジック
      let assignedCourt: number;
      let assignedStartTime: string;

      // 1. カスタムスケジュール（スケジュールプレビューからの手動調整）を最優先
      const customMatch = customScheduleMap.get(Number(template.match_number));
      if (customMatch) {
        assignedCourt = customMatch.court_number;
        assignedStartTime = customMatch.start_time;
      } 
      // 2. テンプレートのsuggested_start_timeを優先（時間指定がある場合）
      else if (template.suggested_start_time) {
        assignedStartTime = String(template.suggested_start_time);
        // コート番号もテンプレート指定があれば使用、なければ自動割り当て
        if (template.court_number && Number(template.court_number) > 0) {
          assignedCourt = Number(template.court_number);
        } else {
          // 最も早く空くコートを選択
          let earliestCourt = 1;
          let earliestTime = courtEndTimes[1] || start_time;
          
          for (let court = 2; court <= court_count; court++) {
            const courtTime = courtEndTimes[court] || start_time;
            if (courtTime < earliestTime) {
              earliestTime = courtTime;
              earliestCourt = court;
            }
          }
          assignedCourt = earliestCourt;
        }
      } 
      // 3. テンプレートのcourt_numberのみ指定の場合
      else if (template.court_number && Number(template.court_number) > 0) {
        assignedCourt = Number(template.court_number);
        assignedStartTime = courtEndTimes[assignedCourt] || start_time;
      } 
      // 4. 完全自動割り当て
      else {
        // 最も早く空くコートを選択
        let earliestCourt = 1;
        let earliestTime = courtEndTimes[1] || start_time;
        
        for (let court = 2; court <= court_count; court++) {
          const courtTime = courtEndTimes[court] || start_time;
          if (courtTime < earliestTime) {
            earliestTime = courtTime;
            earliestCourt = court;
          }
        }
        
        assignedCourt = earliestCourt;
        assignedStartTime = earliestTime;
      }

      // 試合データを作成
      const dayKey = template.day_number?.toString() || "1";
      const tournamentDate = tournamentDatesObj[dayKey] || event_start_date;

      await db.execute(`
        INSERT INTO t_matches_live (
          match_block_id,
          tournament_date,
          match_number,
          match_code,
          team1_id,
          team2_id,
          team1_display_name,
          team2_display_name,
          court_number,
          start_time,
          team1_scores,
          team2_scores,
          period_count,
          winner_team_id,
          remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [
        matchBlockId,
        tournamentDate,
        template.match_number,
        template.match_code,
        null, // team1_id - 後でチーム参加時に設定
        null, // team2_id
        template.team1_display_name,
        template.team2_display_name,
        assignedCourt,
        assignedStartTime,
        null, // team1_scores は初期状態でnull
        null, // team2_scores は初期状態でnull
        null, // winner_team_id は結果確定時に設定
        null  // remarks
      ]);

      // コート終了時刻を更新（次の試合のため）
      const endTime = addMinutesToTime(assignedStartTime, match_duration_minutes + break_duration_minutes);
      
      // テンプレートで固定時間が指定されている場合は、そのコートの時間管理を慎重に行う
      if (template.suggested_start_time) {
        // 固定時間指定の場合は、最低限の終了時刻のみ設定
        const currentCourtEndTime = courtEndTimes[assignedCourt] || start_time;
        // 時間文字列を分で比較して、より遅い時刻を選択
        const currentEndMinutes = timeToMinutes(currentCourtEndTime);
        const newEndMinutes = timeToMinutes(endTime);
        courtEndTimes[assignedCourt] = newEndMinutes > currentEndMinutes ? endTime : currentCourtEndTime;
      } else {
        // 通常の連続スケジュールの場合
        courtEndTimes[assignedCourt] = endTime;
      }

      matchesCreated++;
    }

    console.log(`✅ ${matchesCreated}個の試合を作成しました`);

    // 作成された大会情報を取得
    const createdTournament = await db.execute(`
      SELECT 
        t.*,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    return NextResponse.json({
      success: true,
      tournament: createdTournament.rows[0],
      matches_created: matchesCreated,
      message: `大会「${tournament_name}」を作成しました。${matchesCreated}個の試合スケジュールを生成しました。`
    });

  } catch (error) {
    console.error("大会作成エラー:", error);
    
    // より詳しいエラー情報を提供
    let errorMessage = "大会作成中にエラーが発生しました";
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    }
    
    return NextResponse.json(
      { success: false, error: errorMessage, details: error },
      { status: 500 }
    );
  }
}

// ヘルパー関数
function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
}

function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}