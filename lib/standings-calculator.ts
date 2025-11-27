// lib/standings-calculator.ts
import { db } from '@/lib/db';
import { promoteTeamsToFinalTournament } from '@/lib/tournament-promotion';
import { createTournamentNotification } from '@/lib/notifications';
import { handleTemplateBasedPositions } from '@/lib/template-position-handler';
import { 
  MultiSportTeamStanding, 
  getSportScoreConfig, 
  getTournamentSportCode,
  getMultiSportMatchResults
} from '@/lib/sport-standings-calculator';
import { 
  getTournamentTieBreakingRules,
  TieBreakingEngine,
  TieBreakingContext,
  requiresManualRanking,
  MatchData,
  TeamStandingData
} from '@/lib/tie-breaking-calculator';
import { getTournamentPointSystem, PointSystem } from '@/lib/point-system-loader';

/**
 * スコア文字列を数値に変換（カンマ区切り対応）
 * 注: この関数は非サッカー競技用です。サッカーの場合はcalculateMultiSportBlockStandingsのanalyzeScore関数が使用されます。
 * 非サッカー競技（pk_championshipなど）では全ピリオドを合計します。
 */
function parseScore(score: string | number | bigint | ArrayBuffer | null | undefined): number {
  if (score === null || score === undefined) {
    return 0;
  }

  if (typeof score === 'number') {
    return isNaN(score) ? 0 : score;
  }

  if (typeof score === 'bigint') {
    return Number(score);
  }

  if (score instanceof ArrayBuffer) {
    const decoder = new TextDecoder();
    const stringValue = decoder.decode(score);
    return parseScore(stringValue);
  }

  if (typeof score === 'string') {
    // 空文字列の場合
    if (score.trim() === '') {
      return 0;
    }

    // カンマ区切りの場合は全ピリオドを合計
    // 非サッカー競技（pk_championshipなど）では全ピリオドを合計
    if (score.includes(',')) {
      const scores = score.split(',').map(s => parseInt(s.trim()) || 0);
      const total = scores.reduce((sum, score) => sum + score, 0);
      return isNaN(total) ? 0 : total;
    }

    // 単一値の場合
    const parsed = parseInt(score.trim());
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

// Re-export for other modules
export type { MultiSportTeamStanding };

export interface TeamStanding {
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
}

export interface BlockStanding {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  teams: TeamStanding[];
  remarks?: string | null;
}

export interface MatchResult {
  match_id: number;
  match_block_id: number;
  team1_id: string | null;
  team2_id: string | null;
  team1_goals: string | number | bigint | ArrayBuffer | null | undefined; // Allow parseScore input types
  team2_goals: string | number | bigint | ArrayBuffer | null | undefined; // Allow parseScore input types
  winner_team_id: string | null;
  is_draw: boolean;
  is_walkover: boolean;
}

/**
 * 大会の順位表を取得する（team_rankingsから）
 */
export async function getTournamentStandings(tournamentId: number): Promise<BlockStanding[]> {
  try {
    // ブロック情報とteam_rankingsを取得（予選・決勝順、予選は試合コード順）
    const blocks = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          phase,
          display_round_name,
          block_name,
          team_rankings,
          remarks
        FROM t_match_blocks 
        WHERE tournament_id = ? 
        ORDER BY 
          CASE phase 
            WHEN 'preliminary' THEN 1 
            WHEN 'final' THEN 2 
            ELSE 3 
          END,
          block_name
      `,
      args: [tournamentId]
    });

    if (!blocks.rows || blocks.rows.length === 0) {
      return [];
    }

    const standings: BlockStanding[] = [];

    // フォーマットタイプを取得
    const formatResult = await db.execute({
      sql: `
        SELECT f.preliminary_format_type, f.final_format_type
        FROM t_tournaments t
        JOIN m_tournament_formats f ON t.format_id = f.format_id
        WHERE t.tournament_id = ?
      `,
      args: [tournamentId]
    });

    const preliminaryFormatType = formatResult.rows[0]?.preliminary_format_type as string;
    const finalFormatType = formatResult.rows[0]?.final_format_type as string;

    // 各ブロックの順位表を取得
    for (const block of blocks.rows) {
      const teamRankings = block.team_rankings as string;
      let teams: TeamStanding[] = [];

      if (teamRankings) {
        try {
          teams = JSON.parse(teamRankings);
        } catch (parseError) {
          console.error(`ブロック ${block.match_block_id} のteam_rankingsのパースに失敗:`, parseError);
          teams = [];
        }
      }

      // team_rankingsが空の場合の処理
      if (teams.length === 0) {
        const phase = block.phase as string;
        const currentFormatType = phase === 'final' ? finalFormatType : preliminaryFormatType;

        // トーナメント形式の場合のみ専用計算ロジックを使用
        if (currentFormatType === 'tournament') {
          console.log(`[getTournamentStandings] ${phase}トーナメントの順位を計算`);
          teams = await calculateFinalTournamentStandings(tournamentId);
        } else {
          // リーグ形式の場合は参加チーム一覧を取得
          console.log(`[getTournamentStandings] ${phase}リーグの参加チーム一覧を取得`);
          const participatingTeams = await getParticipatingTeamsForBlock(
            block.match_block_id as number,
            tournamentId
          );
          teams = participatingTeams;
        }
      }

      standings.push({
        match_block_id: block.match_block_id as number,
        phase: block.phase as string,
        display_round_name: block.display_round_name as string,
        block_name: block.block_name as string,
        teams: teams,
        remarks: block.remarks as string | null
      });
    }

    return standings;
  } catch (error) {
    console.error('順位表取得エラー:', error);
    throw new Error('順位表の取得に失敗しました');
  }
}

/**
 * トーナメント形式の順位を計算してteam_rankingsに保存する
 * @param tournamentId 大会ID
 * @param phase フェーズ（'preliminary' または 'final'）。省略時は 'final'
 */
export async function updateFinalTournamentRankings(tournamentId: number, phase: string = 'final'): Promise<void> {
  try {
    const phaseLabel = phase === 'final' ? '決勝' : '予選';
    console.log(`[TOURNAMENT_RANKINGS] ${phaseLabel}トーナメント順位更新開始: Tournament ${tournamentId}, Phase ${phase}`);

    // トーナメントブロックを取得
    const tournamentBlockResult = await db.execute({
      sql: `
        SELECT match_block_id, team_rankings
        FROM t_match_blocks
        WHERE tournament_id = ? AND phase = ?
      `,
      args: [tournamentId, phase]
    });

    if (tournamentBlockResult.rows.length === 0) {
      console.log(`[TOURNAMENT_RANKINGS] ${phaseLabel}トーナメントブロックが見つかりません`);
      return;
    }

    const tournamentBlockId = tournamentBlockResult.rows[0].match_block_id as number;

    console.log(`[TOURNAMENT_RANKINGS] 試合確定により順位を自動計算します`);
    
    // テンプレートベースの順位計算も利用可能か確認
    const templateRankings = await calculateTemplateBasedRankings(tournamentId, phase);
    let tournamentRankings: TeamStanding[] = [];

    if (templateRankings.length > 0) {
      console.log(`[TOURNAMENT_RANKINGS] テンプレートベース順位計算を使用`);
      tournamentRankings = templateRankings;
    } else {
      console.log(`[TOURNAMENT_RANKINGS] 従来の詳細順位計算を使用`);
      // 従来の計算方法を使用
      tournamentRankings = await calculateDetailedFinalTournamentStandings(tournamentId, phase);
    }

    if (tournamentRankings.length > 0) {
      // team_rankingsに保存
      await db.execute({
        sql: `
          UPDATE t_match_blocks
          SET team_rankings = ?, updated_at = datetime('now', '+9 hours')
          WHERE match_block_id = ?
        `,
        args: [JSON.stringify(tournamentRankings), tournamentBlockId]
      });

      console.log(`[TOURNAMENT_RANKINGS] ${phaseLabel}トーナメント順位更新完了: ${tournamentRankings.length}チーム`);
      tournamentRankings.forEach(team => {
        console.log(`[TOURNAMENT_RANKINGS]   ${team.position}位: ${team.team_name} (${team.team_id})`);
      });
    } else {
      console.log(`[TOURNAMENT_RANKINGS] 計算できる順位がありません`);
    }

  } catch (error) {
    console.error(`[TOURNAMENT_RANKINGS] トーナメント順位更新エラー:`, error);
    // エラーでも処理は継続
  }
}

/**
 * 試合結果確定時に順位表を計算・更新する
 */
export async function updateBlockRankingsOnMatchConfirm(matchBlockId: number, tournamentId: number): Promise<void> {
  try {
    console.log(`[STANDINGS] 順位表更新開始: Block ${matchBlockId}, Tournament ${tournamentId}`);

    // ブロック情報を取得してphaseを確認
    const blockInfoResult = await db.execute({
      sql: `SELECT phase FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });

    if (!blockInfoResult.rows || blockInfoResult.rows.length === 0) {
      throw new Error('ブロック情報が見つかりません');
    }

    const phase = blockInfoResult.rows[0].phase as string;
    console.log(`[STANDINGS] ブロックフェーズ: ${phase}`);

    // フォーマットタイプを取得して、リーグ戦かトーナメント戦かを判定
    const formatResult = await db.execute({
      sql: `
        SELECT f.preliminary_format_type, f.final_format_type
        FROM t_tournaments t
        JOIN m_tournament_formats f ON t.format_id = f.format_id
        WHERE t.tournament_id = ?
      `,
      args: [tournamentId]
    });

    const preliminaryFormatType = formatResult.rows[0]?.preliminary_format_type as string;
    const finalFormatType = formatResult.rows[0]?.final_format_type as string;

    // 現在のフェーズに応じたフォーマットタイプを取得
    const currentFormatType = phase === 'final' ? finalFormatType : preliminaryFormatType;
    console.log(`[STANDINGS] フェーズ: ${phase}, フォーマットタイプ: ${currentFormatType}`);

    // トーナメント形式の場合は該当ブロックのみ順位表を更新
    if (currentFormatType === 'tournament') {
      const phaseLabel = phase === 'final' ? '決勝' : '予選';
      console.log(`[STANDINGS] ${phaseLabel}トーナメント（ブロック ${matchBlockId} のみ）の順位表更新を実行`);

      // テンプレートベースの順位計算を試行
      const templateRankings = await calculateTemplateBasedRankingsForBlock(matchBlockId, tournamentId, phase);
      let blockRankings: TeamStanding[] = [];

      if (templateRankings.length > 0) {
        console.log(`[STANDINGS] テンプレートベース順位計算を使用`);
        blockRankings = templateRankings;
      } else {
        console.log(`[STANDINGS] 従来の詳細順位計算を使用`);
        // 従来の計算方法を使用（該当ブロックのみ）
        blockRankings = await calculateDetailedBlockTournamentStandings(matchBlockId, tournamentId, phase);
      }

      if (blockRankings.length > 0) {
        // team_rankingsに保存
        await db.execute({
          sql: `
            UPDATE t_match_blocks
            SET team_rankings = ?, updated_at = datetime('now', '+9 hours')
            WHERE match_block_id = ?
          `,
          args: [JSON.stringify(blockRankings), matchBlockId]
        });
        console.log(`[STANDINGS] ブロック ${matchBlockId} のトーナメント順位更新完了: ${blockRankings.length}チーム`);
      }

      return;
    }

    // リーグ形式の場合は以下のリーグ戦処理を継続
    console.log(`[STANDINGS] リーグ戦の順位表更新を実行`);

    // 競技種別を取得して適切な計算関数を選択
    const sportCode = await getTournamentSportCode(tournamentId);
    console.log(`[STANDINGS] 競技種別: ${sportCode}`);
    
    // 確定済み試合数を事前確認
    const matchCountResult = await db.execute({
      sql: `SELECT COUNT(*) as count FROM t_matches_final WHERE match_block_id = ?`,
      args: [matchBlockId]
    });
    const confirmedMatches = matchCountResult.rows[0]?.count as number || 0;
    console.log(`[STANDINGS] 確定済み試合数: ${confirmedMatches}件`);
    
    // 競技種別に応じて適切な順位計算関数を使用
    let blockStandings: TeamStanding[];
    
    if (sportCode === 'soccer') {
      console.log(`[STANDINGS] サッカー競技: calculateMultiSportBlockStandingsを使用`);
      const multiSportStandings = await calculateMultiSportBlockStandings(matchBlockId, tournamentId);
      // 従来形式に変換
      blockStandings = multiSportStandings.map(convertMultiSportToLegacyStanding);
    } else {
      console.log(`[STANDINGS] その他競技: calculateBlockStandingsを使用`);
      blockStandings = await calculateBlockStandings(matchBlockId, tournamentId);
    }
    
    console.log(`[STANDINGS] 計算完了: ${blockStandings.length}チームの順位を計算`);
    
    // 計算結果の詳細ログ
    blockStandings.forEach(team => {
      console.log(`[STANDINGS] ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
    });
    
    // team_rankingsをJSON形式で更新
    const updateResult = await db.execute({
      sql: `
        UPDATE t_match_blocks 
        SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
        WHERE match_block_id = ?
      `,
      args: [JSON.stringify(blockStandings), matchBlockId]
    });

    console.log(`[STANDINGS] DB更新完了: ${updateResult.rowsAffected}行が更新されました`);
    console.log(`[STANDINGS] ブロック ${matchBlockId} の順位表を更新しました`);
    
    // 更新確認
    const verifyResult = await db.execute({
      sql: `SELECT team_rankings, updated_at FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });
    
    if (verifyResult.rows[0]?.team_rankings) {
      const updatedAt = verifyResult.rows[0].updated_at;
      console.log(`[STANDINGS] 更新確認: データが正常に保存されています (更新時刻: ${updatedAt})`);
      
      // ブロック順位確定後の処理チェック
      try {
        await checkBlockCompletionAndPromote(tournamentId, matchBlockId, blockStandings);
      } catch (promotionError) {
        console.error(`[STANDINGS] 進出処理エラー:`, promotionError);
        // 進出処理エラーでも順位表更新は成功とする
      }
    } else {
      console.log(`[STANDINGS] 警告: データが保存されていない可能性があります`);
    }
    
  } catch (error) {
    console.error(`[STANDINGS] ブロック ${matchBlockId} の順位表更新エラー:`, error);
    console.error(`[STANDINGS] エラー詳細:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      matchBlockId,
      tournamentId
    });
    throw new Error('順位表の更新に失敗しました');
  }
}

/**
 * 全ブロックの順位表を再計算・更新する（管理者用）
 */
export async function recalculateAllTournamentRankings(tournamentId: number): Promise<void> {
  try {
    // 全ブロック情報を取得
    const blocks = await db.execute({
      sql: `
        SELECT match_block_id
        FROM t_match_blocks 
        WHERE tournament_id = ?
      `,
      args: [tournamentId]
    });

    if (!blocks.rows || blocks.rows.length === 0) {
      return;
    }

    // 各ブロックの順位表を再計算
    for (const block of blocks.rows) {
      await updateBlockRankingsOnMatchConfirm(
        block.match_block_id as number, 
        tournamentId
      );
    }

    console.log(`大会 ${tournamentId} の全ブロック順位表を再計算しました`);
  } catch (error) {
    console.error(`大会 ${tournamentId} の順位表再計算エラー:`, error);
    throw new Error('順位表の再計算に失敗しました');
  }
}

/**
 * ブロックの参加チーム一覧を取得する（大会開始前用）
 */
async function getParticipatingTeamsForBlock(
  matchBlockId: number, 
  tournamentId: number
): Promise<TeamStanding[]> {
  try {
    // ブロック情報を取得
    const blockResult = await db.execute({
      sql: `SELECT block_name FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });

    if (!blockResult.rows || blockResult.rows.length === 0) {
      return [];
    }

    const blockName = blockResult.rows[0].block_name as string;

    // 該当ブロックの参加チーム一覧を取得
    const teamsResult = await db.execute({
      sql: `
        SELECT DISTINCT
          tt.team_id,
          COALESCE(tt.team_name, t.team_name) as team_name,
          COALESCE(tt.team_omission, t.team_omission) as team_omission
        FROM t_tournament_teams tt
        JOIN m_teams t ON tt.team_id = t.team_id
        WHERE tt.tournament_id = ? AND tt.assigned_block = ?
        ORDER BY COALESCE(tt.team_name, t.team_name)
      `,
      args: [tournamentId, blockName]
    });

    if (!teamsResult.rows || teamsResult.rows.length === 0) {
      return [];
    }

    // 空の順位データを作成
    return teamsResult.rows.map((team) => ({
      team_id: team.team_id as string,
      team_name: team.team_name as string,
      team_omission: team.team_omission as string || undefined,
      position: 0, // 大会開始前は順位なし
      points: 0,
      matches_played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0
    }));

  } catch (error) {
    console.error(`ブロック ${matchBlockId} の参加チーム取得エラー:`, error);
    return [];
  }
}

