// lib/schedule-calculator.ts
import { MatchTemplate, TournamentDate } from '@/lib/types';

export interface ScheduleMatch {
  template: MatchTemplate;
  date: string;
  startTime: string;
  endTime: string;
  courtNumber: number;
  timeSlot: number;
}

export interface DaySchedule {
  date: string;
  dayNumber: number;
  matches: ScheduleMatch[];
  totalDuration: string;
  requiredCourts: number;
  timeSlots: number;
}

export interface TournamentSchedule {
  days: DaySchedule[];
  totalMatches: number;
  totalDuration: string;
  warnings: string[];
  feasible: boolean;
  timeConflicts: TimeConflict[];
  customCourtAssignment?: CustomCourtAssignment; // カスタムコート割り当て
}

export interface TimeConflict {
  team: string;
  conflicts: {
    match1: ScheduleMatch;
    match2: ScheduleMatch;
    description: string;
  }[];
}

export interface CustomCourtAssignment {
  blockAssignments?: Record<string, number>; // "A" → 3, "B" → 4
  matchAssignments?: Record<number, number>;  // 25 → 4, 26 → 7 (決勝戦用)
}

export interface ScheduleSettings {
  courtCount: number;
  availableCourts?: number[]; // 使用するコート番号のリスト
  matchDurationMinutes: number;
  breakDurationMinutes: number;
  startTime: string; // HH:MM format
  tournamentDates: TournamentDate[];
}

export function calculateTournamentSchedule(
  templates: MatchTemplate[],
  settings: ScheduleSettings,
  customAssignment?: CustomCourtAssignment
): TournamentSchedule {
  const warnings: string[] = [];
  let feasible = true;
  
  // デバッグ情報（開発時のみ）
  if (process.env.NODE_ENV === 'development') {
    console.log(`🚀 Schedule calculation started with ${templates.length} templates`);
    console.log(`⚙️ Settings:`, {
      courtCount: settings.courtCount,
      startTime: settings.startTime,
      matchDuration: settings.matchDurationMinutes,
      breakDuration: settings.breakDurationMinutes,
      tournamentDates: settings.tournamentDates?.length
    });
  }
  
  // 日程別にテンプレートを分類
  const templatesByDay = templates.reduce((acc, template) => {
    if (!acc[template.day_number]) {
      acc[template.day_number] = [];
    }
    acc[template.day_number].push(template);
    return acc;
  }, {} as Record<number, MatchTemplate[]>);

  // 各日のスケジュールを計算
  const days: DaySchedule[] = [];
  
  for (const [dayNumberStr, dayTemplates] of Object.entries(templatesByDay)) {
    const dayNumber = parseInt(dayNumberStr);
    const tournamentDate = settings.tournamentDates.find(td => td.dayNumber === dayNumber);
    
    if (!tournamentDate) {
      warnings.push(`開催日番号${dayNumber}に対応する開催日が設定されていません`);
      feasible = false;
      continue;
    }

    const daySchedule = calculateDaySchedule(
      dayTemplates,
      tournamentDate.date,
      dayNumber,
      settings,
      customAssignment
    );

    if (daySchedule.requiredCourts > settings.courtCount) {
      warnings.push(
        `${tournamentDate.date}: ${daySchedule.requiredCourts}コート必要ですが、${settings.courtCount}コートしか利用できません`
      );
      feasible = false;
    }

    days.push(daySchedule);
  }

  // 全体の統計を計算（すべての日の最早開始時刻から最遅終了時刻まで）
  const totalMatches = templates.length;
  let overallStartTime = Infinity;
  let overallEndTime = 0;
  
  for (const day of days) {
    if (day.matches.length > 0) {
      const dayStart = Math.min(...day.matches.map(m => timeToMinutes(m.startTime)));
      const dayEnd = Math.max(...day.matches.map(m => timeToMinutes(m.endTime)));
      overallStartTime = Math.min(overallStartTime, dayStart);
      overallEndTime = Math.max(overallEndTime, dayEnd);
    }
  }
  
  const totalDurationMinutes = overallEndTime - overallStartTime;

  // 時間重複チェック
  const timeConflicts = checkTimeConflicts(days);
  if (timeConflicts.length > 0) {
    feasible = false;
    timeConflicts.forEach(conflict => {
      warnings.push(`チーム「${conflict.team}」の試合時間が重複しています`);
    });
  }

  return {
    days: days.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    totalMatches,
    totalDuration: totalDurationMinutes > 0 ? minutesToTime(totalDurationMinutes) : '0:00',
    warnings,
    feasible,
    timeConflicts,
    customCourtAssignment: customAssignment
  };
}

