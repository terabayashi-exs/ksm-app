import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.DATABASE_URL_MAIN!,
  authToken: process.env.DATABASE_AUTH_TOKEN_MAIN,
});

async function alterSafe(sql: string) {
  try {
    await db.execute(sql);
    return true;
  } catch (e: any) {
    if (e.message?.includes("duplicate") || e.message?.includes("already exists")) return false;
    throw e;
  }
}

async function recordMigration(id: number, tag: string, when: number) {
  try {
    await db.execute({
      sql: "INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)",
      args: [id, tag, when],
    });
    console.log(`  ✓ 履歴記録: ${tag}`);
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) console.log(`  ⊘ 既に記録済み: ${tag}`);
    else throw e;
  }
}

async function main() {
  // === 0017: format_name ===
  console.log("\n=== 0017: format_name ===");
  const added0017 = await alterSafe("ALTER TABLE t_tournaments ADD COLUMN format_name TEXT");
  console.log(added0017 ? "  ✓ カラム追加" : "  ⊘ 既に存在");
  const r0017 = await db.execute(
    "UPDATE t_tournaments SET format_name = (SELECT format_name FROM m_tournament_formats WHERE m_tournament_formats.format_id = t_tournaments.format_id) WHERE format_name IS NULL",
  );
  console.log(`  ✓ データコピー: ${r0017.rowsAffected}件`);
  await recordMigration(21, "0017_add_format_name_to_tournaments", 1740758400000);

  // === 0018: venue_name ===
  console.log("\n=== 0018: venue_name ===");
  await alterSafe("ALTER TABLE t_matches_live ADD COLUMN venue_name text");
  await alterSafe("ALTER TABLE t_matches_final ADD COLUMN venue_name text");
  console.log("  ✓ カラム追加");

  // 部門のvenue_idから会場名を設定
  const liveVenue = await db.execute(`
    UPDATE t_matches_live SET venue_name = (
      SELECT v.venue_name FROM m_venues v
      JOIN t_tournaments t ON t.venue_id = v.venue_id
      JOIN t_match_blocks mb ON mb.tournament_id = t.tournament_id
      WHERE mb.match_block_id = t_matches_live.match_block_id
    ) WHERE venue_name IS NULL
  `);
  console.log(`  ✓ t_matches_live venue_name: ${liveVenue.rowsAffected}件`);

  const finalVenue = await db.execute(`
    UPDATE t_matches_final SET venue_name = (
      SELECT v.venue_name FROM m_venues v
      JOIN t_tournaments t ON t.venue_id = v.venue_id
      JOIN t_match_blocks mb ON mb.tournament_id = t.tournament_id
      WHERE mb.match_block_id = t_matches_final.match_block_id
    ) WHERE venue_name IS NULL
  `);
  console.log(`  ✓ t_matches_final venue_name: ${finalVenue.rowsAffected}件`);
  await recordMigration(22, "0018_add_venue_name_to_matches", 1740844800000);

  // === 0019: format default durations ===
  console.log("\n=== 0019: format default durations ===");
  await alterSafe("ALTER TABLE m_tournament_formats ADD COLUMN default_match_duration integer");
  await alterSafe("ALTER TABLE m_tournament_formats ADD COLUMN default_break_duration integer");
  console.log("  ✓ カラム追加");

  const tournaments = await db.execute(
    "SELECT DISTINCT format_id, match_duration_minutes, break_duration_minutes FROM t_tournaments WHERE format_id IS NOT NULL",
  );
  for (const t of tournaments.rows) {
    await db.execute({
      sql: "UPDATE m_tournament_formats SET default_match_duration = ?, default_break_duration = ? WHERE format_id = ? AND default_match_duration IS NULL",
      args: [t.match_duration_minutes, t.break_duration_minutes, t.format_id],
    });
  }
  console.log(`  ✓ データコピー: ${tournaments.rows.length}フォーマット`);
  await recordMigration(23, "0019_add_format_default_durations", 1740931200000);

  // === 0020: remove phase check constraint ===
  console.log("\n=== 0020: remove phase check constraint ===");
  const createSql = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='t_tournament_rules'",
  );
  const hasCHECK = createSql.rows[0]?.sql?.toString().includes("CHECK");
  if (hasCHECK) {
    await db.execute("DROP TABLE IF EXISTS t_tournament_rules_new");
    await db.execute(`CREATE TABLE t_tournament_rules_new (
      tournament_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE,
      phase TEXT NOT NULL,
      use_extra_time INTEGER DEFAULT 0,
      use_penalty INTEGER DEFAULT 0,
      active_periods TEXT DEFAULT '["1"]',
      notes TEXT,
      point_system TEXT,
      walkover_settings TEXT,
      tie_breaking_rules TEXT,
      tie_breaking_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', '+9 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+9 hours'))
    )`);
    await db.execute("INSERT INTO t_tournament_rules_new SELECT * FROM t_tournament_rules");
    await db.execute("DROP TABLE t_tournament_rules");
    await db.execute("ALTER TABLE t_tournament_rules_new RENAME TO t_tournament_rules");
    console.log("  ✓ CHECK制約削除（テーブル再作成）");
  } else {
    console.log("  ⊘ CHECK制約なし（適用済み）");
  }
  await recordMigration(24, "0020_remove_phase_check_constraint", 1741017600000);

  // === 0021: multi venue support ===
  console.log("\n=== 0021: multi venue support ===");
  await alterSafe("ALTER TABLE m_venues ADD COLUMN google_maps_url text");
  await alterSafe("ALTER TABLE m_venues ADD COLUMN latitude real");
  await alterSafe("ALTER TABLE m_venues ADD COLUMN longitude real");
  await alterSafe("ALTER TABLE t_matches_final ADD COLUMN court_name text");
  await alterSafe("ALTER TABLE t_matches_final ADD COLUMN venue_id integer");
  await alterSafe("ALTER TABLE t_matches_live ADD COLUMN court_name text");
  await alterSafe("ALTER TABLE t_matches_live ADD COLUMN venue_id integer");
  await alterSafe("ALTER TABLE t_tournament_courts ADD COLUMN venue_id integer");
  console.log("  ✓ カラム追加");

  // venue_id: INTEGER → TEXT (JSON配列)
  try {
    await db.execute("ALTER TABLE t_tournaments RENAME COLUMN venue_id TO venue_id_legacy");
    await db.execute("ALTER TABLE t_tournaments ADD COLUMN venue_id text");
    await db.execute(
      "UPDATE t_tournaments SET venue_id = '[' || venue_id_legacy || ']' WHERE venue_id_legacy IS NOT NULL AND (venue_id IS NULL OR venue_id = '')",
    );
    console.log("  ✓ venue_id JSON配列化");
  } catch (e: any) {
    if (e.message?.includes("no such column") || e.message?.includes("already exists")) {
      console.log("  ⊘ venue_id変換は適用済み");
    } else throw e;
  }

  // t_matches_liveとt_matches_finalにvenue_id設定
  const liveVenueId = await db.execute(`
    UPDATE t_matches_live SET venue_id = (
      SELECT t.venue_id_legacy FROM t_tournaments t
      JOIN t_match_blocks mb ON mb.tournament_id = t.tournament_id
      WHERE mb.match_block_id = t_matches_live.match_block_id
    ) WHERE venue_id IS NULL
  `);
  console.log(`  ✓ t_matches_live venue_id: ${liveVenueId.rowsAffected}件`);

  const finalVenueId = await db.execute(`
    UPDATE t_matches_final SET venue_id = (
      SELECT t.venue_id_legacy FROM t_tournaments t
      JOIN t_match_blocks mb ON mb.tournament_id = t.tournament_id
      WHERE mb.match_block_id = t_matches_final.match_block_id
    ) WHERE venue_id IS NULL
  `);
  console.log(`  ✓ t_matches_final venue_id: ${finalVenueId.rowsAffected}件`);

  await recordMigration(25, "0021_multi_venue_support", 1741104000000);

  // === 0022: venue ownership ===
  console.log("\n=== 0022: venue ownership ===");
  await alterSafe("ALTER TABLE m_venues ADD COLUMN created_by_login_user_id integer");
  await alterSafe("ALTER TABLE m_venues ADD COLUMN is_shared integer NOT NULL DEFAULT 0");
  const venueResult = await db.execute("UPDATE m_venues SET is_shared = 1");
  console.log(`  ✓ 既存会場 is_shared=1: ${venueResult.rowsAffected}件`);
  await recordMigration(26, "0022_venue_ownership", 1741190400000);

  // === 最終確認 ===
  console.log("\n=== マイグレーション履歴 ===");
  const history = await db.execute("SELECT id, hash FROM __drizzle_migrations ORDER BY id");
  history.rows.forEach((r) => console.log(`  ${r.id} ${r.hash}`));

  console.log("\n✅ 0017〜0022 全て完了");
  db.close();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