/**
 * 特定ブロックの順位表を計算する
 */
export async function calculateBlockStandings(
  matchBlockId: number,
  tournamentId: number
): Promise<TeamStanding[]> {
  try {
    // ブロック情報を取得してphaseを確認
    const blockInfoQuery = await db.execute({
      sql: `SELECT phase, block_name FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });

    if (!blockInfoQuery.rows || blockInfoQuery.rows.length === 0) {
      throw new Error('ブロック情報が見つかりません');
    }

    const blockPhase = blockInfoQuery.rows[0].phase as string;
    const blockName = blockInfoQuery.rows[0].block_name as string;

    // ブロック内のチーム一覧を取得
    let teamsResult;

    if (blockPhase === 'final') {
      // 決勝フェーズの場合は試合データから直接チーム情報を取得
      console.log(`[STANDINGS] 決勝フェーズのブロックのため、試合データからチーム情報を取得`);
      teamsResult = await db.execute({
        sql: `
          SELECT DISTINCT
            ml.team1_id as team_id,
            COALESCE(tt.team_name, t.team_name, ml.team1_display_name) as team_name,
            COALESCE(tt.team_omission, t.team_omission) as team_omission
          FROM t_matches_live ml
          LEFT JOIN t_tournament_teams tt ON ml.team1_id = tt.team_id AND tt.tournament_id = ?
          LEFT JOIN m_teams t ON ml.team1_id = t.team_id
          WHERE ml.match_block_id = ? AND ml.team1_id IS NOT NULL
          UNION
          SELECT DISTINCT
            ml.team2_id as team_id,
            COALESCE(tt.team_name, t.team_name, ml.team2_display_name) as team_name,
            COALESCE(tt.team_omission, t.team_omission) as team_omission
          FROM t_matches_live ml
          LEFT JOIN t_tournament_teams tt ON ml.team2_id = tt.team_id AND tt.tournament_id = ?
          LEFT JOIN m_teams t ON ml.team2_id = t.team_id
          WHERE ml.match_block_id = ? AND ml.team2_id IS NOT NULL
          ORDER BY team_name
        `,
        args: [tournamentId, matchBlockId, tournamentId, matchBlockId]
      });
    } else {
      // 予選フェーズの場合は従来通り assigned_block を使用
      console.log(`[STANDINGS] 予選フェーズのブロックのため、assigned_block から取得`);
      teamsResult = await db.execute({
        sql: `
          SELECT DISTINCT
            tt.team_id,
            COALESCE(tt.team_name, t.team_name) as team_name,
            COALESCE(tt.team_omission, t.team_omission) as team_omission
          FROM t_tournament_teams tt
          JOIN m_teams t ON tt.team_id = t.team_id
          WHERE tt.tournament_id = ?
          AND tt.assigned_block = ?
          ORDER BY COALESCE(tt.team_name, t.team_name)
        `,
        args: [tournamentId, blockName]
      });
    }

    if (!teamsResult.rows || teamsResult.rows.length === 0) {
      return [];
    }

    // 確定試合結果を取得（t_matches_finalから、中止試合は除外）
    const matchesResult = await db.execute({
      sql: `
        SELECT
          mf.match_id,
          mf.match_block_id,
          mf.team1_id,
          mf.team2_id,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover
        FROM t_matches_final mf
        LEFT JOIN t_matches_live ml ON mf.match_id = ml.match_id
        WHERE mf.match_block_id = ?
          AND (mf.team1_id IS NOT NULL AND mf.team2_id IS NOT NULL)
          AND (ml.match_status IS NULL OR ml.match_status != 'cancelled')
      `,
      args: [matchBlockId]
    });

    const matches: MatchResult[] = (matchesResult.rows || []).map(row => ({
      match_id: row.match_id as number,
      match_block_id: row.match_block_id as number,
      team1_id: row.team1_id as string | null,
      team2_id: row.team2_id as string | null,
      team1_goals: row.team1_goals, // Keep as string/original type for parseScore function
      team2_goals: row.team2_goals, // Keep as string/original type for parseScore function
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover)
    }));

    // 新しい勝点システムローダーを使用
    const pointSystem: PointSystem = await getTournamentPointSystem(tournamentId);
    const winPoints = pointSystem.win;
    const drawPoints = pointSystem.draw;
    const lossPoints = pointSystem.loss;
    
    // 不戦勝設定を取得
    const { getTournamentWalkoverSettings } = await import('./tournament-rules');
    const walkoverSettings = await getTournamentWalkoverSettings(tournamentId);
    const walkoverWinnerGoals = walkoverSettings.winner_goals;
    const walkoverLoserGoals = walkoverSettings.loser_goals;

    // 各チームの成績を計算
    const teamStandings: TeamStanding[] = teamsResult.rows.map(team => {
      const teamId = team.team_id as string;
      
      // チームが関わる試合を抽出
      const teamMatches = matches.filter(match => 
        match.team1_id === teamId || match.team2_id === teamId
      );

      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      let points = 0;

      // 各試合の結果を集計
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      teamMatches.forEach((match: any) => {
        const isTeam1 = match.team1_id === teamId;
        let teamGoals: number;
        let opponentGoals: number;

        // 不戦勝・不戦敗の場合は設定値を使用
        if (match.is_walkover) {
          if (match.winner_team_id === teamId) {
            // 不戦勝
            teamGoals = walkoverWinnerGoals;
            opponentGoals = walkoverLoserGoals;
          } else {
            // 不戦敗
            teamGoals = walkoverLoserGoals;
            opponentGoals = walkoverWinnerGoals;
          }
        } else {
          // 通常の試合（カンマ区切りスコア対応）
          teamGoals = isTeam1 ? parseScore(match.team1_goals) : parseScore(match.team2_goals);
          opponentGoals = isTeam1 ? parseScore(match.team2_goals) : parseScore(match.team1_goals);
        }

        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;

        // 勝敗とポイントの集計（PK選手権では延長戦により引き分けなし）
        if (match.is_draw) {
          draws++;
          points += drawPoints;
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += winPoints;
        } else {
          losses++;
          points += lossPoints; // 敗北時のポイント（通常は0）
        }
      });

      return {
        team_id: teamId,
        team_name: team.team_name as string,
        team_omission: team.team_omission as string || undefined,
        position: 0, // 後で設定
        points,
        matches_played: teamMatches.length,
        wins,
        draws,
        losses,
        goals_for: Number(goalsFor),
        goals_against: Number(goalsAgainst),
        goal_difference: Number(goalsFor) - Number(goalsAgainst)
      };
    });

    // 順位を決定（正しい順序: 1.勝点 > 2.得失点差 > 3.総得点 > 4.直接対決 > 5.抽選）
    teamStandings.sort((a, b) => {
      // 1. 勝点の多い順
      if (a.points !== b.points) {
        return b.points - a.points;
      }
      
      // 2. 得失点差の良い順
      if (a.goal_difference !== b.goal_difference) {
        return b.goal_difference - a.goal_difference;
      }
      
      // 3. 総得点の多い順
      if (a.goals_for !== b.goals_for) {
        return b.goals_for - a.goals_for;
      }
      
      // 4. 直接対決の結果
      const headToHead = calculateHeadToHead(a.team_id, b.team_id, matches);
      
      // 直接対決の勝点を計算（PK選手権では延長戦により引き分けなし）
      let teamAHeadToHeadPoints = 0;
      let teamBHeadToHeadPoints = 0;
      
      teamAHeadToHeadPoints += headToHead.teamAWins * winPoints;
      teamAHeadToHeadPoints += headToHead.draws * drawPoints;
      
      teamBHeadToHeadPoints += headToHead.teamBWins * winPoints;
      teamBHeadToHeadPoints += headToHead.draws * drawPoints;
      
      if (teamAHeadToHeadPoints !== teamBHeadToHeadPoints) {
        return teamBHeadToHeadPoints - teamAHeadToHeadPoints;
      }
      
      // 5. 抽選（チーム名の辞書順で代用）
      return a.team_name.localeCompare(b.team_name, 'ja');
    });

    // TODO: カスタム順位決定ルール対応は将来実装
    // 現在はデフォルトの順位決定ロジックを使用
    const finalStandings = [...teamStandings];

    // 同着対応の順位を設定
    let currentPosition = 1;
    for (let i = 0; i < finalStandings.length; i++) {
      if (i === 0) {
        // 1位は必ず1
        finalStandings[i].position = 1;
      } else {
        const currentTeam = finalStandings[i];
        const previousTeam = finalStandings[i - 1];
        
        // 新レギュレーション: 勝点、得失点差、総得点がすべて同じ場合のみ同順位
        const isTied = currentTeam.points === previousTeam.points &&
                      currentTeam.goal_difference === previousTeam.goal_difference &&
                      currentTeam.goals_for === previousTeam.goals_for;
        
        if (isTied) {
          // 直接対決の結果を確認
          const headToHead = calculateHeadToHead(currentTeam.team_id, previousTeam.team_id, matches);
          
          // 直接対決も同じ（引き分けまたは対戦なし）なら同着
          const sameHeadToHead = headToHead.teamAWins === headToHead.teamBWins && 
                                headToHead.teamAGoals === headToHead.teamBGoals;
          
          if (sameHeadToHead) {
            // 同着なので前のチームと同じ順位
            teamStandings[i].position = previousTeam.position;
          } else {
            // 直接対決で順位が決まる場合は、これまでの同着も含めた実際の順位
            currentPosition = i + 1;
            teamStandings[i].position = currentPosition;
          }
        } else {
          // 順位が変わる場合は、これまでの同着も含めた実際の順位
          currentPosition = i + 1;
          teamStandings[i].position = currentPosition;
        }
      }
    }

    return teamStandings;
  } catch (error) {
    console.error(`ブロック ${matchBlockId} の順位表計算エラー:`, error);
    throw new Error('ブロック順位表の計算に失敗しました');
  }
}

/**
 * チーム間の直接対戦成績を計算する（将来の拡張用）
 */
export function calculateHeadToHead(
  teamAId: string, 
  teamBId: string, 
  matches: MatchResult[]
): {
  teamAWins: number;
  teamBWins: number;
  draws: number;
  teamAGoals: number;
  teamBGoals: number;
} {
  const headToHeadMatches = matches.filter(match => 
    (match.team1_id === teamAId && match.team2_id === teamBId) ||
    (match.team1_id === teamBId && match.team2_id === teamAId)
  );

  let teamAWins = 0;
  let teamBWins = 0;
  let draws = 0;
  let teamAGoals = 0;
  let teamBGoals = 0;

  headToHeadMatches.forEach(match => {
    if (match.team1_id === teamAId) {
      // カンマ区切りスコアを適切にパース
      teamAGoals += parseScore(match.team1_goals);
      teamBGoals += parseScore(match.team2_goals);
      
      if (match.is_draw) {
        draws++;
      } else if (match.winner_team_id === teamAId) {
        teamAWins++;
      } else {
        teamBWins++;
      }
    } else {
      // カンマ区切りスコアを適切にパース
      teamAGoals += parseScore(match.team2_goals);
      teamBGoals += parseScore(match.team1_goals);
      
      if (match.is_draw) {
        draws++;
      } else if (match.winner_team_id === teamAId) {
        teamAWins++;
      } else {
        teamBWins++;
      }
    }
  });

  return {
    teamAWins,
    teamBWins,
    draws,
    teamAGoals,
    teamBGoals
  };
}

/**
 * ブロック完了チェックと進出処理の実行
 */
export async function checkBlockCompletionAndPromote(
  tournamentId: number,
  completedBlockId: number,
  blockStandings: TeamStanding[]
): Promise<void> {
  try {
    console.log(`[PROMOTION] ブロック完了チェック開始: Block ${completedBlockId}`);
    
    // 1. ブロック情報を取得
    const blockResult = await db.execute({
      sql: `SELECT block_name, display_round_name FROM t_match_blocks WHERE match_block_id = ?`,
      args: [completedBlockId]
    });
    
    if (!blockResult.rows || blockResult.rows.length === 0) {
      console.log(`[PROMOTION] ブロック情報が見つかりません: ${completedBlockId}`);
      return;
    }
    
    const blockName = blockResult.rows[0].block_name as string;
    // const displayRoundName = blockResult.rows[0].display_round_name as string;
    
    // 2. ブロック内の全試合が完了しているかチェック
    const isBlockCompleted = await checkIfBlockAllMatchesCompleted(completedBlockId);
    
    if (!isBlockCompleted) {
      console.log(`[PROMOTION] ${blockName}ブロック: まだ未完了の試合があります`);
      return;
    }
    
    console.log(`[PROMOTION] ${blockName}ブロック: 全試合完了を確認`);
    
    // 3. 上位2チームの自動決定可能性をチェック
    const promotionStatus = analyzePromotionEligibility(blockStandings);
    
    // 4. 同順位通知の作成・保存
    await createTieNotificationIfNeeded(tournamentId, completedBlockId, blockName, promotionStatus);
    
    // 5. ブロック完了かつ確定したチームについてのみ進出処理を実行
    if (isBlockCompleted && (promotionStatus.canPromoteFirst || promotionStatus.canPromoteSecond)) {
      console.log(`[PROMOTION] ${blockName}ブロック: 全試合完了のため進出処理実行`);
      // 確定したブロックのみをチェックするように最適化
      await promoteTeamsToFinalTournament(tournamentId, completedBlockId);
    } else if (!isBlockCompleted) {
      console.log(`[PROMOTION] ${blockName}ブロック: 未完了のため進出処理をスキップ`);
    } else {
      console.log(`[PROMOTION] ${blockName}ブロック: 同着のため手動決定待ち`);
    }
    
  } catch (error) {
    console.error(`[PROMOTION] ブロック完了チェックエラー:`, error);
    throw error;
  }
}

/**
 * ブロックが未完了の場合、順位情報をクリアする
 */
export async function clearBlockRankingsIfIncomplete(matchBlockId: number): Promise<void> {
  try {
    console.log(`[STANDINGS] ブロック順位クリアチェック開始: Block ${matchBlockId}`);

    // ブロックが完了しているかチェック
    const isCompleted = await checkIfBlockAllMatchesCompleted(matchBlockId);

    if (!isCompleted) {
      // 未完了の場合、順位情報をクリア
      await db.execute({
        sql: `
          UPDATE t_match_blocks
          SET team_rankings = NULL, updated_at = datetime('now', '+9 hours')
          WHERE match_block_id = ?
        `,
        args: [matchBlockId]
      });

      console.log(`[STANDINGS] ブロック ${matchBlockId} の順位情報をクリアしました（未完了のため）`);
    } else {
      console.log(`[STANDINGS] ブロック ${matchBlockId} は完了済みのため、順位情報を保持`);
    }
  } catch (error) {
    console.error(`[STANDINGS] ブロック順位クリアエラー:`, error);
    throw error;
  }
}

/**
 * ブロック内の全試合が完了しているかチェック（中止試合も完了として扱う）
 */
async function checkIfBlockAllMatchesCompleted(matchBlockId: number): Promise<boolean> {
  try {
    const result = await db.execute({
      sql: `
        SELECT 
          COUNT(*) as total_matches,
          COUNT(CASE WHEN mf.match_id IS NOT NULL THEN 1 END) as confirmed_matches,
          COUNT(CASE WHEN ml.match_status = 'cancelled' THEN 1 END) as cancelled_matches,
          COUNT(CASE WHEN mf.match_id IS NOT NULL OR ml.match_status = 'cancelled' THEN 1 END) as completed_matches
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
        AND ml.team1_id IS NOT NULL 
        AND ml.team2_id IS NOT NULL
      `,
      args: [matchBlockId]
    });
    
    const row = result.rows[0];
    const totalMatches = row?.total_matches as number || 0;
    const confirmedMatches = row?.confirmed_matches as number || 0;
    const cancelledMatches = row?.cancelled_matches as number || 0;
    const completedMatches = row?.completed_matches as number || 0;
    
    console.log(`[PROMOTION] ブロック ${matchBlockId}: ${completedMatches}/${totalMatches} 試合完了 (確定:${confirmedMatches}, 中止:${cancelledMatches})`);
    
    // 詳細な試合状況をログ出力
    const detailResult = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.match_status,
          CASE WHEN mf.match_id IS NOT NULL THEN '確定済み' ELSE '未確定' END as final_status,
          ml.team1_display_name,
          ml.team2_display_name
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
        AND ml.team1_id IS NOT NULL 
        AND ml.team2_id IS NOT NULL
        ORDER BY ml.match_code
      `,
      args: [matchBlockId]
    });
    
    console.log(`[PROMOTION] ブロック ${matchBlockId} 試合詳細:`);
    detailResult.rows.forEach(match => {
      const status = match.match_status === 'cancelled' ? '中止' : 
                    match.final_status === '確定済み' ? '確定' : '未完了';
      console.log(`[PROMOTION]   ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name} [${status}]`);
    });
    
    const isCompleted = totalMatches > 0 && totalMatches === completedMatches;
    console.log(`[PROMOTION] ブロック ${matchBlockId} 完了判定: ${isCompleted ? '✅ 完了' : '❌ 未完了'}`);
    
    return isCompleted;
  } catch (error) {
    console.error(`ブロック完了チェックエラー:`, error);
    return false;
  }
}

