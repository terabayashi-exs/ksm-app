/**
 * トーナメントブラケット用モックデータ
 * Storybook でさまざまなケースをテストするために使用
 */

export interface BracketMatch {
  match_id: number;
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_tournament_team_id?: number | null;
  team2_tournament_team_id?: number | null;
  team1_display_name: string;
  team2_display_name: string;
  team1_goals: number;
  team2_goals: number;
  team1_scores?: number[];
  team2_scores?: number[];
  active_periods?: number[];
  winner_team_id?: string;
  winner_tournament_team_id?: number | null;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: "scheduled" | "ongoing" | "completed" | "cancelled";
  is_confirmed: boolean;
  execution_priority: number;
  start_time?: string;
  court_number?: number;
  execution_group?: number;
  soccer_data?: {
    regular_goals_for: number;
    regular_goals_against: number;
    pk_goals_for?: number;
    pk_goals_against?: number;
    is_pk_game: boolean;
    pk_winner?: boolean;
  };
}

export interface SportScoreConfig {
  sport_code: string;
  score_label: string;
  score_against_label: string;
  difference_label: string;
  supports_pk: boolean;
}

// デフォルトのスポーツ設定（サッカー）
export const defaultSportConfig: SportScoreConfig = {
  sport_code: "soccer",
  score_label: "得点",
  score_against_label: "失点",
  difference_label: "得失点差",
  supports_pk: true,
};

// 8チームトーナメント（完了済み）
export const eightTeamCompletedMatches: BracketMatch[] = [
  // 準々決勝
  {
    match_id: 1,
    match_code: "M1",
    team1_id: "team-1",
    team2_id: "team-2",
    team1_tournament_team_id: 1,
    team2_tournament_team_id: 2,
    team1_display_name: "FCバルセロナ",
    team2_display_name: "レアル・マドリード",
    team1_goals: 3,
    team2_goals: 1,
    team1_scores: [1, 1, 1, 0],
    team2_scores: [0, 1, 0, 0],
    winner_team_id: "team-1",
    winner_tournament_team_id: 1,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 1,
    execution_group: 1,
    court_number: 1,
  },
  {
    match_id: 2,
    match_code: "M2",
    team1_id: "team-3",
    team2_id: "team-4",
    team1_tournament_team_id: 3,
    team2_tournament_team_id: 4,
    team1_display_name: "マンチェスター・シティ",
    team2_display_name: "リバプール",
    team1_goals: 2,
    team2_goals: 2,
    team1_scores: [1, 0, 1, 0],
    team2_scores: [0, 1, 0, 1],
    winner_team_id: "team-4",
    winner_tournament_team_id: 4,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 2,
    execution_group: 1,
    court_number: 2,
  },
  {
    match_id: 3,
    match_code: "M3",
    team1_id: "team-5",
    team2_id: "team-6",
    team1_tournament_team_id: 5,
    team2_tournament_team_id: 6,
    team1_display_name: "バイエルン・ミュンヘン",
    team2_display_name: "ドルトムント",
    team1_goals: 4,
    team2_goals: 0,
    team1_scores: [2, 1, 1, 0],
    team2_scores: [0, 0, 0, 0],
    winner_team_id: "team-5",
    winner_tournament_team_id: 5,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 3,
    execution_group: 1,
    court_number: 1,
  },
  {
    match_id: 4,
    match_code: "M4",
    team1_id: "team-7",
    team2_id: "team-8",
    team1_tournament_team_id: 7,
    team2_tournament_team_id: 8,
    team1_display_name: "パリ・サンジェルマン",
    team2_display_name: "ユベントス",
    team1_goals: 1,
    team2_goals: 2,
    team1_scores: [0, 1, 0, 0],
    team2_scores: [1, 0, 1, 0],
    winner_team_id: "team-8",
    winner_tournament_team_id: 8,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 4,
    execution_group: 1,
    court_number: 2,
  },
  // 準決勝
  {
    match_id: 5,
    match_code: "M5",
    team1_id: "team-1",
    team2_id: "team-4",
    team1_tournament_team_id: 1,
    team2_tournament_team_id: 4,
    team1_display_name: "FCバルセロナ",
    team2_display_name: "リバプール",
    team1_goals: 2,
    team2_goals: 1,
    team1_scores: [1, 0, 1, 0],
    team2_scores: [0, 1, 0, 0],
    winner_team_id: "team-1",
    winner_tournament_team_id: 1,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 5,
    execution_group: 2,
    court_number: 1,
  },
  {
    match_id: 6,
    match_code: "M6",
    team1_id: "team-5",
    team2_id: "team-8",
    team1_tournament_team_id: 5,
    team2_tournament_team_id: 8,
    team1_display_name: "バイエルン・ミュンヘン",
    team2_display_name: "ユベントス",
    team1_goals: 3,
    team2_goals: 3,
    team1_scores: [1, 1, 1, 0],
    team2_scores: [1, 1, 0, 1],
    winner_team_id: "team-5",
    winner_tournament_team_id: 5,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 6,
    execution_group: 2,
    court_number: 2,
  },
  // 3位決定戦
  {
    match_id: 7,
    match_code: "M7",
    team1_id: "team-4",
    team2_id: "team-8",
    team1_tournament_team_id: 4,
    team2_tournament_team_id: 8,
    team1_display_name: "リバプール",
    team2_display_name: "ユベントス",
    team1_goals: 2,
    team2_goals: 0,
    team1_scores: [1, 0, 1, 0],
    team2_scores: [0, 0, 0, 0],
    winner_team_id: "team-4",
    winner_tournament_team_id: 4,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 7,
    execution_group: 3,
    court_number: 2,
  },
  // 決勝
  {
    match_id: 8,
    match_code: "M8",
    team1_id: "team-1",
    team2_id: "team-5",
    team1_tournament_team_id: 1,
    team2_tournament_team_id: 5,
    team1_display_name: "FCバルセロナ",
    team2_display_name: "バイエルン・ミュンヘン",
    team1_goals: 2,
    team2_goals: 1,
    team1_scores: [1, 0, 1, 0],
    team2_scores: [0, 1, 0, 0],
    winner_team_id: "team-1",
    winner_tournament_team_id: 1,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 8,
    execution_group: 3,
    court_number: 1,
  },
];

