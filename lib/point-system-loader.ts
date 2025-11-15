// lib/point-system-loader.ts
// 大会ルール設定から勝点システムを取得するユーティリティ

import { db } from '@/lib/db';

/**
 * 勝点システム設定
 */
export interface PointSystem {
  win: number;
  draw: number;
  loss: number;
}

/**
 * デフォルトの勝点システム
 */
export const DEFAULT_POINT_SYSTEM: PointSystem = {
  win: 3,
  draw: 1,
  loss: 0
};

/**
 * 大会ルール設定から勝点システムを取得
 * 設定がない場合は競技種別に応じたデフォルト値を返す
 */
export async function getTournamentPointSystem(tournamentId: number): Promise<PointSystem> {
  try {
    // 大会ルール設定から勝点システムを取得（予選フェーズを基準）
    const rulesResult = await db.execute(`
      SELECT tr.point_system, st.supports_point_system, st.ranking_method
      FROM t_tournament_rules tr
      JOIN t_tournaments t ON tr.tournament_id = t.tournament_id
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE tr.tournament_id = ? AND tr.phase = 'preliminary'
      LIMIT 1
    `, [tournamentId]);

    if (rulesResult.rows.length > 0) {
      const row = rulesResult.rows[0];
      const supportsPointSystem = Boolean(row.supports_point_system);
      const pointSystemJson = row.point_system as string | null;

      // 勝点システム対応競技でかつ設定がある場合
      if (supportsPointSystem && pointSystemJson) {
        try {
          const parsedPointSystem = JSON.parse(pointSystemJson);
          return {
            win: Number(parsedPointSystem.win) || DEFAULT_POINT_SYSTEM.win,
            draw: Number(parsedPointSystem.draw) || DEFAULT_POINT_SYSTEM.draw,
            loss: Number(parsedPointSystem.loss) || DEFAULT_POINT_SYSTEM.loss
          };
        } catch (parseError) {
          console.error('勝点システムJSON解析エラー:', parseError);
        }
      }

      // 勝点システム非対応の競技の場合はフォールバック
      if (!supportsPointSystem) {
        const rankingMethod = row.ranking_method as string;
        
        // 勝率ベースの競技では勝利=1点、敗北=0点として扱う
        if (rankingMethod === 'win_rate') {
          return {
            win: 1,
            draw: 0.5, // 引き分けは0.5勝として計算
            loss: 0
          };
        }
        
        // タイムベースの競技では勝点システムを使用しない
        if (rankingMethod === 'time') {
          return {
            win: 0,
            draw: 0,
            loss: 0
          };
        }
      }
    }

    // 大会ルール設定がない場合、レガシー方式でt_tournamentsテーブルから取得
    console.warn(`大会ID:${tournamentId} - ルール設定未検出、レガシー方式で取得中...`);
    return await getLegacyPointSystem(tournamentId);

  } catch (error) {
    console.error('勝点システム取得エラー:', error);
    
    // エラー時はレガシー方式にフォールバック
    return await getLegacyPointSystem(tournamentId);
  }
}

/**
 * レガシー方式：t_tournamentsテーブルから勝点を取得
 * 既存システムとの互換性を保つために使用
 */
async function getLegacyPointSystem(tournamentId: number): Promise<PointSystem> {
  try {
    const result = await db.execute(`
      SELECT win_points, draw_points, loss_points
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        win: Number(row.win_points) || DEFAULT_POINT_SYSTEM.win,
        draw: Number(row.draw_points) || DEFAULT_POINT_SYSTEM.draw,
        loss: Number(row.loss_points) || DEFAULT_POINT_SYSTEM.loss
      };
    }
  } catch (error) {
    console.error('レガシー勝点システム取得エラー:', error);
  }

  // 最終フォールバック：デフォルト値
  console.warn(`大会ID:${tournamentId} - デフォルト勝点システムを使用`);
  return DEFAULT_POINT_SYSTEM;
}

/**
 * 競技種別が勝点システムに対応しているかチェック
 */
export async function tournamentSupportsPointSystem(tournamentId: number): Promise<boolean> {
  try {
    const result = await db.execute(`
      SELECT st.supports_point_system
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (result.rows.length > 0) {
      return Boolean(result.rows[0].supports_point_system);
    }
  } catch (error) {
    console.error('勝点システム対応チェックエラー:', error);
  }

  // デフォルトは対応しているものとして扱う（後方互換性）
  return true;
}

/**
 * 勝点システム設定の詳細情報を取得
 * デバッグやログ出力用
 */
export async function getTournamentPointSystemInfo(tournamentId: number): Promise<{
  pointSystem: PointSystem;
  source: 'rules' | 'legacy' | 'default';
  supportsPointSystem: boolean;
  rankingMethod: string;
}> {
  try {
    const rulesResult = await db.execute(`
      SELECT 
        tr.point_system, 
        st.supports_point_system, 
        st.ranking_method,
        st.sport_code
      FROM t_tournament_rules tr
      JOIN t_tournaments t ON tr.tournament_id = t.tournament_id
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE tr.tournament_id = ? AND tr.phase = 'preliminary'
      LIMIT 1
    `, [tournamentId]);

    const pointSystem = await getTournamentPointSystem(tournamentId);
    
    if (rulesResult.rows.length > 0) {
      const row = rulesResult.rows[0];
      const supportsPointSystem = Boolean(row.supports_point_system);
      const rankingMethod = String(row.ranking_method || 'points');
      
      if (supportsPointSystem && row.point_system) {
        return {
          pointSystem,
          source: 'rules',
          supportsPointSystem,
          rankingMethod
        };
      }
      
      return {
        pointSystem,
        source: 'legacy',
        supportsPointSystem,
        rankingMethod
      };
    }
  } catch (error) {
    console.error('勝点システム詳細情報取得エラー:', error);
  }

  return {
    pointSystem: DEFAULT_POINT_SYSTEM,
    source: 'default',
    supportsPointSystem: true,
    rankingMethod: 'points'
  };
}