/**
 * 上位2チームの進出可能性を分析
 */
function analyzePromotionEligibility(standings: TeamStanding[]): {
  canPromoteFirst: boolean;
  canPromoteSecond: boolean;
  firstPlaceTeams: TeamStanding[];
  secondPlaceTeams: TeamStanding[];
  tieMessage: string | null;
} {
  const sortedStandings = standings.sort((a, b) => a.position - b.position);
  
  const firstPlaceTeams = sortedStandings.filter(team => team.position === 1);
  const secondPlaceTeams = sortedStandings.filter(team => team.position === 2);
  
  const canPromoteFirst = firstPlaceTeams.length === 1;
  const canPromoteSecond = secondPlaceTeams.length === 1;
  
  let tieMessage: string | null = null;
  
  if (firstPlaceTeams.length > 1) {
    const teamNames = firstPlaceTeams.map(t => t.team_name).join('、');
    tieMessage = `1位同着: ${teamNames} (${firstPlaceTeams.length}チーム)`;
  } else if (secondPlaceTeams.length > 1) {
    const teamNames = secondPlaceTeams.map(t => t.team_name).join('、');
    tieMessage = `2位同着: ${teamNames} (${secondPlaceTeams.length}チーム)`;
  } else if (secondPlaceTeams.length === 0) {
    tieMessage = '2位チームが存在しません';
  }
  
  return {
    canPromoteFirst,
    canPromoteSecond,
    firstPlaceTeams,
    secondPlaceTeams,
    tieMessage
  };
}

