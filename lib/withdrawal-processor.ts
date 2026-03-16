// lib/withdrawal-processor.ts
// 辞退承認後の自動処理機能
// MIGRATION NOTE: team_id系からtournament_team_id系に移行済み（2026-02-04）

import { db } from '@/lib/db';

interface WithdrawalInfo {
  tournament_team_id: number;
  tournament_id: number;
  team_id: string; // データ構造には残す（後方互換性）
  team_name: string;
  withdrawal_status: string;
  withdrawal_reason: string | null;
  withdrawal_requested_at: string | null;
  tournament_name: string;
  tournament_status: string;
}

/**
 * 辞退承認後の自動処理を実行
 * @param tournamentTeamId 参加チームID（tournament_team_id）
 * @param withdrawalInfo 辞退申請情報
 */
export async function processWithdrawalApproval(
  tournamentTeamId: number,
  withdrawalInfo: WithdrawalInfo
): Promise<void> {
  console.log(`🔄 辞退承認後の自動処理開始: ${withdrawalInfo.team_name}`);

  try {
    // 1. 関連する試合データの処理
    await processMatchAdjustments(withdrawalInfo);

    // 2. 順位表・統計の更新
    await updateTournamentRankings(withdrawalInfo.tournament_id);

    // 3. ブロック配置の調整
    await adjustBlockPositions(withdrawalInfo);

    // 4. 処理ログの記録
    await logWithdrawalProcess(tournamentTeamId, withdrawalInfo);

    console.log(`✅ 辞退承認後の自動処理完了: ${withdrawalInfo.team_name}`);

  } catch (error) {
    console.error(`❌ 辞退承認後の自動処理エラー: ${withdrawalInfo.team_name}`, error);

    // エラーログを記録（処理は継続）
    await logWithdrawalError(tournamentTeamId, error);

    // エラーが発生しても処理を継続（手動対応可能）
    throw error;
  }
}

/**
 * 関連する試合データの処理
 * MIGRATION NOTE: team1_id/team2_id → team1_tournament_team_id/team2_tournament_team_id
 */
async function processMatchAdjustments(withdrawalInfo: WithdrawalInfo): Promise<void> {
  const { tournament_id, tournament_team_id } = withdrawalInfo;

  // 辞退チームが関連する試合を取得
  // MIGRATION NOTE: tournament_team_idベースで検索
  const relatedMatches = await db.execute(`
    SELECT
      ml.match_id,
      ml.match_code,
      ml.team1_tournament_team_id,
      ml.team2_tournament_team_id,
      ml.team1_display_name,
      ml.team2_display_name,
      ml.match_status,
      mf.match_id as final_match_id
    FROM t_matches_live ml
    LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
    WHERE ml.tournament_id = ?
      AND (ml.team1_tournament_team_id = ? OR ml.team2_tournament_team_id = ?)
  `, [tournament_id, tournament_team_id, tournament_team_id]);

  if (relatedMatches.rows.length === 0) {
    console.log(`📝 辞退チーム ${withdrawalInfo.team_name} に関連する試合がありません`);
    return;
  }

  console.log(`📝 ${relatedMatches.rows.length}件の関連試合を処理中...`);

  for (const match of relatedMatches.rows) {
    const matchId = Number(match.match_id);
    // MIGRATION NOTE: tournament_team_idで比較
    const isTeam1 = match.team1_tournament_team_id === tournament_team_id;
    const opponentTournamentTeamId = isTeam1 ? match.team2_tournament_team_id : match.team1_tournament_team_id;
    // const opponentName = isTeam1 ? match.team2_display_name : match.team1_display_name;

    // 確定済み試合の場合はスキップ（手動対応が必要）
    if (match.final_match_id) {
      console.log(`⚠️  試合 ${match.match_code} は既に確定済みのため、手動対応が必要です`);
      continue;
    }

    // 試合ステータスによる処理分岐
    if (match.match_status === 'scheduled') {
      // 未開始試合: 不戦勝として処理
      if (opponentTournamentTeamId) {
        await processWalkoverMatch(matchId, Number(opponentTournamentTeamId), withdrawalInfo, String(match.match_code));
      } else {
        console.log(`⚠️  試合 ${match.match_code} に対戦相手がいないため、処理をスキップします`);
      }
    } else if (match.match_status === 'ongoing') {
      // 進行中試合: 中止として処理（手動確認が必要）
      await processCancelledMatch(matchId, withdrawalInfo, String(match.match_code));
    } else if (match.match_status === 'completed') {
      // 完了済み試合: 結果を維持（確定処理は手動）
      console.log(`📋 試合 ${match.match_code} は完了済みです。確定処理は手動で行ってください`);
    }
  }
}

