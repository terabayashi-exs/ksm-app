/**
 * t_matches_live.court_name がNULLの行にコート名を一括登録
 * - t_tournament_courts にマッピングがある場合はそれを使用
 * - ない場合は "コート{court_number}" を設定
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
  console.log(`\n=== court_name一括登録 (環境: ${env}) ===\n`);

  // 1. t_tournament_courts のマッピングがある場合はそれを使ってUPDATE
  const courtMappings = await db.execute(
    "SELECT tournament_id, court_number, court_name FROM t_tournament_courts WHERE court_name IS NOT NULL AND is_active = 1",
  );

  if (courtMappings.rows.length > 0) {
    console.log(`📋 t_tournament_courts のマッピング: ${courtMappings.rows.length}件`);
    for (const row of courtMappings.rows) {
      const result = await db.execute({
        sql: `UPDATE t_matches_live SET court_name = ?
              WHERE court_name IS NULL AND court_number = ?
              AND match_id IN (
                SELECT ml.match_id FROM t_matches_live ml
                JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
                WHERE mb.tournament_id = ? AND ml.court_number = ?
              )`,
        args: [
          row.court_name as string,
          row.court_number as number,
          row.tournament_id as number,
          row.court_number as number,
        ],
      });
      if (result.rowsAffected > 0) {
        console.log(
          `  ✓ tournament_id=${row.tournament_id}, court_number=${row.court_number} → "${row.court_name}": ${result.rowsAffected}件更新`,
        );
      }
    }
  } else {
    console.log("📋 t_tournament_courts のマッピングなし");
  }

  // 2. 残りのNULLを "コート{N}" で埋める
  const remaining = await db.execute(
    "SELECT COUNT(*) as cnt FROM t_matches_live WHERE court_name IS NULL AND court_number IS NOT NULL",
  );
  const cnt = Number(remaining.rows[0].cnt);
  console.log(`\n📝 court_name=NULL かつ court_number≠NULL: ${cnt}件`);

  if (cnt > 0) {
    const result = await db.execute(
      "UPDATE t_matches_live SET court_name = 'コート' || court_number WHERE court_name IS NULL AND court_number IS NOT NULL",
    );
    console.log(`  ✓ ${result.rowsAffected}件を "コート{N}" で更新`);
  }

  // 3. court_number=NULLのケースも確認
  const nullCourt = await db.execute(
    "SELECT COUNT(*) as cnt FROM t_matches_live WHERE court_number IS NULL",
  );
  console.log(`\n📝 court_number=NULL: ${nullCourt.rows[0].cnt}件（スキップ）`);

  // 4. 検証
  console.log("\n✅ 検証...");
  const verify = await db.execute(
    "SELECT court_number, court_name, COUNT(*) as cnt FROM t_matches_live GROUP BY court_number, court_name ORDER BY court_number, court_name",
  );
  for (const row of verify.rows) {
    console.log(
      `  court_number=${row.court_number}, court_name=${JSON.stringify(row.court_name)}, count=${row.cnt}`,
    );
  }

  // 5. t_matches_final も同様に更新
  const finalNull = await db.execute(
    "SELECT COUNT(*) as cnt FROM t_matches_final WHERE court_name IS NULL AND court_number IS NOT NULL",
  );
  const finalCnt = Number(finalNull.rows[0].cnt);
  console.log(`\n📝 t_matches_final: court_name=NULL かつ court_number≠NULL: ${finalCnt}件`);

  if (finalCnt > 0) {
    // t_tournament_courts マッピングで更新
    for (const row of courtMappings.rows) {
      await db.execute({
        sql: `UPDATE t_matches_final SET court_name = ?
              WHERE court_name IS NULL AND court_number = ?
              AND match_id IN (
                SELECT mf.match_id FROM t_matches_final mf
                JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
                WHERE mb.tournament_id = ? AND mf.court_number = ?
              )`,
        args: [
          row.court_name as string,
          row.court_number as number,
          row.tournament_id as number,
          row.court_number as number,
        ],
      });
    }
    // 残りを "コート{N}" で
    const result = await db.execute(
      "UPDATE t_matches_final SET court_name = 'コート' || court_number WHERE court_name IS NULL AND court_number IS NOT NULL",
    );
    console.log(`  ✓ ${result.rowsAffected}件を更新`);
  }

  console.log("\n=== 完了 ===\n");
}

run().catch(console.error);
