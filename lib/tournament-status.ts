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
  is_archived?: boolean; // アーカイブ済みフラグ
  // 計算されたステータス
  calculated_status: TournamentStatus;
  tournament_period: string;
}

/**
 * 大会ステータスを動的に判定する（非同期版）
 * @param tournament 大会情報
 * @param tournamentId 大会ID（試合進行状況確認用・オプション）
 */
export async function calculateTournamentStatus(
  tournament: {
    status: string;
    tournament_dates: string;
    recruitment_start_date: string | null;
    recruitment_end_date: string | null;
  },
  tournamentId?: number
): Promise<TournamentStatus> {
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

  // 試合進行状況をチェック（tournamentIdが提供されている場合のみ）
  let allMatchesCompleted = false;

  console.log(`📊 Tournament ${tournamentId || 'N/A'} status calculation:`, {
    dbStatus: tournament.status,
    hasTournamentId: !!tournamentId
  });

  if (tournamentId) {
    try {
      allMatchesCompleted = await checkAllMatchesCompleted(tournamentId);

      console.log(`📊 Tournament ${tournamentId} match status:`, {
        allMatchesCompleted
      });
    } catch (error) {
      console.warn('試合状況チェックエラー:', error);
    }
  }
  
  // DBのstatusが'completed'でも、未確定の試合がある場合は'ongoing'にする
  if (tournament.status === 'completed' && tournamentId && !allMatchesCompleted) {
    console.log(`🔄 Tournament ${tournamentId}: Status overridden from 'completed' to 'ongoing' (${allMatchesCompleted ? 'all matches confirmed' : 'matches pending'})`);
    return 'ongoing';
  }
  
  // DBのstatusが'completed'で全試合確定済みの場合は終了とする
  if (tournament.status === 'completed') {
    return 'completed';
  }
  
  // DBのstatusが'ongoing'の場合は開催中とする（管理者が明示的に開始した場合）
  if (tournament.status === 'ongoing') {
    return 'ongoing';
  }

  // 実際に試合が開始されている場合は、日付に関わらず開催中とする
  let matchBasedOngoing = false;
  if (tournamentId) {
    matchBasedOngoing = await checkTournamentHasOngoingMatches(tournamentId);
    if (matchBasedOngoing) {
      console.log(`🏁 Tournament ${tournamentId}: Status set to 'ongoing' because matches have started`);
      return 'ongoing';
    }
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
  return 'before_event';
}

/**
 * 大会ステータスを同期的に判定する（従来版・後方互換性のため）
 */
export function calculateTournamentStatusSync(
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
  
  // DBのstatusが'ongoing'の場合は開催中とする（管理者が明示的に開始した場合）
  if (tournament.status === 'ongoing') {
    return 'ongoing';
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
 * 大会に進行中または開始済みの試合があるかチェック
 * scheduled（試合前）以外の試合が1つでもあればtrueを返す
 */
async function checkTournamentHasOngoingMatches(tournamentId: number): Promise<boolean> {
  try {
    const { db } = await import('@/lib/db');

    // t_match_statusテーブルから scheduled 以外の試合をカウント
    const result = await db.execute(`
      SELECT COUNT(*) as started_count
      FROM t_match_status ms
      INNER JOIN t_matches_live ml ON ms.match_id = ml.match_id
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
        AND ms.match_status != 'scheduled'
        AND ml.team1_id IS NOT NULL
        AND ml.team2_id IS NOT NULL
    `, [tournamentId]);

    const startedCount = result.rows[0]?.started_count as number || 0;

    console.log(`Tournament ${tournamentId}: ${startedCount} matches have started (not scheduled)`);

    return startedCount > 0;
  } catch (error) {
    console.warn('進行中試合チェックエラー:', error);
    return false;
  }
}

/**
 * 大会の全試合が確定済みかチェック
 */
async function checkAllMatchesCompleted(tournamentId: number): Promise<boolean> {
  try {
    const { db } = await import('@/lib/db');
    
    // 全試合数を取得
    const totalResult = await db.execute(`
      SELECT COUNT(*) as total_matches
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
        AND ml.team1_id IS NOT NULL 
        AND ml.team2_id IS NOT NULL
    `, [tournamentId]);

    const totalMatches = totalResult.rows[0]?.total_matches as number || 0;
    
    if (totalMatches === 0) {
      return false; // 試合がまだ設定されていない
    }

    // 確定済み試合数を取得
    const confirmedResult = await db.execute(`
      SELECT COUNT(*) as confirmed_matches
      FROM t_matches_final mf
      INNER JOIN t_matches_live ml ON mf.match_id = ml.match_id
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);

    const confirmedMatches = confirmedResult.rows[0]?.confirmed_matches as number || 0;
    
    console.log(`Tournament ${tournamentId}: ${confirmedMatches}/${totalMatches} matches confirmed`);
    
    return confirmedMatches === totalMatches;
  } catch (error) {
    console.warn('全試合確定チェックエラー:', error);
    return false;
  }
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
    case 'before_recruitment': return 'bg-gray-100 !text-black border border-gray-400';
    case 'recruiting': return 'bg-blue-100 !text-black border border-blue-400';
    case 'before_event': return 'bg-yellow-100 !text-black border border-yellow-400';
    case 'ongoing': return 'bg-green-100 !text-black border border-green-400';
    case 'completed': return 'bg-red-100 !text-black border border-red-400';
    default: return 'bg-gray-100 !text-black border border-gray-400';
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