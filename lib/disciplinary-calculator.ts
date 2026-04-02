// lib/disciplinary-calculator.ts
// 懲罰機能のビジネスロジック

import { db } from '@/lib/db';
import { PENALTY_POINTS, type CardType } from '@/lib/disciplinary-constants';

// ============================================================
// 型定義
// ============================================================

export interface DisciplinaryAction {
  action_id: number;
  group_id: number;
  tournament_id: number;
  match_id: number;
  tournament_team_id: number;
  player_name: string;
  card_type: CardType;
  reason_code: number;
  reason_text: string | null;
  suspension_matches: number;
  is_void: number;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
  // JOIN結果
  team_name?: string;
  match_code?: string;
  tournament_date?: string;
}

export interface PlayerSuspensionStatus {
  isSuspended: boolean;
  remainingMatches: number;
  totalYellows: number;
  reason: string;
}

export interface TeamDisciplinaryData {
  tournament_team_id: number;
  team_name: string;
  penaltyPoints: number;
  actions: DisciplinaryAction[];
}

export interface DisciplinarySettings {
  setting_id: number;
  group_id: number;
  yellow_threshold: number;
  is_enabled: number;
}

// ============================================================
// 設定
// ============================================================

/**
 * 大会グループの懲罰設定を取得（なければデフォルト値を返す）
 */
export async function getDisciplinarySettings(groupId: number): Promise<DisciplinarySettings> {
  const result = await db.execute(
    `SELECT * FROM t_disciplinary_settings WHERE group_id = ?`,
    [groupId]
  );
  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      setting_id: Number(row.setting_id),
      group_id: Number(row.group_id),
      yellow_threshold: Number(row.yellow_threshold),
      is_enabled: Number(row.is_enabled),
    };
  }
  // デフォルト設定
  return {
    setting_id: 0,
    group_id: groupId,
    yellow_threshold: 2,
    is_enabled: 1,
  };
}

// ============================================================
// 個人の累積イエロー
// ============================================================

/**
 * 選手のアクティブなイエロー累積数を取得
 * group_id + player_name で全部門横断検索（移動対応）
 */
export async function getPlayerAccumulatedYellows(
  groupId: number,
  playerName: string
): Promise<number> {
  const result = await db.execute(
    `SELECT COUNT(*) as count FROM t_disciplinary_actions
     WHERE group_id = ? AND player_name = ? AND card_type = 'yellow'
     AND is_void = 0`,
    [groupId, playerName]
  );
  return Number(result.rows[0]?.count ?? 0);
}

// ============================================================
// 出場停止判定
// ============================================================

/**
 * 選手の出場停止状態を取得
 */
export async function getPlayerSuspensionStatus(
  groupId: number,
  playerName: string,
  settings?: DisciplinarySettings
): Promise<PlayerSuspensionStatus> {
  const s = settings ?? await getDisciplinarySettings(groupId);

  // 1. イエロー累積による停止チェック
  const totalYellows = await getPlayerAccumulatedYellows(groupId, playerName);
  const yellowSuspension = totalYellows > 0 && totalYellows % s.yellow_threshold === 0;

  // 2. レッド/2枚目イエローによる未消化停止チェック
  const redResult = await db.execute(
    `SELECT SUM(suspension_matches) as total_suspension FROM t_disciplinary_actions
     WHERE group_id = ? AND player_name = ? AND card_type IN ('red', 'second_yellow')
     AND is_void = 0 AND suspension_matches > 0`,
    [groupId, playerName]
  );
  const totalRedSuspension = Number(redResult.rows[0]?.total_suspension ?? 0);

  // 停止中かどうかを判定
  // イエロー累積による停止は1試合
  const yellowRemaining = yellowSuspension ? 1 : 0;
  const totalRemaining = yellowRemaining + totalRedSuspension;

  if (totalRemaining > 0) {
    const reasons: string[] = [];
    if (yellowSuspension) reasons.push(`イエロー累積${totalYellows}枚`);
    if (totalRedSuspension > 0) reasons.push(`レッドカードによる${totalRedSuspension}試合停止`);

    return {
      isSuspended: true,
      remainingMatches: totalRemaining,
      totalYellows,
      reason: reasons.join('、'),
    };
  }

  return {
    isSuspended: false,
    remainingMatches: 0,
    totalYellows,
    reason: '',
  };
}

// ============================================================
// チーム懲罰ポイント
// ============================================================

/**
 * チームの累積懲罰ポイントを取得（順位表用）
 * is_void=0 のみ。リセットは影響しない。
 */