/**
 * 不戦勝として試合を処理
 * MIGRATION NOTE: winnerTeamId → winnerTournamentTeamId
 */
async function processWalkoverMatch(
  matchId: number,
  winnerTournamentTeamId: number,
  withdrawalInfo: WithdrawalInfo,
  matchCode: string
): Promise<void> {
  console.log(`🏆 試合 ${matchCode}: 不戦勝処理を実行中...`);

  // 不戦勝として結果を設定
  // MIGRATION NOTE: tournament_team_idベースで更新
  await db.execute(`
    UPDATE t_matches_live
    SET
      team1_goals = CASE WHEN team1_tournament_team_id = ? THEN 0 ELSE 3 END,
      team2_goals = CASE WHEN team2_tournament_team_id = ? THEN 0 ELSE 3 END,
      winner_tournament_team_id = ?,
      is_walkover = 1,
      match_status = 'completed',
      remarks = '辞退による不戦勝 (自動処理)',
      updated_at = datetime('now', '+9 hours')
    WHERE match_id = ?
  `, [withdrawalInfo.tournament_team_id, withdrawalInfo.tournament_team_id, winnerTournamentTeamId, matchId]);

  console.log(`✅ 試合 ${matchCode}: 不戦勝処理完了`);
}

/**
 * 進行中試合を中止として処理
 */
async function processCancelledMatch(
  matchId: number,
  _withdrawalInfo: WithdrawalInfo,
  matchCode: string
): Promise<void> {
  console.log(`⚠️  試合 ${matchCode}: 中止処理を実行中...`);

  await db.execute(`
    UPDATE t_matches_live
    SET
      match_status = 'cancelled',
      remarks = '辞退による試合中止 (要手動確認)',
      updated_at = datetime('now', '+9 hours')
    WHERE match_id = ?
  `, [matchId]);

  console.log(`🛑 試合 ${matchCode}: 中止処理完了（手動確認が必要）`);
}

/**
 * 大会順位表の更新
 */
async function updateTournamentRankings(tournamentId: number): Promise<void> {
  try {
    console.log(`📊 大会 ${tournamentId} の順位表更新中...`);

    // standings-calculatorの関数を使用して順位表を再計算
    // Note: 実際の実装では既存の順位表計算関数をインポートして使用
    const { recalculateAllTournamentRankings } = await import('@/lib/standings-calculator');
    await recalculateAllTournamentRankings(tournamentId);

    console.log(`✅ 順位表更新完了`);
  } catch (error) {
    console.error(`❌ 順位表更新エラー:`, error);
    // エラーが発生しても処理継続
  }
}

/**
 * ブロック配置の調整
 * MIGRATION NOTE: team_id → tournament_team_id（WHERE句のみteam_idを使用して後方互換性維持）
 */
async function adjustBlockPositions(withdrawalInfo: WithdrawalInfo): Promise<void> {
  const { tournament_id, team_id } = withdrawalInfo;

  try {
    console.log(`🔄 ブロック配置調整中...`);

    // 辞退チームのブロック情報を取得
    const teamBlockInfo = await db.execute(`
      SELECT assigned_block, block_position
      FROM t_tournament_teams
      WHERE tournament_id = ? AND team_id = ?
    `, [tournament_id, team_id]);

    if (teamBlockInfo.rows.length === 0 || !teamBlockInfo.rows[0].assigned_block) {
      console.log(`📝 ブロック未配置のため調整不要`);
      return;
    }

    const blockName = teamBlockInfo.rows[0].assigned_block;
    const blockPosition = Number(teamBlockInfo.rows[0].block_position);

    // 同じブロックの他のチームの位置を調整
    const otherTeams = await db.execute(`
      SELECT tournament_team_id, team_name, block_position
      FROM t_tournament_teams
      WHERE tournament_id = ?
        AND assigned_block = ?
        AND team_id != ?
        AND withdrawal_status = 'active'
      ORDER BY block_position
    `, [tournament_id, blockName, team_id]);

    // 辞退チームより後の位置のチームを前に詰める
    for (const team of otherTeams.rows) {
      const currentPosition = Number(team.block_position);
      if (currentPosition > blockPosition) {
        const newPosition = currentPosition - 1;

        await db.execute(`
          UPDATE t_tournament_teams
          SET block_position = ?, updated_at = datetime('now', '+9 hours')
          WHERE tournament_team_id = ?
        `, [newPosition, team.tournament_team_id]);

        console.log(`📝 ${team.team_name}: 位置 ${currentPosition} → ${newPosition}`);
      }
    }

    console.log(`✅ ブロック配置調整完了`);
  } catch (error) {
    console.error(`❌ ブロック配置調整エラー:`, error);
    // エラーが発生しても処理継続
  }
}