/**
 * 同順位通知が必要な場合に作成
 */
async function createTieNotificationIfNeeded(
  tournamentId: number,
  blockId: number,
  blockName: string,
  promotionStatus: {
    canPromoteFirst: boolean;
    canPromoteSecond: boolean;
    firstPlaceTeams: TeamStanding[];
    secondPlaceTeams: TeamStanding[];
    tieMessage: string | null;
  }
): Promise<void> {
  try {
    // 同順位が発生している場合のみ通知作成
    if (!promotionStatus.tieMessage) {
      console.log(`[PROMOTION] ${blockName}ブロック: 同順位なし、通知不要`);
      return;
    }
    
    const title = `${blockName}ブロック 手動順位決定が必要`;
    const message = `${blockName}ブロックで${promotionStatus.tieMessage}が発生しました。決勝トーナメント進出チームを決定するため、手動で順位を設定してください。`;
    
    // 通知に含めるメタデータ
    const metadata = {
      block_id: blockId,
      block_name: blockName,
      tie_type: promotionStatus.firstPlaceTeams.length > 1 ? 'first_place' : 'second_place',
      tied_teams: promotionStatus.firstPlaceTeams.length > 1 
        ? promotionStatus.firstPlaceTeams.map(t => ({ team_id: t.team_id, team_name: t.team_name }))
        : promotionStatus.secondPlaceTeams.map(t => ({ team_id: t.team_id, team_name: t.team_name })),
      requires_manual_ranking: true
    };
    
    await createTournamentNotification(
      tournamentId,
      'manual_ranking_needed',
      title,
      message,
      'warning',
      metadata
    );
    
    console.log(`[PROMOTION] ${blockName}ブロック: 同順位通知を作成`);
    
  } catch (error) {
    console.error(`[PROMOTION] 同順位通知作成エラー:`, error);
    // エラーでも処理は続行
  }
}

/**
 * トーナメント構造に基づいてチームの順位を決定する
 * 31チーム構成: 1位, 2位, 3位, 4位, 5位(4チーム), 9位(4チーム), 17位(8チーム), 25位(16チーム)
 */
function determineTournamentPosition(teamId: string, finalMatches: Array<{
  match_id: number;
  match_code: string;
  team1_id: string | null;
  team2_id: string | null;
  team1_display_name: string;
  team2_display_name: string;
  team1_scores: number | null;
  team2_scores: number | null;
  winner_team_id: string | null;
  is_draw: boolean;
  is_walkover: boolean;
  is_confirmed: boolean;
}>): number {
  // このチームが参加した全試合を取得
  const teamMatches = finalMatches.filter(m => 
    m.team1_id === teamId || m.team2_id === teamId
  );
  
  if (teamMatches.length === 0) return 25; // デフォルト（1回戦敗退相当）
  
  // 最後に敗退した試合を特定
  let lastLossMatch = null;
  for (const match of teamMatches) {
    if (match.is_confirmed && match.winner_team_id && match.winner_team_id !== teamId) {
      // このチームが負けた試合
      const matchNum = parseInt(match.match_code.replace('M', ''));
      if (!lastLossMatch || matchNum > parseInt(lastLossMatch.match_code.replace('M', ''))) {
        lastLossMatch = match;
      }
    }
  }
  
  // 敗退していない場合（まだ勝ち進んでいる、または結果未確定）
  if (!lastLossMatch) {
    // 最も進んだ試合を確認
    const maxMatchCode = Math.max(...teamMatches.map(m => {
      const match = m.match_code.match(/M(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }));
    
    // まだ試合結果が未確定の場合の推定順位
    if (maxMatchCode >= 36) return 1;  // 決勝戦参加 → 1位or2位
    if (maxMatchCode >= 35) return 3;  // 3位決定戦参加 → 3位or4位
    if (maxMatchCode >= 33) return 5;  // 準決勝参加 → ベスト4
    if (maxMatchCode >= 29) return 9;  // 準々決勝参加 → ベスト8
    if (maxMatchCode >= 25) return 17; // Round3参加 → ベスト16
    if (maxMatchCode >= 17) return 25; // Round2参加 → ベスト32
    return 25; // Round1のみ → ベスト32
  }
  
  // 敗退した試合に基づいて順位を決定
  const lastLossMatchNum = parseInt(lastLossMatch.match_code.replace('M', ''));
  
  if (lastLossMatchNum === 36) return 2;   // 決勝戦敗者 → 2位
  if (lastLossMatchNum === 35) return 4;   // 3位決定戦敗者 → 4位
  if (lastLossMatchNum >= 33 && lastLossMatchNum <= 34) return 5;  // 準決勝敗者 → 5位
  if (lastLossMatchNum >= 29 && lastLossMatchNum <= 32) return 9;  // 準々決勝敗者 → 9位
  if (lastLossMatchNum >= 25 && lastLossMatchNum <= 28) return 17; // Round3敗者 → 17位
  if (lastLossMatchNum >= 17 && lastLossMatchNum <= 24) return 25; // Round2敗者 → 25位
  if (lastLossMatchNum >= 1 && lastLossMatchNum <= 16) return 25;  // Round1敗者 → 25位
  
  return 25; // デフォルト
}

/**
 * 決勝トーナメントの順位表を計算する
 */
async function calculateFinalTournamentStandings(tournamentId: number): Promise<TeamStanding[]> {
  try {
    // テンプレートベース順位計算を実行
    return await calculateTemplateBasedTournamentStandings(tournamentId);
  } catch (error) {
    console.error('テンプレートベース順位計算に失敗、フォールバック実行:', error);
    return await calculateLegacyTournamentStandings(tournamentId);
  }
}

/**
 * テンプレートベースの決勝トーナメント順位計算
 */
async function calculateTemplateBasedTournamentStandings(tournamentId: number): Promise<TeamStanding[]> {
  try {
    // 大会のフォーマットIDを取得
    const tournamentResult = await db.execute({
      sql: `SELECT format_id FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });
    
    if (!tournamentResult.rows.length) {
      throw new Error('大会が見つかりません');
    }
    
    const formatId = tournamentResult.rows[0].format_id as number;

    // 決勝トーナメントの試合情報とテンプレート情報を取得
    const finalMatchesResult = await db.execute({
      sql: `
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
          COALESCE(t1.team_omission, '') as team1_omission,
          COALESCE(t2.team_omission, '') as team2_omission,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
          -- テンプレート情報
          mt.winner_position,
          mt.loser_position_start,
          mt.loser_position_end,
          mt.position_note
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code AND mt.phase = 'final'
        WHERE mb.tournament_id = ? 
          AND mb.phase = 'final'
        ORDER BY ml.match_number, ml.match_code
      `,
      args: [formatId, tournamentId]
    });

    const finalMatches = finalMatchesResult.rows.map(row => ({
      match_id: row.match_id as number,
      match_code: row.match_code as string,
      team1_id: row.team1_id as string | null,
      team2_id: row.team2_id as string | null,
      team1_display_name: row.team1_display_name as string,
      team2_display_name: row.team2_display_name as string,
      team1_omission: row.team1_omission as string,
      team2_omission: row.team2_omission as string,
      team1_scores: row.team1_scores as number | null,
      team2_scores: row.team2_scores as number | null,
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      is_confirmed: Boolean(row.is_confirmed),
      winner_position: row.winner_position as number | null,
      loser_position_start: row.loser_position_start as number | null,
      loser_position_end: row.loser_position_end as number | null,
      position_note: row.position_note as string | null
    }));

    // 全参加チームの情報を取得（修正版クエリ）
    const allTeamsResult = await db.execute({
      sql: `
        SELECT DISTINCT team_id, team_name, team_omission
        FROM (
          SELECT
            ml.team1_id as team_id,
            COALESCE(tt1.team_name, t1.team_name, ml.team1_display_name) as team_name,
            COALESCE(tt1.team_omission, t1.team_omission, '') as team_omission
          FROM t_matches_live ml
          LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
          LEFT JOIN t_tournament_teams tt1 ON ml.team1_id = tt1.team_id AND mb.tournament_id = tt1.tournament_id
          LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
          WHERE mb.tournament_id = ? AND mb.phase = 'final'
            AND ml.team1_id IS NOT NULL

          UNION

          SELECT
            ml.team2_id as team_id,
            COALESCE(tt2.team_name, t2.team_name, ml.team2_display_name) as team_name,
            COALESCE(tt2.team_omission, t2.team_omission, '') as team_omission
          FROM t_matches_live ml
          LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
          LEFT JOIN t_tournament_teams tt2 ON ml.team2_id = tt2.team_id AND mb.tournament_id = tt2.tournament_id
          LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
          WHERE mb.tournament_id = ? AND mb.phase = 'final'
            AND ml.team2_id IS NOT NULL
        ) all_teams
        WHERE team_id IS NOT NULL
        ORDER BY team_name
      `,
      args: [tournamentId, tournamentId]
    });

    const allTeams = new Map<string, { team_name: string; team_omission: string }>();
    allTeamsResult.rows.forEach(row => {
      if (row.team_id) {
        allTeams.set(row.team_id as string, {
          team_name: row.team_name as string,
          team_omission: row.team_omission as string
        });
      }
    });

    const rankings: (TeamStanding & { position_note?: string })[] = [];
    const rankedTeamIds = new Set<string>();

    // 確定済み試合から順位を決定
    for (const match of finalMatches) {
      if (!match.is_confirmed || !match.team1_id || !match.team2_id) {
        continue;
      }

      const winnerId = match.winner_team_id;
      const loserId = match.team1_id === winnerId ? match.team2_id : match.team1_id;
      
      // 勝者の順位設定
      if (winnerId && match.winner_position && !rankedTeamIds.has(winnerId)) {
        const teamInfo = allTeams.get(winnerId);
        if (teamInfo) {
          rankings.push({
            team_id: winnerId,
            team_name: teamInfo.team_name,
            team_omission: teamInfo.team_omission || undefined,
            position: match.winner_position,
            points: 0,
            matches_played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goals_for: 0,
            goals_against: 0,
            goal_difference: 0,
            position_note: match.position_note || undefined
          });
          rankedTeamIds.add(winnerId);
        }
      }

      // 敗者の順位設定
      if (loserId && match.loser_position_start && !rankedTeamIds.has(loserId)) {
        const teamInfo = allTeams.get(loserId);
        if (teamInfo) {
          // loser_position_startとloser_position_endが同じ場合は固定順位
          // 異なる場合は範囲の最初の順位を使用
          const position = match.loser_position_start;
          
          rankings.push({
            team_id: loserId,
            team_name: teamInfo.team_name,
            team_omission: teamInfo.team_omission || undefined,
            position: position,
            points: 0,
            matches_played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goals_for: 0,
            goals_against: 0,
            goal_difference: 0,
            position_note: match.position_note || undefined
          });
          rankedTeamIds.add(loserId);
        }
      }
    }

    // 未順位のチームがある場合のデフォルト処理
    for (const [teamId, teamInfo] of allTeams) {
      if (!rankedTeamIds.has(teamId)) {
        rankings.push({
          team_id: teamId,
          team_name: teamInfo.team_name,
          team_omission: teamInfo.team_omission || undefined,
          position: 0, // 未確定順位（最上位に表示）
          points: 0,
          matches_played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0
        });
      }
    }

    // 順位でソート
    rankings.sort((a, b) => a.position - b.position);
    
    return rankings;

  } catch (error) {
    console.error('テンプレートベース順位計算エラー:', error);
    throw error;
  }
}

/**
 * レガシーの決勝トーナメント順位計算（フォールバック用）
 */
async function calculateLegacyTournamentStandings(tournamentId: number): Promise<TeamStanding[]> {
  try {
    // 決勝トーナメントの試合情報を取得
    const finalMatchesResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        WHERE mb.tournament_id = ?
          AND mb.phase = 'final'
        ORDER BY ml.match_number, ml.match_code
      `,
      args: [tournamentId]
    });

    const finalMatches = finalMatchesResult.rows.map(row => ({
      match_id: row.match_id as number,
      match_code: row.match_code as string,
      team1_id: row.team1_id as string | null,
      team2_id: row.team2_id as string | null,
      team1_display_name: row.team1_display_name as string,
      team2_display_name: row.team2_display_name as string,
      team1_scores: row.team1_scores as number | null,
      team2_scores: row.team2_scores as number | null,
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      is_confirmed: Boolean(row.is_confirmed)
    }));

    // 新旧両形式の試合コードに対応
    const finalMatch = finalMatches.find(m => m.match_code === 'T8' || m.match_code === 'M8');

    // 全参加チームIDを取得
    const teamSet = new Set<string>();
    finalMatches.forEach(match => {
      if (match.team1_id) teamSet.add(match.team1_id);
      if (match.team2_id) teamSet.add(match.team2_id);
    });

    const rankings: TeamStanding[] = [];
    const rankedTeamIds = new Set<string>();

    // 1位・2位（決勝戦）
    if (finalMatch?.is_confirmed && finalMatch.winner_team_id) {
      const winnerId = finalMatch.winner_team_id;
      const loserId = finalMatch.team1_id === winnerId ? finalMatch.team2_id : finalMatch.team1_id;

      rankings.push({
        team_id: winnerId,
        team_name: finalMatch.team1_id === winnerId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
        team_omission: undefined,
        position: 1,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0
      });
      rankedTeamIds.add(winnerId);

      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: finalMatch.team1_id === loserId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
          team_omission: undefined,
          position: 2,
          points: 0,
          matches_played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0
        });
        rankedTeamIds.add(loserId);
      }
    }

    // 3位・4位（3位決定戦）の処理は動的順位決定に委ねる（ダブル処理を避ける）
    // thirdPlaceMatch の結果は determineTournamentPosition 内で処理される

    // 準々決勝敗者の処理は動的順位決定に委ねる（ダブル処理を避ける）

    // 未確定のチームはトーナメント構造に基づいて順位を決定
    teamSet.forEach(teamId => {
      if (!rankedTeamIds.has(teamId)) {
        const teamMatch = finalMatches.find(m => 
          (m.team1_id === teamId || m.team2_id === teamId)
        );
        const displayName = teamMatch?.team1_id === teamId ? teamMatch.team1_display_name : teamMatch?.team2_display_name;
        
        // トーナメント構造に基づいて順位を動的に決定
        const dynamicPosition = determineTournamentPosition(teamId, finalMatches);
        
        rankings.push({
          team_id: teamId,
          team_name: displayName || '未確定',
          team_omission: undefined,
          position: dynamicPosition,
          points: 0,
          matches_played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0
        });
      }
    });

    return rankings.sort((a, b) => {
      // 同順位の場合はチーム名順
      if (a.position === b.position) return a.team_name.localeCompare(b.team_name, 'ja');
      return a.position - b.position;
    });
  } catch (error) {
    console.error('決勝トーナメント順位表計算エラー:', error);
    return [];
  }
}

