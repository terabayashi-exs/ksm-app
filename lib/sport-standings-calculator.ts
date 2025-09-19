// lib/sport-standings-calculator.ts
// 多競技対応の順位計算システム

import { db } from '@/lib/db';

/**
 * 競技種別別のスコア設定
 */
export interface SportScoreConfig {
  sport_code: string;
  score_label: string;          // "得点" | "ゴール" | "スコア" | "点数"
  score_against_label: string;  // "失点" | "失ゴール" | "失スコア" | "失点"
  difference_label: string;     // "得失点差" | "得失ゴール差" | "スコア差"
  supports_pk: boolean;         // PK戦対応フラグ
  pk_display_format?: string;   // PK表示フォーマット: "PK {pk_score1}-{pk_score2}"
}

/**
 * 競技種別設定
 */
export const SPORT_SCORE_CONFIGS: Record<string, SportScoreConfig> = {
  'pk_championship': {
    sport_code: 'pk_championship',
    score_label: '得点',
    score_against_label: '失点',
    difference_label: '得失点差',
    supports_pk: false
  },
  'soccer': {
    sport_code: 'soccer',
    score_label: '得点',
    score_against_label: '失点',
    difference_label: '得失点差',
    supports_pk: true,
    pk_display_format: 'PK {pk_score1}-{pk_score2}'
  },
  'baseball': {
    sport_code: 'baseball',
    score_label: 'スコア',
    score_against_label: '失スコア',
    difference_label: 'スコア差',
    supports_pk: false
  },
  'basketball': {
    sport_code: 'basketball',
    score_label: '点数',
    score_against_label: '失点',
    difference_label: '得失点差',
    supports_pk: false
  }
};

/**
 * サッカー専用スコアデータ
 */
export interface SoccerScoreData {
  regular_goals_for: number;    // 通常時間ゴール（前半+後半+延長）
  regular_goals_against: number; // 通常時間失ゴール
  pk_goals_for?: number;        // PK戦ゴール（別集計）
  pk_goals_against?: number;    // PK戦失ゴール（別集計）
  is_pk_game: boolean;          // PK戦実施フラグ
  pk_winner?: boolean;          // PK戦勝利フラグ（このチーム視点）
}

/**
 * 多競技対応TeamStanding
 */
export interface MultiSportTeamStanding {
  team_id: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  // 競技種別に応じて動的に設定される
  scores_for: number;           // goals_for の汎用版
  scores_against: number;       // goals_against の汎用版
  score_difference: number;     // goal_difference の汎用版
  // サッカー専用データ（該当する場合のみ）
  soccer_data?: SoccerScoreData;
  // 競技種別情報
  sport_config: SportScoreConfig;
}

/**
 * 競技種別設定を取得
 */
export function getSportScoreConfig(sportCode: string): SportScoreConfig {
  return SPORT_SCORE_CONFIGS[sportCode] || SPORT_SCORE_CONFIGS['pk_championship'];
}

/**
 * スコアデータからサッカー専用データを抽出
 */
export function extractSoccerScoreData(
  team1Scores: number[], 
  team2Scores: number[], 
  teamId: string, 
  team1Id: string, 
  team2Id: string,
  winnerTeamId: string | null,
  activePeriods: number[]
): SoccerScoreData {
  const isTeam1 = teamId === team1Id;
  const teamScores = isTeam1 ? team1Scores : team2Scores;
  const opponentScores = isTeam1 ? team2Scores : team1Scores;
  
  // 前半・後半・延長戦（PKを除く）の合計
  let regularGoalsFor = 0;
  let regularGoalsAgainst = 0;
  let pkGoalsFor = 0;
  let pkGoalsAgainst = 0;
  let isPkGame = false;
  
  activePeriods.forEach((period, index) => {
    const teamScore = teamScores[index] || 0;
    const opponentScore = opponentScores[index] || 0;
    
    // 5期目以降をPK戦として扱う（サッカー設定に依存）
    if (period >= 5) {
      isPkGame = true;
      pkGoalsFor += teamScore;
      pkGoalsAgainst += opponentScore;
      console.log(`[SOCCER_PK] Period ${period}: PK goals ${teamScore}-${opponentScore}`);
    } else {
      regularGoalsFor += teamScore;
      regularGoalsAgainst += opponentScore;
      console.log(`[SOCCER_REGULAR] Period ${period}: Regular goals ${teamScore}-${opponentScore}`);
    }
  });
  
  // PK戦勝利判定
  let pkWinner: boolean | undefined = undefined;
  if (isPkGame && winnerTeamId) {
    pkWinner = winnerTeamId === teamId;
  }
  
  return {
    regular_goals_for: regularGoalsFor,
    regular_goals_against: regularGoalsAgainst,
    pk_goals_for: isPkGame ? pkGoalsFor : undefined,
    pk_goals_against: isPkGame ? pkGoalsAgainst : undefined,
    is_pk_game: isPkGame,
    pk_winner: pkWinner
  };
}

/**
 * 競技種別に応じたスコア表示フォーマット
 */
export function formatScoreDisplay(
  scoresFor: number,
  scoresAgainst: number,
  soccerData?: SoccerScoreData
): string {
  const baseScore = `${scoresFor}-${scoresAgainst}`;
  
  // サッカーでPK戦がある場合
  if (soccerData?.is_pk_game && soccerData.pk_goals_for !== undefined && soccerData.pk_goals_against !== undefined) {
    return `${baseScore} (PK ${soccerData.pk_goals_for}-${soccerData.pk_goals_against})`;
  }
  
  return baseScore;
}

/**
 * 大会の競技種別を取得
 */
export async function getTournamentSportCode(tournamentId: number): Promise<string> {
  try {
    const result = await db.execute(`
      SELECT st.sport_code
      FROM t_tournaments t
      INNER JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);
    
    if (result.rows.length > 0) {
      return String(result.rows[0].sport_code);
    }
    
    // フォールバック: PK選手権
    return 'pk_championship';
  } catch (error) {
    console.error('Failed to get tournament sport code:', error);
    return 'pk_championship';
  }
}

/**
 * 多競技対応の試合結果データ取得
 */
export async function getMultiSportMatchResults(matchBlockId: number, tournamentId: number): Promise<unknown[]> {
  try {
    const result = await db.execute(`
      SELECT 
        mf.match_id,
        mf.match_block_id,
        mf.team1_id,
        mf.team2_id,
        mf.team1_scores,
        mf.team2_scores,
        mf.winner_team_id,
        mf.is_draw,
        mf.is_walkover,
        -- 拡張情報（サッカー用）
        ml.period_count,
        -- 大会ルール情報
        tr.active_periods,
        -- 競技種別
        st.sport_code
      FROM t_matches_final mf
      INNER JOIN t_matches_live ml ON mf.match_id = ml.match_id
      INNER JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      INNER JOIN t_tournaments tour ON mb.tournament_id = tour.tournament_id
      INNER JOIN m_sport_types st ON tour.sport_type_id = st.sport_type_id
      LEFT JOIN t_tournament_rules tr ON tour.tournament_id = tr.tournament_id AND tr.phase = mb.phase
      WHERE mf.match_block_id = ?
        AND mb.tournament_id = ?
    `, [matchBlockId, tournamentId]);
    
    return result.rows;
  } catch (error) {
    console.error('Failed to get multi-sport match results:', error);
    return [];
  }
}