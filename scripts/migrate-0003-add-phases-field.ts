/**
 * マイグレーション 0003_rapid_stephen_strange.sql 対応スクリプト
 *
 * m_tournament_formatsテーブルに追加されたphasesフィールドに
 * preliminary_format_typeとfinal_format_typeから自動生成したデータを設定する
 *
 * 使用方法:
 *   npx tsx scripts/migrate-0003-add-phases-field.ts [環境]
 *
 * 環境:
 *   dev  - 開発環境（デフォルト）
 *   stag - ステージング環境
 *   main - 本番環境
 *
 * 例:
 *   npx tsx scripts/migrate-0003-add-phases-field.ts stag
 *   npx tsx scripts/migrate-0003-add-phases-field.ts main
 */

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// 環境に応じた接続情報を取得
const env = process.argv[2] || "stag";
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

interface TournamentFormat {
  format_id: number;
  format_name: string;
  preliminary_format_type: string | null;
  final_format_type: string | null;
  phases: string | null;
}

interface TournamentPhase {
  id: string;
  order: number;
  name: string;
  format_type: "league" | "tournament";
}

interface TournamentPhases {
  phases: TournamentPhase[];
}

/**
 * format_typeの値を正規化する
 * 'league', 'リーグ戦' -> 'league'
 * 'tournament', 'トーナメント' -> 'tournament'
 */
function normalizeFormatType(formatType: string | null): "league" | "tournament" | null {
  if (!formatType) return null;

  const normalized = formatType.toLowerCase();
  if (normalized.includes("league") || normalized.includes("リーグ")) {
    return "league";
  }
  if (normalized.includes("tournament") || normalized.includes("トーナメント")) {
    return "tournament";
  }

  return null;
}

/**
 * preliminary_format_typeとfinal_format_typeから
 * phasesオブジェクトを生成する
 */
function generatePhases(
  preliminaryType: string | null,
  finalType: string | null,
): TournamentPhases | null {
  const phases: TournamentPhase[] = [];

  // 予選フェーズ
  if (preliminaryType) {
    const formatType = normalizeFormatType(preliminaryType);
    if (formatType) {
      phases.push({
        id: "preliminary",
        order: 1,
        name: "予選",
        format_type: formatType,
      });
    }
  }

  // 決勝フェーズ
  if (finalType) {
    const formatType = normalizeFormatType(finalType);
    if (formatType) {
      phases.push({
        id: "final",
        order: phases.length + 1,
        name: "決勝トーナメント",
        format_type: formatType,
      });
    }
  }

  if (phases.length === 0) {
    return null;
  }

  return { phases };
}

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  マイグレーション 0003: phases フィールド移行 (環境: ${env})`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    // 現在のデータを取得
    console.log("📖 現在のm_tournament_formatsデータを取得中...\n");
    const result = await db.execute(`
      SELECT
        format_id,
        format_name,
        preliminary_format_type,
        final_format_type,
        phases
      FROM m_tournament_formats
      ORDER BY format_id
    `);

    const formats = result.rows as unknown as TournamentFormat[];
    console.log(`✓ ${formats.length}件のフォーマットを取得しました\n`);

    // 各フォーマットを処理
    let updatedCount = 0;
    let skippedCount = 0;

    for (const format of formats) {
      console.log(`\n📋 フォーマットID ${format.format_id}: ${format.format_name}`);
      console.log(`   preliminary_format_type: ${format.preliminary_format_type || "(null)"}`);
      console.log(`   final_format_type: ${format.final_format_type || "(null)"}`);
      console.log(`   現在のphases: ${format.phases || "(null)"}`);

      // phasesが既に設定されている場合はスキップ
      if (format.phases) {
        console.log(`   ⊘ スキップ: phasesは既に設定されています`);
        skippedCount++;
        continue;
      }

      // phasesオブジェクトを生成
      const phases = generatePhases(format.preliminary_format_type, format.final_format_type);

      if (!phases) {
        console.log(`   ⊘ スキップ: 有効なformat_typeが見つかりません`);
        skippedCount++;
        continue;
      }

      const phasesJson = JSON.stringify(phases);
      console.log(`   生成されたphases: ${phasesJson}`);

      // データベースを更新
      await db.execute({
        sql: `UPDATE m_tournament_formats SET phases = ? WHERE format_id = ?`,
        args: [phasesJson, format.format_id],
      });

      console.log(`   ✓ 更新完了`);
      updatedCount++;
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  ✅ 移行完了");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`更新: ${updatedCount}件`);
    console.log(`スキップ: ${skippedCount}件`);
    console.log(`合計: ${formats.length}件\n`);

    // 更新後のデータを確認
    console.log("📊 更新後のデータ確認:\n");
    const verifyResult = await db.execute(`
      SELECT
        format_id,
        format_name,
        phases
      FROM m_tournament_formats
      WHERE phases IS NOT NULL
      ORDER BY format_id
    `);

    const updatedFormats = verifyResult.rows as unknown as TournamentFormat[];
    for (const format of updatedFormats) {
      console.log(`ID ${format.format_id}: ${format.format_name}`);
      console.log(`  ${format.phases}\n`);
    }
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