function calculateDaySchedule(
  templates: MatchTemplate[],
  date: string,
  dayNumber: number,
  settings: ScheduleSettings,
  customAssignment?: CustomCourtAssignment
): DaySchedule {
  // 利用可能コート番号の取得（指定がない場合は1からの連番）
  const availableCourts = settings.availableCourts?.length 
    ? settings.availableCourts 
    : Array.from({length: settings.courtCount}, (_, i) => i + 1);

  // ブロック名からコート番号へのマッピングを作成（テンプレート指定がない場合のフォールバック）
  const uniqueBlocks = [...new Set(templates.map(t => t.block_name).filter((name): name is string => Boolean(name)))];
  const blockToCourtMap: Record<string, number> = {};
  
  uniqueBlocks.forEach((blockName, index) => {
    blockToCourtMap[blockName] = availableCourts[index % availableCourts.length];
  });

  // コート別の最新終了時刻管理（利用可能コートのみ管理）
  const courtEndTimes: Record<number, number> = {};
  
  // 初期化：利用可能コートを開始時刻に設定
  availableCourts.forEach(courtNumber => {
    courtEndTimes[courtNumber] = timeToMinutes(settings.startTime);
  });

  // execution_priorityでグループ化（同時進行する試合）
  const priorityGroups = templates.reduce((acc, template) => {
    if (!acc[template.execution_priority]) {
      acc[template.execution_priority] = [];
    }
    acc[template.execution_priority].push(template);
    return acc;
  }, {} as Record<number, MatchTemplate[]>);

  const matches: ScheduleMatch[] = [];
  let maxRequiredCourts = 0;

  // 各優先度グループを順番に処理
  const sortedPriorities = Object.keys(priorityGroups)
    .map(p => parseInt(p))
    .sort((a, b) => a - b);

  for (const priority of sortedPriorities) {
    const groupMatches = priorityGroups[priority].sort((a, b) => a.match_number - b.match_number);
    const simultaneousMatches = groupMatches.length;
    
    maxRequiredCourts = Math.max(maxRequiredCourts, simultaneousMatches);

    // 前のpriorityグループの全試合完了まで待機する時刻を計算
    // 同一priority内の試合は同時進行、異なるpriorityは完全に分離
    const groupStartTime = Math.max(...Object.values(courtEndTimes));

    // 同時進行する試合のスケジュール作成
    for (let i = 0; i < groupMatches.length; i++) {
      const template = groupMatches[i];
      
      // テンプレートデータのデバッグログ（開発時のみ）
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Template ${template.match_code} data:`, {
          suggested_start_time: template.suggested_start_time,
          court_number: template.court_number,
          block_name: template.block_name,
          phase: template.phase
        });
      }

      // 個別試合コート割り当て：テンプレートのcourt_numberを最優先
      const courtNumber = template.court_number && Number(template.court_number) > 0
        ? Number(template.court_number)
        : getCourtNumber(template, i, availableCourts, blockToCourtMap, customAssignment);
      
      // priority間の依存関係とコート使用時間の両方を考慮
      let matchStartTime: number;
      
      // テンプレートにsuggested_start_timeが設定されている場合はそれを最優先
      if (template.suggested_start_time && String(template.suggested_start_time).trim() !== '') {
        matchStartTime = timeToMinutes(String(template.suggested_start_time));
        if (process.env.NODE_ENV === 'development') {
          console.log(`🎯 Template ${template.match_code}: Using suggested_start_time ${template.suggested_start_time} (${matchStartTime} minutes)`);
        }
      } else if (template.block_name) {
        // 予選ブロック: 該当コートの終了時刻から開始（ブロック内で連続実行）
        matchStartTime = courtEndTimes[courtNumber];
        if (process.env.NODE_ENV === 'development') {
          console.log(`📅 Template ${template.match_code}: Using block schedule (court ${courtNumber} ends at ${minutesToTime(courtEndTimes[courtNumber])})`);
        }
      } else {
        // 決勝トーナメント: priority制御とコート制御の両方を適用
        // - groupStartTime: 前のpriorityの全試合完了まで待機
        // - courtEndTimes[courtNumber]: 同じコートでの時間重複回避
        matchStartTime = Math.max(groupStartTime, courtEndTimes[courtNumber]);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🏆 Template ${template.match_code}: Using tournament schedule (max of ${minutesToTime(groupStartTime)} and ${minutesToTime(courtEndTimes[courtNumber])})`);
        }
      }
      
      const matchEndTime = matchStartTime + settings.matchDurationMinutes;
      
      // コートの次回使用可能時刻を更新（休憩時間を追加）
      // テンプレートの時間を使用した場合でも、終了時刻は正しく更新する
      // ただし、テンプレートでsuggested_start_timeが指定されている場合は、
      // そのコートの時間管理は慎重に行う
      if (template.suggested_start_time && String(template.suggested_start_time).trim() !== '') {
        // 固定時間指定の場合は、最低限の終了時刻のみ設定
        courtEndTimes[courtNumber] = Math.max(
          courtEndTimes[courtNumber], 
          matchEndTime + settings.breakDurationMinutes
        );
        if (process.env.NODE_ENV === 'development') {
          console.log(`⏰ Template ${template.match_code}: Fixed time mode - court ${courtNumber} end time set to ${minutesToTime(courtEndTimes[courtNumber])}`);
        }
      } else {
        // 通常の連続スケジュールの場合
        courtEndTimes[courtNumber] = matchEndTime + settings.breakDurationMinutes;
        if (process.env.NODE_ENV === 'development') {
          console.log(`⏰ Template ${template.match_code}: Sequential mode - court ${courtNumber} end time set to ${minutesToTime(courtEndTimes[courtNumber])}`);
        }
      }
      
      const startTime = minutesToTime(matchStartTime);
      const endTime = minutesToTime(matchEndTime);

      matches.push({
        template,
        date,
        startTime,
        endTime,
        courtNumber,
        timeSlot: priority
      });
    }
  }

  // その日の実際の総所要時間を計算（最早開始時刻から最遅終了時刻まで）
  const totalDurationMinutes = matches.length > 0 
    ? Math.max(...matches.map(m => timeToMinutes(m.endTime))) - Math.min(...matches.map(m => timeToMinutes(m.startTime)))
    : 0;

  return {
    date,
    dayNumber,
    matches,
    totalDuration: totalDurationMinutes > 0 ? minutesToTime(totalDurationMinutes) : '0:00',
    requiredCourts: maxRequiredCourts,
    timeSlots: sortedPriorities.length
  };
}


