/**
 * m_teams.team_id を UUID形式に付け替えるスクリプト (main環境)
 *
 * TursoではFK制約OFFが効かないため:
 * 1. FK制約なしの _new テーブルを作成しUUID変換データを投入
 * 2. 旧テーブルDROP→新テーブルRENAMEをバッチで一括実行
 *
 * 使用方法:
 *   npx tsx scripts/migrate-replace-team-ids-main.ts
 */

import { createClient, type InStatement } from "@libsql/client";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.DATABASE_URL_MAIN!,
  authToken: process.env.DATABASE_AUTH_TOKEN_MAIN,
});

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  team_id UUID化 (main環境)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // STEP 1: 現在のteam_idを取得
  const teams = await db.execute("SELECT team_id FROM m_teams ORDER BY team_id");
  console.log(`[STEP 1] m_teams: ${teams.rows.length}件\n`);

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const mapping = new Map<string, string>();
  for (const t of teams.rows) {
    const oldId = t.team_id as string;
    if (!uuidPattern.test(oldId)) {
      mapping.set(oldId, randomUUID());
    }
  }
  console.log(`  UUID化対象: ${mapping.size}件\n`);

  if (mapping.size === 0) {
    console.log("✅ 全て既にUUID形式です。\n");
    return;
  }

  // STEP 2: マッピングテーブル作成
  console.log("[STEP 2] マッピングテーブル作成\n");
  await db.execute("DROP TABLE IF EXISTS _team_id_mapping");
  await db.execute("CREATE TABLE _team_id_mapping (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL)");

  const entries = Array.from(mapping.entries());
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    const stmts: InStatement[] = chunk.map(([oldId, newId]) => ({
      sql: "INSERT INTO _team_id_mapping (old_id, new_id) VALUES (?, ?)",
      args: [oldId, newId],
    }));
    await db.batch(stmts, "write");
  }
  console.log(`  ✓ ${mapping.size}件のマッピング登録完了\n`);

  // STEP 3: FK制約なしの _new テーブルを作成し、UUID変換済みデータを投入
  console.log("[STEP 3] 新テーブル作成＆UUID変換データ投入\n");

  // m_teams_new
  await db.execute("DROP TABLE IF EXISTS m_teams_new");
  await db.execute(`CREATE TABLE m_teams_new (
    team_id TEXT PRIMARY KEY,
    team_name TEXT NOT NULL,
    team_omission TEXT,
    contact_person TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    representative_player_id INTEGER,
    password_hash TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    registration_type TEXT DEFAULT 'self_registered',
    prefecture_id INTEGER
  )`);
  await db.execute(`
    INSERT INTO m_teams_new
    SELECT COALESCE(m.new_id, t.team_id),
      t.team_name, t.team_omission, t.contact_person, t.contact_email, t.contact_phone,
      t.representative_player_id, t.password_hash, t.is_active, t.created_at, t.updated_at,
      t.registration_type, t.prefecture_id
    FROM m_teams t
    LEFT JOIN _team_id_mapping m ON t.team_id = m.old_id
  `);
  const mtCount = await db.execute("SELECT COUNT(*) as cnt FROM m_teams_new");
  console.log(`  m_teams_new: ${mtCount.rows[0].cnt}件`);

  // m_players_new
  await db.execute("DROP TABLE IF EXISTS m_players_new");
  await db.execute(`CREATE TABLE m_players_new (
    player_id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    jersey_number INTEGER,
    current_team_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
  )`);
  await db.execute(`
    INSERT INTO m_players_new (player_id, player_name, jersey_number, current_team_id, is_active, created_at, updated_at)
    SELECT p.player_id, p.player_name, p.jersey_number,
      COALESCE(m.new_id, p.current_team_id),
      p.is_active, p.created_at, p.updated_at
    FROM m_players p
    LEFT JOIN _team_id_mapping m ON p.current_team_id = m.old_id
  `);
  const mpCount = await db.execute("SELECT COUNT(*) as cnt FROM m_players_new");
  console.log(`  m_players_new: ${mpCount.rows[0].cnt}件`);

  // t_tournament_teams_new
  await db.execute("DROP TABLE IF EXISTS t_tournament_teams_new");
  await db.execute(`CREATE TABLE t_tournament_teams_new (
    tournament_team_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    assigned_block TEXT,
    block_position INTEGER,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    team_name TEXT NOT NULL DEFAULT '',
    team_omission TEXT NOT NULL DEFAULT '',
    withdrawal_status TEXT DEFAULT 'active',
    withdrawal_reason TEXT,
    withdrawal_requested_at DATETIME,
    withdrawal_processed_at DATETIME,
    withdrawal_processed_by TEXT,
    withdrawal_admin_comment TEXT,
    registration_method TEXT DEFAULT 'self_registered',
    participation_status TEXT NOT NULL DEFAULT 'confirmed',
    waitlist_position INTEGER NULL
  )`);
  await db.execute(`
    INSERT INTO t_tournament_teams_new
    SELECT tt.tournament_team_id, tt.tournament_id,
      COALESCE(m.new_id, tt.team_id),
      tt.assigned_block, tt.block_position, tt.created_at, tt.updated_at,
      tt.team_name, tt.team_omission, tt.withdrawal_status, tt.withdrawal_reason,
      tt.withdrawal_requested_at, tt.withdrawal_processed_at, tt.withdrawal_processed_by,
      tt.withdrawal_admin_comment, tt.registration_method, tt.participation_status,
      tt.waitlist_position
    FROM t_tournament_teams tt
    LEFT JOIN _team_id_mapping m ON tt.team_id = m.old_id
  `);
  const ttCount = await db.execute("SELECT COUNT(*) as cnt FROM t_tournament_teams_new");
  console.log(`  t_tournament_teams_new: ${ttCount.rows[0].cnt}件`);

  // t_tournament_players_new
  // 前回team_idがUUIDに変換されているレコードがある
  // → m1: 旧IDからの直接マッピング, m2: player経由の間接マッピング
  await db.execute("DROP TABLE IF EXISTS t_tournament_players_new");
  await db.execute(`CREATE TABLE t_tournament_players_new (
    tournament_player_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    jersey_number INTEGER,
    player_status TEXT NOT NULL DEFAULT 'active',
    registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    withdrawal_date DATETIME,
    remarks TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    player_name TEXT,
    player_omission TEXT,
    tournament_team_id INTEGER,
    UNIQUE(tournament_id, team_id, player_id)
  )`);
  await db.execute(`
    INSERT INTO t_tournament_players_new (
      tournament_player_id, tournament_id, team_id, player_id, jersey_number,
      player_status, registration_date, withdrawal_date, remarks,
      created_at, updated_at, player_name, player_omission, tournament_team_id
    )
    SELECT tp.tournament_player_id, tp.tournament_id,
      COALESCE(m1.new_id, m2.new_id, tp.team_id),
      tp.player_id, tp.jersey_number,
      tp.player_status, tp.registration_date, tp.withdrawal_date, tp.remarks,
      tp.created_at, tp.updated_at, tp.player_name, tp.player_omission, tp.tournament_team_id
    FROM t_tournament_players tp
    LEFT JOIN _team_id_mapping m1 ON tp.team_id = m1.old_id
    LEFT JOIN m_players p ON tp.player_id = p.player_id
    LEFT JOIN _team_id_mapping m2 ON p.current_team_id = m2.old_id
  `);
  const tpCount = await db.execute("SELECT COUNT(*) as cnt FROM t_tournament_players_new");
  console.log(`  t_tournament_players_new: ${tpCount.rows[0].cnt}件`);

  // t_password_reset_tokens_new
  await db.execute("DROP TABLE IF EXISTS t_password_reset_tokens_new");
  await db.execute(`CREATE TABLE t_password_reset_tokens_new (
    token_id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    reset_token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours'))
  )`);
  // 前回UUID化されたteam_idはm_teams_newに存在しないのでフィルタ
  await db.execute(`
    INSERT INTO t_password_reset_tokens_new (token_id, team_id, reset_token, expires_at, used_at, created_at)
    SELECT prt.token_id,
      COALESCE(m.new_id, prt.team_id),
      prt.reset_token, prt.expires_at, prt.used_at, prt.created_at
    FROM t_password_reset_tokens prt
    LEFT JOIN _team_id_mapping m ON prt.team_id = m.old_id
    WHERE COALESCE(m.new_id, prt.team_id) IN (SELECT team_id FROM m_teams_new)
  `);
  const prtCount = await db.execute("SELECT COUNT(*) as cnt FROM t_password_reset_tokens_new");
  console.log(`  t_password_reset_tokens_new: ${prtCount.rows[0].cnt}件`);

  // t_team_invitations_new
  await db.execute("DROP TABLE IF EXISTS t_team_invitations_new");
  await db.execute(`CREATE TABLE t_team_invitations_new (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    team_id text NOT NULL,
    invited_by_login_user_id integer NOT NULL,
    invited_email text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    expires_at numeric NOT NULL,
    accepted_at numeric,
    created_at numeric DEFAULT (datetime('now', '+9 hours'))
  )`);
  await db.execute(`
    INSERT INTO t_team_invitations_new
    SELECT ti.id,
      COALESCE(m.new_id, ti.team_id),
      ti.invited_by_login_user_id, ti.invited_email, ti.token, ti.status,
      ti.expires_at, ti.accepted_at, ti.created_at
    FROM t_team_invitations ti
    LEFT JOIN _team_id_mapping m ON ti.team_id = m.old_id
  `);
  const tiCount = await db.execute("SELECT COUNT(*) as cnt FROM t_team_invitations_new");
  console.log(`  t_team_invitations_new: ${tiCount.rows[0].cnt}件`);

  // STEP 4: 旧テーブルDROP→新テーブルRENAMEをバッチで一括実行
  console.log("\n[STEP 4] 旧テーブル削除＆リネーム (バッチ実行)\n");

  await db.batch(
    [
      // 子テーブルを先に削除
      "DROP TABLE IF EXISTS t_tournament_players",
      "DROP TABLE IF EXISTS t_tournament_teams",
      "DROP TABLE IF EXISTS t_password_reset_tokens",
      "DROP TABLE IF EXISTS t_team_invitations",
      "DROP TABLE IF EXISTS m_players",
      // 親テーブルを削除
      "DROP TABLE IF EXISTS m_teams",
      // 親テーブルから先にリネーム
      "ALTER TABLE m_teams_new RENAME TO m_teams",
      "ALTER TABLE m_players_new RENAME TO m_players",
      "ALTER TABLE t_tournament_teams_new RENAME TO t_tournament_teams",
      "ALTER TABLE t_tournament_players_new RENAME TO t_tournament_players",
      "ALTER TABLE t_password_reset_tokens_new RENAME TO t_password_reset_tokens",
      "ALTER TABLE t_team_invitations_new RENAME TO t_team_invitations",
    ],
    "write",
  );

  console.log("  ✓ バッチ実行完了");

  // STEP 5: クリーンアップ
  await db.execute("DROP TABLE IF EXISTS _team_id_mapping");
  console.log("  ✓ マッピングテーブル削除");

  // STEP 6: 整合性チェック
  console.log("\n[STEP 5] 整合性チェック\n");

  const nonUuid = await db.execute(
    "SELECT COUNT(*) as cnt FROM m_teams WHERE length(team_id) != 36",
  );
  console.log(`  UUID形式でないteam_id: ${nonUuid.rows[0].cnt}件`);

  for (const [table, col] of [
    ["t_tournament_teams", "team_id"],
    ["t_tournament_players", "team_id"],
    ["m_players", "current_team_id"],
  ] as const) {
    const orphans = await db.execute(
      `SELECT COUNT(*) as cnt FROM ${table} WHERE ${col} IS NOT NULL AND ${col} NOT IN (SELECT team_id FROM m_teams)`,
    );
    console.log(`  ${table}.${col} 孤立: ${orphans.rows[0].cnt}件`);
  }

  // 件数確認
  console.log("\n  --- 件数確認 ---");
  for (const table of [
    "m_teams",
    "m_players",
    "t_tournament_teams",
    "t_tournament_players",
    "t_password_reset_tokens",
    "t_team_invitations",
  ]) {
    const cnt = await db.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
    console.log(`  ${table}: ${cnt.rows[0].cnt}件`);
  }

  // サンプル表示
  console.log("\n[STEP 6] サンプル確認\n");
  const sample = await db.execute("SELECT team_id, team_name FROM m_teams LIMIT 5");
  sample.rows.forEach((r) => console.log("  " + r.team_id + " → " + r.team_name));

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  ✅ 完了: ${mapping.size}件のteam_idをUUID化`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  db.close();
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
