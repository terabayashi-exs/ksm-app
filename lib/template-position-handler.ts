// テンプレートベースの順位設定ハンドラー
import { db } from '@/lib/db';

interface TeamRanking {
  tournament_team_id?: number;
  team_id: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points?: number;
  matches_played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goals_for?: number;
  goals_against?: number;
  goal_difference?: number;
  position_note?: string;
}

/**
 * 試合結果確定時にテンプレートベースで順位を設定
 * @param matchId - 確定された試合ID
 * @param winnerTournamentTeamId - 勝利チームのtournament_team_id
 * @param loserTournamentTeamId - 敗北チームのtournament_team_id
 * MIGRATION NOTE: tournament_team_idベースに変更完了
 */
export async function handleTemplateBasedPositions(
  matchId: number,
  winnerTournamentTeamId: number | null,
  loserTournamentTeamId: number | null
): Promise<void> {
  try {
    console.log(`🎯 テンプレートベース順位設定開始: 試合${matchId}`);
    console.log(`   勝者: tournament_team_id=${winnerTournamentTeamId}`);
    console.log(`   敗者: tournament_team_id=${loserTournamentTeamId}`);

    // 1. 試合のテンプレート情報とブロック情報を取得
    const matchInfo = await getMatchTemplateAndBlock(matchId);
    if (!matchInfo) {
      console.log('⚠️  試合情報が見つかりません');
      return;
    }

    console.log(`📋 テンプレート情報: ${matchInfo.match_code} (phase=${matchInfo.phase})`);
    console.log(`   敗者順位:${matchInfo.loser_position_start}-${matchInfo.loser_position_end}, 勝者順位:${matchInfo.winner_position}`);

    // 2. 既存の手動順位設定をチェック
    const existingRankings = await getExistingRankings(matchInfo.match_block_id);

    // 3. 敗者の順位設定
    if (matchInfo.loser_position_start && loserTournamentTeamId) {
      await setTeamPositionByTournamentTeamId(
        matchInfo.match_block_id,
        loserTournamentTeamId,
        matchInfo.loser_position_start,
        matchInfo.loser_position_end,
        matchInfo.position_note,
        existingRankings
      );
    }

    // 4. 勝者の順位設定（決勝戦など）
    if (matchInfo.winner_position && winnerTournamentTeamId) {
      await setTeamPositionByTournamentTeamId(
        matchInfo.match_block_id,
        winnerTournamentTeamId,
        matchInfo.winner_position,
        matchInfo.winner_position,
        matchInfo.position_note,
        existingRankings
      );
    }

    // 5. 次戦への進出処理は既存のシステム（tournament-progression.ts）で処理される
    // このハンドラーは順位設定のみに専念

    console.log('✅ テンプレートベース順位設定完了');

  } catch (error) {
    console.error('❌ テンプレートベース順位設定エラー:', error);
    throw error;
  }
}

/**
 * 試合のテンプレート情報とブロック情報を取得
 * MIGRATION NOTE: 予選・決勝両方のトーナメント形式に対応
 */
