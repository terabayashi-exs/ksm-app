// テンプレートベースの順位設定ハンドラー
import { db } from '@/lib/db';

interface MatchTemplate {
  template_id: number;
  match_code: string;
  loser_position_start: number | null;
  loser_position_end: number | null;
  winner_position: number | null;
  position_note: string | null;
}

interface TeamRanking {
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
}

/**
 * 試合結果確定時にテンプレートベースで順位を設定
 * @param matchId - 確定された試合ID
 * @param winnerId - 勝利チームID
 * @param loserId - 敗北チームID（引き分けの場合はnull）
 * @param tournamentId - 大会ID
 */
export async function handleTemplateBasedPositions(
  matchId: number,
  winnerId: string | null,
  loserId: string | null,
  tournamentId: number
): Promise<void> {
  try {
    console.log(`🎯 テンプレートベース順位設定開始: 試合${matchId}, 勝者:${winnerId}, 敗者:${loserId}`);
    
    // 1. 試合のテンプレート情報を取得
    const template = await getMatchTemplate(matchId);
    if (!template) {
      console.log('⚠️  テンプレート情報が見つかりません');
      return;
    }
    
    console.log(`📋 テンプレート情報: ${template.match_code} - 敗者順位:${template.loser_position_start}-${template.loser_position_end}, 勝者順位:${template.winner_position}`);
    
    // 2. 決勝トーナメントブロックを取得
    const finalBlock = await getFinalTournamentBlock(tournamentId);
    if (!finalBlock) {
      console.log('⚠️  決勝トーナメントブロックが見つかりません');
      return;
    }
    
    // 3. 既存の手動順位設定をチェック
    const existingRankings = await getExistingRankings(finalBlock.match_block_id);
    
    // 4. 敗者の順位設定
    if (loserId && template.loser_position_start) {
      await setTeamPosition(
        finalBlock.match_block_id,
        loserId,
        template.loser_position_start,
        template.loser_position_end,
        template.position_note,
        existingRankings
      );
    }
    
    // 5. 勝者の順位設定（決勝戦など）
    if (winnerId && template.winner_position) {
      await setTeamPosition(
        finalBlock.match_block_id,
        winnerId,
        template.winner_position,
        template.winner_position,
        template.position_note,
        existingRankings
      );
    }
    
    // 6. 次戦への進出処理は既存のシステム（tournament-progression.ts）で処理される
    // このハンドラーは順位設定のみに専念
    
    console.log('✅ テンプレートベース順位設定完了');
    
  } catch (error) {
    console.error('❌ テンプレートベース順位設定エラー:', error);
    throw error;
  }
}

/**
 * 試合のテンプレート情報を取得
 */
async function getMatchTemplate(matchId: number): Promise<MatchTemplate | null> {
  const result = await db.execute(`
    SELECT 
      mt.template_id,
      mt.match_code,
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
      AND mt.phase = 'final'
    )
    WHERE ml.match_id = ?
    LIMIT 1
  `, [matchId]);
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    template_id: row.template_id as number,
    match_code: row.match_code as string,
    loser_position_start: row.loser_position_start as number | null,
    loser_position_end: row.loser_position_end as number | null,
    winner_position: row.winner_position as number | null,
    position_note: row.position_note as string | null
  };
}

/**
 * 決勝トーナメントブロックを取得
 */
async function getFinalTournamentBlock(tournamentId: number): Promise<{ match_block_id: number } | null> {
  const result = await db.execute(`
    SELECT match_block_id
    FROM t_match_blocks
    WHERE tournament_id = ? AND phase = 'final'
    LIMIT 1
  `, [tournamentId]);
  
  if (result.rows.length === 0) return null;
  
  return { match_block_id: result.rows[0].match_block_id as number };
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
 * チームの順位を設定（手動設定を優先）
 */
async function setTeamPosition(
  matchBlockId: number,
  teamId: string,
  positionStart: number,
  positionEnd: number | null,
  note: string | null,
  existingRankings: TeamRanking[]
): Promise<void> {
  console.log(`🎯 チーム ${teamId} の順位設定: ${positionStart}位${positionEnd && positionEnd !== positionStart ? `-${positionEnd}位` : ''}`);
  
  // 既に手動で順位が設定されているかチェック
  const existingTeam = existingRankings.find(ranking => ranking.team_id === teamId);
  if (existingTeam && existingTeam.position > 0) {
    console.log(`ℹ️  チーム ${teamId} は既に手動で ${existingTeam.position}位 に設定されています。スキップします。`);
    return;
  }
  
  // チーム情報を取得
  const teamResult = await db.execute(`
    SELECT team_name, team_omission
    FROM m_teams
    WHERE team_id = ?
  `, [teamId]);
  
  if (teamResult.rows.length === 0) {
    console.log(`⚠️  チーム ${teamId} の情報が見つかりません`);
    return;
  }
  
  const teamInfo = teamResult.rows[0];
  
  // 新しい順位情報を作成
  const newRanking: TeamRanking = {
    team_id: teamId,
    team_name: teamInfo.team_name as string,
    team_omission: teamInfo.team_omission as string,
    position: positionStart,
    // 決勝トーナメントでは試合統計は表示しない
    points: undefined,
    matches_played: undefined,
    wins: undefined,
    draws: undefined,
    losses: undefined,
    goals_for: undefined,
    goals_against: undefined,
    goal_difference: undefined
  };
  
  // 既存のランキングを更新
  const updatedRankings = existingRankings.filter(ranking => ranking.team_id !== teamId);
  updatedRankings.push(newRanking);
  
  // 順位でソート
  updatedRankings.sort((a, b) => a.position - b.position);
  
  // データベースに保存
  await db.execute(`
    UPDATE t_match_blocks
    SET 
      team_rankings = ?,
      updated_at = datetime('now', '+9 hours')
    WHERE match_block_id = ?
  `, [JSON.stringify(updatedRankings), matchBlockId]);
  
  console.log(`✅ チーム ${teamId} (${teamInfo.team_name}) を ${positionStart}位 に設定しました`);
}

/**
 * 手動順位設定があるかチェック
 */
export async function hasManualRankings(tournamentId: number): Promise<boolean> {
  const result = await db.execute(`
    SELECT team_rankings
    FROM t_match_blocks
    WHERE tournament_id = ? AND phase = 'final' AND team_rankings IS NOT NULL
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