/**
 * 処理ログの記録
 */
async function logWithdrawalProcess(
  tournamentTeamId: number,
  withdrawalInfo: WithdrawalInfo
): Promise<void> {
  const logMessage = `辞退承認後の自動処理完了: ${withdrawalInfo.team_name} (大会: ${withdrawalInfo.tournament_name})`;

  console.log(`📝 処理ログ記録: ${logMessage}`);

  // 将来的にはログテーブルに保存
  // 現在は単純にコンソールログとデータベースコメントに記録
  try {
    await db.execute(`
      UPDATE t_tournament_teams
      SET
        remarks = CASE
          WHEN remarks IS NULL OR remarks = ''
          THEN '自動処理完了: ' || datetime('now', '+9 hours')
          ELSE remarks || ' | 自動処理完了: ' || datetime('now', '+9 hours')
        END,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_team_id = ?
    `, [tournamentTeamId]);
  } catch (error) {
    console.error('ログ記録エラー:', error);
  }
}

/**
 * エラーログの記録
 */
async function logWithdrawalError(
  tournamentTeamId: number,
  error: Error | unknown
): Promise<void> {
  const errorMessage = `辞退承認後処理エラー: ${error instanceof Error ? error.message : String(error)}`;

  console.log(`❌ エラーログ記録: ${errorMessage}`);

  try {
    await db.execute(`
      UPDATE t_tournament_teams
      SET
        remarks = CASE
          WHEN remarks IS NULL OR remarks = ''
          THEN 'エラー: ' || ? || ' (' || datetime('now', '+9 hours') || ')'
          ELSE remarks || ' | エラー: ' || ? || ' (' || datetime('now', '+9 hours') || ')'
        END,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_team_id = ?
    `, [errorMessage, errorMessage, tournamentTeamId]);
  } catch (logError) {
    console.error('エラーログ記録失敗:', logError);
  }
}

/**
 * 辞退処理の影響範囲を分析
 * MIGRATION NOTE: teamId → tournamentTeamId（パラメータ変更）
 */
export async function analyzeWithdrawalImpact(
  tournamentId: number,
  tournamentTeamId: number
): Promise<{
  affectedMatches: number;
  blockAdjustment: boolean;
  rankingUpdate: boolean;
  manualReviewRequired: boolean;
}> {
  // 影響を受ける試合数を計算
  // MIGRATION NOTE: tournament_team_idベースで検索
  const matchCount = await db.execute(`
    SELECT COUNT(*) as count
    FROM t_matches_live ml
    WHERE ml.tournament_id = ?
      AND (ml.team1_tournament_team_id = ? OR ml.team2_tournament_team_id = ?)
  `, [tournamentId, tournamentTeamId, tournamentTeamId]);

  // ブロック配置の確認
  const blockInfo = await db.execute(`
    SELECT assigned_block, block_position
    FROM t_tournament_teams
    WHERE tournament_team_id = ?
  `, [tournamentTeamId]);

  // 確定済み試合の確認
  // MIGRATION NOTE: tournament_team_idベースで検索
  const confirmedMatches = await db.execute(`
    SELECT COUNT(*) as count
    FROM t_matches_live ml
    INNER JOIN t_matches_final mf ON ml.match_id = mf.match_id
    WHERE ml.tournament_id = ?
      AND (ml.team1_tournament_team_id = ? OR ml.team2_tournament_team_id = ?)
  `, [tournamentId, tournamentTeamId, tournamentTeamId]);

  return {
    affectedMatches: Number(matchCount.rows[0]?.count || 0),
    blockAdjustment: blockInfo.rows[0]?.assigned_block !== null,
    rankingUpdate: Number(matchCount.rows[0]?.count || 0) > 0,
    manualReviewRequired: Number(confirmedMatches.rows[0]?.count || 0) > 0
  };
}