async function getMatchTemplateAndBlock(matchId: number): Promise<{
  template_id: number;
  match_code: string;
  match_block_id: number;
  phase: string;
  loser_position_start: number | null;
  loser_position_end: number | null;
  winner_position: number | null;
  position_note: string | null;
} | null> {
  const result = await db.execute(`
    SELECT
      mt.template_id,
      mt.match_code,
      mb.match_block_id,
      mb.phase,
      mt.loser_position_start,
      mt.loser_position_end,
      mt.winner_position,
      mt.position_note
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    JOIN t_tournaments t ON mb.tournament_id = t.tournament_id
    JOIN m_match_templates mt ON (
      mt.format_id = t.format_id
      AND mt.match_code = ml.match_code
      AND mt.phase = mb.phase
    )
    WHERE ml.match_id = ?
    LIMIT 1
  `, [matchId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    template_id: row.template_id as number,
    match_code: row.match_code as string,
    match_block_id: row.match_block_id as number,
    phase: row.phase as string,
    loser_position_start: row.loser_position_start as number | null,
    loser_position_end: row.loser_position_end as number | null,
    winner_position: row.winner_position as number | null,
    position_note: row.position_note as string | null
  };
}

/**
 * 既存の順位設定を取得
 */
async function getExistingRankings(matchBlockId: number): Promise<TeamRanking[]> {
  const result = await db.execute(`
    SELECT team_rankings
    FROM t_match_blocks
    WHERE match_block_id = ?
  `, [matchBlockId]);
  
  if (result.rows.length === 0 || !result.rows[0].team_rankings) {
    return [];
  }
  
  try {
    return JSON.parse(result.rows[0].team_rankings as string);
  } catch {
    return [];
  }
}

/**
 * チームの順位を設定（tournament_team_idベース）
 * MIGRATION NOTE: tournament_team_idを使用する新しい関数
 */
async function setTeamPositionByTournamentTeamId(
  matchBlockId: number,
  tournamentTeamId: number,
  positionStart: number,
  positionEnd: number | null,
  note: string | null,
  existingRankings: TeamRanking[]
): Promise<void> {
  console.log(`🎯 チーム tournament_team_id=${tournamentTeamId} の順位設定: ${positionStart}位${positionEnd && positionEnd !== positionStart ? `-${positionEnd}位` : ''}`);

  // チーム情報を取得（tournament_team_idから）
  const teamResult = await db.execute(`
    SELECT
      tt.tournament_team_id,
      tt.team_id,
      tt.tournament_id,
      COALESCE(tt.team_omission, tt.team_name, t.team_omission, t.team_name) as display_name,
      COALESCE(tt.team_name, t.team_name) as team_name
    FROM t_tournament_teams tt
    LEFT JOIN m_teams t ON tt.team_id = t.team_id
    WHERE tt.tournament_team_id = ?
  `, [tournamentTeamId]);

  if (teamResult.rows.length === 0) {
    console.log(`⚠️  tournament_team_id=${tournamentTeamId} の情報が見つかりません`);
    return;
  }

  const teamInfo = teamResult.rows[0];
  const teamId = teamInfo.team_id as string;
  const tournamentId = teamInfo.tournament_id as number;

  // 既に手動で順位が設定されているかチェック
  const existingTeam = existingRankings.find(ranking => ranking.team_id === teamId);
  if (existingTeam && existingTeam.position > 0) {
    console.log(`ℹ️  チーム ${teamId} は既に手動で ${existingTeam.position}位 に設定されています。スキップします。`);
    return;
  }

  // 全参加チームを取得して、順位未設定チームも含める
  const allTeamsResult = await db.execute(`
    SELECT
      tt.tournament_team_id,
      tt.team_id,
      COALESCE(tt.team_omission, tt.team_name, t.team_omission, t.team_name) as display_name,
      COALESCE(tt.team_name, t.team_name) as team_name
    FROM t_tournament_teams tt
    LEFT JOIN m_teams t ON tt.team_id = t.team_id
    WHERE tt.tournament_id = ?
      AND tt.withdrawal_status = 'active'
    ORDER BY display_name
  `, [tournamentId]);

  // 既存のランキングからチームIDのセットを作成
  const rankedTeamIds = new Set(existingRankings.map(r => r.team_id));

  // 全チームのランキングを作成
  const updatedRankings: TeamRanking[] = [];

  // 既存のランキングを追加（今回更新対象のチームを除く）
  existingRankings.forEach(ranking => {
    if (ranking.team_id !== teamId) {
      updatedRankings.push(ranking);
    }
  });

  // 今回順位を設定するチームを追加
  updatedRankings.push({
    tournament_team_id: tournamentTeamId,
    team_id: teamId,
    team_name: teamInfo.team_name as string,
    team_omission: teamInfo.display_name as string,
    position: positionStart,
    points: 0,
    matches_played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals_for: 0,
    goals_against: 0,
    goal_difference: 0,
    position_note: note || undefined
  });

  // ランキングに含まれていないチームを position: 0 で追加
  allTeamsResult.rows.forEach(row => {
    const tId = row.team_id as string;
    const ttId = row.tournament_team_id as number;
    if (tId !== teamId && !rankedTeamIds.has(tId)) {
      updatedRankings.push({
        tournament_team_id: ttId,
        team_id: tId,
        team_name: row.team_name as string,
        team_omission: row.display_name as string,
        position: 0,
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

  // 順位でソート（0は最後）
  updatedRankings.sort((a, b) => {
    if (a.position === 0 && b.position === 0) return 0;
    if (a.position === 0) return 1;
    if (b.position === 0) return -1;
    return a.position - b.position;
  });

  // データベースに保存
  await db.execute(`
    UPDATE t_match_blocks
    SET
      team_rankings = ?,
      updated_at = datetime('now', '+9 hours')
    WHERE match_block_id = ?
  `, [JSON.stringify(updatedRankings), matchBlockId]);

  console.log(`✅ チーム ${teamId} (${teamInfo.display_name}) を ${positionStart}位 に設定しました`);
  console.log(`📊 合計 ${updatedRankings.length} チームをランキングに含めました`);
}

/**
 * 手動順位設定があるかチェック
 * MIGRATION NOTE: 予選・決勝両方のトーナメント形式に対応
 */
export async function hasManualRankings(tournamentId: number): Promise<boolean> {
  const result = await db.execute(`
    SELECT mb.team_rankings
    FROM t_match_blocks mb
    JOIN t_tournaments t ON mb.tournament_id = t.tournament_id
    JOIN m_tournament_formats f ON t.format_id = f.format_id
    WHERE mb.tournament_id = ?
      AND mb.team_rankings IS NOT NULL
      AND (
        (mb.phase = 'preliminary' AND f.preliminary_format_type = 'tournament')
        OR (mb.phase = 'final' AND f.final_format_type = 'tournament')
      )
    LIMIT 1
  `, [tournamentId]);

  if (result.rows.length === 0) return false;

  try {
    const rankings = JSON.parse(result.rows[0].team_rankings as string);
    return rankings.some((ranking: TeamRanking) => ranking.position > 0);
  } catch {
    return false;
  }
}