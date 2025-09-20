// lib/notifications.ts
import { db } from '@/lib/db';

export interface TournamentNotification {
  notification_id?: number;
  tournament_id: number;
  notification_type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  is_resolved: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

/**
 * 大会通知を作成
 */
export async function createTournamentNotification(
  tournamentId: number,
  type: string,
  title: string,
  message: string,
  severity: 'info' | 'warning' | 'error' = 'info',
  metadata?: Record<string, unknown>
): Promise<number> {
  try {
    console.log(`[NOTIFICATIONS] 通知作成: ${title}`);
    
    // 既存の同じ内容の通知があるかチェック
    const existingNotification = await db.execute({
      sql: `
        SELECT notification_id 
        FROM t_tournament_notifications 
        WHERE tournament_id = ? 
        AND notification_type = ? 
        AND title = ?
        AND is_resolved = 0
      `,
      args: [tournamentId, type, title]
    });
    
    if (existingNotification.rows.length > 0) {
      console.log(`[NOTIFICATIONS] 既存の通知を更新`);
      const notificationId = existingNotification.rows[0].notification_id as number;
      
      await db.execute({
        sql: `
          UPDATE t_tournament_notifications 
          SET message = ?, severity = ?, metadata = ?, updated_at = datetime('now', '+9 hours')
          WHERE notification_id = ?
        `,
        args: [message, severity, metadata ? JSON.stringify(metadata) : null, notificationId]
      });
      
      return notificationId;
    } else {
      console.log(`[NOTIFICATIONS] 新規通知を作成`);
      const result = await db.execute({
        sql: `
          INSERT INTO t_tournament_notifications 
          (tournament_id, notification_type, title, message, severity, is_resolved, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
        `,
        args: [
          tournamentId,
          type,
          title,
          message,
          severity,
          metadata ? JSON.stringify(metadata) : null
        ]
      });
      
      return Number(result.lastInsertRowid);
    }
  } catch (error) {
    console.error('[NOTIFICATIONS] 通知作成エラー:', error);
    throw error;
  }
}

/**
 * 通知を解決済みにする
 */
export async function resolveNotification(notificationId: number): Promise<void> {
  try {
    await db.execute({
      sql: `
        UPDATE t_tournament_notifications 
        SET is_resolved = 1, updated_at = datetime('now', '+9 hours')
        WHERE notification_id = ?
      `,
      args: [notificationId]
    });
    console.log(`[NOTIFICATIONS] 通知解決: ID ${notificationId}`);
  } catch (error) {
    console.error('[NOTIFICATIONS] 通知解決エラー:', error);
    throw error;
  }
}

/**
 * 大会の未解決通知を取得
 */
export async function getTournamentNotifications(
  tournamentId: number, 
  includeResolved: boolean = false
): Promise<TournamentNotification[]> {
  try {
    const sql = `
      SELECT 
        notification_id,
        tournament_id,
        notification_type,
        title,
        message,
        severity,
        is_resolved,
        metadata,
        created_at,
        updated_at
      FROM t_tournament_notifications
      WHERE tournament_id = ?
      ${includeResolved ? '' : 'AND is_resolved = 0'}
      ORDER BY created_at DESC
    `;
    
    const result = await db.execute({
      sql,
      args: [tournamentId]
    });
    
    return result.rows.map(row => ({
      notification_id: row.notification_id as number,
      tournament_id: row.tournament_id as number,
      notification_type: row.notification_type as string,
      title: row.title as string,
      message: row.message as string,
      severity: row.severity as 'info' | 'warning' | 'error',
      is_resolved: Boolean(row.is_resolved),
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string
    }));
  } catch (error) {
    console.error('[NOTIFICATIONS] 通知取得エラー:', error);
    return [];
  }
}

/**
 * 決勝トーナメント進出チームが決定しているかチェック
 */
export async function checkFinalTournamentPromotionCompleted(tournamentId: number): Promise<boolean> {
  try {
    // 決勝トーナメントブロックを取得
    const finalBlockResult = await db.execute({
      sql: `
        SELECT match_block_id
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'final'
      `,
      args: [tournamentId]
    });

    if (finalBlockResult.rows.length === 0) {
      // 決勝トーナメントブロックがない場合は進出完了とみなす
      return true;
    }

    const finalBlockId = finalBlockResult.rows[0].match_block_id as number;
    
    // 決勝トーナメント試合で実チーム名が設定されているかチェック
    // プレースホルダー（T1_winner, T2_winnerなど）ではなく実際のチームIDが設定されているかチェック
    const matchesResult = await db.execute({
      sql: `
        SELECT 
          COUNT(*) as total_matches,
          COUNT(CASE WHEN 
            team1_id IS NOT NULL AND team2_id IS NOT NULL 
            AND team1_id NOT LIKE '%\\_winner' ESCAPE '\\'
            AND team1_id NOT LIKE '%\\_loser' ESCAPE '\\'
            AND team2_id NOT LIKE '%\\_winner' ESCAPE '\\'
            AND team2_id NOT LIKE '%\\_loser' ESCAPE '\\'
            AND team1_id NOT LIKE 'T%の勝者'
            AND team2_id NOT LIKE 'T%の勝者'
            THEN 1 END) as real_team_matches
        FROM t_matches_live
        WHERE match_block_id = ?
      `,
      args: [finalBlockId]
    });

    const totalMatches = matchesResult.rows[0]?.total_matches as number || 0;
    const realTeamMatches = matchesResult.rows[0]?.real_team_matches as number || 0;

    // 全ての試合で実チーム名が設定されていれば進出完了
    return totalMatches > 0 && realTeamMatches === totalMatches;
  } catch (error) {
    console.error('[NOTIFICATIONS] 進出完了チェックエラー:', error);
    return false;
  }
}

/**
 * 手動順位設定が不要になった通知を自動解決
 */
export async function autoResolveManualRankingNotifications(tournamentId: number): Promise<void> {
  try {
    const isPromotionCompleted = await checkFinalTournamentPromotionCompleted(tournamentId);
    
    if (isPromotionCompleted) {
      console.log(`[NOTIFICATIONS] 大会${tournamentId}: 進出決定により手動順位設定通知を自動解決`);
      
      await db.execute({
        sql: `
          UPDATE t_tournament_notifications 
          SET is_resolved = 1, updated_at = datetime('now', '+9 hours')
          WHERE tournament_id = ? 
          AND notification_type = 'manual_ranking_needed' 
          AND is_resolved = 0
        `,
        args: [tournamentId]
      });
    }
  } catch (error) {
    console.error('[NOTIFICATIONS] 自動解決エラー:', error);
  }
}

/**
 * 手動順位設定後に同着問題解決通知を即座に削除
 */
export async function resolveManualRankingNotificationsImmediately(tournamentId: number): Promise<void> {
  try {
    console.log(`[NOTIFICATIONS] 大会${tournamentId}: 手動順位設定により通知を即座に解決`);
    
    await db.execute({
      sql: `
        UPDATE t_tournament_notifications 
        SET is_resolved = 1, updated_at = datetime('now', '+9 hours')
        WHERE tournament_id = ? 
        AND notification_type = 'manual_ranking_needed' 
        AND is_resolved = 0
      `,
      args: [tournamentId]
    });
    
    console.log(`[NOTIFICATIONS] 大会${tournamentId}: 手動順位設定通知の即座解決完了`);
  } catch (error) {
    console.error('[NOTIFICATIONS] 即座解決エラー:', error);
  }
}

/**
 * 管理者ダッシュボード用：全大会の未解決通知を取得（大会IDで絞り込み可能）
 */
export async function getAllUnresolvedNotifications(tournamentId?: number): Promise<(TournamentNotification & { tournament_name: string })[]> {
  try {
    // まず手動順位設定通知の自動解決を実行
    if (tournamentId) {
      // 特定の大会のみ
      await autoResolveManualRankingNotifications(tournamentId);
    } else {
      // 全大会
      const tournamentIds = await db.execute(`
        SELECT DISTINCT tournament_id 
        FROM t_tournament_notifications 
        WHERE notification_type = 'manual_ranking_needed' AND is_resolved = 0
      `);
      
      for (const row of tournamentIds.rows) {
        const tournamentIdToProcess = row.tournament_id as number;
        await autoResolveManualRankingNotifications(tournamentIdToProcess);
      }
    }
    
    // 通知を取得（大会IDで絞り込み）
    const sql = `
      SELECT 
        tn.notification_id,
        tn.tournament_id,
        tn.notification_type,
        tn.title,
        tn.message,
        tn.severity,
        tn.is_resolved,
        tn.metadata,
        tn.created_at,
        tn.updated_at,
        t.tournament_name
      FROM t_tournament_notifications tn
      JOIN t_tournaments t ON tn.tournament_id = t.tournament_id
      WHERE tn.is_resolved = 0
      ${tournamentId ? 'AND tn.tournament_id = ?' : ''}
      ORDER BY tn.created_at DESC
    `;
    
    const result = await db.execute({
      sql,
      args: tournamentId ? [tournamentId] : []
    });
    
    return result.rows.map(row => ({
      notification_id: row.notification_id as number,
      tournament_id: row.tournament_id as number,
      notification_type: row.notification_type as string,
      title: row.title as string,
      message: row.message as string,
      severity: row.severity as 'info' | 'warning' | 'error',
      is_resolved: Boolean(row.is_resolved),
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      tournament_name: row.tournament_name as string
    }));
  } catch (error) {
    console.error('[NOTIFICATIONS] 全通知取得エラー:', error);
    return [];
  }
}