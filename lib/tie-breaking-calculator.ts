// lib/tie-breaking-calculator.ts
// 順位決定計算エンジン - カスタムルールによる順位決定

import { db } from '@/lib/db';
import { TieBreakingRule, parseTieBreakingRules } from '@/lib/tie-breaking-rules';

/**
 * チーム成績データの型定義
 */
export interface TeamStandingData {
  team_id: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  // 追加フィールド（競技種別によって使用）
  win_rate?: number;
  best_time?: number;
  fair_play_points?: number;
}

/**
 * 試合データの型定義
 */
export interface MatchData {
  match_id: number;
  team1_id: string;
  team2_id: string;
  team1_goals: number;
  team2_goals: number;
  winner_team_id: string | null;
  is_draw: boolean;
  is_confirmed: boolean;
}

/**
 * 順位決定計算コンテキスト
 */
export interface TieBreakingContext {
  teams: TeamStandingData[];
  matches: MatchData[];
  sportCode: string;
  rules: TieBreakingRule[];
  tournamentId: number;
  matchBlockId: number;
}

/**
 * 順位決定結果
 */
export interface TieBreakingResult {
  teams: TeamStandingData[];
  tieBreakingApplied: boolean;
  lotteriesRequired: string[]; // 抽選が必要なチームIDのグループ
  calculations: TieBreakingCalculation[];
}

/**
 * 順位決定計算の詳細
 */
export interface TieBreakingCalculation {
  rule_type: string;
  teams_affected: string[];
  description: string;
  result: 'resolved' | 'unresolved' | 'lottery_required';
}

/**
 * 順位決定計算関数の型
 */
type TieBreakingCalculator = (
  teams: TeamStandingData[],
  context: TieBreakingContext
) => Promise<{ teams: TeamStandingData[]; resolved: boolean; }>;

/**
 * 順位決定計算エンジンクラス
 */
export class TieBreakingEngine {
  private calculators: Map<string, TieBreakingCalculator>;

  constructor(sportCode: string) {
    this.calculators = this.initializeCalculators(sportCode);
  }

  /**
   * 競技種別に応じた計算関数マップを初期化
   */
  private initializeCalculators(sportCode: string): Map<string, TieBreakingCalculator> {
    const calculators = new Map<string, TieBreakingCalculator>();

    // 共通ルール
    calculators.set('points', this.calculateByPoints.bind(this));
    calculators.set('head_to_head', this.calculateByHeadToHead.bind(this)); // 後方互換
    calculators.set('h2h_points', this.calculateByH2HPoints.bind(this));
    calculators.set('h2h_goal_difference', this.calculateByH2HGoalDifference.bind(this));
    calculators.set('h2h_goals_for', this.calculateByH2HGoalsFor.bind(this));
    calculators.set('lottery', this.calculateByLottery.bind(this));

    // 競技種別固有ルール
    if (sportCode === 'soccer' || sportCode === 'pk_championship') {
      calculators.set('goal_difference', this.calculateByGoalDifference.bind(this));
      calculators.set('goals_for', this.calculateByGoalsFor.bind(this));
      calculators.set('fair_play', this.calculateByFairPlay.bind(this));
    } else if (sportCode === 'baseball') {
      calculators.set('win_rate', this.calculateByWinRate.bind(this));
      calculators.set('run_difference', this.calculateByGoalDifference.bind(this)); // 同じロジック
      calculators.set('runs_scored', this.calculateByGoalsFor.bind(this)); // 同じロジック
    } else if (sportCode === 'track_and_field') {
      calculators.set('best_time', this.calculateByBestTime.bind(this));
      calculators.set('win_count', this.calculateByWinCount.bind(this));
      calculators.set('podium_count', this.calculateByPodiumCount.bind(this));
    } else if (sportCode === 'basketball') {
      calculators.set('win_rate', this.calculateByWinRate.bind(this));
      calculators.set('point_difference', this.calculateByGoalDifference.bind(this)); // 同じロジック
      calculators.set('points_scored', this.calculateByGoalsFor.bind(this)); // 同じロジック
    }

    return calculators;
  }