/**
 * 決勝トーナメントの詳細順位を計算する（テンプレート情報を活用）
 */
async function calculateDetailedFinalTournamentStandings(tournamentId: number, phase: string = 'final'): Promise<TeamStanding[]> {
  try {
    const phaseLabel = phase === 'final' ? '決勝' : '予選';
    console.log(`[DETAILED_TOURNAMENT_RANKINGS] 詳細順位計算開始: Tournament ${tournamentId}, Phase: ${phaseLabel}`);

    // 大会のフォーマットIDを取得
    const formatResult = await db.execute({
      sql: `SELECT format_id FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });

    if (!formatResult.rows || formatResult.rows.length === 0) {
      throw new Error('大会情報が見つかりません');
    }

    const formatId = formatResult.rows[0].format_id as number;
    console.log(`[DETAILED_TOURNAMENT_RANKINGS] フォーマットID: ${formatId}`);

    // トーナメントの試合情報とテンプレート情報を結合して取得
    const finalMatchesResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
          mt.winner_position,
          mt.loser_position_start,
          mt.loser_position_end
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
        WHERE mb.tournament_id = ?
          AND mb.phase = ?
          AND ml.team1_id IS NOT NULL
        ORDER BY ml.match_code
      `,
      args: [formatId, tournamentId, phase]
    });

    const finalMatches = finalMatchesResult.rows.map(row => ({
      match_id: row.match_id as number,
      match_code: row.match_code as string,
      team1_id: row.team1_id as string | null,
      team2_id: row.team2_id as string | null,
      team1_display_name: row.team1_display_name as string,
      team2_display_name: row.team2_display_name as string,
      team1_scores: row.team1_scores as number | null,
      team2_scores: row.team2_scores as number | null,
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      is_confirmed: Boolean(row.is_confirmed),
      winner_position: row.winner_position as number | null,
      loser_position_start: row.loser_position_start as number | null,
      loser_position_end: row.loser_position_end as number | null
    }));

    console.log(`[DETAILED_TOURNAMENT_RANKINGS] 取得した${phaseLabel}トーナメント試合: ${finalMatches.length}試合`);

    // 全参加チームを収集
    const allTeams = new Set<string>();
    finalMatches.forEach(match => {
      if (match.team1_id && !match.team1_id.includes('_winner') && !match.team1_id.includes('_loser')) {
        allTeams.add(match.team1_id);
      }
      if (match.team2_id && !match.team2_id.includes('_winner') && !match.team2_id.includes('_loser')) {
        allTeams.add(match.team2_id);
      }
    });

    console.log(`[DETAILED_TOURNAMENT_RANKINGS] ${phaseLabel}トーナメント参加チーム数: ${allTeams.size}`);

    const rankings: TeamStanding[] = [];

    // 各チームの最終順位を決定（テンプレート情報を活用）
    allTeams.forEach(teamId => {
      const position = calculateTemplateBasedTournamentPosition(teamId, finalMatches);
      const teamMatch = finalMatches.find(m =>
        m.team1_id === teamId || m.team2_id === teamId
      );
      const teamName = teamMatch?.team1_id === teamId
        ? teamMatch.team1_display_name
        : teamMatch?.team2_display_name || '未確定';

      rankings.push({
        team_id: teamId,
        team_name: teamName,
        team_omission: undefined,
        position,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0
      });
    });

    // 順位順でソート、同順位内はチーム名順
    const sortedRankings = rankings.sort((a, b) => {
      if (a.position === b.position) {
        return a.team_name.localeCompare(b.team_name, 'ja');
      }
      return a.position - b.position;
    });

    // ログ出力：順位分布
    const positionGroups = sortedRankings.reduce((acc, team) => {
      if (!acc[team.position]) acc[team.position] = [];
      acc[team.position].push(team.team_name);
      return acc;
    }, {} as Record<number, string[]>);

    Object.entries(positionGroups).forEach(([position, teams]) => {
      console.log(`[DETAILED_TOURNAMENT_RANKINGS] ${position}位: ${teams.join(', ')} (${teams.length}チーム)`);
    });

    return sortedRankings;

  } catch (error) {
    console.error('[DETAILED_TOURNAMENT_RANKINGS] 詳細順位計算エラー:', error);
    return [];
  }
}

/**
 * チームの詳細トーナメント順位を計算する（テンプレート情報を活用）
 */
