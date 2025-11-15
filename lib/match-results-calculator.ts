// lib/match-results-calculator.ts
import { db } from '@/lib/db';
import { 
  getSportScoreConfig, 
  getTournamentSportCode, 
  extractSoccerScoreData,
  SportScoreConfig,
  SoccerScoreData
} from '@/lib/sport-standings-calculator';

/**
 * スコア文字列を数値に変換（カンマ区切り対応）
 */
function parseScore(score: string | number | bigint | ArrayBuffer | null | undefined): number | null {
  if (score === null || score === undefined) {
    return null;
  }
  
  if (typeof score === 'number') {
    return isNaN(score) ? null : score;
  }
  
  if (typeof score === 'bigint') {
    return Number(score);
  }
  
  if (score instanceof ArrayBuffer) {
    // ArrayBufferを文字列として扱う
    const decoder = new TextDecoder();
    const stringValue = decoder.decode(score);
    return parseScore(stringValue); // 再帰的に処理
  }
  
  if (typeof score === 'string') {
    // 空文字列の場合
    if (score.trim() === '') {
      return null;
    }
    
    // カンマ区切りの場合は合計を計算
    if (score.includes(',')) {
      const total = score.split(',').reduce((sum, s) => sum + (parseInt(s.trim()) || 0), 0);
      return isNaN(total) ? null : total;
    }
    
    // 単一値の場合
    const parsed = parseInt(score.trim());
    return isNaN(parsed) ? null : parsed;
  }
  
  return null;
}

export interface MatchResult {
  match_id: number;
  match_block_id: number;
  team1_id: string;
  team2_id: string;
  team1_goals: number | null;
  team2_goals: number | null;
  // 多競技対応の拡張フィールド
  team1_scores?: number[];
  team2_scores?: number[];
  active_periods?: number[];
  winner_team_id: string | null;
  is_draw: boolean;
  is_walkover: boolean;
  match_code: string;
  is_confirmed: boolean;
  match_status: string | null;
  // サッカー専用データ（該当する場合のみ）
  soccer_data?: SoccerScoreData;
}

export interface TeamInfo {
  team_id: string;
  team_name: string;
  team_omission?: string;
  display_name: string; // 略称優先の表示名
}

export interface BlockResults {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  teams: TeamInfo[];
  matches: MatchResult[];
  match_matrix: MatchMatrix;
  remarks?: string | null;
  // 多競技対応の追加フィールド
  sport_config?: SportScoreConfig;
}

export interface MatchMatrix {
  [teamId: string]: {
    [opponentId: string]: {
      result: 'win' | 'loss' | 'draw' | null;
      score: string; // 多競技対応：スコア表示形式
      match_code: string;
      // サッカー専用情報（該当する場合のみ）
      soccer_data?: SoccerScoreData;
    };
  };
}

/**
 * 大会の戦績表データを取得する（多競技対応版）
 */
