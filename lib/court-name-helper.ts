import { db } from './db';

/**
 * コート番号の表示名を取得
 *
 * 大会ごとのカスタムコート名が設定されていればそれを返し、
 * 設定がなければコート番号のみを返す
 *
 * @param tournamentId - 大会ID
 * @param courtNumber - コート番号
 * @returns コート表示名（例: "Aコート" または "1"）
 */
export async function getCourtDisplayName(
  tournamentId: number,
  courtNumber: number
): Promise<string> {
  try {
    const result = await db.execute({
      sql: `
        SELECT court_name
        FROM t_tournament_courts
        WHERE tournament_id = ? AND court_number = ? AND is_active = 1
      `,
      args: [tournamentId, courtNumber]
    });

    // カスタム名が設定されていればそれを返す
    if (result.rows.length > 0 && result.rows[0].court_name) {
      return result.rows[0].court_name as string;
    }

    // 設定がなければコート番号のみを返す
    return String(courtNumber);
  } catch (error) {
    console.error('コート名取得エラー:', error);
    // エラー時はコート番号のみを返す
    return String(courtNumber);
  }
}

/**
 * 複数のコートの表示名を一括取得
 *
 * @param tournamentId - 大会ID
 * @param courtNumbers - コート番号の配列
 * @returns コート番号をキー、表示名を値とするマップ
 */
export async function getCourtDisplayNames(
  tournamentId: number,
  courtNumbers: number[]
): Promise<Record<number, string>> {
  if (courtNumbers.length === 0) {
    return {};
  }

  try {
    const placeholders = courtNumbers.map(() => '?').join(',');
    const result = await db.execute({
      sql: `
        SELECT court_number, court_name
        FROM t_tournament_courts
        WHERE tournament_id = ? AND court_number IN (${placeholders}) AND is_active = 1
      `,
      args: [tournamentId, ...courtNumbers]
    });

    // 取得したカスタム名をマップに格納
    const courtMap: Record<number, string> = {};
    for (const row of result.rows) {
      courtMap[row.court_number as number] = row.court_name as string;
    }

    // 設定がないコートはコート番号のみを設定
    for (const courtNum of courtNumbers) {
      if (!courtMap[courtNum]) {
        courtMap[courtNum] = String(courtNum);
      }
    }

    return courtMap;
  } catch (error) {
    console.error('コート名一括取得エラー:', error);
    // エラー時は全てコート番号のみを返す
    const courtMap: Record<number, string> = {};
    for (const courtNum of courtNumbers) {
      courtMap[courtNum] = String(courtNum);
    }
    return courtMap;
  }
}

/**
 * 大会の全コート設定を取得
 *
 * @param tournamentId - 大会ID
 * @returns コート設定の配列
 */
export async function getTournamentCourtSettings(tournamentId: number) {
  try {
    const result = await db.execute({
      sql: `
        SELECT
          tournament_court_id,
          court_number,
          court_name,
          display_order,
          is_active,
          created_at,
          updated_at
        FROM t_tournament_courts
        WHERE tournament_id = ?
        ORDER BY court_number ASC
      `,
      args: [tournamentId]
    });

    return result.rows.map(row => ({
      tournament_court_id: row.tournament_court_id as number,
      court_number: row.court_number as number,
      court_name: row.court_name as string,
      display_order: row.display_order as number,
      is_active: row.is_active as number,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string
    }));
  } catch (error) {
    console.error('コート設定取得エラー:', error);
    return [];
  }
}

/**
 * コート名を保存または更新
 *
 * @param tournamentId - 大会ID
 * @param courtNumber - コート番号
 * @param courtName - コート名
 */
export async function saveCourtName(
  tournamentId: number,
  courtNumber: number,
  courtName: string
): Promise<void> {
  try {
    // 既存レコードをチェック
    const existingResult = await db.execute({
      sql: `
        SELECT tournament_court_id
        FROM t_tournament_courts
        WHERE tournament_id = ? AND court_number = ?
      `,
      args: [tournamentId, courtNumber]
    });

    if (existingResult.rows.length > 0) {
      // 更新
      await db.execute({
        sql: `
          UPDATE t_tournament_courts
          SET court_name = ?, updated_at = datetime('now', '+9 hours')
          WHERE tournament_id = ? AND court_number = ?
        `,
        args: [courtName, tournamentId, courtNumber]
      });
    } else {
      // 新規作成
      await db.execute({
        sql: `
          INSERT INTO t_tournament_courts (tournament_id, court_number, court_name)
          VALUES (?, ?, ?)
        `,
        args: [tournamentId, courtNumber, courtName]
      });
    }
  } catch (error) {
    console.error('コート名保存エラー:', error);
    throw error;
  }
}

/**
 * コート設定を削除
 *
 * @param tournamentId - 大会ID
 * @param courtNumber - コート番号
 */
export async function deleteCourtName(
  tournamentId: number,
  courtNumber: number
): Promise<void> {
  try {
    await db.execute({
      sql: `
        DELETE FROM t_tournament_courts
        WHERE tournament_id = ? AND court_number = ?
      `,
      args: [tournamentId, courtNumber]
    });
  } catch (error) {
    console.error('コート名削除エラー:', error);
    throw error;
  }
}
