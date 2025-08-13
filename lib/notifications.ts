// lib/notifications.ts
import { db } from '@/lib/db';

export interface TournamentNotification {
  notification_id?: number;
  tournament_id: number;
  notification_type: 'tie_ranking' | 'manual_ranking_needed' | 'block_completed';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  is_resolved: boolean;
  metadata?: any;
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
  metadata?: any
): Promise<number> {
  try {
    console.log(`[NOTIFICATIONS] 通知作成: ${title}`);
    
    // 既存の同じ内容の通知があるかチェック
    const existingNotification = await db.execute({
      sql: `
        SELECT notification_id 
        FROM tournament_notifications 
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
          UPDATE tournament_notifications 
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
          INSERT INTO tournament_notifications 
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
      
      return result.lastInsertRowid as number;
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
        UPDATE tournament_notifications 
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
      FROM tournament_notifications
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
 * 管理者ダッシュボード用：全大会の未解決通知を取得
 */
export async function getAllUnresolvedNotifications(): Promise<(TournamentNotification & { tournament_name: string })[]> {
  try {
    const result = await db.execute(`
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
      FROM tournament_notifications tn
      JOIN t_tournaments t ON tn.tournament_id = t.tournament_id
      WHERE tn.is_resolved = 0
      ORDER BY tn.created_at DESC
    `);
    
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