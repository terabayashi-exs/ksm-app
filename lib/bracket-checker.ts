// lib/bracket-checker.ts
import { db } from '@/lib/db';

/**
 * トーナメント形式の試合があるかチェックする
 */
export async function hasTournamentMatches(tournamentId: number): Promise<boolean> {
  try {
    const result = await db.execute(`
      SELECT COUNT(*) as count
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? 
        AND mb.phase = 'final'
    `, [tournamentId]);

    const count = result.rows?.[0]?.count as number || 0;
    return count > 0;
    
  } catch (error) {
    console.error('hasTournamentMatches error:', error);
    return false;
  }
}