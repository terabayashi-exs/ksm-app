/**
 * マイグレーションスクリプト: 0025 - preliminary_format_type / final_format_type カラム削除
 *
 * 前提: バックフィルスクリプト (backfill-phases-from-legacy.ts) を先に実行し、
 *       全レコードの phases が設定済みであること。
 *
 * 使用方法:
 *   npx tsx scripts/migrate-0025-drop-format-type-legacy.ts          # dev環境
 *   npx tsx scripts/migrate-0025-drop-format-type-legacy.ts stag     # stag環境
 *   npx tsx scripts/migrate-0025-drop-format-type-legacy.ts main     # main環境
 */

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const env = process.argv[2] || "dev";
const envSuffix = env === "dev" ? "" : `_${env.toUpperCase()}`;

const url = process.env[`DATABASE_URL${envSuffix}`] || process.env.DATABASE_URL;
const authToken = process.env[`DATABASE_AUTH_TOKEN${envSuffix}`] || process.env.DATABASE_AUTH_TOKEN;

if (!url || !authToken) {
  console.error(
    `❌ 環境変数が見つかりません: DATABASE_URL${envSuffix}, DATABASE_AUTH_TOKEN${envSuffix}`,
  );
  process.exit(1);
}

const client = createClient({ url, authToken });

async function migrate() {
  console.log(`🔄 マイグレーション0025開始: ${env}環境`);
  console.log(`   URL: ${url}`);

  // 1. バックフィル確認
  const formatsCheck = await client.execute(
    `SELECT COUNT(*) as count FROM m_tournament_formats WHERE phases IS NULL`,
  );
  const tournamentsCheck = await client.execute(
    `SELECT COUNT(*) as count FROM t_tournaments WHERE phases IS NULL`,
  );

  if (Number(formatsCheck.rows[0].count) > 0 || Number(tournamentsCheck.rows[0].count) > 0) {
    console.error(`❌ phases IS NULL のレコードが残っています！`);
    console.error(`   m_tournament_formats: ${formatsCheck.rows[0].count}件`);
    console.error(`   t_tournaments: ${tournamentsCheck.rows[0].count}件`);
    console.error(`\n   先に backfill-phases-from-legacy.ts を実行してください。`);
    process.exit(1);
  }

  console.log(`   ✅ バックフィル確認OK（全レコードに phases が設定済み）`);

  // 2. DROP COLUMN 実行
  const statements = [
    `ALTER TABLE m_tournament_formats DROP COLUMN preliminary_format_type`,
    `ALTER TABLE m_tournament_formats DROP COLUMN final_format_type`,
    `ALTER TABLE t_tournaments DROP COLUMN preliminary_format_type`,
    `ALTER TABLE t_tournaments DROP COLUMN final_format_type`,
  ];

  for (const sql of statements) {
    try {
      await client.execute(sql);
      console.log(`   ✅ ${sql}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // カラムが既に存在しない場合はスキップ
      if (message.includes("no such column") || message.includes("No such column")) {
        console.log(`   ⏭️ スキップ（カラム未存在）: ${sql}`);
      } else {
        console.error(`   ❌ エラー: ${sql}`);
        throw error;
      }
    }
  }

  console.log(`\n✅ マイグレーション0025完了`);
}

migrate().catch((error) => {
  console.error("❌ マイグレーションエラー:", error);
  process.exit(1);
});