function calculateTemplateBasedTournamentPosition(
  teamId: string, 
  finalMatches: Array<{
    match_id: number;
    match_code: string;
    team1_id: string | null;
    team2_id: string | null;
    team1_display_name: string;
    team2_display_name: string;
    team1_scores: number | null;
    team2_scores: number | null;
    winner_team_id: string | null;
    is_draw: boolean;
    is_walkover: boolean;
    is_confirmed: boolean;
    winner_position: number | null;
    loser_position_start: number | null;
    loser_position_end: number | null;
  }>
): number {
  // このチームが参加した試合を全て取得
  const teamMatches = finalMatches.filter(m => 
    m.team1_id === teamId || m.team2_id === teamId
  );

  if (teamMatches.length === 0) {
    console.log(`[TEMPLATE_POSITION] チーム${teamId}の試合が見つかりません`);
    return 999; // デフォルト（未定）
  }

  // 確定済み試合を優先度順でソート（試合コード降順で最終試合を優先）
  const confirmedMatches = teamMatches
    .filter(m => m.is_confirmed)
    .sort((a, b) => b.match_code.localeCompare(a.match_code));

  console.log(`[TEMPLATE_POSITION] チーム${teamId}の確定済み試合: ${confirmedMatches.map(m => m.match_code).join(', ')}`);

  // 最終試合（最も後のラウンド）の結果を優先
  for (const match of confirmedMatches) {
    // このチームが勝者の場合
    if (match.winner_team_id === teamId) {
      if (match.winner_position && match.winner_position > 0) {
        // 勝者に明確な順位が設定されている場合（決勝・3位決定戦など）
        console.log(`[TEMPLATE_POSITION] ${match.match_code}: 勝者確定順位 ${match.winner_position}`);
        return match.winner_position;
      }
    } 
    // このチームが敗者の場合
    else if (match.winner_team_id && match.winner_team_id !== teamId) {
      if (match.loser_position_start) {
        // 敗者順位の開始位置を使用
        console.log(`[TEMPLATE_POSITION] ${match.match_code}: 敗者確定順位 ${match.loser_position_start}`);
        return match.loser_position_start;
      }
    }
  }

  // 確定試合で順位が決まらない場合は、最終試合から推定
  if (confirmedMatches.length > 0) {
    const lastMatch = confirmedMatches[0]; // 最も後の試合
    
    // このチームが勝者で、勝者順位が未設定の場合
    if (lastMatch.winner_team_id === teamId && lastMatch.loser_position_start && lastMatch.loser_position_start > 1) {
      const winnerMaxPosition = lastMatch.loser_position_start - 1;
      console.log(`[TEMPLATE_POSITION] ${lastMatch.match_code}: 推定勝者順位 <= ${winnerMaxPosition}`);
      return winnerMaxPosition;
    }
    
    // このチームが敗者で、敗者順位が設定されている場合
    if (lastMatch.winner_team_id !== teamId && lastMatch.loser_position_start) {
      console.log(`[TEMPLATE_POSITION] ${lastMatch.match_code}: 敗者順位 ${lastMatch.loser_position_start}`);
      return lastMatch.loser_position_start;
    }
  }

  // 確定試合がない場合は、参加している最も後の試合から推測
  const allMatches = teamMatches.sort((a, b) => b.match_code.localeCompare(a.match_code));
  if (allMatches.length > 0) {
    const lastMatch = allMatches[0];
    if (lastMatch.loser_position_end) {
      // このラウンドの参加者の最悪順位
      console.log(`[TEMPLATE_POSITION] ${lastMatch.match_code}: 未確定・参加者最悪順位 ${lastMatch.loser_position_end}`);
      return lastMatch.loser_position_end;
    }
  }

  console.log(`[TEMPLATE_POSITION] チーム${teamId}の順位が決定できません`);
  return 99; // 未定
}

/**
 * テンプレートベースの順位計算を実行する
 */
async function calculateTemplateBasedRankings(tournamentId: number, phase: string = 'final'): Promise<TeamStanding[]> {
  try {
    const phaseLabel = phase === 'final' ? '決勝' : '予選';
    console.log(`[TEMPLATE_RANKINGS] テンプレートベース順位計算開始: Tournament ${tournamentId}, Phase: ${phaseLabel}`);

    // トーナメントブロックを取得
    const finalBlockResult = await db.execute({
      sql: `
        SELECT match_block_id, team_rankings
        FROM t_match_blocks
        WHERE tournament_id = ? AND phase = ?
        LIMIT 1
      `,
      args: [tournamentId, phase]
    });

    if (finalBlockResult.rows.length === 0) {
      console.log(`[TEMPLATE_RANKINGS] ${phaseLabel}トーナメントブロックが見つかりません`);
      return [];
    }

    const finalBlockId = finalBlockResult.rows[0].match_block_id as number;
    const existingRankings = finalBlockResult.rows[0].team_rankings as string | null;
    
    // 既存の順位設定があるかチェック
    if (existingRankings) {
      try {
        const rankings = JSON.parse(existingRankings);
        if (rankings.length > 0) {
          console.log(`[TEMPLATE_RANKINGS] 既存の順位設定を使用: ${rankings.length}チーム`);
          return rankings;
        }
      } catch {
        console.log(`[TEMPLATE_RANKINGS] 既存順位データのパースに失敗、新規計算を実行`);
      }
    }
    
    // 確定済みの決勝トーナメント試合を取得
    const finalMatchesResult = await db.execute({
      sql: `
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          mf.winner_team_id,
          mf.is_draw,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
          AND ml.team1_id IS NOT NULL
          AND ml.team2_id IS NOT NULL
          AND mf.match_id IS NOT NULL
        ORDER BY ml.match_code
      `,
      args: [finalBlockId]
    });

    console.log(`[TEMPLATE_RANKINGS] 確定済み${phaseLabel}トーナメント試合: ${finalMatchesResult.rows.length}試合`);

    if (finalMatchesResult.rows.length === 0) {
      console.log(`[TEMPLATE_RANKINGS] 確定済み試合がないため、テンプレートベース計算をスキップ`);
      return [];
    }

    // 各確定済み試合でテンプレートベース順位設定を実行
    for (const match of finalMatchesResult.rows) {
      const matchId = match.match_id as number;
      const winnerId = match.winner_team_id as string | null;
      const loserId = match.team1_id === winnerId ? match.team2_id as string : match.team1_id as string;
      
      console.log(`[TEMPLATE_RANKINGS] 試合 ${match.match_code}: 勝者=${winnerId}, 敗者=${loserId}`);
      
      try {
        await handleTemplateBasedPositions(matchId, winnerId, loserId, tournamentId);
      } catch (templateError) {
        console.error(`[TEMPLATE_RANKINGS] テンプレート処理エラー (試合${matchId}):`, templateError);
        // エラーでも他の試合の処理は継続
      }
    }

    // 更新後の順位データを取得
    const updatedResult = await db.execute({
      sql: `SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?`,
      args: [finalBlockId]
    });
    
    if (updatedResult.rows[0]?.team_rankings) {
      try {
        const rankings = JSON.parse(updatedResult.rows[0].team_rankings as string);
        console.log(`[TEMPLATE_RANKINGS] テンプレートベース順位計算完了: ${rankings.length}チーム`);
        return rankings;
      } catch (error) {
        console.error(`[TEMPLATE_RANKINGS] 更新後順位データのパースに失敗:`, error);
      }
    }

    console.log(`[TEMPLATE_RANKINGS] テンプレートベース順位データなし`);
    return [];
    
  } catch (error) {
    console.error(`[TEMPLATE_RANKINGS] テンプレートベース順位計算エラー:`, error);
    return [];
  }
}

// カンマ区切りスコアを配列に変換

/**
 * 多競技対応版: ブロック順位表計算（サッカーPK戦対応）
 */
