/**
 * バックフィルスクリプト: テンプレート独立化
 *
 * 既存の t_tournaments, t_matches_live, t_matches_final に
 * m_tournament_formats / m_match_templates からデータをコピーする。
 *
 * 使用方法:
 *   npx tsx scripts/backfill-template-data.ts [環境]
 *
 * 環境:
 *   dev  - 開発環境（デフォルト）
 *   stag - ステージング環境
 *   main - 本番環境
 */

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const env = process.argv[2] || "dev";
const dbUrl =
  env === "stag"
    ? process.env.DATABASE_URL_STAG
    : env === "main"
      ? process.env.DATABASE_URL_MAIN
      : process.env.DATABASE_URL;

const dbToken =
  env === "stag"
    ? process.env.DATABASE_AUTH_TOKEN_STAG
    : env === "main"
      ? process.env.DATABASE_AUTH_TOKEN_MAIN
      : process.env.DATABASE_AUTH_TOKEN;

const db = createClient({
  url: dbUrl!,
  authToken: dbToken,
});

async function backfillTournaments() {
  console.log("=== t_tournaments のバックフィル開始 ===");

  // フォーマット情報が未コピーのt_tournamentsを取得
  const tournaments = await db.execute(`
    SELECT t.tournament_id, t.format_id, t.preliminary_format_type, t.final_format_type, t.phases
    FROM t_tournaments t
  `);

  let updated = 0;
  for (const t of tournaments.rows) {
    // 既にコピー済みならスキップ
    if (t.preliminary_format_type && t.final_format_type) {
      console.log(`  [skip] tournament_id=${t.tournament_id} - 既にコピー済み`);
      continue;
    }

    const format = await db.execute(
      `
      SELECT preliminary_format_type, final_format_type, phases
      FROM m_tournament_formats
      WHERE format_id = ?
    `,
      [t.format_id],
    );

    if (format.rows.length === 0) {
      console.log(
        `  [warn] tournament_id=${t.tournament_id} - format_id=${t.format_id} が見つかりません`,
      );
      continue;
    }

    const f = format.rows[0];
    await db.execute(
      `
      UPDATE t_tournaments SET
        preliminary_format_type = ?,
        final_format_type = ?,
        phases = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ?
    `,
      [
        f.preliminary_format_type,
        f.final_format_type,
        typeof f.phases === "string" ? f.phases : JSON.stringify(f.phases),
        t.tournament_id,
      ],
    );
    updated++;
    console.log(`  [ok] tournament_id=${t.tournament_id} - フォーマット情報をコピー`);
  }

  console.log(`=== t_tournaments: ${updated}件更新 ===\n`);
}

async function backfillMatchesLive() {
  console.log("=== t_matches_live のバックフィル開始 ===");

  // テンプレートフィールドが未コピーのt_matches_liveを取得
  // phase が NULL のレコードを対象とする
  const matches = await db.execute(`
    SELECT ml.match_id, ml.match_code, ml.match_block_id,
      mb.phase as block_phase, mb.tournament_id
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE ml.phase IS NULL
  `);

  console.log(`  対象: ${matches.rows.length}件`);

  let updated = 0;
  let notFound = 0;

  // tournament_id -> format_id のキャッシュ
  const formatCache = new Map<number, number>();

  for (const m of matches.rows) {
    const tournamentId = m.tournament_id as number;

    // format_idを取得（キャッシュ活用）
    if (!formatCache.has(tournamentId)) {
      const tResult = await db.execute(
        "SELECT format_id FROM t_tournaments WHERE tournament_id = ?",
        [tournamentId],
      );
      if (tResult.rows.length > 0) {
        formatCache.set(tournamentId, tResult.rows[0].format_id as number);
      }
    }

    const formatId = formatCache.get(tournamentId);
    if (!formatId) {
      console.log(`  [warn] match_id=${m.match_id} - tournament format not found`);
      notFound++;
      continue;
    }

    // テンプレートからフィールドを取得
    const template = await db.execute(
      `
      SELECT match_type, phase, round_name, block_name,
        team1_source, team2_source, day_number, execution_priority,
        suggested_start_time, loser_position_start, loser_position_end,
        position_note, winner_position, is_bye_match, matchday, cycle
      FROM m_match_templates
      WHERE format_id = ? AND match_code = ? AND phase = ?
    `,
      [formatId, m.match_code, m.block_phase],
    );

    if (template.rows.length === 0) {
      console.log(
        `  [warn] match_id=${m.match_id} - テンプレート見つからず (format_id=${formatId}, match_code=${m.match_code}, phase=${m.block_phase})`,
      );
      notFound++;
      continue;
    }

    const t = template.rows[0];
    await db.execute(
      `
      UPDATE t_matches_live SET
        phase = ?,
        match_type = ?,
        round_name = ?,
        block_name = ?,
        team1_source = ?,
        team2_source = ?,
        day_number = ?,
        execution_priority = ?,
        suggested_start_time = ?,
        loser_position_start = ?,
        loser_position_end = ?,
        position_note = ?,
        winner_position = ?,
        is_bye_match = ?,
        matchday = ?,
        cycle = ?
      WHERE match_id = ?
    `,
      [
        t.phase,
        t.match_type,
        t.round_name,
        t.block_name,
        t.team1_source,
        t.team2_source,
        t.day_number,
        t.execution_priority,
        t.suggested_start_time,
        t.loser_position_start,
        t.loser_position_end,
        t.position_note,
        t.winner_position,
        t.is_bye_match ?? 0,
        t.matchday,
        t.cycle ?? 1,
        m.match_id,
      ],
    );
    updated++;
  }

  console.log(`=== t_matches_live: ${updated}件更新, ${notFound}件マッチなし ===\n`);
}