// 進行中のトーナメント（準決勝まで完了、決勝待ち）
export const eightTeamOngoingMatches: BracketMatch[] = [
  // 準々決勝（完了）
  ...eightTeamCompletedMatches.slice(0, 4),
  // 準決勝（完了）
  ...eightTeamCompletedMatches.slice(4, 6),
  // 3位決定戦（未実施）
  {
    match_id: 7,
    match_code: "M7",
    team1_id: "team-4",
    team2_id: "team-8",
    team1_tournament_team_id: 4,
    team2_tournament_team_id: 8,
    team1_display_name: "リバプール",
    team2_display_name: "ユベントス",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 7,
    execution_group: 3,
  },
  // 決勝（試合中）
  {
    match_id: 8,
    match_code: "M8",
    team1_id: "team-1",
    team2_id: "team-5",
    team1_tournament_team_id: 1,
    team2_tournament_team_id: 5,
    team1_display_name: "FCバルセロナ",
    team2_display_name: "バイエルン・ミュンヘン",
    team1_goals: 1,
    team2_goals: 1,
    team1_scores: [1, 0, 0, 0],
    team2_scores: [0, 1, 0, 0],
    is_draw: false,
    is_walkover: false,
    match_status: "ongoing",
    is_confirmed: false,
    execution_priority: 8,
    execution_group: 3,
  },
];