  /**
   * メイン計算実行
   */
  async calculateTieBreaking(context: TieBreakingContext): Promise<TieBreakingResult> {
    let { teams } = context;
    const calculations: TieBreakingCalculation[] = [];
    let tieBreakingApplied = false;
    const lotteriesRequired: string[] = [];

    // 基本的な順位付け（勝点→得失点差→総得点）を行う
    const basicSorted = [...teams].sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
      if (a.goals_for !== b.goals_for) return b.goals_for - a.goals_for;
      return a.team_name.localeCompare(b.team_name, 'ja');
    });

    // 統計値の同一性で同着グループを特定
    const tiedGroups = this.groupByStatistics(basicSorted);

    for (const group of tiedGroups) {
      if (group.teams.length <= 1) continue; // 同順位なし

      let groupTeams = [...group.teams];
      let resolved = false;

      // 設定されたルールを順番に適用
      for (const rule of context.rules.sort((a, b) => a.order - b.order)) {
        const calculator = this.calculators.get(rule.type);
        if (!calculator) continue;

        try {
          const result = await calculator(groupTeams, context);
          groupTeams = result.teams;
          resolved = result.resolved;

          calculations.push({
            rule_type: rule.type,
            teams_affected: group.teams.map(t => t.team_id),
            description: this.getCalculationDescription(rule.type, group.teams.length),
            result: resolved ? 'resolved' : 'unresolved'
          });

          if (resolved) {
            tieBreakingApplied = true;
            break;
          }
        } catch (error) {
          console.error(`計算エラー (${rule.type}):`, error);
          calculations.push({
            rule_type: rule.type,
            teams_affected: group.teams.map(t => t.team_id),
            description: `計算エラー: ${error instanceof Error ? error.message : String(error)}`,
            result: 'unresolved'
          });
        }
      }

      // 抽選が必要な場合
      if (!resolved && groupTeams.length > 1) {
        lotteriesRequired.push(groupTeams.map(t => t.team_id).join(','));
        calculations.push({
          rule_type: 'lottery',
          teams_affected: groupTeams.map(t => t.team_id),
          description: '抽選による順位決定が必要です',
          result: 'lottery_required'
        });
      }

      // グループの結果を元のリストに反映（H2Hで解決済みならresolved=trueを渡す）
      teams = this.mergeGroupResults(teams, groupTeams, group.position, resolved);
    }

    return {
      teams: tieBreakingApplied ? teams : this.assignFinalPositions(teams),
      tieBreakingApplied,
      lotteriesRequired,
      calculations
    };
  }

  /**
   * 勝点による順位決定
   */
  private async calculateByPoints(
    teams: TeamStandingData[],
    _context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    const sorted = [...teams].sort((a, b) => b.points - a.points);
    const resolved = this.hasUniqueRanking(sorted, (team) => team.points);
    return { teams: sorted, resolved };
  }

  /**
   * 得失点差による順位決定
   */
  private async calculateByGoalDifference(
    teams: TeamStandingData[],
    _context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    const sorted = [...teams].sort((a, b) => b.goal_difference - a.goal_difference);
    const resolved = this.hasUniqueRanking(sorted, (team) => team.goal_difference);
    return { teams: sorted, resolved };
  }

  /**
   * 総得点による順位決定
   */
  private async calculateByGoalsFor(
    teams: TeamStandingData[],
    _context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    const sorted = [...teams].sort((a, b) => b.goals_for - a.goals_for);
    const resolved = this.hasUniqueRanking(sorted, (team) => team.goals_for);
    return { teams: sorted, resolved };
  }

  /**
   * 勝率による順位決定
   */
  private async calculateByWinRate(
    teams: TeamStandingData[],
    _context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    const teamsWithRate = teams.map(team => ({
      ...team,
      win_rate: team.matches_played > 0 ? team.wins / team.matches_played : 0
    }));
    
    const sorted = teamsWithRate.sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0));
    const resolved = this.hasUniqueRanking(sorted, (team) => team.win_rate || 0);
    return { teams: sorted, resolved };
  }

  /**
   * 直接対決結果による順位決定
   */
  private async calculateByHeadToHead(
    teams: TeamStandingData[],
    context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    if (teams.length !== 2) {
      // 3チーム以上の場合は複雑になるため、現在は2チームのみ対応
      return { teams, resolved: false };
    }

    const team1 = teams[0];
    const team2 = teams[1];

    // 直接対決の試合を検索
    const headToHeadMatches = context.matches.filter(match =>
      (match.team1_id === team1.team_id && match.team2_id === team2.team_id) ||
      (match.team1_id === team2.team_id && match.team2_id === team1.team_id)
    );

    if (headToHeadMatches.length === 0) {
      return { teams, resolved: false };
    }

    // 直接対決での成績を計算
    let team1Points = 0;
    let team1Goals = 0;
    let team2Goals = 0;

    for (const match of headToHeadMatches) {
      if (match.is_draw) {
        team1Points += 1;
      } else if (match.winner_team_id === team1.team_id) {
        team1Points += 3;
      }

      if (match.team1_id === team1.team_id) {
        team1Goals += match.team1_goals;
        team2Goals += match.team2_goals;
      } else {
        team1Goals += match.team2_goals;
        team2Goals += match.team1_goals;
      }
    }

    const team2Points = headToHeadMatches.length * 3 - team1Points;

    // 直接対決の勝点で判定
    if (team1Points !== team2Points) {
      const sorted = team1Points > team2Points ? [team1, team2] : [team2, team1];
      return { teams: sorted, resolved: true };
    }

    // 勝点が同じ場合は得失点差で判定
    const team1Diff = team1Goals - team2Goals;
    const team2Diff = team2Goals - team1Goals;

    if (team1Diff !== team2Diff) {
      const sorted = team1Diff > team2Diff ? [team1, team2] : [team2, team1];
      return { teams: sorted, resolved: true };
    }

    return { teams, resolved: false };
  }

  /**
   * H2H統計を計算するヘルパー（2チーム間の全直接対決から勝点・得点・失点を集計）
   */
  private calculateH2HStats(
    teams: TeamStandingData[],
    matches: MatchData[]
  ): Map<string, { points: number; goalsFor: number; goalsAgainst: number; goalDifference: number }> {
    const stats = new Map<string, { points: number; goalsFor: number; goalsAgainst: number; goalDifference: number }>();
    const teamIds = new Set(teams.map(t => t.team_id));

    // 初期化
    for (const team of teams) {
      stats.set(team.team_id, { points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 });
    }

    // 対象チーム間の試合のみ抽出
    const h2hMatches = matches.filter(m =>
      teamIds.has(m.team1_id) && teamIds.has(m.team2_id)
    );

    for (const match of h2hMatches) {
      const s1 = stats.get(match.team1_id)!;
      const s2 = stats.get(match.team2_id)!;

      s1.goalsFor += match.team1_goals;
      s1.goalsAgainst += match.team2_goals;
      s2.goalsFor += match.team2_goals;
      s2.goalsAgainst += match.team1_goals;

      if (match.is_draw) {
        s1.points += 1;
        s2.points += 1;
      } else if (match.winner_team_id === match.team1_id) {
        s1.points += 3;
      } else if (match.winner_team_id === match.team2_id) {
        s2.points += 3;
      }
    }

    // 得失点差を計算
    for (const [, s] of stats) {
      s.goalDifference = s.goalsFor - s.goalsAgainst;
    }

    return stats;
  }

  /**
   * 当該チーム間の勝点による順位決定
   */
  private async calculateByH2HPoints(
    teams: TeamStandingData[],
    context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    if (teams.length < 2) return { teams, resolved: false };

    const stats = this.calculateH2HStats(teams, context.matches);
    const sorted = [...teams].sort((a, b) => {
      const sa = stats.get(a.team_id)!;
      const sb = stats.get(b.team_id)!;
      return sb.points - sa.points;
    });

    // 全チームの勝点が同じなら未解決
    const allSame = sorted.every(t => stats.get(t.team_id)!.points === stats.get(sorted[0].team_id)!.points);
    return { teams: sorted, resolved: !allSame };
  }

  /**
   * 当該チーム間の得失点差による順位決定
   */
  private async calculateByH2HGoalDifference(
    teams: TeamStandingData[],
    context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    if (teams.length < 2) return { teams, resolved: false };

    const stats = this.calculateH2HStats(teams, context.matches);
    const sorted = [...teams].sort((a, b) => {
      const sa = stats.get(a.team_id)!;
      const sb = stats.get(b.team_id)!;
      return sb.goalDifference - sa.goalDifference;
    });

    const allSame = sorted.every(t => stats.get(t.team_id)!.goalDifference === stats.get(sorted[0].team_id)!.goalDifference);
    return { teams: sorted, resolved: !allSame };
  }

  /**
   * 当該チーム間の総得点による順位決定
   */
  private async calculateByH2HGoalsFor(
    teams: TeamStandingData[],
    context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    if (teams.length < 2) return { teams, resolved: false };

    const stats = this.calculateH2HStats(teams, context.matches);
    const sorted = [...teams].sort((a, b) => {
      const sa = stats.get(a.team_id)!;
      const sb = stats.get(b.team_id)!;
      return sb.goalsFor - sa.goalsFor;
    });

    const allSame = sorted.every(t => stats.get(t.team_id)!.goalsFor === stats.get(sorted[0].team_id)!.goalsFor);
    return { teams: sorted, resolved: !allSame };
  }

  /**
   * ベストタイムによる順位決定（陸上競技）
   */
  private async calculateByBestTime(
    teams: TeamStandingData[],
    _context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    // best_timeが設定されている場合のみ（少ない方が上位）
    const teamsWithTime = teams.filter(team => team.best_time !== undefined && team.best_time > 0);
    const teamsWithoutTime = teams.filter(team => team.best_time === undefined || team.best_time <= 0);

    const sortedWithTime = teamsWithTime.sort((a, b) => (a.best_time || 0) - (b.best_time || 0));
    const sorted = [...sortedWithTime, ...teamsWithoutTime];
    
    const resolved = this.hasUniqueRanking(sortedWithTime, (team) => team.best_time || 0);
    return { teams: sorted, resolved };
  }

  /**
   * 勝利数による順位決定
   */
  private async calculateByWinCount(
    teams: TeamStandingData[],
    _context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    const sorted = [...teams].sort((a, b) => b.wins - a.wins);
    const resolved = this.hasUniqueRanking(sorted, (team) => team.wins);
    return { teams: sorted, resolved };
  }

  /**
   * 表彰台回数による順位決定
   */
  private async calculateByPodiumCount(
    teams: TeamStandingData[],
    _context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    // 仮実装（実際にはpodium_countフィールドが必要）
    const sorted = [...teams].sort((a, b) => b.wins - a.wins); // 暫定的に勝利数を使用
    const resolved = this.hasUniqueRanking(sorted, (team) => team.wins);
    return { teams: sorted, resolved };
  }

  /**
   * フェアプレーポイントによる順位決定（サッカー）
   */
  private async calculateByFairPlay(
    teams: TeamStandingData[],
    _context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    // 仮実装（実際にはfair_play_pointsフィールドが必要）
    // 少ない方が上位
    const sorted = [...teams].sort((a, b) => (a.fair_play_points || 0) - (b.fair_play_points || 0));
    const resolved = this.hasUniqueRanking(sorted, (team) => team.fair_play_points || 0);
    return { teams: sorted, resolved };
  }

  /**
   * 抽選による順位決定（手動設定要求）
   */
  private async calculateByLottery(
    teams: TeamStandingData[],
    _context: TieBreakingContext
  ): Promise<{ teams: TeamStandingData[]; resolved: boolean; }> {
    // 抽選は手動設定が必要なため、解決されない
    return { teams, resolved: false };
  }

  /**
   * ユーティリティ関数群
   */

  private groupByPosition(teams: TeamStandingData[]): Array<{ position: number; teams: TeamStandingData[] }> {
    const groups = new Map<number, TeamStandingData[]>();
    
    for (const team of teams) {
      if (!groups.has(team.position)) {
        groups.set(team.position, []);
      }
      groups.get(team.position)!.push(team);
    }

    return Array.from(groups.entries()).map(([position, teams]) => ({ position, teams }));
  }

  /**
   * 統計値（勝点・得失点差・総得点）の同一性でグループ化
   */
  private groupByStatistics(teams: TeamStandingData[]): Array<{ position: number; teams: TeamStandingData[] }> {
    const groups: Array<{ position: number; teams: TeamStandingData[] }> = [];
    let currentPosition = 1;
    
    for (let i = 0; i < teams.length; i++) {
      const currentTeam = teams[i];
      const group: TeamStandingData[] = [currentTeam];
      
      // 同じ統計値を持つ後続チームを探す
      for (let j = i + 1; j < teams.length; j++) {
        const nextTeam = teams[j];
        if (
          currentTeam.points === nextTeam.points &&
          currentTeam.goal_difference === nextTeam.goal_difference &&
          currentTeam.goals_for === nextTeam.goals_for
        ) {
          group.push(nextTeam);
        } else {
          break; // 統計値が異なる場合は終了
        }
      }
      
      groups.push({ position: currentPosition, teams: group });
      currentPosition += group.length; // 次のグループの開始順位
      i += group.length - 1; // 処理済みチームをスキップ
    }
    
    return groups;
  }

  private hasUniqueRanking<T>(teams: T[], getValue: (team: T) => number): boolean {
    if (teams.length <= 1) return true;
    
    const values = teams.map(getValue);
    return new Set(values).size === values.length;
  }

  private mergeGroupResults(
    allTeams: TeamStandingData[],
    groupTeams: TeamStandingData[],
    startPosition: number,
    resolved: boolean = false
  ): TeamStandingData[] {
    const groupTeamIds = new Set(groupTeams.map(t => t.team_id));
    const otherTeams = allTeams.filter(t => !groupTeamIds.has(t.team_id));

    // グループ内の順位を再設定
    const updatedGroupTeams: TeamStandingData[] = [];
    let currentPosition = startPosition;

    for (let i = 0; i < groupTeams.length; i++) {
      const currentTeam = groupTeams[i];
      updatedGroupTeams.push({ ...currentTeam, position: currentPosition });

      if (i < groupTeams.length - 1) {
        if (resolved) {
          // タイブレーキングで解決済み → ソート順に連番で割り当て
          currentPosition = startPosition + i + 1;
        } else {
          // 未解決 → 全体統計値が同じなら同着
          const nextTeam = groupTeams[i + 1];
          const isNextTeamTied =
            currentTeam.points === nextTeam.points &&
            currentTeam.goal_difference === nextTeam.goal_difference &&
            currentTeam.goals_for === nextTeam.goals_for;

          if (!isNextTeamTied) {
            currentPosition = startPosition + i + 1;
          }
        }
      }
    }

    return [...otherTeams, ...updatedGroupTeams].sort((a, b) => a.position - b.position);
  }

  private assignFinalPositions(teams: TeamStandingData[]): TeamStandingData[] {
    const result: TeamStandingData[] = [];
    let currentPosition = 1;
    
    for (let i = 0; i < teams.length; i++) {
      const currentTeam = teams[i];
      result.push({ ...currentTeam, position: currentPosition });
      
      // 次のチームと統計値が同じかチェック
      if (i < teams.length - 1) {
        const nextTeam = teams[i + 1];
        const isNextTeamTied = 
          currentTeam.points === nextTeam.points &&
          currentTeam.goal_difference === nextTeam.goal_difference &&
          currentTeam.goals_for === nextTeam.goals_for;
        
        if (!isNextTeamTied) {
          currentPosition = i + 2; // 次の順位は現在のインデックス + 2
        }
        // 同着の場合はcurrentPositionを変更しない
      }
    }
    
    return result;
  }

  private getCalculationDescription(ruleType: string, teamsCount: number): string {
    const descriptions: Record<string, string> = {
      points: `勝点による順位決定（${teamsCount}チーム）`,
      goal_difference: `得失点差による順位決定（${teamsCount}チーム）`,
      goals_for: `総得点による順位決定（${teamsCount}チーム）`,
      head_to_head: `直接対決結果による順位決定（${teamsCount}チーム）`,
      h2h_points: `当該チーム間の勝点による順位決定（${teamsCount}チーム）`,
      h2h_goal_difference: `当該チーム間の得失点差による順位決定（${teamsCount}チーム）`,
      h2h_goals_for: `当該チーム間の総得点による順位決定（${teamsCount}チーム）`,
      win_rate: `勝率による順位決定（${teamsCount}チーム）`,
      best_time: `ベストタイムによる順位決定（${teamsCount}チーム）`,
      win_count: `勝利数による順位決定（${teamsCount}チーム）`,
      fair_play: `フェアプレーポイントによる順位決定（${teamsCount}チーム）`,
      lottery: `抽選による順位決定（${teamsCount}チーム）`
    };

    return descriptions[ruleType] || `${ruleType}による順位決定（${teamsCount}チーム）`;
  }
}

/**
 * 大会の順位決定ルール設定を取得
 */
export async function getTournamentTieBreakingRules(
  tournamentId: number,
  phase: string
): Promise<TieBreakingRule[]> {
  try {
    const result = await db.execute(`
      SELECT tie_breaking_rules, tie_breaking_enabled
      FROM t_tournament_rules
      WHERE tournament_id = ? AND phase = ?
    `, [tournamentId, phase]);

    if (result.rows.length === 0 || !result.rows[0].tie_breaking_enabled) {
      return [];
    }

    const rulesJson = result.rows[0].tie_breaking_rules;
    return parseTieBreakingRules(rulesJson ? String(rulesJson) : null);
  } catch (error) {
    console.error('順位決定ルール取得エラー:', error);
    return [];
  }
}

/**
 * 手動順位設定が必要かどうかをチェック
 */
export function requiresManualRanking(result: TieBreakingResult): boolean {
  return result.lotteriesRequired.length > 0;
}