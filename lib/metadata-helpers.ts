// lib/metadata-helpers.ts
import { db } from "@/lib/db";

export async function getTournamentNameForMetadata(id: string): Promise<string | null> {
  try {
    const tournamentId = parseInt(id);
    if (isNaN(tournamentId)) return null;
    const result = await db.execute(
      `SELECT tournament_name FROM t_tournaments WHERE tournament_id = ?`,
      [tournamentId],
    );
    if (result.rows.length === 0) return null;
    return String(result.rows[0].tournament_name);
  } catch {
    return null;
  }
}