// BYE（不戦勝）を含むトーナメント
export const withByeMatches: BracketMatch[] = [
  // 準々決勝（BYEあり）
  {
    match_id: 1,
    match_code: "M1",
    team1_id: "team-1",
    team2_id: undefined,
    team1_tournament_team_id: 1,
    team2_tournament_team_id: null,
    team1_display_name: "FCバルセロナ",
    team2_display_name: "BYE",
    team1_goals: 0,
    team2_goals: 0,
    winner_team_id: "team-1",
    winner_tournament_team_id: 1,
    is_draw: false,
    is_walkover: true,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 1,
    execution_group: 1,
  },
  {
    match_id: 2,
    match_code: "M2",
    team1_id: "team-3",
    team2_id: "team-4",
    team1_tournament_team_id: 3,
    team2_tournament_team_id: 4,
    team1_display_name: "マンチェスター・シティ",
    team2_display_name: "リバプール",
    team1_goals: 2,
    team2_goals: 1,
    team1_scores: [1, 0, 1, 0],
    team2_scores: [0, 1, 0, 0],
    winner_team_id: "team-3",
    winner_tournament_team_id: 3,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 2,
    execution_group: 1,
  },
  {
    match_id: 3,
    match_code: "M3",
    team1_id: "team-5",
    team2_id: undefined,
    team1_tournament_team_id: 5,
    team2_tournament_team_id: null,
    team1_display_name: "バイエルン・ミュンヘン",
    team2_display_name: "BYE",
    team1_goals: 0,
    team2_goals: 0,
    winner_team_id: "team-5",
    winner_tournament_team_id: 5,
    is_draw: false,
    is_walkover: true,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 3,
    execution_group: 1,
  },
  {
    match_id: 4,
    match_code: "M4",
    team1_id: "team-7",
    team2_id: "team-8",
    team1_tournament_team_id: 7,
    team2_tournament_team_id: 8,
    team1_display_name: "パリ・サンジェルマン",
    team2_display_name: "ユベントス",
    team1_goals: 3,
    team2_goals: 2,
    team1_scores: [1, 1, 1, 0],
    team2_scores: [1, 0, 1, 0],
    winner_team_id: "team-7",
    winner_tournament_team_id: 7,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 4,
    execution_group: 1,
  },
  // 準決勝
  {
    match_id: 5,
    match_code: "M5",
    team1_id: "team-1",
    team2_id: "team-3",
    team1_tournament_team_id: 1,
    team2_tournament_team_id: 3,
    team1_display_name: "FCバルセロナ",
    team2_display_name: "マンチェスター・シティ",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 5,
    execution_group: 2,
  },
  {
    match_id: 6,
    match_code: "M6",
    team1_id: "team-5",
    team2_id: "team-7",
    team1_tournament_team_id: 5,
    team2_tournament_team_id: 7,
    team1_display_name: "バイエルン・ミュンヘン",
    team2_display_name: "パリ・サンジェルマン",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 6,
    execution_group: 2,
  },
  // 3位決定戦・決勝（未確定）
  {
    match_id: 7,
    match_code: "M7",
    team1_tournament_team_id: null,
    team2_tournament_team_id: null,
    team1_display_name: "未確定",
    team2_display_name: "未確定",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 7,
    execution_group: 3,
  },
  {
    match_id: 8,
    match_code: "M8",
    team1_tournament_team_id: null,
    team2_tournament_team_id: null,
    team1_display_name: "未確定",
    team2_display_name: "未確定",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 8,
    execution_group: 3,
  },
];

// 不戦勝（チーム辞退による）を含むトーナメント
export const withWalkoverMatches: BracketMatch[] = [
  ...eightTeamCompletedMatches.slice(0, 3),
  // M4で不戦勝
  {
    match_id: 4,
    match_code: "M4",
    team1_id: "team-7",
    team2_id: "team-8",
    team1_tournament_team_id: 7,
    team2_tournament_team_id: 8,
    team1_display_name: "パリ・サンジェルマン",
    team2_display_name: "ユベントス（辞退）",
    team1_goals: 0,
    team2_goals: 0,
    winner_team_id: "team-7",
    winner_tournament_team_id: 7,
    is_draw: false,
    is_walkover: true,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 4,
    execution_group: 1,
  },
  ...eightTeamCompletedMatches.slice(4),
];