async function backfillMatchesFinal() {
  console.log("=== t_matches_final のバックフィル開始 ===");

  const matches = await db.execute(`
    SELECT mf.match_id, mf.match_code, mf.match_block_id,
      mb.phase as block_phase, mb.tournament_id
    FROM t_matches_final mf
    JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
    WHERE mf.phase IS NULL
  `);

  console.log(`  対象: ${matches.rows.length}件`);

  let updated = 0;
  let notFound = 0;

  const formatCache = new Map<number, number>();

  for (const m of matches.rows) {
    const tournamentId = m.tournament_id as number;

    if (!formatCache.has(tournamentId)) {
      const tResult = await db.execute(
        "SELECT format_id FROM t_tournaments WHERE tournament_id = ?",
        [tournamentId],
      );
      if (tResult.rows.length > 0) {
        formatCache.set(tournamentId, tResult.rows[0].format_id as number);
      }
    }

    const formatId = formatCache.get(tournamentId);
    if (!formatId) {
      console.log(`  [warn] match_id=${m.match_id} - tournament format not found`);
      notFound++;
      continue;
    }

    const template = await db.execute(
      `
      SELECT match_type, phase, round_name, block_name,
        team1_source, team2_source, day_number, execution_priority,
        suggested_start_time, loser_position_start, loser_position_end,
        position_note, winner_position, is_bye_match, matchday, cycle
      FROM m_match_templates
      WHERE format_id = ? AND match_code = ? AND phase = ?
    `,
      [formatId, m.match_code, m.block_phase],
    );

    if (template.rows.length === 0) {
      console.log(`  [warn] match_id=${m.match_id} - テンプレート見つからず`);
      notFound++;
      continue;
    }

    const t = template.rows[0];
    await db.execute(
      `
      UPDATE t_matches_final SET
        phase = ?,
        match_type = ?,
        round_name = ?,
        block_name = ?,
        team1_source = ?,
        team2_source = ?,
        day_number = ?,
        execution_priority = ?,
        suggested_start_time = ?,
        loser_position_start = ?,
        loser_position_end = ?,
        position_note = ?,
        winner_position = ?,
        is_bye_match = ?,
        matchday = ?,
        cycle = ?
      WHERE match_id = ?
    `,
      [
        t.phase,
        t.match_type,
        t.round_name,
        t.block_name,
        t.team1_source,
        t.team2_source,
        t.day_number,
        t.execution_priority,
        t.suggested_start_time,
        t.loser_position_start,
        t.loser_position_end,
        t.position_note,
        t.winner_position,
        t.is_bye_match ?? 0,
        t.matchday,
        t.cycle ?? 1,
        m.match_id,
      ],
    );
    updated++;
  }

  console.log(`=== t_matches_final: ${updated}件更新, ${notFound}件マッチなし ===\n`);
}

async function main() {
  console.log(`\n🔄 テンプレート独立化バックフィル開始 (環境: ${env})\n`);

  try {
    await backfillTournaments();
    await backfillMatchesLive();
    await backfillMatchesFinal();
    console.log("✅ バックフィル完了");
  } catch (error) {
    console.error("❌ バックフィルエラー:", error);
    process.exit(1);
  }
}

main();