export async function getTeamPenaltyPoints(
  tournamentId: number,
  tournamentTeamId: number
): Promise<number> {
  const result = await db.execute(
    `SELECT card_type, COUNT(*) as count FROM t_disciplinary_actions
     WHERE tournament_id = ? AND tournament_team_id = ? AND is_void = 0
     GROUP BY card_type`,
    [tournamentId, tournamentTeamId]
  );

  let total = 0;
  for (const row of result.rows) {
    const cardType = String(row.card_type) as CardType;
    const count = Number(row.count);
    total += (PENALTY_POINTS[cardType] ?? 0) * count;
  }
  return total;
}

/**
 * 部門全チームのフェアプレーポイントをMapで返す
 */
export async function getTeamFairPlayPoints(
  tournamentId: number
): Promise<Map<number, number>> {
  const result = await db.execute(
    `SELECT tournament_team_id, card_type, COUNT(*) as count
     FROM t_disciplinary_actions
     WHERE tournament_id = ? AND is_void = 0
     GROUP BY tournament_team_id, card_type`,
    [tournamentId]
  );

  const pointsMap = new Map<number, number>();
  for (const row of result.rows) {
    const teamId = Number(row.tournament_team_id);
    const cardType = String(row.card_type) as CardType;
    const count = Number(row.count);
    const points = (PENALTY_POINTS[cardType] ?? 0) * count;
    pointsMap.set(teamId, (pointsMap.get(teamId) ?? 0) + points);
  }
  return pointsMap;
}

// ============================================================
// 部門の懲罰データ取得（公開画面用）
// ============================================================

/**
 * 部門の全懲罰データをチームごとにグループ化して返す
 */
export async function getDivisionDisciplinaryData(
  tournamentId: number
): Promise<TeamDisciplinaryData[]> {
  const result = await db.execute(
    `SELECT da.*, tt.team_name,
            ml.match_code, ml.tournament_date
     FROM t_disciplinary_actions da
     JOIN t_tournament_teams tt ON da.tournament_team_id = tt.tournament_team_id
     LEFT JOIN t_matches_live ml ON da.match_id = ml.match_id
     WHERE da.tournament_id = ? AND da.is_void = 0
     ORDER BY tt.team_name, da.created_at`,
    [tournamentId]
  );

  const teamMap = new Map<number, TeamDisciplinaryData>();

  for (const row of result.rows) {
    const teamId = Number(row.tournament_team_id);
    const cardType = String(row.card_type) as CardType;

    if (!teamMap.has(teamId)) {
      teamMap.set(teamId, {
        tournament_team_id: teamId,
        team_name: String(row.team_name),
        penaltyPoints: 0,
        actions: [],
      });
    }

    const teamData = teamMap.get(teamId)!;
    teamData.penaltyPoints += PENALTY_POINTS[cardType] ?? 0;
    teamData.actions.push({
      action_id: Number(row.action_id),
      group_id: Number(row.group_id),
      tournament_id: Number(row.tournament_id),
      match_id: Number(row.match_id),
      tournament_team_id: teamId,
      player_name: String(row.player_name),
      card_type: cardType,
      reason_code: Number(row.reason_code),
      reason_text: row.reason_text ? String(row.reason_text) : null,
      suspension_matches: Number(row.suspension_matches),
      is_void: Number(row.is_void),
      recorded_by: row.recorded_by ? String(row.recorded_by) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      team_name: String(row.team_name),
      match_code: row.match_code ? String(row.match_code) : undefined,
      tournament_date: row.tournament_date ? String(row.tournament_date) : undefined,
    });
  }

  return Array.from(teamMap.values()).sort((a, b) => a.team_name.localeCompare(b.team_name));
}

// ============================================================
// カード登録
// ============================================================

export interface CreateDisciplinaryActionInput {
  groupId: number;
  tournamentId: number;
  matchId: number;
  tournamentTeamId: number;
  playerName: string;
  cardType: CardType;
  reasonCode: number;
  reasonText?: string;
  suspensionMatches: number;
  recordedBy?: string;
}

export async function createDisciplinaryAction(
  input: CreateDisciplinaryActionInput
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO t_disciplinary_actions
     (group_id, tournament_id, match_id, tournament_team_id, player_name,
      card_type, reason_code, reason_text, suspension_matches, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.groupId,
      input.tournamentId,
      input.matchId,
      input.tournamentTeamId,
      input.playerName,
      input.cardType,
      input.reasonCode,
      input.reasonText ?? null,
      input.suspensionMatches,
      input.recordedBy ?? null,
    ]
  );
  return Number(result.lastInsertRowid);
}

// ============================================================
// カード取消
// ============================================================

/**
 * カード登録を取消（is_void=1に更新）
 */
