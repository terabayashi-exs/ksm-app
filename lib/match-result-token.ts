import crypto from "node:crypto";
import { db } from "./db";

/**
 * 試合結果QRコード用トークンの生成・検証・リセット
 */

/** ランダムトークン文字列を生成 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** 1試合分のトークンを作成してDBに挿入 */
export async function createTokenForMatch(matchId: number): Promise<string> {
  const token = generateToken();
  await db.execute(
    `INSERT INTO t_match_result_tokens (match_id, token, created_at)
     VALUES (?, ?, datetime('now', '+9 hours'))`,
    [matchId, token],
  );
  return token;
}

/** 部門内の全試合のトークンを一括作成 */
export async function createTokensForTournament(tournamentId: number): Promise<number> {
  // 部門内の全試合IDを取得（既にトークンがある試合は除外）
  const matches = await db.execute(
    `SELECT ml.match_id
     FROM t_matches_live ml
     INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
     LEFT JOIN t_match_result_tokens mrt ON ml.match_id = mrt.match_id
     WHERE mb.tournament_id = ? AND mrt.match_id IS NULL`,
    [tournamentId],
  );

  let created = 0;
  for (const row of matches.rows) {
    const matchId = Number(row.match_id);
    const token = generateToken();
    await db.execute(
      `INSERT INTO t_match_result_tokens (match_id, token, created_at)
       VALUES (?, ?, datetime('now', '+9 hours'))`,
      [matchId, token],
    );
    created++;
  }
  return created;
}

/** DBトークンを検証し、一致すればmatch_idを返す */
export async function verifyDbToken(token: string, matchId: number): Promise<boolean> {
  const result = await db.execute(
    `SELECT match_id FROM t_match_result_tokens
     WHERE token = ? AND match_id = ?`,
    [token, matchId],
  );
  return result.rows.length > 0;
}

/** 部門内の全トークンをリセット（削除→再作成） */
export async function resetTokensForTournament(tournamentId: number): Promise<number> {
  // 既存トークンを削除
  await db.execute(
    `DELETE FROM t_match_result_tokens
     WHERE match_id IN (
       SELECT ml.match_id
       FROM t_matches_live ml
       INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
       WHERE mb.tournament_id = ?
     )`,
    [tournamentId],
  );

  // 新しいトークンを作成
  return createTokensForTournament(tournamentId);
}

/** 1試合のトークンをリセット（削除→再作成） */
export async function resetTokenForMatch(matchId: number): Promise<string> {
  await db.execute(`DELETE FROM t_match_result_tokens WHERE match_id = ?`, [matchId]);
  return createTokenForMatch(matchId);
}

export interface TimeWindowStatus {
  canInput: boolean;
  reason: "ok" | "confirmed" | "no_start_time" | "too_early" | "too_late";
  /** 入力可能になる時刻（too_earlyの場合） */
  windowStart?: string;
  /** 入力期限（too_lateの場合） */
  windowEnd?: string;
}

/**
 * 時間制限チェック
 * start_time: "HH:MM" 形式（t_matches_live.start_time）
 * tournamentDate: "YYYY-MM-DD" 形式（t_matches_live.tournament_date）
 * isConfirmed: t_matches_final にレコードが存在するか
 */
export function getTimeWindowStatus(
  startTime: string | null,
  tournamentDate: string | null,
  isConfirmed: boolean,
): TimeWindowStatus {
  if (isConfirmed) {
    return { canInput: false, reason: "confirmed" };
  }

  if (!startTime || !tournamentDate) {
    return { canInput: false, reason: "no_start_time" };
  }

  // tournament_date + start_time からDateオブジェクトを作成（JST）
  const timeParts = startTime.split(":");
  const hours = Number.parseInt(timeParts[0], 10);
  const minutes = Number.parseInt(timeParts[1] || "0", 10);

  const matchDateTime = new Date(`${tournamentDate}T00:00:00+09:00`);
  matchDateTime.setHours(hours, minutes, 0, 0);

  const windowStart = new Date(matchDateTime.getTime() - 60 * 60 * 1000); // 1時間前
  const windowEnd = new Date(matchDateTime.getTime() + 11 * 60 * 60 * 1000); // 11時間後

  // 現在時刻（JST）
  const now = new Date();

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (now < windowStart) {
    return {
      canInput: false,
      reason: "too_early",
      windowStart: formatTime(windowStart),
    };
  }

  if (now > windowEnd) {
    return {
      canInput: false,
      reason: "too_late",
      windowEnd: formatTime(windowEnd),
    };
  }

  return { canInput: true, reason: "ok" };
}
