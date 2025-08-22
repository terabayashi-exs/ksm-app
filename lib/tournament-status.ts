// lib/tournament-status.ts
// 大会ステータス判定ユーティリティ

export type TournamentStatus = 
  | 'before_recruitment'  // 募集前
  | 'recruiting'          // 募集中
  | 'before_event'        // 開催前
  | 'ongoing'             // 開催中
  | 'completed';          // 終了

export interface TournamentWithStatus {
  tournament_id: number;
  tournament_name: string;
  status: string; // DB上のstatus
  tournament_dates: string; // JSON形式
  recruitment_start_date: string | null;
  recruitment_end_date: string | null;
  venue_name: string;
  format_name: string;
  registered_teams: number;
  created_at: string;
  updated_at: string;
  // 計算されたステータス
  calculated_status: TournamentStatus;
  tournament_period: string;
}

/**
 * 大会ステータスを動的に判定する
 */
export function calculateTournamentStatus(
  tournament: {
    status: string;
    tournament_dates: string;
    recruitment_start_date: string | null;
    recruitment_end_date: string | null;
  }
): TournamentStatus {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 募集日程の確認
  const recruitmentStart = tournament.recruitment_start_date 
    ? new Date(tournament.recruitment_start_date) 
    : null;
  const recruitmentEnd = tournament.recruitment_end_date 
    ? new Date(tournament.recruitment_end_date) 
    : null;

  // 大会日程の確認
  let tournamentStartDate: Date | null = null;
  let tournamentEndDate: Date | null = null;

  try {
    const tournamentDates = JSON.parse(tournament.tournament_dates);
    const dates = Object.values(tournamentDates)
      .filter(date => date)
      .map(date => new Date(date as string))
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (dates.length > 0) {
      tournamentStartDate = dates[0];
      tournamentEndDate = dates[dates.length - 1];
    }
  } catch (error) {
    console.warn('tournament_datesのJSON解析に失敗:', tournament.tournament_dates, error);
  }

  // DBのstatusが'completed'の場合は終了とする
  if (tournament.status === 'completed') {
    return 'completed';
  }

  // 1. 募集前：募集開始日が未来の場合
  if (recruitmentStart && today < recruitmentStart) {
    return 'before_recruitment';
  }

  // 2. 募集中：募集開始日 <= 現在 <= 募集終了日
  if (recruitmentStart && recruitmentEnd && 
      today >= recruitmentStart && today <= recruitmentEnd) {
    return 'recruiting';
  }

  // 3. 開催前：募集終了日 < 現在 < 大会開始日
  if (recruitmentEnd && tournamentStartDate && 
      today > recruitmentEnd && today < tournamentStartDate) {
    return 'before_event';
  }

  // 4. 開催中：大会期間中
  if (tournamentStartDate && tournamentEndDate && 
      today >= tournamentStartDate && today <= tournamentEndDate) {
    return 'ongoing';
  }

  // 5. 終了：大会期間終了後
  if (tournamentEndDate && today > tournamentEndDate) {
    return 'completed';
  }

  // デフォルト：判定できない場合は募集前とする
  return 'before_recruitment';
}

/**
 * ステータスの表示用ラベルを取得
 */
export function getStatusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'before_recruitment': return '募集前';
    case 'recruiting': return '募集中';
    case 'before_event': return '開催前';
    case 'ongoing': return '開催中';
    case 'completed': return '終了';
    default: return status;
  }
}

/**
 * ステータスの表示用カラークラスを取得
 */
export function getStatusColor(status: TournamentStatus): string {
  switch (status) {
    case 'before_recruitment': return 'bg-gray-100 text-gray-800';
    case 'recruiting': return 'bg-blue-100 text-blue-800';
    case 'before_event': return 'bg-yellow-100 text-yellow-800';
    case 'ongoing': return 'bg-green-100 text-green-800';
    case 'completed': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

/**
 * 大会期間の文字列を生成
 */
export function formatTournamentPeriod(tournamentDatesJson: string): string {
  try {
    const tournamentDates = JSON.parse(tournamentDatesJson);
    const dates = Object.values(tournamentDates).filter(date => date).sort();
    
    if (dates.length === 0) {
      return '未設定';
    } else if (dates.length === 1) {
      return dates[0] as string;
    } else {
      return `${dates[0]} - ${dates[dates.length - 1]}`;
    }
  } catch (error) {
    console.warn('tournament_datesのJSON解析に失敗:', error);
    return '未設定';
  }
}