export async function getTournamentResults(tournamentId: number): Promise<BlockResults[]> {
  try {
    // 競技種別を取得
    const sportCode = await getTournamentSportCode(tournamentId);
    const sportConfig = getSportScoreConfig(sportCode);
    
    // ブロック情報を取得
    const blocks = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          phase,
          display_round_name,
          block_name,
          remarks
        FROM t_match_blocks 
        WHERE tournament_id = ? 
        ORDER BY block_order, match_block_id
      `,
      args: [tournamentId]
    });

    if (!blocks.rows || blocks.rows.length === 0) {
      return [];
    }

    const results: BlockResults[] = [];

    // 各ブロックの戦績データを取得
    for (const block of blocks.rows) {
      const blockResult = await getBlockResults(
        block.match_block_id as number,
        tournamentId,
        sportCode
      );

      results.push({
        match_block_id: block.match_block_id as number,
        phase: block.phase as string,
        display_round_name: block.display_round_name as string,
        block_name: block.block_name as string,
        teams: blockResult.teams,
        matches: blockResult.matches,
        match_matrix: blockResult.match_matrix,
        remarks: block.remarks as string | null,
        sport_config: sportConfig
      });
    }

    return results;
  } catch (error) {
    console.error('戦績表取得エラー:', error);
    console.error('Tournament ID:', tournamentId);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    throw new Error(`戦績表の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 特定ブロックの戦績データを取得する（多競技対応版）
 */
async function getBlockResults(
  matchBlockId: number,
  tournamentId: number,
  sportCode: string
): Promise<{
  teams: TeamInfo[];
  matches: MatchResult[];
  match_matrix: MatchMatrix;
}> {
  try {
    // ブロック内のチーム一覧を取得（ブロック内ポジション順）
    const teamsResult = await db.execute({
      sql: `
        SELECT DISTINCT
          tt.team_id,
          t.team_name,
          t.team_omission,
          tt.block_position
        FROM t_tournament_teams tt
        JOIN m_teams t ON tt.team_id = t.team_id
        WHERE tt.tournament_id = ?
        AND tt.assigned_block = (
          SELECT block_name
          FROM t_match_blocks
          WHERE match_block_id = ?
        )
        ORDER BY tt.block_position NULLS LAST, t.team_name
      `,
      args: [tournamentId, matchBlockId]
    });

    let teams: TeamInfo[] = (teamsResult.rows || []).map(row => ({
      team_id: row.team_id as string,
      team_name: row.team_name as string,
      team_omission: row.team_omission as string || undefined,
      display_name: (row.team_omission as string) || (row.team_name as string)
    }));

    // チーム登録がない場合、m_match_templatesのプレースホルダーから生成
    if (teams.length === 0) {
      const placeholderTeamsResult = await db.execute({
        sql: `
          SELECT DISTINCT
            team1_display_name as display_name
          FROM t_matches_live
          WHERE match_block_id = ?
          AND team1_display_name IS NOT NULL
          UNION
          SELECT DISTINCT
            team2_display_name as display_name
          FROM t_matches_live
          WHERE match_block_id = ?
          AND team2_display_name IS NOT NULL
          ORDER BY display_name
        `,
        args: [matchBlockId, matchBlockId]
      });

      teams = (placeholderTeamsResult.rows || []).map((row, index) => ({
        team_id: `placeholder_${matchBlockId}_${index}`,
        team_name: row.display_name as string,
        team_omission: undefined,
        display_name: row.display_name as string
      }));
    }

    // 確定済みの試合と未確定試合のコード情報を取得（現在のスキーマに対応）
    // チーム登録がない場合も表示できるよう、team_display_nameを含める
    const matchesResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_block_id,
          ml.team1_id,
          ml.team2_id,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.match_code,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover,
          ml.match_status,
          -- 多競技対応の拡張情報（現在のスキーマに対応）
          ml.period_count,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE ml.match_block_id = ?
        ORDER BY ml.match_code
      `,
      args: [matchBlockId]
    });

    const matches: MatchResult[] = (matchesResult.rows || []).map(row => {
      // チームIDがnullの場合、プレースホルダーIDを生成
      const team1Id = row.team1_id as string | null;
      const team2Id = row.team2_id as string | null;
      const team1DisplayName = row.team1_display_name as string;
      const team2DisplayName = row.team2_display_name as string;

      // teamsリストから対応するプレースホルダーIDを検索
      const getTeamId = (actualId: string | null, displayName: string): string => {
        if (actualId) return actualId;
        const placeholderTeam = teams.find(t => t.display_name === displayName);
        return placeholderTeam?.team_id || `placeholder_${displayName}`;
      };

      // 基本データ
      const baseMatch: MatchResult = {
        match_id: row.match_id as number,
        match_block_id: row.match_block_id as number,
        team1_id: getTeamId(team1Id, team1DisplayName),
        team2_id: getTeamId(team2Id, team2DisplayName),
        // スコアの処理（カンマ区切り対応）
        team1_goals: parseScore(row.team1_scores),
        team2_goals: parseScore(row.team2_scores),
        winner_team_id: row.winner_team_id as string | null,
        is_draw: Boolean(row.is_draw),
        is_walkover: Boolean(row.is_walkover),
        match_code: row.match_code as string,
        is_confirmed: Boolean(row.is_confirmed),
        match_status: row.match_status as string | null
      };

      // 多競技対応の拡張データ
      try {
        const team1ScoresStr = row.team1_scores as string | null;
        const team2ScoresStr = row.team2_scores as string | null;
        const periodCount = row.period_count as number | null;

        if (team1ScoresStr && team2ScoresStr) {
          // カンマ区切り文字列を配列に変換（JSONではない場合の対応）
          let team1Scores: number[];
          let team2Scores: number[];
          
          try {
            // まずJSONとしてパースを試行
            team1Scores = JSON.parse(team1ScoresStr);
            team2Scores = JSON.parse(team2ScoresStr);
          } catch {
            // JSON形式でない場合はカンマ区切り文字列として処理
            team1Scores = team1ScoresStr.split(',').map(s => parseInt(s.trim()) || 0);
            team2Scores = team2ScoresStr.split(',').map(s => parseInt(s.trim()) || 0);
          }

          baseMatch.team1_scores = team1Scores;
          baseMatch.team2_scores = team2Scores;
          
          // period_countからactive_periodsを生成
          if (periodCount && periodCount > 0) {
            baseMatch.active_periods = Array.from({ length: periodCount }, (_, i) => i + 1);
          }

          // サッカーの場合はPKデータを抽出
          if (sportCode === 'soccer' && baseMatch.is_confirmed && baseMatch.active_periods) {
            const team1SoccerData = extractSoccerScoreData(
              team1Scores, team2Scores, baseMatch.team1_id, 
              baseMatch.team1_id, baseMatch.team2_id, 
              baseMatch.winner_team_id, baseMatch.active_periods
            );
            
            baseMatch.soccer_data = team1SoccerData;
          }
        }
      } catch {
        // エラーの場合は基本データのみ使用
      }

      return baseMatch;
    });

    // 星取表マトリックスを作成（多競技対応）
    const match_matrix = createMatchMatrix(teams, matches, sportCode);

    return {
      teams,
      matches,
      match_matrix
    };
  } catch (error) {
    console.error(`ブロック ${matchBlockId} の戦績データ取得エラー:`, error);
    console.error('Match Block ID:', matchBlockId);
    console.error('Tournament ID:', tournamentId);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    throw new Error(`ブロック戦績データの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 星取表マトリックスを作成する（多競技対応版）
 */
function createMatchMatrix(
  teams: TeamInfo[], 
  matches: MatchResult[], 
  sportCode: string
): MatchMatrix {
  const matrix: MatchMatrix = {};

  // 初期化：全チーム同士の組み合わせをnullで初期化
  teams.forEach(team => {
    matrix[team.team_id] = {};
    teams.forEach(opponent => {
      if (team.team_id !== opponent.team_id) {
        matrix[team.team_id][opponent.team_id] = {
          result: null,
          score: '-',
          match_code: ''
        };
      }
    });
  });

  // 試合結果を反映
  matches.forEach(match => {
    const team1Id = match.team1_id;
    const team2Id = match.team2_id;
    
    // チームIDが存在するかチェック
    if (!matrix[team1Id] || !matrix[team2Id]) {
      return;
    }
    
    // 未実施・進行中・完了（未確定）の試合の場合は状態を表示
    if (!match.is_confirmed || match.team1_goals === null || match.team2_goals === null) {
      let displayText = match.match_code; // デフォルトは試合コード
      
      // 試合状態に応じて表示テキストを決定（試合コード付き）
      switch (match.match_status) {
        case 'scheduled':
          displayText = `${match.match_code}`;
          break;
        case 'ongoing':
          displayText = `${match.match_code}\n試合中`;
          break;
        case 'completed':
          displayText = `${match.match_code}\n試合完了`;
          break;
        default:
          displayText = match.match_code; // 状態不明の場合は試合コード
      }
      
      matrix[team1Id][team2Id] = {
        result: null,
        score: displayText,
        match_code: match.match_code
      };
      
      matrix[team2Id][team1Id] = {
        result: null,
        score: displayText,
        match_code: match.match_code
      };
      return;
    }
    
    const team1Goals = match.team1_goals ?? 0;
    const team2Goals = match.team2_goals ?? 0;

    if (match.is_walkover) {
      // 不戦勝の場合
      const winnerId = match.winner_team_id;
      if (!winnerId) return;
      
      const loserId = winnerId === team1Id ? team2Id : team1Id;
      
      if (matrix[winnerId] && matrix[loserId]) {
        matrix[winnerId][loserId] = {
          result: 'win',
          score: '不戦勝',
          match_code: match.match_code
        };
        
        matrix[loserId][winnerId] = {
          result: 'loss',
          score: '不戦敗',
          match_code: match.match_code
        };
      }
    } else if (match.is_draw) {
      // 引き分けの場合（多競技対応）
      if (matrix[team1Id] && matrix[team2Id] && matrix[team1Id][team2Id] && matrix[team2Id][team1Id]) {
        const team1GoalsDisplay = isNaN(team1Goals) ? 0 : Math.floor(team1Goals);
        const team2GoalsDisplay = isNaN(team2Goals) ? 0 : Math.floor(team2Goals);
        
        let team1ScoreDisplay = `△\n${team1GoalsDisplay}-${team2GoalsDisplay}`;
        let team2ScoreDisplay = `△\n${team2GoalsDisplay}-${team1GoalsDisplay}`;
        
        // サッカーでPK戦がある場合の特別表示（引き分けでPK戦実施のケース）
        if (sportCode === 'soccer' && match.soccer_data?.is_pk_game) {
          const team1PkScore = `${match.soccer_data.pk_goals_for || 0}-${match.soccer_data.pk_goals_against || 0}`;
          const team2PkScore = `${match.soccer_data.pk_goals_against || 0}-${match.soccer_data.pk_goals_for || 0}`;
          
          team1ScoreDisplay = `△\n${team1GoalsDisplay}-${team2GoalsDisplay}\n(PK ${team1PkScore})`;
          team2ScoreDisplay = `△\n${team2GoalsDisplay}-${team1GoalsDisplay}\n(PK ${team2PkScore})`;
        }

        matrix[team1Id][team2Id] = {
          result: 'draw',
          score: team1ScoreDisplay,
          match_code: match.match_code,
          soccer_data: match.soccer_data
        };
        
        matrix[team2Id][team1Id] = {
          result: 'draw',
          score: team2ScoreDisplay,
          match_code: match.match_code,
          soccer_data: match.soccer_data
        };
      }
    } else {
      // 勝敗が決まった場合（多競技対応）
      const winnerId = match.winner_team_id;
      if (!winnerId) return;
      
      const loserId = winnerId === team1Id ? team2Id : team1Id;
      const winnerGoals = winnerId === team1Id ? team1Goals : team2Goals;
      const loserGoals = winnerId === team1Id ? team2Goals : team1Goals;

      if (matrix[winnerId] && matrix[loserId] && matrix[winnerId][loserId] && matrix[loserId][winnerId]) {
        // 勝者側の表示
        const winnerGoalsDisplay = isNaN(winnerGoals) ? 0 : Math.floor(winnerGoals);
        const loserGoalsDisplay = isNaN(loserGoals) ? 0 : Math.floor(loserGoals);
        
        let winnerScoreDisplay = `〇\n${winnerGoalsDisplay}-${loserGoalsDisplay}`;
        let loserScoreDisplay = `×\n${loserGoalsDisplay}-${winnerGoalsDisplay}`;
        
        // サッカーでPK戦がある場合の特別表示
        if (sportCode === 'soccer' && match.soccer_data?.is_pk_game) {
          const pkScoreWinner = winnerId === team1Id 
            ? `${match.soccer_data.pk_goals_for || 0}-${match.soccer_data.pk_goals_against || 0}`
            : `${match.soccer_data.pk_goals_against || 0}-${match.soccer_data.pk_goals_for || 0}`;
          const pkScoreLoser = winnerId === team1Id 
            ? `${match.soccer_data.pk_goals_against || 0}-${match.soccer_data.pk_goals_for || 0}`
            : `${match.soccer_data.pk_goals_for || 0}-${match.soccer_data.pk_goals_against || 0}`;
            
          winnerScoreDisplay = `〇\n${winnerGoalsDisplay}-${loserGoalsDisplay}\n(PK ${pkScoreWinner})`;
          loserScoreDisplay = `×\n${loserGoalsDisplay}-${winnerGoalsDisplay}\n(PK ${pkScoreLoser})`;
        }

        matrix[winnerId][loserId] = {
          result: 'win',
          score: winnerScoreDisplay,
          match_code: match.match_code,
          soccer_data: winnerId === team1Id ? match.soccer_data : undefined
        };
        
        matrix[loserId][winnerId] = {
          result: 'loss',
          score: loserScoreDisplay,
          match_code: match.match_code,
          soccer_data: loserId === team1Id ? match.soccer_data : undefined
        };
      }
    }
  });

  return matrix;
}

/**
 * チーム名の表示名を取得（略称優先）
 */
export function getDisplayName(team: TeamInfo): string {
  return team.team_omission || team.team_name;
}

/**
 * 結果の色を取得
 */
export function getResultColor(result: 'win' | 'loss' | 'draw' | null, score?: string): string {
  switch (result) {
    case 'win':
      return 'text-black bg-white';
    case 'loss':
      return 'text-gray-500 bg-white';
    case 'draw':
      return 'text-black bg-white';
    default:
      // 状態表示の色分け
      if (score === '未実施') {
        return 'text-gray-500 bg-white font-medium';
      } else if (score === '試合中') {
        return 'text-orange-600 bg-white font-medium animate-pulse';
      } else if (score === '試合完了') {
        return 'text-purple-600 bg-white font-medium';
      }
      return 'text-gray-600 bg-white font-medium'; // 試合コード用にスタイルを調整
  }
}