export async function voidDisciplinaryAction(actionId: number): Promise<void> {
  await db.execute(
    `UPDATE t_disciplinary_actions SET is_void = 1, updated_at = datetime('now', '+9 hours')
     WHERE action_id = ?`,
    [actionId]
  );
}

// ============================================================
// 累積リセット
// ============================================================

/**
 * 選手のイエロー累積をリセット（出場停止消化後）
 * 実装: 有効なイエローカードのis_voidは変えず、suspension_matchesに-1を設定して
 * リセット済みであることをマークする代わりに、
 * 累積数を閾値未満に戻すため、最古のイエローカードから順にis_void=1にする
 *
 * ※ チーム累積ポイントに影響を与えないよう、リセット用の別フラグが必要だが、
 *   シンプルにするため、リセット時は出場停止の suspension_matches を0に戻す実装とする。
 *   累積イエロー自体はカウントに残り、次の閾値到達で再度停止となる。
 *
 * 再検討: ユーザー要件「リセットしてもチーム累積ポイントはリセットされない」
 * → イエローカード自体は有効なまま（チームポイントに加算される）
 * → ただし個人の累積カウンターは0に戻す
 * → 実装: 累積リセットを記録するため、特殊なアクション（card_type='reset'）を挿入
 *   リセット後のイエロー累積は、最後のリセット以降のイエローのみカウントする
 */
export async function resetPlayerAccumulation(
  groupId: number,
  playerName: string
): Promise<void> {
  // リセットマーカーを挿入（card_type='reset'、ダミーの値で記録）
  await db.execute(
    `INSERT INTO t_disciplinary_actions
     (group_id, tournament_id, match_id, tournament_team_id, player_name,
      card_type, reason_code, suspension_matches, is_void, recorded_by)
     VALUES (?, 0, 0, 0, ?, 'reset', 0, 0, 0, 'system')`,
    [groupId, playerName]
  );
}

/**
 * リセットを考慮した累積イエロー数を取得
 * 最後のリセットマーカー以降のイエローのみカウント
 */
export async function getPlayerAccumulatedYellowsSinceReset(
  groupId: number,
  playerName: string
): Promise<number> {
  // 最後のリセットマーカーの日時を取得
  const resetResult = await db.execute(
    `SELECT MAX(created_at) as last_reset FROM t_disciplinary_actions
     WHERE group_id = ? AND player_name = ? AND card_type = 'reset'`,
    [groupId, playerName]
  );
  const lastReset = resetResult.rows[0]?.last_reset;

  if (lastReset) {
    // リセット以降のイエローのみカウント
    const result = await db.execute(
      `SELECT COUNT(*) as count FROM t_disciplinary_actions
       WHERE group_id = ? AND player_name = ? AND card_type = 'yellow'
       AND is_void = 0 AND created_at > ?`,
      [groupId, playerName, lastReset]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  // リセット履歴がなければ全件カウント
  return getPlayerAccumulatedYellows(groupId, playerName);
}

/**
 * 出場停止判定（リセット考慮版）
 * 公開画面・管理画面で使用する正式版
 */
export async function getPlayerSuspensionStatusWithReset(
  groupId: number,
  playerName: string,
  settings?: DisciplinarySettings
): Promise<PlayerSuspensionStatus> {
  const s = settings ?? await getDisciplinarySettings(groupId);

  // リセット考慮済みの累積イエロー数
  const totalYellows = await getPlayerAccumulatedYellowsSinceReset(groupId, playerName);
  const yellowSuspension = totalYellows > 0 && totalYellows % s.yellow_threshold === 0;

  // レッド/2枚目イエローによる停止
  const redResult = await db.execute(
    `SELECT SUM(suspension_matches) as total_suspension FROM t_disciplinary_actions
     WHERE group_id = ? AND player_name = ? AND card_type IN ('red', 'second_yellow')
     AND is_void = 0 AND suspension_matches > 0`,
    [groupId, playerName]
  );
  const totalRedSuspension = Number(redResult.rows[0]?.total_suspension ?? 0);

  const yellowRemaining = yellowSuspension ? 1 : 0;
  const totalRemaining = yellowRemaining + totalRedSuspension;

  if (totalRemaining > 0) {
    const reasons: string[] = [];
    if (yellowSuspension) reasons.push(`イエロー累積${totalYellows}枚`);
    if (totalRedSuspension > 0) reasons.push(`レッドカードによる${totalRedSuspension}試合停止`);

    return {
      isSuspended: true,
      remainingMatches: totalRemaining,
      totalYellows,
      reason: reasons.join('、'),
    };
  }

  return {
    isSuspended: false,
    remainingMatches: 0,
    totalYellows,
    reason: '',
  };
}
