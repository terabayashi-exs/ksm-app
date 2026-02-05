// lib/match-results-calculator.ts
// MIGRATION NOTE: tournament_team_idベースで実装済み（2026-02-04）
// team_idはTeamInfo構造体に保持（マスターチームとの関連維持のため）
import { db } from '@/lib/db';
import {
  getSportScoreConfig,
  getTournamentSportCode,
  extractSoccerScoreData,
  SportScoreConfig,
  SoccerScoreData
} from '@/lib/sport-standings-calculator';
import { parseTotalScore, parseScoreArray } from '@/lib/score-parser';

/**
 * スコア文字列を数値に変換（全形式対応）
 * @deprecated 新しいコードでは parseTotalScore を使用してください
 */
function parseScore(score: string | number | bigint | ArrayBuffer | null | undefined): number | null {
  const result = parseTotalScore(score);
  return result === 0 && !score ? null : result;
}

export interface MatchResult {
  match_id: number;
  match_block_id: number;
  team1_id: string;
  team2_id: string;
  team1_tournament_team_id: number | null; // 複数エントリーチーム対応
  team2_tournament_team_id: number | null; // 複数エントリーチーム対応
  team1_display_name: string;
  team2_display_name: string;
  team1_goals: number | null;
  team2_goals: number | null;
  // 多競技対応の拡張フィールド
  team1_scores?: number[];
  team2_scores?: number[];
  active_periods?: number[];
  winner_team_id: string | null;
  winner_tournament_team_id: number | null; // 複数エントリーチーム対応
  is_draw: boolean;
  is_walkover: boolean;
  match_code: string;
  is_confirmed: boolean;
  match_status: string | null;
  cancellation_type: string | null;
  // サッカー専用データ（該当する場合のみ）
  soccer_data?: SoccerScoreData;
}

