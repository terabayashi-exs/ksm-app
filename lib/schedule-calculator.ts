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

  // コート別の最新終了時刻管理（全コートを管理）
  const courtEndTimes: Record<number, number> = {};
  
  // 初期化：全コートを開始時刻に設定
  for (let i = 1; i <= settings.courtCount; i++) {
    courtEndTimes[i] = timeToMinutes(settings.startTime);
  }

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
    let groupStartTime = Math.max(...Object.values(courtEndTimes));

    // 同時進行する試合のスケジュール作成
    for (let i = 0; i < groupMatches.length; i++) {
      const template = groupMatches[i];
      
      // ブロック名に基づいてコート番号を決定
      let courtNumber: number;
      if (template.block_name && blockToCourtMap[template.block_name]) {
        // 予選ブロック: ブロック固定のコート番号
        courtNumber = blockToCourtMap[template.block_name];
      } else {
        // 決勝トーナメント: 利用可能なコートを順番に割り当て
        courtNumber = ((i % settings.courtCount) + 1);
      }

      // priority間の依存関係とコート使用時間の両方を考慮
      let matchStartTime: number;
      if (template.block_name && blockToCourtMap[template.block_name]) {
        // 予選ブロック: 該当コートの終了時刻から開始
        matchStartTime = courtEndTimes[courtNumber];
      } else {
        // 決勝トーナメント: priority制御とコート制御の両方を適用
        // - groupStartTime: 前のpriorityの全試合完了まで待機
        // - courtEndTimes[courtNumber]: 同じコートでの時間重複回避
        matchStartTime = Math.max(groupStartTime, courtEndTimes[courtNumber]);
      }
      
      const matchEndTime = matchStartTime + settings.matchDurationMinutes;
      
      // コートの次回使用可能時刻を更新（休憩時間を追加）
      courtEndTimes[courtNumber] = matchEndTime + (settings.breakDurationMinutes || 0);
      
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

// APIエンドポイント用のスケジュール計算（未使用）
// export async function calculateScheduleFromAPI(
//   formatId: number,
//   settings: ScheduleSettings
// ): Promise<TournamentSchedule> {
//   // この関数は実際にはAPIから試合テンプレートを取得する必要がありますが、
//   // ここではクライアントサイドでの使用を想定しています
//   throw new Error('この関数はサーバーサイドでは使用できません。クライアントサイドで使用してください。');
// }