export async function calculateMultiSportBlockStandings(
  matchBlockId: number, 
  tournamentId: number,
  walkoverWinnerGoals: number = 3,
  walkoverLoserGoals: number = 0
): Promise<MultiSportTeamStanding[]> {
  try {
    console.log(`[MULTI_SPORT_STANDINGS] 多競技対応順位計算開始: Block ${matchBlockId}, Tournament ${tournamentId}`);

    // 競技種別設定を取得
    const sportCode = await getTournamentSportCode(tournamentId);
    const sportConfig = getSportScoreConfig(sportCode);
    console.log(`[MULTI_SPORT_STANDINGS] 競技種別: ${sportCode}`, sportConfig);

    // 勝点システムを取得
    const pointSystem: PointSystem = await getTournamentPointSystem(tournamentId);
    const winPoints = pointSystem.win;
    const drawPoints = pointSystem.draw;
    const lossPoints = pointSystem.loss;
    console.log(`[MULTI_SPORT_STANDINGS] 勝点システム: 勝利=${winPoints}, 引分=${drawPoints}, 敗北=${lossPoints}`);

    // 競技種別対応スコア解析関数
    function analyzeScore(scoreString: string | number | null | undefined, periodCount: number, currentSportCode: string = sportCode) {
      if (!scoreString || scoreString === null || scoreString === undefined) {
        return {
          regularTime: 0,
          pkScore: null,
          totalScore: 0,
          display: '0',
          forStandings: 0
        };
      }
      
      const scoreStr = String(scoreString);
      
      if (!scoreStr.includes(',')) {
        const score = parseInt(scoreStr) || 0;
        return {
          regularTime: score,
          pkScore: null,
          totalScore: score,
          display: scoreStr,
          forStandings: score
        };
      }
      
      const periods = scoreStr.split(',').map(s => parseInt(s.trim()) || 0);
      
      // PK競技の場合: シンプルな合計計算
      if (currentSportCode === 'pk') {
        const total = periods.reduce((sum, p) => sum + p, 0);
        return {
          regularTime: total,
          pkScore: null,
          totalScore: total,
          display: total.toString(),  // シンプルに "5" や "4" と表示
          forStandings: total
        };
      }
      
      // サッカー競技の場合: 特殊なPK戦処理
      if (currentSportCode === 'soccer') {
        if (periodCount <= 2) {
          // 通常戦のみ（前半・後半）
          const total = periods.reduce((sum, p) => sum + p, 0);
          return {
            regularTime: total,
            pkScore: null,
            totalScore: total,
            display: total.toString(),
            forStandings: total
          };
        } else if (periodCount === 3) {
          // 延長戦あり（前半・後半・延長）
          const total = periods.reduce((sum, p) => sum + p, 0);
          return {
            regularTime: total,
            pkScore: null,
            totalScore: total,
            display: total.toString(),
            forStandings: total
          };
        } else if (periodCount >= 4) {
          // PK戦あり（前半・後半・延長・PK）
          const regularScore = periods.slice(0, -1).reduce((sum, p) => sum + p, 0);
          const pkScore = periods[periods.length - 1];
          
          return {
            regularTime: regularScore,
            pkScore: pkScore,
            totalScore: regularScore + pkScore,
            display: `${regularScore}(PK ${pkScore})`,  // サッカー用: "2(PK 5)"
            forStandings: regularScore  // 順位表では通常戦スコアのみ
          };
        }
      }
      
      // その他の競技: 従来通りの合計計算
      const total = periods.reduce((sum, p) => sum + p, 0);
      return {
        regularTime: total,
        pkScore: null,
        totalScore: total,
        display: total.toString(),
        forStandings: total
      };
    }

    // 多競技対応試合結果を取得
    const matches = await getMultiSportMatchResults(matchBlockId, tournamentId);
    console.log(`[MULTI_SPORT_STANDINGS] 確定済み試合数: ${matches.length}`);

    // 確定済み試合がない場合でもチーム情報は表示する
    if (matches.length === 0) {
      console.log(`[MULTI_SPORT_STANDINGS] 確定済み試合がありません - チーム基本情報のみ表示`);
    }

    // 参加チーム一覧を取得
    // 決勝フェーズのブロックでは assigned_block が更新されない場合があるため、
    // 試合データから直接チーム情報を取得する
    const blockInfoQuery = await db.execute({
      sql: `SELECT phase, block_name FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });

    const blockPhase = blockInfoQuery.rows[0]?.phase as string;
    const blockName = blockInfoQuery.rows[0]?.block_name as string;

    let teamsResult;

    if (blockPhase === 'final') {
      // 決勝フェーズの場合は試合データから直接チーム情報を取得
      console.log(`[MULTI_SPORT_STANDINGS] 決勝フェーズのブロックのため、試合データからチーム情報を取得`);
      teamsResult = await db.execute({
        sql: `
          SELECT DISTINCT
            ml.team1_id as team_id,
            COALESCE(tt.team_name, t.team_name, ml.team1_display_name) as team_name,
            COALESCE(tt.team_omission, t.team_omission) as team_omission
          FROM t_matches_live ml
          LEFT JOIN t_tournament_teams tt ON ml.team1_id = tt.team_id AND tt.tournament_id = ?
          LEFT JOIN m_teams t ON ml.team1_id = t.team_id
          WHERE ml.match_block_id = ? AND ml.team1_id IS NOT NULL
          UNION
          SELECT DISTINCT
            ml.team2_id as team_id,
            COALESCE(tt.team_name, t.team_name, ml.team2_display_name) as team_name,
            COALESCE(tt.team_omission, t.team_omission) as team_omission
          FROM t_matches_live ml
          LEFT JOIN t_tournament_teams tt ON ml.team2_id = tt.team_id AND tt.tournament_id = ?
          LEFT JOIN m_teams t ON ml.team2_id = t.team_id
          WHERE ml.match_block_id = ? AND ml.team2_id IS NOT NULL
          ORDER BY team_name
        `,
        args: [tournamentId, matchBlockId, tournamentId, matchBlockId]
      });
    } else {
      // 予選フェーズの場合は従来通り assigned_block を使用
      console.log(`[MULTI_SPORT_STANDINGS] 予選フェーズのブロックのため、assigned_block から取得`);
      teamsResult = await db.execute({
        sql: `
          SELECT DISTINCT
            tt.team_id,
            COALESCE(tt.team_name, t.team_name) as team_name,
            COALESCE(tt.team_omission, t.team_omission) as team_omission
          FROM t_tournament_teams tt
          INNER JOIN m_teams t ON tt.team_id = t.team_id
          WHERE tt.tournament_id = ? AND tt.assigned_block = ?
          ORDER BY COALESCE(tt.team_name, t.team_name)
        `,
        args: [tournamentId, blockName]
      });
    }

    console.log(`[MULTI_SPORT_STANDINGS] 参加チーム数: ${teamsResult.rows.length}`);

    // 各チームの成績を計算
    const teamStandings: MultiSportTeamStanding[] = [];

    for (const team of teamsResult.rows) {
      const teamId = team.team_id as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamMatches = matches.filter((m: any) => m.team1_id === teamId || m.team2_id === teamId);
      
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let scoresFor = 0;
      let scoresAgainst = 0;
      let points = 0;
      const soccerDataList: { regular_goals_for: number; regular_goals_against: number; pk_goals_for?: number; pk_goals_against?: number; is_pk_game: boolean; pk_winner?: boolean }[] = []; // サッカー専用データ収集

      // 各試合の結果を集計
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      teamMatches.forEach((match: any) => {
        const isTeam1 = match.team1_id === teamId;
        let teamScores: number;
        let opponentScores: number;

        // スコアデータの解析
        if (match.is_walkover) {
          // 不戦勝・不戦敗
          if (match.winner_team_id === teamId) {
            teamScores = walkoverWinnerGoals;
            opponentScores = walkoverLoserGoals;
          } else {
            teamScores = walkoverLoserGoals;
            opponentScores = walkoverWinnerGoals;
          }
        } else {
          // 通常の試合
          if (sportCode === 'soccer') {
            // サッカー用解析（PK戦分離）
            const periodCount = match.period_count || 2;
            const team1Analysis = analyzeScore(match.team1_scores, periodCount, sportCode);
            const team2Analysis = analyzeScore(match.team2_scores, periodCount, sportCode);
            
            // 順位表では通常戦スコアのみ使用
            teamScores = isTeam1 ? team1Analysis.forStandings : team2Analysis.forStandings;
            opponentScores = isTeam1 ? team2Analysis.forStandings : team1Analysis.forStandings;
            
            console.log(`[MULTI_SPORT_STANDINGS] Soccer match ${match.match_code}: ${team1Analysis.display} - ${team2Analysis.display} (順位表用: ${team1Analysis.forStandings}-${team2Analysis.forStandings})`);
          } else {
            // 他の競技: 汎用スコア解析（PK競技対応含む）
            const periodCount = match.period_count || 1;
            const team1Analysis = analyzeScore(match.team1_scores, periodCount, sportCode);
            const team2Analysis = analyzeScore(match.team2_scores, periodCount, sportCode);
            
            teamScores = isTeam1 ? team1Analysis.forStandings : team2Analysis.forStandings;
            opponentScores = isTeam1 ? team2Analysis.forStandings : team1Analysis.forStandings;
            
            console.log(`[MULTI_SPORT_STANDINGS] ${sportCode} match ${match.match_code}: ${team1Analysis.display} - ${team2Analysis.display} (順位表用: ${team1Analysis.forStandings}-${team2Analysis.forStandings})`);
          }
        }

        scoresFor += teamScores;
        scoresAgainst += opponentScores;

        // 勝敗とポイントの集計
        if (match.is_draw) {
          draws++;
          points += drawPoints;
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += winPoints;
        } else {
          losses++;
          points += lossPoints;
        }
      });

      // サッカー専用データの統合
      let consolidatedSoccerData: { regular_goals_for: number; regular_goals_against: number; pk_goals_for: number; pk_goals_against: number; is_pk_game: boolean; pk_winner?: boolean } | undefined = undefined;
      if (sportCode === 'soccer' && soccerDataList.length > 0) {
        consolidatedSoccerData = {
          regular_goals_for: soccerDataList.reduce((sum, data) => sum + data.regular_goals_for, 0),
          regular_goals_against: soccerDataList.reduce((sum, data) => sum + data.regular_goals_against, 0),
          pk_goals_for: soccerDataList.reduce((sum, data) => sum + (data.pk_goals_for || 0), 0),
          pk_goals_against: soccerDataList.reduce((sum, data) => sum + (data.pk_goals_against || 0), 0),
          is_pk_game: soccerDataList.some(data => data.is_pk_game),
          pk_winner: undefined // 複数試合では意味がないため未定義
        };
      }

      teamStandings.push({
        team_id: teamId,
        team_name: team.team_name as string,
        team_omission: team.team_omission as string || undefined,
        position: 0, // 後で設定
        points,
        matches_played: teamMatches.length,
        wins,
        draws,
        losses,
        scores_for: scoresFor,
        scores_against: scoresAgainst,
        score_difference: scoresFor - scoresAgainst,
        soccer_data: consolidatedSoccerData,
        sport_config: sportConfig
      });
    }

    // カスタム順位決定ルールの適用を試行
    let finalStandings = [...teamStandings];
    let tieBreakingApplied = false;
    
    try {
      // 大会フェーズを取得
      const blockInfo = await db.execute(`
        SELECT phase, tournament_id FROM t_match_blocks WHERE match_block_id = ?
      `, [matchBlockId]);
      
      if (blockInfo.rows.length > 0) {
        const phase = String(blockInfo.rows[0].phase) as 'preliminary' | 'final';
        const tournamentId = Number(blockInfo.rows[0].tournament_id);
        
        // カスタム順位決定ルールを取得
        const customRules = await getTournamentTieBreakingRules(tournamentId, phase);
        
        if (customRules.length > 0) {
          console.log(`[TIE_BREAKING] カスタム順位決定ルール適用開始: ${customRules.length}個のルール`);
          
          // まず基本的な順位付け（デフォルトロジック）
          const basicSorted = [...teamStandings].sort((a, b) => {
            if (a.points !== b.points) return b.points - a.points;
            if (a.score_difference !== b.score_difference) return b.score_difference - a.score_difference;
            if (a.scores_for !== b.scores_for) return b.scores_for - a.scores_for;
            return a.team_name.localeCompare(b.team_name);
          });

          // 基本順位を設定
          let currentPosition = 1;
          for (let i = 0; i < basicSorted.length; i++) {
            if (i === 0) {
              basicSorted[i].position = 1;
            } else {
              const current = basicSorted[i];
              const previous = basicSorted[i - 1];
              
              // タイブレーキングルールに従った同着判定
              // 勝点、得失点差、総得点がすべて同じ場合のみ同順位とする
              const isTied = current.points === previous.points &&
                            current.score_difference === previous.score_difference &&
                            current.scores_for === previous.scores_for;
              if (isTied) {
                basicSorted[i].position = previous.position;
              } else {
                currentPosition = i + 1;
                basicSorted[i].position = currentPosition;
              }
            }
          }

          // カスタム順位決定ルールエンジンを初期化
          const engine = new TieBreakingEngine(sportCode);
          
          // 確定済み試合データを取得
          const confirmedMatches = (matches || []).map((match: unknown) => {
            const m = match as Record<string, unknown>;
            return {
            match_id: m.match_id as number,
            team1_id: (m.team1_id as string) || '',
            team2_id: (m.team2_id as string) || '',
            team1_goals: parseScore(m.team1_goals as string),
            team2_goals: parseScore(m.team2_goals as string),
            winner_team_id: m.winner_team_id as string,
            is_draw: Boolean(m.is_draw),
            is_confirmed: true
          } as MatchData;
          });

          // TieBreakingContextを構築
          const context: TieBreakingContext = {
            teams: basicSorted.map(team => ({
              team_id: team.team_id,
              team_name: team.team_name,
              team_omission: team.team_omission,
              position: team.position,
              points: team.points,
              matches_played: team.matches_played,
              wins: team.wins,
              draws: team.draws,
              losses: team.losses,
              goals_for: team.scores_for,
              goals_against: team.scores_against,
              goal_difference: team.score_difference
            } as TeamStandingData)),
            matches: confirmedMatches,
            sportCode,
            rules: customRules,
            tournamentId,
            matchBlockId
          };

          // カスタム順位決定を実行
          const result = await engine.calculateTieBreaking(context);
          
          // 結果を元の形式に変換
          finalStandings = result.teams.map(team => {
            const original = teamStandings.find(t => t.team_id === team.team_id);
            return original ? { ...original, position: team.position } : original;
          }).filter(Boolean) as MultiSportTeamStanding[];

          tieBreakingApplied = result.tieBreakingApplied;

          // 手動順位設定が必要な場合のログ出力
          // 通知作成は createTieNotificationIfNeeded で行われるため、ここでは通知作成しない
          if (requiresManualRanking(result)) {
            console.log(`[TIE_BREAKING] 手動順位設定が必要（通知は createTieNotificationIfNeeded で作成済み）`);
          }

          console.log(`[TIE_BREAKING] カスタム順位決定完了: 適用=${tieBreakingApplied}, 手動設定必要=${requiresManualRanking(result)}`);
        }
      }
    } catch (error) {
      console.error(`[TIE_BREAKING] カスタム順位決定エラー:`, error);
      // エラーの場合はデフォルトロジックにフォールバック
    }

    // カスタムルールが適用されなかった場合はデフォルトロジック
    if (!tieBreakingApplied) {
      const sortedStandings = [...teamStandings].sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.score_difference !== b.score_difference) return b.score_difference - a.score_difference;
        if (a.scores_for !== b.scores_for) return b.scores_for - a.scores_for;
        return a.team_name.localeCompare(b.team_name);
      });

      // 順位を設定（同着処理含む）
      let currentPosition = 1;
      for (let i = 0; i < sortedStandings.length; i++) {
        if (i === 0) {
          sortedStandings[i].position = 1;
        } else {
          const current = sortedStandings[i];
          const previous = sortedStandings[i - 1];
          
          // タイブレーキングルールに従った同着判定
          // 勝点、得失点差、総得点がすべて同じ場合のみ同順位とする
          const isTied = current.points === previous.points &&
                        current.score_difference === previous.score_difference &&
                        current.scores_for === previous.scores_for;
          if (isTied) {
            sortedStandings[i].position = previous.position;
          } else {
            currentPosition = i + 1;
            sortedStandings[i].position = currentPosition;
          }
        }
      }
      
      finalStandings = sortedStandings;
    }

    console.log(`[MULTI_SPORT_STANDINGS] 多競技対応順位計算完了: ${finalStandings.length}チーム`);
    return finalStandings;

  } catch (error) {
    console.error(`[MULTI_SPORT_STANDINGS] 多競技対応順位計算エラー:`, error);
    throw new Error('多競技対応順位表の計算に失敗しました');
  }
}

/**
 * 多競技対応データを従来フォーマットに変換（後方互換性）
 */
export function convertMultiSportToLegacyStanding(multiSportStanding: MultiSportTeamStanding): TeamStanding {
  return {
    team_id: multiSportStanding.team_id,
    team_name: multiSportStanding.team_name,
    team_omission: multiSportStanding.team_omission,
    position: multiSportStanding.position,
    points: multiSportStanding.points,
    matches_played: multiSportStanding.matches_played,
    wins: multiSportStanding.wins,
    draws: multiSportStanding.draws,
    losses: multiSportStanding.losses,
    // 従来の名前にマッピング
    goals_for: multiSportStanding.scores_for,
    goals_against: multiSportStanding.scores_against,
    goal_difference: multiSportStanding.score_difference
  };
}

/**
 * ブロック単位のテンプレートベース順位計算（トーナメント形式用）
 */
async function calculateTemplateBasedRankingsForBlock(matchBlockId: number, tournamentId: number, phase: string = 'final'): Promise<TeamStanding[]> {
  try {
    const phaseLabel = phase === 'final' ? '決勝' : '予選';
    console.log(`[TEMPLATE_RANKINGS_BLOCK] テンプレートベース順位計算開始: Block ${matchBlockId}, Tournament ${tournamentId}, Phase: ${phaseLabel}`);

    // ブロック情報を取得
    const blockResult = await db.execute({
      sql: `SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });

    if (blockResult.rows.length === 0) {
      console.log(`[TEMPLATE_RANKINGS_BLOCK] ブロックが見つかりません`);
      return [];
    }

    const existingRankings = blockResult.rows[0].team_rankings as string | null;

    // 既存の順位設定があるかチェック
    if (existingRankings) {
      try {
        const rankings = JSON.parse(existingRankings);
        if (rankings.length > 0) {
          console.log(`[TEMPLATE_RANKINGS_BLOCK] 既存の順位設定を使用: ${rankings.length}チーム`);
          return rankings;
        }
      } catch {
        console.log(`[TEMPLATE_RANKINGS_BLOCK] 既存順位データのパースに失敗、新規計算を実行`);
      }
    }

    // 確定済みのトーナメント試合を取得
    const matchesResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          mf.winner_team_id,
          mf.is_draw,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
          AND ml.team1_id IS NOT NULL
          AND ml.team2_id IS NOT NULL
          AND mf.match_id IS NOT NULL
        ORDER BY ml.match_code
      `,
      args: [matchBlockId]
    });

    console.log(`[TEMPLATE_RANKINGS_BLOCK] 確定済み${phaseLabel}トーナメント試合: ${matchesResult.rows.length}試合`);

    if (matchesResult.rows.length === 0) {
      console.log(`[TEMPLATE_RANKINGS_BLOCK] 確定済み試合がないため、テンプレートベース計算をスキップ`);
      return [];
    }

    // 各確定済み試合でテンプレートベース順位設定を実行
    for (const match of matchesResult.rows) {
      const matchId = match.match_id as number;
      const winnerId = match.winner_team_id as string | null;
      const loserId = match.team1_id === winnerId ? match.team2_id as string : match.team1_id as string;

      console.log(`[TEMPLATE_RANKINGS_BLOCK] 試合 ${match.match_code}: 勝者=${winnerId}, 敗者=${loserId}`);

      try {
        await handleTemplateBasedPositions(matchId, winnerId, loserId, tournamentId);
      } catch (templateError) {
        console.error(`[TEMPLATE_RANKINGS_BLOCK] テンプレート処理エラー (試合${matchId}):`, templateError);
        // エラーでも他の試合の処理は継続
      }
    }

    // 更新後の順位データを取得
    const updatedResult = await db.execute({
      sql: `SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });

    if (updatedResult.rows[0]?.team_rankings) {
      try {
        const rankings = JSON.parse(updatedResult.rows[0].team_rankings as string);
        console.log(`[TEMPLATE_RANKINGS_BLOCK] テンプレートベース順位計算完了: ${rankings.length}チーム`);
        return rankings;
      } catch (error) {
        console.error(`[TEMPLATE_RANKINGS_BLOCK] 更新後順位データのパースに失敗:`, error);
      }
    }

    console.log(`[TEMPLATE_RANKINGS_BLOCK] テンプレートベース順位データなし`);
    return [];

  } catch (error) {
    console.error(`[TEMPLATE_RANKINGS_BLOCK] エラー:`, error);
    return [];
  }
}