export interface TeamInfo {
  tournament_team_id: number; // 一意のID（PRIMARY KEY）- これを主キーとして使用
  team_id: string; // マスターチームとの関連（後方互換性のため保持）
  team_name: string;
  team_omission?: string;
  display_name: string; // 略称優先の表示名（画面表示用）
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
  [tournamentTeamId: number]: {
    [opponentTournamentTeamId: number]: {
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
    // 大会のformat_idとブロック情報を取得
    const tournamentInfoResult = await db.execute({
      sql: `
        SELECT t.format_id, mb.block_name
        FROM t_tournaments t
        JOIN t_match_blocks mb ON mb.tournament_id = t.tournament_id
        WHERE mb.match_block_id = ?
      `,
      args: [matchBlockId]
    });

    const formatId = tournamentInfoResult.rows[0]?.format_id as number;
    const blockName = tournamentInfoResult.rows[0]?.block_name as string || '';

    // ブロック内のチーム一覧を取得（試合データから実際に使用されているdisplay_nameを取得）
    // tournament_team_idを使ってJOINすることで複数エントリーチームを正しく区別
    // 決勝リーグ対応: テンプレート表示名でソートして表示順序を維持
    const teamsResult = await db.execute({
      sql: `
        SELECT
          tt.tournament_team_id,
          tt.team_id,
          tt.team_name,
          tt.team_omission,
          tt.block_position,
          COALESCE(
            (
              SELECT COALESCE(mt.team1_display_name, ml.team1_display_name)
              FROM t_matches_live ml
              LEFT JOIN m_match_templates mt ON ml.match_code = mt.match_code AND mt.format_id = ?
              WHERE ml.team1_tournament_team_id = tt.tournament_team_id
                AND ml.match_block_id = ?
              LIMIT 1
            ),
            (
              SELECT COALESCE(mt.team2_display_name, ml.team2_display_name)
              FROM t_matches_live ml
              LEFT JOIN m_match_templates mt ON ml.match_code = mt.match_code AND mt.format_id = ?
              WHERE ml.team2_tournament_team_id = tt.tournament_team_id
                AND ml.match_block_id = ?
              LIMIT 1
            )
          ) as display_name,
          COALESCE(
            (
              SELECT COALESCE(mt.team1_display_name, ml.team1_display_name)
              FROM t_matches_live ml
              LEFT JOIN m_match_templates mt ON ml.match_code = mt.match_code AND mt.format_id = ?
              WHERE ml.team1_tournament_team_id = tt.tournament_team_id
                AND ml.match_block_id = ?
              LIMIT 1
            ),
            (
              SELECT COALESCE(mt.team2_display_name, ml.team2_display_name)
              FROM t_matches_live ml
              LEFT JOIN m_match_templates mt ON ml.match_code = mt.match_code AND mt.format_id = ?
              WHERE ml.team2_tournament_team_id = tt.tournament_team_id
                AND ml.match_block_id = ?
              LIMIT 1
            )
          ) as template_display_name
        FROM t_tournament_teams tt
        WHERE tt.tournament_id = ?
          AND EXISTS (
            SELECT 1 FROM t_matches_live ml
            WHERE (ml.team1_tournament_team_id = tt.tournament_team_id
                   OR ml.team2_tournament_team_id = tt.tournament_team_id)
              AND ml.match_block_id = ?
          )
        ORDER BY template_display_name NULLS LAST, tt.block_position NULLS LAST
      `,
      args: [formatId, matchBlockId, formatId, matchBlockId, formatId, matchBlockId, formatId, matchBlockId, tournamentId, matchBlockId]
    });

    let teams: TeamInfo[] = (teamsResult.rows || []).map(row => ({
      tournament_team_id: row.tournament_team_id as number,
      team_id: row.team_id as string,
      team_name: row.team_name as string,
      team_omission: row.team_omission as string || undefined,
      display_name: row.display_name as string  // 試合データから取得したdisplay_nameを使用
    }));

    console.log(`[TEAMS] Block ${blockName}: Found ${teams.length} teams:`, teams.map(t => `${t.team_id}:${t.display_name}`).join(', '));

    // チーム登録がない場合、試合から実際のチーム情報を取得（略称含む、未確定チームも含む）
    // 決勝リーグ対応: tournament_team_idを使用し、テンプレート表示名でソート
    if (teams.length === 0) {
      const placeholderTeamsResult = await db.execute({
        sql: `
          WITH team_positions AS (
            SELECT DISTINCT
              COALESCE(mt.team1_display_name, ml.team1_display_name) as template_display_name,
              ml.team1_id as team_id,
              ml.team1_display_name as team_display_name,
              ml.team1_tournament_team_id as tournament_team_id,
              tt.team_name,
              tt.team_omission
            FROM t_matches_live ml
            LEFT JOIN m_match_templates mt ON ml.match_code = mt.match_code AND mt.format_id = ?
            LEFT JOIN t_tournament_teams tt ON ml.team1_tournament_team_id = tt.tournament_team_id
            WHERE ml.match_block_id = ?
            AND ml.team1_display_name IS NOT NULL
            UNION
            SELECT DISTINCT
              COALESCE(mt.team2_display_name, ml.team2_display_name) as template_display_name,
              ml.team2_id as team_id,
              ml.team2_display_name as team_display_name,
              ml.team2_tournament_team_id as tournament_team_id,
              tt.team_name,
              tt.team_omission
            FROM t_matches_live ml
            LEFT JOIN m_match_templates mt ON ml.match_code = mt.match_code AND mt.format_id = ?
            LEFT JOIN t_tournament_teams tt ON ml.team2_tournament_team_id = tt.tournament_team_id
            WHERE ml.match_block_id = ?
            AND ml.team2_display_name IS NOT NULL
          )
          SELECT
            template_display_name,
            MAX(tournament_team_id) as tournament_team_id,
            MAX(team_id) as team_id,
            MAX(team_name) as team_name,
            MAX(team_omission) as team_omission,
            MAX(team_display_name) as team_display_name
          FROM team_positions
          GROUP BY template_display_name
          ORDER BY template_display_name
        `,
        args: [formatId, matchBlockId, formatId, matchBlockId]
      });

      teams = (placeholderTeamsResult.rows || []).map((row, index) => {
        const teamData = {
          tournament_team_id: row.tournament_team_id as number || -(matchBlockId * 1000 + index),  // プレースホルダーの場合は負の値
          team_id: row.team_id as string || `placeholder_${matchBlockId}_${index}`,
          team_name: row.team_name as string || row.template_display_name as string,
          team_omission: row.team_omission as string || undefined,
          display_name: (row.team_display_name as string) || (row.template_display_name as string)  // 実際の試合のdisplay_nameを優先
        };
        console.log(`[PLACEHOLDER_TEAM] ${teamData.display_name} (tournament_team_id: ${teamData.tournament_team_id}, team_display: ${row.team_display_name}, template: ${row.template_display_name}, omission: ${row.team_omission}, name: ${row.team_name})`);
        return teamData;
      });
    }

    // 確定済みの試合と未確定試合のコード情報を取得（現在のスキーマに対応）
    // チーム登録がない場合も表示できるよう、team_display_nameを含める
    // tournament_team_idも取得して複数エントリーチームに対応
    const matchesResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_block_id,
          ml.team1_id,
          ml.team2_id,
          ml.team1_tournament_team_id,
          ml.team2_tournament_team_id,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.match_code,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.winner_tournament_team_id,
          mf.is_draw,
          mf.is_walkover,
          ml.match_status,
          ml.cancellation_type,
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
      const team1TournamentTeamId = row.team1_tournament_team_id as number | null;
      const team2TournamentTeamId = row.team2_tournament_team_id as number | null;
      const team1DisplayName = row.team1_display_name as string;
      const team2DisplayName = row.team2_display_name as string;

      // teamsリストから対応するチームIDを検索
      // tournament_team_idが設定されている場合は優先使用（複数エントリーチーム対応）
      const getTeamId = (actualId: string | null, tournamentTeamId: number | null, displayName: string): string => {
        if (actualId) {
          // tournament_team_idが設定されている場合は、それを使ってteam_idを取得
          if (tournamentTeamId) {
            const teamWithTournamentId = teams.find(t => t.tournament_team_id === tournamentTeamId);
            if (teamWithTournamentId) {
              return teamWithTournamentId.team_id;
            }
          }
          return actualId;
        }
        const placeholderTeam = teams.find(t => t.display_name === displayName);
        return placeholderTeam?.team_id || `placeholder_${displayName}`;
      };

      // 基本データ
      const team1_goals = parseScore(row.team1_scores);
      const team2_goals = parseScore(row.team2_scores);
      const is_confirmed = Boolean(row.is_confirmed);

      // デバッグログ: A2試合の詳細
      if (row.match_code === 'A2') {
        console.log(`[RAW_A2] row.team1_scores="${row.team1_scores}", row.team2_scores="${row.team2_scores}", row.is_confirmed=${row.is_confirmed}`);
        console.log(`[PARSED_A2] team1_goals=${team1_goals}, team2_goals=${team2_goals}, is_confirmed=${is_confirmed}`);
        console.log(`[PARSED_A2] team1Name="${team1DisplayName}", team2Name="${team2DisplayName}"`);
      }

      const baseMatch: MatchResult = {
        match_id: row.match_id as number,
        match_block_id: row.match_block_id as number,
        team1_id: getTeamId(team1Id, team1TournamentTeamId, team1DisplayName),
        team2_id: getTeamId(team2Id, team2TournamentTeamId, team2DisplayName),
        team1_tournament_team_id: team1TournamentTeamId,
        team2_tournament_team_id: team2TournamentTeamId,
        team1_display_name: team1DisplayName,
        team2_display_name: team2DisplayName,
        // スコアの処理（カンマ区切り対応）
        team1_goals: team1_goals,
        team2_goals: team2_goals,
        winner_team_id: row.winner_team_id as string | null,
        winner_tournament_team_id: row.winner_tournament_team_id as number | null,
        is_draw: Boolean(row.is_draw),
        is_walkover: Boolean(row.is_walkover),
        match_code: row.match_code as string,
        is_confirmed: is_confirmed,
        match_status: row.match_status as string | null,
        cancellation_type: row.cancellation_type as string | null
      };

      // 多競技対応の拡張データ
      try {
        const team1ScoresStr = row.team1_scores as string | null;
        const team2ScoresStr = row.team2_scores as string | null;
        const periodCount = row.period_count as number | null;

        if (team1ScoresStr && team2ScoresStr) {
          // parseScoreArray()で全形式に対応（JSON形式・カンマ区切り・単一数値）
          const team1Scores = parseScoreArray(team1ScoresStr);
          const team2Scores = parseScoreArray(team2ScoresStr);

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
    matrix[team.tournament_team_id] = {};
    teams.forEach(opponent => {
      if (team.tournament_team_id !== opponent.tournament_team_id) {
        matrix[team.tournament_team_id][opponent.tournament_team_id] = {
          result: null,
          score: '-',
          match_code: ''
        };
      }
    });
  });

  // 試合結果を反映
  matches.forEach(match => {
    const team1Name = match.team1_display_name;
    const team2Name = match.team2_display_name;

    // tournament_team_idを直接使用（複数エントリーチーム対応）
    const team1Id = match.team1_tournament_team_id;
    const team2Id = match.team2_tournament_team_id;

    // チームIDが存在するかチェック
    // 決勝トーナメントでは未確定チームの可能性があるため、より詳細なログを出力
    if (!team1Id || !team2Id) {
      console.log(`[MATRIX] Missing tournament_team_id: ${match.match_code}, team1="${team1Name}"(${team1Id}), team2="${team2Name}"(${team2Id})`);
      return;
    }

    if (!matrix[team1Id] || !matrix[team2Id]) {
      console.log(`[MATRIX] Matrix not initialized for tournament_team_id: ${match.match_code}, team1Id=${team1Id} exists:${!!matrix[team1Id]}, team2Id=${team2Id} exists:${!!matrix[team2Id]}`);
      console.log(`[MATRIX] Available team IDs in matrix: ${Object.keys(matrix).join(', ')}`);
      return;
    }

    // 中止された試合の場合（ただし、確定済み不戦勝は除く）
    if (match.match_status === 'cancelled' && !match.is_confirmed) {
      console.log(`[MATRIX] Unconfirmed cancelled match: ${match.match_code}`);
      let cancelLabel = '中止';
      if (match.cancellation_type === 'no_count') {
        cancelLabel = '中止';
      } else if (match.cancellation_type === 'no_show_both') {
        cancelLabel = '中止\n（両者不参加）';
      } else if (match.cancellation_type === 'no_show_team1' || match.cancellation_type === 'no_show_team2') {
        cancelLabel = '中止\n（不戦勝）';
      }

      matrix[team1Id][team2Id] = {
        result: null,
        score: cancelLabel,
        match_code: match.match_code
      };

      matrix[team2Id][team1Id] = {
        result: null,
        score: cancelLabel,
        match_code: match.match_code
      };
      return;
    }

    // 確定済み不戦勝試合のデバッグログ
    if (match.match_status === 'cancelled' && match.is_confirmed && match.is_walkover) {
      console.log(`[MATRIX] Confirmed walkover match: ${match.match_code}, team1_goals=${match.team1_goals}, team2_goals=${match.team2_goals}, winner=${match.winner_team_id}`);
    }

    // 未実施・進行中・完了（未確定）の試合の場合は状態を表示
    if (!match.is_confirmed || match.team1_goals === null || match.team2_goals === null) {
      console.log(`[MATRIX] Unconfirmed match: ${match.match_code}, is_confirmed=${match.is_confirmed}, team1_goals=${match.team1_goals}, team2_goals=${match.team2_goals}, team1Name="${team1Name}", team2Name="${team2Name}"`);
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

    // 不戦引き分けの特別処理（両チーム不参加の場合）
    if (match.is_walkover && match.is_draw) {
      // 両チーム不参加の場合は0-0引き分け扱い
      console.log(`[MATRIX] Processing walkover draw (both teams absent): ${match.match_code}`);

      if (matrix[team1Id] && matrix[team2Id] && matrix[team1Id][team2Id] && matrix[team2Id][team1Id]) {
        const team1GoalsDisplay = isNaN(team1Goals) ? 0 : Math.floor(team1Goals);
        const team2GoalsDisplay = isNaN(team2Goals) ? 0 : Math.floor(team2Goals);

        const team1ScoreDisplay = `不戦引分\n${team1GoalsDisplay}-${team2GoalsDisplay}`;
        const team2ScoreDisplay = `不戦引分\n${team2GoalsDisplay}-${team1GoalsDisplay}`;

        matrix[team1Id][team2Id] = {
          result: 'draw',
          score: team1ScoreDisplay,
          match_code: match.match_code
        };
        matrix[team2Id][team1Id] = {
          result: 'draw',
          score: team2ScoreDisplay,
          match_code: match.match_code
        };
        console.log(`[MATRIX] Set walkover draw for ${team1Name}(${team1Id}) vs ${team2Name}(${team2Id})`);
      }
    } else if (match.is_walkover) {
      // 不戦勝の場合（片方チーム不参加）
      console.log(`[MATRIX] Processing walkover: ${match.match_code}, winner_team_id=${match.winner_team_id}, winner_tournament_team_id=${match.winner_tournament_team_id}`);

      // winner_tournament_team_idを優先、winner_team_idはフォールバック
      const winnerTournamentTeamId = match.winner_tournament_team_id;
      const winnerId = match.winner_team_id;

      if (!winnerTournamentTeamId && !winnerId) {
        console.log(`[MATRIX] No winner identified for walkover match: ${match.match_code}`);
        return;
      }

      // winner_tournament_team_idとtournament_team_idを使って勝者を特定（複数エントリーチーム対応）
      let winnerTournamentId: number;
      let loserTournamentId: number;
      let winnerName: string;
      let loserName: string;

      // winner_tournament_team_idが設定されている場合は直接使用（推奨）
      if (winnerTournamentTeamId && match.team1_tournament_team_id && match.team2_tournament_team_id) {
        if (winnerTournamentTeamId === match.team1_tournament_team_id) {
          winnerTournamentId = match.team1_tournament_team_id;
          loserTournamentId = match.team2_tournament_team_id;
          winnerName = team1Name;
          loserName = team2Name;
        } else {
          winnerTournamentId = match.team2_tournament_team_id;
          loserTournamentId = match.team1_tournament_team_id;
          winnerName = team2Name;
          loserName = team1Name;
        }
      } else if (winnerId && match.team1_tournament_team_id && match.team2_tournament_team_id) {
        // フォールバック: winner_team_idを使って判定（team_idとの照合）
        const team1 = teams.find(t => t.tournament_team_id === match.team1_tournament_team_id);
        const team2 = teams.find(t => t.tournament_team_id === match.team2_tournament_team_id);

        if (team1 && team2 && team1.team_id === winnerId) {
          winnerTournamentId = team1.tournament_team_id;
          loserTournamentId = team2.tournament_team_id;
          winnerName = team1Name;
          loserName = team2Name;
        } else if (team1 && team2 && team2.team_id === winnerId) {
          winnerTournamentId = team2.tournament_team_id;
          loserTournamentId = team1.tournament_team_id;
          winnerName = team2Name;
          loserName = team1Name;
        } else {
          console.log(`[MATRIX] Cannot match winner_team_id to tournament_team_id for walkover: ${match.match_code}`);
          return;
        }
      } else {
        // 古いデータ用フォールバック: team_idのみで判定
        winnerTournamentId = winnerId === match.team1_id ? team1Id : team2Id;
        loserTournamentId = winnerId === match.team1_id ? team2Id : team1Id;
        winnerName = winnerId === match.team1_id ? team1Name : team2Name;
        loserName = winnerId === match.team1_id ? team2Name : team1Name;
      }

      console.log(`[MATRIX] Walkover result: winner=${winnerName}(${winnerTournamentId}), loser=${loserName}(${loserTournamentId})`);

      // スコアを取得
      const team1Goals = match.team1_goals ?? 0;
      const team2Goals = match.team2_goals ?? 0;

      if (matrix[winnerTournamentId] && matrix[loserTournamentId]) {
        // 勝者側のスコア表示を決定
        const winnerScore = winnerId === match.team1_id
          ? `不戦勝\n${team1Goals}-${team2Goals}`
          : `不戦勝\n${team2Goals}-${team1Goals}`;

        // 敗者側のスコア表示を決定
        const loserScore = winnerId === match.team1_id
          ? `不戦敗\n${team2Goals}-${team1Goals}`
          : `不戦敗\n${team1Goals}-${team2Goals}`;

        matrix[winnerTournamentId][loserTournamentId] = {
          result: 'win',
          score: winnerScore,
          match_code: match.match_code
        };
        console.log(`[MATRIX] Set walkover win for ${winnerName}(${winnerTournamentId}) vs ${loserName}(${loserTournamentId})`);

        matrix[loserTournamentId][winnerTournamentId] = {
          result: 'loss',
          score: loserScore,
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
      // winner_tournament_team_idを優先、winner_team_idはフォールバック
      const winnerTournamentTeamId = match.winner_tournament_team_id;
      const winnerId = match.winner_team_id;

      if (!winnerTournamentTeamId && !winnerId) {
        console.log(`[MATRIX] No winner identified for match: ${match.match_code}`);
        return;
      }

      // winner_tournament_team_idとtournament_team_idを使って勝者を特定（複数エントリーチーム対応）
      let winnerTournamentId: number;
      let loserTournamentId: number;
      let winnerName: string;
      let loserName: string;
      let winnerGoals: number;
      let loserGoals: number;

      // winner_tournament_team_idが設定されている場合は直接使用（推奨）
      if (winnerTournamentTeamId && match.team1_tournament_team_id && match.team2_tournament_team_id) {
        if (winnerTournamentTeamId === match.team1_tournament_team_id) {
          winnerTournamentId = match.team1_tournament_team_id;
          loserTournamentId = match.team2_tournament_team_id;
          winnerName = team1Name;
          loserName = team2Name;
          winnerGoals = team1Goals;
          loserGoals = team2Goals;
        } else {
          winnerTournamentId = match.team2_tournament_team_id;
          loserTournamentId = match.team1_tournament_team_id;
          winnerName = team2Name;
          loserName = team1Name;
          winnerGoals = team2Goals;
          loserGoals = team1Goals;
        }
      } else if (winnerId && match.team1_tournament_team_id && match.team2_tournament_team_id) {
        // フォールバック: winner_team_idを使って判定（team_idとの照合）
        const team1 = teams.find(t => t.tournament_team_id === match.team1_tournament_team_id);
        const team2 = teams.find(t => t.tournament_team_id === match.team2_tournament_team_id);

        if (team1 && team2 && team1.team_id === winnerId) {
          winnerTournamentId = team1.tournament_team_id;
          loserTournamentId = team2.tournament_team_id;
          winnerName = team1Name;
          loserName = team2Name;
          winnerGoals = team1Goals;
          loserGoals = team2Goals;
        } else if (team1 && team2 && team2.team_id === winnerId) {
          winnerTournamentId = team2.tournament_team_id;
          loserTournamentId = team1.tournament_team_id;
          winnerName = team2Name;
          loserName = team1Name;
          winnerGoals = team2Goals;
          loserGoals = team1Goals;
        } else {
          console.log(`[MATRIX] Cannot match winner_team_id to tournament_team_id: ${match.match_code}`);
          return;
        }
      } else {
        // 古いデータ用フォールバック: team_idのみで判定
        winnerTournamentId = winnerId === match.team1_id ? team1Id : team2Id;
        loserTournamentId = winnerId === match.team1_id ? team2Id : team1Id;
        winnerName = winnerId === match.team1_id ? team1Name : team2Name;
        loserName = winnerId === match.team1_id ? team2Name : team1Name;
        winnerGoals = winnerId === match.team1_id ? team1Goals : team2Goals;
        loserGoals = winnerId === match.team1_id ? team2Goals : team1Goals;
      }

      console.log(`[MATRIX_WIN] ${match.match_code}: winnerName="${winnerName}"(${winnerTournamentId}), loserName="${loserName}"(${loserTournamentId}), matrix[${winnerTournamentId}]=${!!matrix[winnerTournamentId]}, matrix[${loserTournamentId}]=${!!matrix[loserTournamentId]}`);

      if (matrix[winnerTournamentId] && matrix[loserTournamentId] && matrix[winnerTournamentId][loserTournamentId] && matrix[loserTournamentId][winnerTournamentId]) {
        // 勝者側の表示
        const winnerGoalsDisplay = isNaN(winnerGoals) ? 0 : Math.floor(winnerGoals);
        const loserGoalsDisplay = isNaN(loserGoals) ? 0 : Math.floor(loserGoals);

        let winnerScoreDisplay = `〇\n${winnerGoalsDisplay}-${loserGoalsDisplay}`;
        let loserScoreDisplay = `×\n${loserGoalsDisplay}-${winnerGoalsDisplay}`;

        // サッカーでPK戦がある場合の特別表示
        if (sportCode === 'soccer' && match.soccer_data?.is_pk_game) {
          const pkScoreWinner = winnerId === match.team1_id
            ? `${match.soccer_data.pk_goals_for || 0}-${match.soccer_data.pk_goals_against || 0}`
            : `${match.soccer_data.pk_goals_against || 0}-${match.soccer_data.pk_goals_for || 0}`;
          const pkScoreLoser = winnerId === match.team1_id
            ? `${match.soccer_data.pk_goals_against || 0}-${match.soccer_data.pk_goals_for || 0}`
            : `${match.soccer_data.pk_goals_for || 0}-${match.soccer_data.pk_goals_against || 0}`;

          winnerScoreDisplay = `〇\n${winnerGoalsDisplay}-${loserGoalsDisplay}\n(PK ${pkScoreWinner})`;
          loserScoreDisplay = `×\n${loserGoalsDisplay}-${winnerGoalsDisplay}\n(PK ${pkScoreLoser})`;
        }

        matrix[winnerTournamentId][loserTournamentId] = {
          result: 'win',
          score: winnerScoreDisplay,
          match_code: match.match_code,
          soccer_data: winnerId === match.team1_id ? match.soccer_data : undefined
        };

        matrix[loserTournamentId][winnerTournamentId] = {
          result: 'loss',
          score: loserScoreDisplay,
          match_code: match.match_code,
          soccer_data: winnerId !== match.team1_id ? match.soccer_data : undefined
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
      } else if (score?.includes('中止')) {
        return 'text-red-600 bg-white font-medium';
      }
      return 'text-gray-600 bg-white font-medium'; // 試合コード用にスタイルを調整
  }
}