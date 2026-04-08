/**
 * バックフィルスクリプト: preliminary_format_type / final_format_type → phases
 *
 * phases が NULL のレコードに対して、レガシーフィールドから phases JSON を生成して埋める。
 * 対象テーブル: m_tournament_formats, t_tournaments
 *
 * 使用方法:
 *   npx tsx scripts/backfill-phases-from-legacy.ts          # dev環境
 *   npx tsx scripts/backfill-phases-from-legacy.ts stag     # stag環境
 *   npx tsx scripts/backfill-phases-from-legacy.ts main     # main環境
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

interface PhaseEntry {
  id: string;
  order: number;
  name: string;
  format_type: string;
}

function generatePhasesFromLegacy(
  preliminaryType: string | null,
  finalType: string | null,
): { phases: PhaseEntry[] } {
  const phases: PhaseEntry[] = [];

  if (preliminaryType && preliminaryType !== "none") {
    phases.push({
      id: "preliminary",
      order: 1,
      name: "予選",
      format_type: preliminaryType,
    });
  }

  if (finalType && finalType !== "none") {
    phases.push({
      id: "final",
      order: phases.length + 1,
      name: "決勝トーナメント",
      format_type: finalType,
    });
  }

  return { phases };
}

async function backfill() {
  console.log(`🔄 バックフィル開始: ${env}環境`);
  console.log(`   URL: ${url}`);

  // 1. m_tournament_formats
  const formatsResult = await client.execute(
    `SELECT format_id, preliminary_format_type, final_format_type, phases FROM m_tournament_formats WHERE phases IS NULL`,
  );

  console.log(`\n📋 m_tournament_formats: phases IS NULL = ${formatsResult.rows.length}件`);

  for (const row of formatsResult.rows) {
    const phasesJson = generatePhasesFromLegacy(
      row.preliminary_format_type as string | null,
      row.final_format_type as string | null,
    );

    await client.execute({
      sql: `UPDATE m_tournament_formats SET phases = ? WHERE format_id = ?`,
      args: [JSON.stringify(phasesJson), row.format_id as number],
    });

    console.log(
      `   ✅ format_id=${row.format_id}: preliminary=${row.preliminary_format_type}, final=${row.final_format_type} → ${JSON.stringify(phasesJson)}`,
    );
  }

  // 2. t_tournaments
  const tournamentsResult = await client.execute(
    `SELECT tournament_id, preliminary_format_type, final_format_type, phases FROM t_tournaments WHERE phases IS NULL`,
  );

  console.log(`\n📋 t_tournaments: phases IS NULL = ${tournamentsResult.rows.length}件`);

  for (const row of tournamentsResult.rows) {
    const phasesJson = generatePhasesFromLegacy(
      row.preliminary_format_type as string | null,
      row.final_format_type as string | null,
    );

    await client.execute({
      sql: `UPDATE t_tournaments SET phases = ? WHERE tournament_id = ?`,
      args: [JSON.stringify(phasesJson), row.tournament_id as number],
    });

    console.log(
      `   ✅ tournament_id=${row.tournament_id}: preliminary=${row.preliminary_format_type}, final=${row.final_format_type} → ${JSON.stringify(phasesJson)}`,
    );
  }

  // 3. 検証
  const formatsCheck = await client.execute(
    `SELECT COUNT(*) as count FROM m_tournament_formats WHERE phases IS NULL`,
  );
  const tournamentsCheck = await client.execute(
    `SELECT COUNT(*) as count FROM t_tournaments WHERE phases IS NULL`,
  );

  console.log(`\n✅ バックフィル完了`);
  console.log(`   m_tournament_formats: phases IS NULL = ${formatsCheck.rows[0].count}件`);
  console.log(`   t_tournaments: phases IS NULL = ${tournamentsCheck.rows[0].count}件`);

  if (Number(formatsCheck.rows[0].count) > 0 || Number(tournamentsCheck.rows[0].count) > 0) {
    console.error(`\n⚠️ まだ phases IS NULL のレコードが残っています！`);
    process.exit(1);
  }
}

backfill().catch((error) => {
  console.error("❌ バックフィルエラー:", error);
  process.exit(1);
});
