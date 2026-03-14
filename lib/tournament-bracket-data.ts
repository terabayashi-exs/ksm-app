import { db } from '@/lib/db';
import { getTournamentSportCode, getSportScoreConfig, extractSoccerScoreData } from '@/lib/sport-standings-calculator';
import { parseScoreArray, parseTotalScore } from '@/lib/score-parser';
import type { BracketMatch, SportScoreConfig } from '@/lib/tournament-bracket/types';

export type { BracketMatch };

export interface BracketResult {
  data: BracketMatch[];
  sport_config: SportScoreConfig;
  target_team_count: number;
}

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export { HttpError };

/**
 * Fetches tournament bracket data for a given tournament and phase.
 * Throws HttpError for HTTP error scenarios.
 */
export async function getTournamentBracketData(
  tournamentId: number,
  phase: string = 'final'
): Promise<BracketResult> {
  // phaseのバリデーション（動的フェーズID対応: 英数字・アンダースコアのみ許可）
  if (!/^[a-zA-Z0-9_]+$/.test(phase)) {
    throw new HttpError('Invalid phase parameter', 400);
  }

  // 多競技対応：スポーツ設定を取得
  const sportCode = await getTournamentSportCode(tournamentId);
  const sportConfig = getSportScoreConfig(sportCode);

  // 大会のtarget_team_countを取得
  const tournamentResult = await db.execute(
    `SELECT f.target_team_count
     FROM t_tournaments t
     JOIN m_tournament_formats f ON t.format_id = f.format_id
     WHERE t.tournament_id = ?`,
    [tournamentId]
  );

  if (!tournamentResult.rows || tournamentResult.rows.length === 0) {
    throw new HttpError('大会が見つかりません', 404);
  }

  const targetTeamCount = tournamentResult.rows[0].target_team_count as number;

  // まず基本的なクエリでデータを取得（多競技対応データ含む）
  const query = `
    SELECT DISTINCT
      ml.match_id,
      ml.match_code,
      ml.team1_tournament_team_id,
      ml.team2_tournament_team_id,
      COALESCE(tt1.team_omission, tt1.team_name, ml.team1_display_name) as team1_display_name,
      COALESCE(tt2.team_omission, tt2.team_name, ml.team2_display_name) as team2_display_name,
      COALESCE(mf.team1_scores, '0') as team1_goals,
      COALESCE(mf.team2_scores, '0') as team2_goals,
      -- 多競技対応の拡張データ
      ml.team1_scores as live_team1_scores,
      ml.team2_scores as live_team2_scores,
      ml.period_count as live_period_count,
      mf.winner_tournament_team_id,
      COALESCE(mf.is_draw, 0) as is_draw,
      COALESCE(mf.is_walkover, ml.is_bye_match, 0) as is_walkover,
      ml.match_status,
      CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
      ml.match_number as execution_priority,
      ml.start_time,
      ml.court_number,
      ml.match_type,
      mb.block_name,
      mb.display_round_name,
      ml.position_note,
      ml.team1_source,
      ml.team2_source,
      ml.is_bye_match
    FROM t_matches_live ml
    LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
    LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    LEFT JOIN t_tournament_rules tr ON mb.tournament_id = tr.tournament_id AND tr.phase = mb.phase
    LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
    LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
    WHERE mb.tournament_id = ?
      AND mb.phase = ?
      AND (ml.match_type IS NULL OR ml.match_type != 'FM')
    ORDER BY ml.match_number, ml.match_code
  `;

  const matches = await db.execute(query, [tournamentId, phase]);

  // トーナメント試合が存在しない場合
  if (!matches.rows || matches.rows.length === 0) {
    throw new HttpError('この大会にはトーナメント戦がありません', 404);
  }

  // execution_groupは現在のスキーマでは利用不可のため、nullに設定
  const executionGroupMap = new Map<string, number>();

  // BYE試合の勝者を解決するためのマップを作成
  const byeMatchWinners: Record<string, string> = {};

  matches.rows.forEach(row => {
    if (row.is_walkover) {
      // BYE試合の勝者を特定（空でない方のチーム）
      const winner = row.team1_display_name || row.team2_display_name;
      if (winner && row.match_code) {
        byeMatchWinners[`【${row.match_code}】勝`] = String(winner);
        console.log(`[bracket] BYE試合勝者マップ: 【${row.match_code}】勝 → ${winner}`);
      }
    }
  });

  console.log('[bracket] BYE試合勝者マップ全体:', byeMatchWinners);

  // データを整形（多競技対応）
  const bracketData: BracketMatch[] = matches.rows.map(row => {
    // スコアデータをパース（確定済みスコアを優先）
    const team1GoalsData = row.team1_goals as string | null;
    const team2GoalsData = row.team2_goals as string | null;

    const isWalkover = Boolean(row.is_walkover);

    // チーム名の解決（BYE試合の勝者を実名に置き換え）
    let team1DisplayName = row.team1_display_name as string;
    let team2DisplayName = row.team2_display_name as string;

    // 【S1】勝のような表記をBYE試合の勝者名に置き換え
    if (byeMatchWinners[team1DisplayName]) {
      team1DisplayName = byeMatchWinners[team1DisplayName];
      console.log(`[bracket] ${row.match_code}: team1 ${row.team1_display_name} → ${team1DisplayName}`);
    }
    if (byeMatchWinners[team2DisplayName]) {
      team2DisplayName = byeMatchWinners[team2DisplayName];
      console.log(`[bracket] ${row.match_code}: team2 ${row.team2_display_name} → ${team2DisplayName}`);
    }

    const baseData: BracketMatch = {
      match_id: row.match_id as number,
      match_code: row.match_code as string,
      team1_tournament_team_id: row.team1_tournament_team_id as number | null,
      team2_tournament_team_id: row.team2_tournament_team_id as number | null,
      team1_display_name: team1DisplayName,
      team2_display_name: team2DisplayName,
      team1_goals: team1GoalsData ? parseTotalScore(team1GoalsData) : 0,
      team2_goals: team2GoalsData ? parseTotalScore(team2GoalsData) : 0,
      winner_tournament_team_id: row.winner_tournament_team_id as number | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: isWalkover,
      match_status: row.match_status as 'scheduled' | 'ongoing' | 'completed' | 'cancelled',
      is_confirmed: Boolean(row.is_confirmed),
      execution_priority: row.execution_priority as number,
      start_time: (row.start_time as string | null) ?? undefined,
      court_number: (row.court_number as number | null) ?? undefined,
      execution_group: executionGroupMap.get(row.match_code as string) ?? undefined,
      match_type: row.match_type as string,
      block_name: row.block_name as string,
      display_round_name: row.display_round_name as string | undefined,
      position_note: row.position_note as string | undefined,
      team1_source: row.team1_source as string | undefined,
      team2_source: row.team2_source as string | undefined,
      is_bye_match: Boolean(row.is_bye_match || 0),
    };

    // デバッグログ
    if (isWalkover) {
      console.log(`[bracket] Bye match detected: ${row.match_code as string} - winner: ${row.team1_display_name || row.team2_display_name}`);
    }

    // 多競技対応の拡張データを追加
    try {
      const liveTeam1ScoresStr = row.live_team1_scores as string | null;
      const liveTeam2ScoresStr = row.live_team2_scores as string | null;
      const livePeriodCount = row.live_period_count as number | null;

      if (liveTeam1ScoresStr && liveTeam2ScoresStr) {
        // parseScoreArray()で全形式に対応
        const team1Scores = parseScoreArray(liveTeam1ScoresStr);
        const team2Scores = parseScoreArray(liveTeam2ScoresStr);

        // period_countからactive_periodsを生成
        let activePeriods: number[] = [];
        if (livePeriodCount && livePeriodCount > 0) {
          activePeriods = Array.from({ length: livePeriodCount }, (_, i) => i + 1);
        }

        baseData.team1_scores = team1Scores;
        baseData.team2_scores = team2Scores;
        baseData.active_periods = activePeriods;

        // サッカーの場合はPKデータを抽出
        if (sportCode === 'soccer' && baseData.is_confirmed && baseData.team1_tournament_team_id && baseData.team2_tournament_team_id) {
          const team1SoccerData = extractSoccerScoreData(
            team1Scores,
            team2Scores,
            baseData.team1_tournament_team_id,
            baseData.team1_tournament_team_id,
            baseData.team2_tournament_team_id,
            baseData.winner_tournament_team_id ?? null,
            activePeriods
          );

          baseData.soccer_data = team1SoccerData;
        }
      }
    } catch (error) {
      console.warn(`[BRACKET_API] Failed to parse multi-sport data for match ${baseData.match_id}:`, error);
      // エラーの場合は基本データのみ使用
    }

    return baseData;
  });

  return {
    data: bracketData,
    sport_config: sportConfig,
    target_team_count: targetTeamCount,
  };
}
