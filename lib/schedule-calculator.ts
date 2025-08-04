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
}

export interface TimeConflict {
  team: string;
  conflicts: {
    match1: ScheduleMatch;
    match2: ScheduleMatch;
    description: string;
  }[];
}

export interface ScheduleSettings {
  courtCount: number;
  matchDurationMinutes: number;
  breakDurationMinutes: number;
  startTime: string; // HH:MM format
  tournamentDates: TournamentDate[];
}

export function calculateTournamentSchedule(
  templates: MatchTemplate[],
  settings: ScheduleSettings
): TournamentSchedule {
  const warnings: string[] = [];
  let feasible = true;
  
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
      settings
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
    timeConflicts
  };
}

function calculateDaySchedule(
  templates: MatchTemplate[],
  date: string,
  dayNumber: number,
  settings: ScheduleSettings
): DaySchedule {
  // ブロック名からコート番号へのマッピングを作成
  const uniqueBlocks = [...new Set(templates.map(t => t.block_name).filter((name): name is string => Boolean(name)))];
  const blockToCourtMap: Record<string, number> = {};
  
  uniqueBlocks.forEach((blockName, index) => {
    blockToCourtMap[blockName] = (index % settings.courtCount) + 1;
  });

  // ブロック別のタイムスロット管理
  const blockTimeSlots: Record<string, number> = {};

  // execution_priorityでグループ化（同時進行する試合）
  const priorityGroups = templates.reduce((acc, template) => {
    if (!acc[template.execution_priority]) {
      acc[template.execution_priority] = [];
    }
    acc[template.execution_priority].push(template);
    return acc;
  }, {} as Record<number, MatchTemplate[]>);

  const matches: ScheduleMatch[] = [];
  let currentTimeMinutes = timeToMinutes(settings.startTime);
  let maxRequiredCourts = 0;

  // 各優先度グループを順番に処理
  const sortedPriorities = Object.keys(priorityGroups)
    .map(p => parseInt(p))
    .sort((a, b) => a - b);

  for (const priority of sortedPriorities) {
    const groupMatches = priorityGroups[priority].sort((a, b) => a.match_number - b.match_number);
    const simultaneousMatches = groupMatches.length;
    
    maxRequiredCourts = Math.max(maxRequiredCourts, simultaneousMatches);

    // 同時進行する試合のスケジュール作成
    for (let i = 0; i < groupMatches.length; i++) {
      const template = groupMatches[i];
      
      // ブロック名に基づいてコート番号を決定
      const courtNumber = template.block_name && blockToCourtMap[template.block_name] 
        ? blockToCourtMap[template.block_name]
        : (i % settings.courtCount) + 1; // フォールバック: 従来の方式

      // ブロック別の時間管理
      let matchStartTime = currentTimeMinutes;
      if (template.block_name && blockToCourtMap[template.block_name]) {
        // 同じコートを使う他のブロックとの重複を避ける
        const sameCourtBlocks = uniqueBlocks.filter(block => 
          template.block_name && blockToCourtMap[block] === blockToCourtMap[template.block_name]
        );
        
        // このコートを使う最後の試合終了時刻を確認
        let latestEndTime = timeToMinutes(settings.startTime);
        for (const block of sameCourtBlocks) {
          if (blockTimeSlots[block]) {
            latestEndTime = Math.max(latestEndTime, blockTimeSlots[block]);
          }
        }
        
        // 重複を避けるために時刻を調整
        matchStartTime = Math.max(currentTimeMinutes, latestEndTime);
        
        // このブロックの次回使用可能時刻を更新（休憩時間が0なら追加しない）
        blockTimeSlots[template.block_name] = matchStartTime + settings.matchDurationMinutes + (settings.breakDurationMinutes || 0);
      }
      
      const startTime = minutesToTime(matchStartTime);
      const endTime = minutesToTime(matchStartTime + settings.matchDurationMinutes);

      matches.push({
        template,
        date,
        startTime,
        endTime,
        courtNumber,
        timeSlot: priority
      });
    }

    // 次のタイムスロットまでの時間を計算（休憩時間が0なら追加しない）
    currentTimeMinutes += settings.matchDurationMinutes + (settings.breakDurationMinutes || 0);
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

// APIエンドポイント用のスケジュール計算（未使用）
// export async function calculateScheduleFromAPI(
//   formatId: number,
//   settings: ScheduleSettings
// ): Promise<TournamentSchedule> {
//   // この関数は実際にはAPIから試合テンプレートを取得する必要がありますが、
//   // ここではクライアントサイドでの使用を想定しています
//   throw new Error('この関数はサーバーサイドでは使用できません。クライアントサイドで使用してください。');
// }