// ユーティリティ関数
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// 時間重複チェック関数
function checkTimeConflicts(days: DaySchedule[]): TimeConflict[] {
  const teamConflicts: Record<string, TimeConflict> = {};
  
  // 全ての試合を日付ごとに確認
  for (const day of days) {
    const matches = day.matches;
    
    // チーム別に試合をグループ化
    const teamMatches: Record<string, ScheduleMatch[]> = {};
    
    for (const match of matches) {
      const team1 = match.template.team1_display_name;
      const team2 = match.template.team2_display_name;
      
      if (!teamMatches[team1]) teamMatches[team1] = [];
      if (!teamMatches[team2]) teamMatches[team2] = [];
      
      teamMatches[team1].push(match);
      teamMatches[team2].push(match);
    }
    
    // 各チームの試合時間重複をチェック
    for (const [teamName, teamMatchList] of Object.entries(teamMatches)) {
      // チームの試合を時間順にソート
      const sortedMatches = teamMatchList.sort((a, b) => 
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
      );
      
      // 重複チェック
      for (let i = 0; i < sortedMatches.length - 1; i++) {
        const match1 = sortedMatches[i];
        const match2 = sortedMatches[i + 1];
        
        const match1End = timeToMinutes(match1.endTime);
        const match2Start = timeToMinutes(match2.startTime);
        
        // 試合時間が重複している場合
        if (match1End > match2Start) {
          if (!teamConflicts[teamName]) {
            teamConflicts[teamName] = {
              team: teamName,
              conflicts: []
            };
          }
          
          teamConflicts[teamName].conflicts.push({
            match1,
            match2,
            description: `${match1.startTime}-${match1.endTime}と${match2.startTime}-${match2.endTime}が重複`
          });
        }
      }
    }
  }
  
  return Object.values(teamConflicts);
}

/**
 * コート番号を決定する関数（カスタム割り当て対応）
 */
function getCourtNumber(
  template: MatchTemplate,
  index: number,
  availableCourts: number[],
  blockToCourtMap: Record<string, number>,
  customAssignment?: CustomCourtAssignment
): number {
  // 1. 個別試合のカスタム割り当てをチェック（最優先）
  if (customAssignment?.matchAssignments?.[template.match_number]) {
    return customAssignment.matchAssignments[template.match_number];
  }

  // 2. ブロック単位のカスタム割り当てをチェック（リーグ戦用）
  if (template.block_name && customAssignment?.blockAssignments?.[template.block_name]) {
    return customAssignment.blockAssignments[template.block_name];
  }

  // 3. デフォルトのブロック固定割り当て（リーグ戦用）
  if (template.block_name && blockToCourtMap[template.block_name]) {
    return blockToCourtMap[template.block_name];
  }

  // 4. デフォルトの順次割り当て（トーナメント用）
  return availableCourts[index % availableCourts.length];
}

// APIエンドポイント用のスケジュール計算（未使用）
// export async function calculateScheduleFromAPI(
//   formatId: number,
//   settings: ScheduleSettings
// ): Promise<TournamentSchedule> {
//   // この関数は実際にはAPIから試合テンプレートを取得する必要がありますが、
//   // ここではクライアントサイドでの使用を想定しています
//   throw new Error('この関数はサーバーサイドでは使用できません。クライアントサイドで使用してください。');
// }