/**
 * ブロック単位の詳細トーナメント順位計算（トーナメント形式用）
 */
async function calculateDetailedBlockTournamentStandings(matchBlockId: number, tournamentId: number, phase: string = 'final'): Promise<TeamStanding[]> {
  try {
    const phaseLabel = phase === 'final' ? '決勝' : '予選';
    console.log(`[DETAILED_BLOCK_TOURNAMENT] 詳細順位計算開始: Block ${matchBlockId}, Tournament ${tournamentId}, Phase: ${phaseLabel}`);

    // 大会のフォーマットIDを取得
    const formatResult = await db.execute({
      sql: `SELECT format_id FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });

    if (!formatResult.rows || formatResult.rows.length === 0) {
      throw new Error('大会情報が見つかりません');
    }

    const formatId = formatResult.rows[0].format_id as number;
    console.log(`[DETAILED_BLOCK_TOURNAMENT] フォーマットID: ${formatId}`);

    // ブロックのトーナメント試合情報とテンプレート情報を結合して取得
    const matchesResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
          mt.winner_position,
          mt.loser_position_start,
          mt.loser_position_end
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
        WHERE ml.match_block_id = ?
          AND ml.team1_id IS NOT NULL
        ORDER BY ml.match_code
      `,
      args: [formatId, matchBlockId]
    });

    const matches = matchesResult.rows.map(row => ({
      match_id: row.match_id as number,
      match_code: row.match_code as string,
      team1_id: row.team1_id as string | null,
      team2_id: row.team2_id as string | null,
      team1_display_name: row.team1_display_name as string,
      team2_display_name: row.team2_display_name as string,
      team1_scores: row.team1_scores as number | null,
      team2_scores: row.team2_scores as number | null,
      winner_team_id: row.winner_team_id as string | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      is_confirmed: Boolean(row.is_confirmed),
      winner_position: row.winner_position as number | null,
      loser_position_start: row.loser_position_start as number | null,
      loser_position_end: row.loser_position_end as number | null
    }));

    console.log(`[DETAILED_BLOCK_TOURNAMENT] 取得した${phaseLabel}トーナメント試合: ${matches.length}試合`);

    // 全参加チームを収集
    const allTeams = new Set<string>();
    matches.forEach(match => {
      if (match.team1_id && !match.team1_id.includes('_winner') && !match.team1_id.includes('_loser')) {
        allTeams.add(match.team1_id);
      }
      if (match.team2_id && !match.team2_id.includes('_winner') && !match.team2_id.includes('_loser')) {
        allTeams.add(match.team2_id);
      }
    });

    console.log(`[DETAILED_BLOCK_TOURNAMENT] 参加チーム数: ${allTeams.size}チーム`);

    // チームごとの順位を計算
    const teamRankings: TeamStanding[] = [];

    for (const teamId of allTeams) {
      // チーム名を取得（大会固有のチーム名を優先）
      const teamResult = await db.execute({
        sql: `
          SELECT
            COALESCE(tt.team_name, t.team_name) as team_name,
            COALESCE(tt.team_omission, t.team_omission) as team_omission
          FROM t_tournament_teams tt
          INNER JOIN m_teams t ON tt.team_id = t.team_id
          WHERE tt.tournament_id = ? AND tt.team_id = ?
        `,
        args: [tournamentId, teamId]
      });

      const teamName = teamResult.rows[0]?.team_name as string || teamId;
      const teamOmission = teamResult.rows[0]?.team_omission as string | null;

      // 簡易的な順位計算（最後に確定した試合の結果に基づく）
      let position = allTeams.size; // デフォルトは最下位

      // このチームが参加した確定済み試合を探す
      const teamMatches = matches.filter(m =>
        (m.team1_id === teamId || m.team2_id === teamId) && m.is_confirmed
      );

      if (teamMatches.length > 0) {
        // 最後の試合を取得
        const lastMatch = teamMatches[teamMatches.length - 1];
        const isWinner = lastMatch.winner_team_id === teamId;

        if (isWinner && lastMatch.winner_position !== null) {
          position = lastMatch.winner_position;
        } else if (!isWinner) {
          if (lastMatch.loser_position_start !== null) {
            position = lastMatch.loser_position_start;
          }
        }
      }

      teamRankings.push({
        team_id: teamId,
        team_name: teamName,
        team_omission: teamOmission || undefined,
        position: position,
        points: 0, // トーナメント形式では勝点は使用しない
        matches_played: teamMatches.length,
        wins: teamMatches.filter(m => m.winner_team_id === teamId).length,
        draws: teamMatches.filter(m => m.is_draw).length,
        losses: teamMatches.filter(m => m.winner_team_id && m.winner_team_id !== teamId).length,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0
      });
    }

    // 順位でソート
    teamRankings.sort((a, b) => a.position - b.position);

    console.log(`[DETAILED_BLOCK_TOURNAMENT] 詳細順位計算完了: ${teamRankings.length}チーム`);
    return teamRankings;

  } catch (error) {
    console.error(`[DETAILED_BLOCK_TOURNAMENT] エラー:`, error);
    return [];
  }
}

