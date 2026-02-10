// lib/tournament-progression.ts
// MIGRATION NOTE: team_id系からtournament_team_id系に移行済み（2026-02-04）
// team_idはマスターチームとの関連維持のため保持、主な処理はtournament_team_idベース
import { db } from '@/lib/db';

interface ProgressionTarget {
  match_code: string;
  position: 'team1' | 'team2';
  source_pattern: string; // e.g., "T1_winner", "T5_loser"
}

interface ProgressionRule {
  winner_targets: ProgressionTarget[];
  loser_targets: ProgressionTarget[];
}

/**
 * m_match_templatesテーブルからトーナメント進出ルールを動的に取得
 */
async function getTournamentProgressionRules(matchCode: string, tournamentId: number): Promise<ProgressionRule> {
  try {
    // 該当試合のフォーマットIDを取得
    const formatResult = await db.execute(`
      SELECT t.format_id
      FROM t_tournaments t
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (formatResult.rows.length === 0) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    const formatId = formatResult.rows[0].format_id as number;

    // この試合を参照している他の試合を検索（オーバーライドを考慮）
    const winnerPattern = `${matchCode}_winner`;
    const loserPattern = `${matchCode}_loser`;

    console.log(`[TOURNAMENT_PROGRESSION] Searching for matches that reference ${winnerPattern} or ${loserPattern}`);

    const dependentMatchesResult = await db.execute(`
      SELECT
        mt.match_code,
        COALESCE(mo.team1_source_override, mt.team1_source) as team1_source,
        COALESCE(mo.team2_source_override, mt.team2_source) as team2_source,
        mt.team1_display_name,
        mt.team2_display_name
      FROM m_match_templates mt
      LEFT JOIN t_tournament_match_overrides mo
        ON mt.match_code = mo.match_code AND mo.tournament_id = ?
      WHERE mt.format_id = ?
      AND (
        COALESCE(mo.team1_source_override, mt.team1_source) = ?
        OR COALESCE(mo.team1_source_override, mt.team1_source) = ?
        OR COALESCE(mo.team2_source_override, mt.team2_source) = ?
        OR COALESCE(mo.team2_source_override, mt.team2_source) = ?
      )
    `, [tournamentId, formatId, winnerPattern, loserPattern, winnerPattern, loserPattern]);

    console.log(`[TOURNAMENT_PROGRESSION] Found ${dependentMatchesResult.rows.length} dependent matches`);

    const rule: ProgressionRule = {
      winner_targets: [],
      loser_targets: []
    };

    for (const row of dependentMatchesResult.rows) {
      const targetMatchCode = row.match_code as string;
      const team1Source = row.team1_source as string;
      const team2Source = row.team2_source as string;

      console.log(`[TOURNAMENT_PROGRESSION] Checking match ${targetMatchCode}: team1_source=${team1Source}, team2_source=${team2Source}`);

      // team1_sourceをチェック
      if (team1Source === winnerPattern) {
        rule.winner_targets.push({
          match_code: targetMatchCode,
          position: 'team1',
          source_pattern: winnerPattern
        });
        console.log(`[TOURNAMENT_PROGRESSION] Added winner target: ${targetMatchCode} team1`);
      } else if (team1Source === loserPattern) {
        rule.loser_targets.push({
          match_code: targetMatchCode,
          position: 'team1',
          source_pattern: loserPattern
        });
        console.log(`[TOURNAMENT_PROGRESSION] Added loser target: ${targetMatchCode} team1`);
      }

      // team2_sourceをチェック
      if (team2Source === winnerPattern) {
        rule.winner_targets.push({
          match_code: targetMatchCode,
          position: 'team2',
          source_pattern: winnerPattern
        });
        console.log(`[TOURNAMENT_PROGRESSION] Added winner target: ${targetMatchCode} team2`);
      } else if (team2Source === loserPattern) {
        rule.loser_targets.push({
          match_code: targetMatchCode,
          position: 'team2',
          source_pattern: loserPattern
        });
        console.log(`[TOURNAMENT_PROGRESSION] Added loser target: ${targetMatchCode} team2`);
      }
    }

    return rule;

  } catch (error) {
    console.error(`[TOURNAMENT_PROGRESSION] Error getting progression rules for ${matchCode}:`, error);
    throw error;
  }
}

/**
 * 確定された試合結果に基づいて、後続のトーナメント試合のチーム名を更新する
 * MIGRATION NOTE: パラメータをtournament_team_idベースに変更
 */
export async function updateTournamentProgression(
  matchCode: string,
  winnerTeamId: string | null,
  loserTeamId: string | null,
  tournamentId: number,
  winnerTournamentTeamId?: number | null,
  loserTournamentTeamId?: number | null
): Promise<void> {
  try {
    console.log(`[TOURNAMENT_PROGRESSION] Processing match ${matchCode}, winner_tournament_team_id: ${winnerTournamentTeamId}, loser_tournament_team_id: ${loserTournamentTeamId}`);

    // m_match_templatesから進出ルールを動的に取得
    const rules = await getTournamentProgressionRules(matchCode, tournamentId);

    if (rules.winner_targets.length === 0 && rules.loser_targets.length === 0) {
      console.log(`[TOURNAMENT_PROGRESSION] No progression rules found for match ${matchCode}`);
      return;
    }

    let winnerTeamName: string | null = null;
    let loserTeamName: string | null = null;

    // 勝者のチーム名を取得
    if (winnerTournamentTeamId) {
      winnerTeamName = await getTeamDisplayNameByTournamentTeamId(winnerTournamentTeamId);
    }

    // 敗者のチーム名を取得
    if (loserTournamentTeamId) {
      loserTeamName = await getTeamDisplayNameByTournamentTeamId(loserTournamentTeamId);
    }

    console.log(`[TOURNAMENT_PROGRESSION] Winner team name: ${winnerTeamName}, Loser team name: ${loserTeamName}`);

    // 勝者の進出先を更新
    for (const target of rules.winner_targets) {
      if (winnerTeamName) {
        await updateMatchTeamName(
          target.match_code,
          target.position,
          winnerTeamName,
          target.source_pattern,
          tournamentId,
          winnerTournamentTeamId || null
        );
      }
    }

    // 敗者の進出先を更新（3位決定戦など）
    for (const target of rules.loser_targets) {
      if (loserTeamName) {
        await updateMatchTeamName(
          target.match_code,
          target.position,
          loserTeamName,
          target.source_pattern,
          tournamentId,
          loserTournamentTeamId || null
        );
      }
    }

    console.log(`[TOURNAMENT_PROGRESSION] ✅ Tournament progression updated for match ${matchCode}`);

  } catch (error) {
    console.error(`[TOURNAMENT_PROGRESSION] ❌ Error updating tournament progression for match ${matchCode}:`, error);
    throw error;
  }
}

/**
 * 特定の試合のチーム名を更新
 */
async function updateMatchTeamName(
  targetMatchCode: string,
  position: 'team1' | 'team2',
  teamDisplayName: string,
  sourcePattern: string,
  tournamentId: number,
  tournamentTeamId: number | null
): Promise<void> {
  try {
    console.log(`[TOURNAMENT_PROGRESSION] Updating ${targetMatchCode} ${position} (source: ${sourcePattern}) to "${teamDisplayName}" (tournament_team_id: ${tournamentTeamId})`);

    // 該当する試合を t_matches_live から検索
    const matchResult = await db.execute(`
      SELECT ml.match_id, ml.${position}_display_name, ml.${position}_tournament_team_id
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND ml.match_code = ?
    `, [tournamentId, targetMatchCode]);

    if (matchResult.rows.length === 0) {
      console.log(`[TOURNAMENT_PROGRESSION] Target match ${targetMatchCode} not found in t_matches_live`);
      return;
    }

    const match = matchResult.rows[0];
    const currentDisplayName = match[`${position}_display_name`] as string;
    const currentTournamentTeamId = match[`${position}_tournament_team_id`] as number | null;

    console.log(`[TOURNAMENT_PROGRESSION] Current ${targetMatchCode} ${position}: display_name="${currentDisplayName}", tournament_team_id="${currentTournamentTeamId}"`);

    // まず、m_match_templatesから期待されるプレースホルダーテキストを取得
    const templateResult = await db.execute(`
      SELECT t.format_id
      FROM t_tournaments t
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (templateResult.rows.length === 0) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    const formatId = templateResult.rows[0].format_id as number;

    const placeholderResult = await db.execute(`
      SELECT ${position}_display_name as placeholder
      FROM m_match_templates
      WHERE format_id = ? AND match_code = ?
    `, [formatId, targetMatchCode]);

    if (placeholderResult.rows.length === 0) {
      console.log(`[TOURNAMENT_PROGRESSION] Template for match ${targetMatchCode} not found`);
      return;
    }

    const expectedPlaceholder = placeholderResult.rows[0].placeholder as string;

    console.log(`[TOURNAMENT_PROGRESSION] Expected placeholder: "${expectedPlaceholder}", Current: "${currentDisplayName}"`);

    // プレースホルダーテキストと一致する場合、または同じsource_patternを持つ場合に更新
    if (currentDisplayName === expectedPlaceholder || currentTournamentTeamId === null) {
      const updateQuery = `
        UPDATE t_matches_live
        SET ${position}_tournament_team_id = ?, ${position}_display_name = ?, updated_at = datetime('now', '+9 hours')
        WHERE match_id = ?
      `;

      await db.execute(updateQuery, [tournamentTeamId, teamDisplayName, match.match_id]);

      console.log(`[TOURNAMENT_PROGRESSION] ✅ Updated ${targetMatchCode} ${position}: "${currentDisplayName}" → "${teamDisplayName}" (tournament_team_id: ${tournamentTeamId})`);
    } else {
      console.log(`[TOURNAMENT_PROGRESSION] Skip update for ${targetMatchCode} ${position}: current="${currentDisplayName}", expected="${expectedPlaceholder}"`);
    }

  } catch (error) {
    console.error(`[TOURNAMENT_PROGRESSION] Error updating match ${targetMatchCode} ${position}:`, error);
    throw error;
  }
}

/**
 * tournament_team_idから表示用チーム名を取得
 * MIGRATION NOTE: tournament_team_idベースの取得関数（team_idがNULLの場合に使用）
 */
async function getTeamDisplayNameByTournamentTeamId(tournamentTeamId: number | null): Promise<string | null> {
  if (!tournamentTeamId) return null;

  try {
    const result = await db.execute(`
      SELECT
        COALESCE(tt.team_omission, tt.team_name) as display_name
      FROM t_tournament_teams tt
      WHERE tt.tournament_team_id = ?
    `, [tournamentTeamId]);

    if (result.rows.length > 0) {
      return result.rows[0].display_name as string;
    }

    console.warn(`[TOURNAMENT_PROGRESSION] Team not found for tournament_team_id: ${tournamentTeamId}`);
    return null;

  } catch (error) {
    console.error(`[TOURNAMENT_PROGRESSION] Error getting team display name for tournament_team_id ${tournamentTeamId}:`, error);
    return null;
  }
}

/**
 * 既存の確定済み試合に基づいてトーナメント進出を再計算する
 * MIGRATION NOTE: tournament_team_idベースで処理
 */
export async function recalculateAllTournamentProgression(tournamentId: number): Promise<void> {
  try {
    console.log(`[TOURNAMENT_PROGRESSION] Recalculating tournament progression for tournament ${tournamentId}`);

    // 確定済みの決勝トーナメント試合を取得（execution_priorityでソート）
    // MIGRATION NOTE: tournament_team_idも取得
    const confirmedMatches = await db.execute(`
      SELECT
        mf.match_id,
        mf.match_code,
        mf.team1_tournament_team_id,
        mf.team2_tournament_team_id,
        mf.winner_tournament_team_id,
        mf.is_draw,
        mb.phase,
        mt.execution_priority
      FROM t_matches_final mf
      INNER JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      LEFT JOIN m_match_templates mt ON mt.match_code = mf.match_code
        AND mt.format_id = (SELECT format_id FROM t_tournaments WHERE tournament_id = ?)
        AND mt.phase = mb.phase
      WHERE mb.tournament_id = ? AND mb.phase = 'final'
      ORDER BY mt.execution_priority ASC, mf.match_code ASC
    `, [tournamentId, tournamentId]);

    console.log(`[TOURNAMENT_PROGRESSION] Found ${confirmedMatches.rows.length} confirmed tournament matches`);

    // 各確定済み試合について進出処理を実行
    for (const match of confirmedMatches.rows) {
      const matchCode = match.match_code as string;
      const team1TournamentTeamId = match.team1_tournament_team_id as number | null;
      const team2TournamentTeamId = match.team2_tournament_team_id as number | null;
      const winnerTournamentTeamId = match.winner_tournament_team_id as number | null;
      const isDraw = Boolean(match.is_draw);

      if (!isDraw && winnerTournamentTeamId) {
        // tournament_team_idから敗者を特定
        const loserTournamentTeamId = team1TournamentTeamId && team2TournamentTeamId
          ? (winnerTournamentTeamId === team1TournamentTeamId ? team2TournamentTeamId : team1TournamentTeamId)
          : null;

        console.log(`[TOURNAMENT_PROGRESSION] Recalculating progression for ${matchCode}: winner_tournament_team_id=${winnerTournamentTeamId}, loser_tournament_team_id=${loserTournamentTeamId}`);
        await updateTournamentProgression(matchCode, null, null, tournamentId, winnerTournamentTeamId, loserTournamentTeamId);
      }
    }

    console.log(`[TOURNAMENT_PROGRESSION] ✅ Tournament progression recalculation completed for tournament ${tournamentId}`);

  } catch (error) {
    console.error(`[TOURNAMENT_PROGRESSION] Error recalculating tournament progression for tournament ${tournamentId}:`, error);
    throw error;
  }
}

/**
 * 確定された試合から勝者・敗者を判定してトーナメント進出を処理
 * MIGRATION NOTE: tournament_team_idベースに変更完了
 */
export async function processTournamentProgression(
  matchId: number,
  matchCode: string,
  isDraw: boolean,
  tournamentId: number,
  team1TournamentTeamId: number | null,
  team2TournamentTeamId: number | null,
  winnerTournamentTeamId: number | null
): Promise<void> {
  try {
    // 引き分けの場合は進出処理をスキップ
    if (isDraw) {
      console.log(`[TOURNAMENT_PROGRESSION] Skipping progression for match ${matchCode}: draw`);
      return;
    }

    if (!winnerTournamentTeamId) {
      console.log(`[TOURNAMENT_PROGRESSION] Skipping progression for match ${matchCode}: no winner_tournament_team_id`);
      return;
    }

    // 敗者を特定
    let loserTournamentTeamId: number | null = null;

    if (team1TournamentTeamId && team2TournamentTeamId) {
      loserTournamentTeamId = winnerTournamentTeamId === team1TournamentTeamId ? team2TournamentTeamId : team1TournamentTeamId;
    }

    console.log(`[TOURNAMENT_PROGRESSION] Processing match ${matchCode} (ID: ${matchId})`);
    console.log(`[TOURNAMENT_PROGRESSION] Winner: tournament_team_id=${winnerTournamentTeamId}, Loser: tournament_team_id=${loserTournamentTeamId}`);

    // トーナメント進出処理を実行
    await updateTournamentProgression(matchCode, null, null, tournamentId, winnerTournamentTeamId, loserTournamentTeamId);

  } catch (error) {
    console.error(`[TOURNAMENT_PROGRESSION] Error processing tournament progression for match ${matchId}:`, error);
    throw error;
  }
}
