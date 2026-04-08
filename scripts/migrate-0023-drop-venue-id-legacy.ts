/**
 * マイグレーション0023: t_tournaments.venue_id_legacy カラム削除
 *
 * SQLiteではFK制約付きカラムのDROPやFK参照先テーブルのDROPができないため、
 * 子テーブルのデータを一時退避→親テーブル再作成→子テーブルデータ復元の手順で実行
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const env = process.argv[2] || "dev";
const urlKey =
  env === "dev" ? "DATABASE_URL_DEV" : env === "stag" ? "DATABASE_URL_STAG" : "DATABASE_URL_MAIN";
const tokenKey =
  env === "dev"
    ? "DATABASE_AUTH_TOKEN_DEV"
    : env === "stag"
      ? "DATABASE_AUTH_TOKEN_STAG"
      : "DATABASE_AUTH_TOKEN_MAIN";

const db = createClient({
  url: process.env[urlKey]!,
  authToken: process.env[tokenKey]!,
});

async function run() {
  console.log(`\n=== マイグレーション0023: venue_id_legacy削除 (環境: ${env}) ===\n`);

  // 1. t_tournaments_new が既に存在するか確認
  const tables = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='t_tournaments_new'",
  );

  if (tables.rows.length === 0) {
    // t_tournaments_new を作成してデータをコピー
    console.log("📄 t_tournaments_new を作成...");
    await db.execute(`
      CREATE TABLE t_tournaments_new (
        tournament_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_name TEXT NOT NULL,
        format_id INTEGER NOT NULL,
        team_count INTEGER NOT NULL,
        court_count INTEGER NOT NULL,
        tournament_dates TEXT NOT NULL,
        match_duration_minutes INTEGER NOT NULL,
        break_duration_minutes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning',
        visibility TEXT NOT NULL DEFAULT 'draft',
        public_start_date TEXT,
        recruitment_start_date TEXT,
        recruitment_end_date TEXT,
        sport_type_id INTEGER,
        created_by TEXT,
        archive_ui_version TEXT,
        is_archived INTEGER DEFAULT 0,
        archived_at DATETIME,
        archived_by TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        files_count INTEGER DEFAULT 0,
        group_order INTEGER,
        category_name TEXT,
        group_id INTEGER,
        show_players_public INTEGER DEFAULT 0,
        preliminary_format_type TEXT,
        final_format_type TEXT,
        phases TEXT,
        format_name TEXT,
        venue_id TEXT,
        FOREIGN KEY (format_id) REFERENCES m_tournament_formats(format_id),
        FOREIGN KEY (group_id) REFERENCES t_tournament_groups(group_id)
      )
    `);
    await db.execute(`
      INSERT INTO t_tournaments_new SELECT tournament_id, tournament_name, format_id,
        team_count, court_count, tournament_dates, match_duration_minutes, break_duration_minutes,
        status, visibility, public_start_date, recruitment_start_date, recruitment_end_date,
        sport_type_id, created_by, archive_ui_version, is_archived, archived_at, archived_by,
        created_at, updated_at, files_count, group_order, category_name, group_id,
        show_players_public, preliminary_format_type, final_format_type, phases, format_name, venue_id
      FROM t_tournaments
    `);
    console.log("  ✓ データコピー完了");
  } else {
    console.log("✓ t_tournaments_new は既に存在します");
  }

  // 2. 子テーブルのFK参照を持つテーブル一覧（孫テーブル含む）
  // t_matches_final, t_match_status → t_match_blocks → t_tournaments
  const childTables = [
    "t_matches_final",
    "t_match_status",
    "t_match_blocks",
    "t_tournament_notifications",
    "t_tournament_files",
    "t_tournament_players",
    "t_tournament_teams",
    "t_tournament_courts",
    "t_tournament_match_overrides",
    "t_email_send_history",
    "t_subscription_usage",
    "t_sponsor_banners",
    "m_login_user_authority",
    "t_operator_tournament_access",
    "t_tournament_rules",
  ];

  // 3. 子テーブルのデータを退避用テーブルにバックアップ
  console.log("\n📦 子テーブルのデータをバックアップ...");
  for (const table of childTables) {
    const count = await db.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
    const cnt = count.rows[0].cnt;
    if (Number(cnt) > 0) {
      const exists = await db.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}_bak0023'`,
      );
      if (exists.rows.length === 0) {
        await db.execute(`CREATE TABLE ${table}_bak0023 AS SELECT * FROM ${table}`);
        console.log(`  ✓ ${table}: ${cnt}件バックアップ`);
      } else {
        console.log(`  ✓ ${table}: バックアップ済み`);
      }
    } else {
      console.log(`  - ${table}: データなし（スキップ）`);
    }
  }

  // 4. 子テーブルのデータを削除（逆順: 孫テーブルから）
  // t_email_send_history は t_tournament_teams を参照するので先に削除
  // t_tournament_players は t_tournament_teams を参照するので先に削除
  // t_match_blocks は t_tournament_courts を参照する可能性がある
  const deleteOrder = [
    "t_match_status",
    "t_matches_final",
    "t_email_send_history",
    "t_tournament_match_overrides",
    "t_sponsor_banners",
    "t_tournament_notifications",
    "t_tournament_files",
    "t_tournament_players",
    "t_subscription_usage",
    "m_login_user_authority",
    "t_operator_tournament_access",
    "t_match_blocks",
    "t_tournament_courts",
    "t_tournament_rules",
    "t_tournament_teams",
  ];

  console.log("\n🗑️  子テーブルのデータを削除...");
  for (const table of deleteOrder) {
    try {
      await db.execute(`DELETE FROM ${table}`);
      console.log(`  ✓ ${table}: 削除完了`);
    } catch (e: any) {
      console.log(`  ⚠ ${table}: ${e.message}`);
    }
  }

  // 5. 元のt_tournamentsを削除
  console.log("\n🔄 t_tournaments テーブルを入れ替え...");
  try {
    await db.execute("DROP TABLE t_tournaments");
    console.log("  ✓ 旧テーブル削除");
  } catch (e: any) {
    console.log(`  ⚠ DROP失敗: ${e.message}`);
    return;
  }

  // 6. 新テーブルをリネーム
  await db.execute("ALTER TABLE t_tournaments_new RENAME TO t_tournaments");
  console.log("  ✓ 新テーブルをリネーム");

  // 7. 子テーブルのデータを復元
  console.log("\n📥 子テーブルのデータを復元...");
  const restoreOrder = [...deleteOrder].reverse();
  for (const table of restoreOrder) {
    const bakExists = await db.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}_bak0023'`,
    );
    if (bakExists.rows.length > 0) {
      const count = await db.execute(`SELECT COUNT(*) as cnt FROM ${table}_bak0023`);
      if (Number(count.rows[0].cnt) > 0) {
        try {
          await db.execute(`INSERT INTO ${table} SELECT * FROM ${table}_bak0023`);
          console.log(`  ✓ ${table}: ${count.rows[0].cnt}件復元`);
        } catch (e: any) {
          console.log(`  ⚠ ${table}: 復元失敗 - ${e.message}`);
        }
      }
    }
  }

  // 8. バックアップテーブルを削除
  console.log("\n🧹 バックアップテーブルを削除...");
  for (const table of childTables) {
    const bakExists = await db.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}_bak0023'`,
    );
    if (bakExists.rows.length > 0) {
      await db.execute(`DROP TABLE ${table}_bak0023`);
      console.log(`  ✓ ${table}_bak0023 削除`);
    }
  }

  // 9. 検証
  console.log("\n✅ 検証...");
  const result = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='t_tournaments'",
  );
  const sql = result.rows[0].sql as string;
  if (sql.includes("venue_id_legacy")) {
    console.log("❌ venue_id_legacy がまだ残っています！");
  } else {
    console.log("✓ venue_id_legacy は正常に削除されました");
  }
  const tourCount = await db.execute("SELECT COUNT(*) as cnt FROM t_tournaments");
  console.log(`✓ t_tournaments: ${tourCount.rows[0].cnt}件`);

  // マイグレーション履歴に登録
  console.log("\n📝 マイグレーション履歴を更新...");
  try {
    await db.execute({
      sql: `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
      args: ["0023_drop_venue_id_legacy", Date.now()],
    });
    console.log("  ✓ 履歴登録完了");
  } catch (e: any) {
    if (e.message?.includes("UNIQUE") || e.message?.includes("already")) {
      console.log("  ✓ 既に登録済み");
    } else {
      console.log(`  ⚠ ${e.message}`);
    }
  }

  console.log("\n=== 完了 ===\n");
}

run().catch(console.error);