// PK戦を含むトーナメント
export const withPKMatches: BracketMatch[] = [
  ...eightTeamCompletedMatches.slice(0, 5),
  // M6でPK戦
  {
    match_id: 6,
    match_code: "M6",
    team1_id: "team-5",
    team2_id: "team-8",
    team1_tournament_team_id: 5,
    team2_tournament_team_id: 8,
    team1_display_name: "バイエルン・ミュンヘン",
    team2_display_name: "ユベントス",
    team1_goals: 3,
    team2_goals: 3,
    // 4クォーター（各0-1得点）+ PK（3-2）
    team1_scores: [1, 0, 1, 1, 3],
    team2_scores: [1, 1, 0, 1, 2],
    winner_team_id: "team-5",
    winner_tournament_team_id: 5,
    is_draw: false,
    is_walkover: false,
    match_status: "completed",
    is_confirmed: true,
    execution_priority: 6,
    execution_group: 2,
    soccer_data: {
      regular_goals_for: 3,
      regular_goals_against: 3,
      pk_goals_for: 3,
      pk_goals_against: 2,
      is_pk_game: true,
      pk_winner: true,
    },
  },
  ...eightTeamCompletedMatches.slice(6),
];

// 未開始のトーナメント
export const emptyTournamentMatches: BracketMatch[] = [
  {
    match_id: 1,
    match_code: "M1",
    team1_tournament_team_id: 1,
    team2_tournament_team_id: 2,
    team1_display_name: "チームA",
    team2_display_name: "チームB",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 1,
    execution_group: 1,
  },
  {
    match_id: 2,
    match_code: "M2",
    team1_tournament_team_id: 3,
    team2_tournament_team_id: 4,
    team1_display_name: "チームC",
    team2_display_name: "チームD",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 2,
    execution_group: 1,
  },
  {
    match_id: 3,
    match_code: "M3",
    team1_tournament_team_id: 5,
    team2_tournament_team_id: 6,
    team1_display_name: "チームE",
    team2_display_name: "チームF",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 3,
    execution_group: 1,
  },
  {
    match_id: 4,
    match_code: "M4",
    team1_tournament_team_id: 7,
    team2_tournament_team_id: 8,
    team1_display_name: "チームG",
    team2_display_name: "チームH",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 4,
    execution_group: 1,
  },
  {
    match_id: 5,
    match_code: "M5",
    team1_tournament_team_id: null,
    team2_tournament_team_id: null,
    team1_display_name: "未確定",
    team2_display_name: "未確定",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 5,
    execution_group: 2,
  },
  {
    match_id: 6,
    match_code: "M6",
    team1_tournament_team_id: null,
    team2_tournament_team_id: null,
    team1_display_name: "未確定",
    team2_display_name: "未確定",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 6,
    execution_group: 2,
  },
  {
    match_id: 7,
    match_code: "M7",
    team1_tournament_team_id: null,
    team2_tournament_team_id: null,
    team1_display_name: "未確定",
    team2_display_name: "未確定",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 7,
    execution_group: 3,
  },
  {
    match_id: 8,
    match_code: "M8",
    team1_tournament_team_id: null,
    team2_tournament_team_id: null,
    team1_display_name: "未確定",
    team2_display_name: "未確定",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 8,
    execution_group: 3,
  },
];

// APIレスポンスの型
export interface BracketApiResponse {
  success: boolean;
  data: BracketMatch[];
  sport_config?: SportScoreConfig;
  error?: string;
}

// モックAPIレスポンス生成関数
export function createMockResponse(
  matches: BracketMatch[],
  sportConfig: SportScoreConfig = defaultSportConfig
): BracketApiResponse {
  return {
    success: true,
    data: matches,
    sport_config: sportConfig,
  };
}

// tournamentId に応じたモックデータを返す関数
export function getMockDataByTournamentId(tournamentId: number): BracketApiResponse {
  switch (tournamentId) {
    case 1:
      return createMockResponse(eightTeamCompletedMatches);
    case 2:
      return createMockResponse(eightTeamOngoingMatches);
    case 3:
      return createMockResponse(withByeMatches);
    case 4:
      return createMockResponse(withWalkoverMatches);
    case 5:
      return createMockResponse(withPKMatches);
    case 6:
      return createMockResponse(emptyTournamentMatches);
    default:
      return createMockResponse(eightTeamCompletedMatches);
  }
}
