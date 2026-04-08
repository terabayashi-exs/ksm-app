#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

// 環境変数の読み込み
require("dotenv").config({ path: ".env.local" });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function clearTables() {
  console.log("📝 既存データを削除中...");

  // 依存関係のある順番で削除
  await client.execute("DELETE FROM m_match_templates");
  await client.execute("DELETE FROM m_tournament_formats");
  await client.execute("DELETE FROM m_venues");

  console.log("✅ 既存データを削除しました");
}

async function seedVenues() {
  const venuesPath = path.join(__dirname, "../data/venues.json");
  if (!fs.existsSync(venuesPath)) {
    console.log("⚠️  venues.json が見つかりません。スキップします。");
    return;
  }

  const venues = JSON.parse(fs.readFileSync(venuesPath, "utf8"));
  console.log(`📍 ${venues.length}件の会場データを登録中...`);

  for (const venue of venues) {
    await client.execute({
      sql: `INSERT INTO m_venues (venue_name, address, available_courts, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [venue.venue_name, venue.address, venue.available_courts, venue.is_active],
    });
  }

  console.log("✅ 会場データを登録しました");
}

async function seedTournamentFormats() {
  const formatsPath = path.join(__dirname, "../data/tournament_formats.json");
  if (!fs.existsSync(formatsPath)) {
    console.log("⚠️  tournament_formats.json が見つかりません。スキップします。");
    return;
  }

  const formats = JSON.parse(fs.readFileSync(formatsPath, "utf8"));
  console.log(`🏆 ${formats.length}件の大会フォーマットデータを登録中...`);

  for (const format of formats) {
    await client.execute({
      sql: `INSERT INTO m_tournament_formats (format_name, target_team_count, format_description, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      args: [format.format_name, format.target_team_count, format.format_description],
    });
  }

  console.log("✅ 大会フォーマットデータを登録しました");
}

async function seedMatchTemplates() {
  const templatesPath = path.join(__dirname, "../data/match_templates.json");
  if (!fs.existsSync(templatesPath)) {
    console.log("⚠️  match_templates.json が見つかりません。スキップします。");
    return;
  }

  // 登録されたフォーマットIDを取得
  const formatResult = await client.execute(
    "SELECT format_id FROM m_tournament_formats ORDER BY format_id DESC LIMIT 1",
  );
  if (formatResult.rows.length === 0) {
    console.log("⚠️  大会フォーマットが登録されていません。試合テンプレートをスキップします。");
    return;
  }

  const actualFormatId = formatResult.rows[0].format_id;
  console.log(`📋 使用するフォーマットID: ${actualFormatId}`);

  const templates = JSON.parse(fs.readFileSync(templatesPath, "utf8"));
  console.log(`⚽ ${templates.length}件の試合テンプレートデータを登録中...`);

  for (const template of templates) {
    await client.execute({
      sql: `INSERT INTO m_match_templates (
              format_id, match_number, match_code, match_type, phase, round_name, block_name,
              team1_source, team2_source, team1_display_name, team2_display_name,
              day_number, execution_priority, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        actualFormatId, // JSONのformat_idの代わりに実際のIDを使用
        template.match_number,
        template.match_code,
        template.match_type,
        template.phase,
        template.round_name,
        template.block_name,
        template.team1_source,
        template.team2_source,
        template.team1_display_name,
        template.team2_display_name,
        template.day_number,
        template.execution_priority,
      ],
    });
  }

  console.log("✅ 試合テンプレートデータを登録しました");
}

async function main() {
  try {
    console.log("🚀 マスターデータの登録を開始します...\n");

    await clearTables();
    console.log("");

    await seedVenues();
    await seedTournamentFormats();
    await seedMatchTemplates();

    console.log("\n🎉 マスターデータの登録が完了しました！");

    // 登録結果の確認
    const venueCount = await client.execute("SELECT COUNT(*) as count FROM m_venues");
    const formatCount = await client.execute("SELECT COUNT(*) as count FROM m_tournament_formats");
    const templateCount = await client.execute("SELECT COUNT(*) as count FROM m_match_templates");

    console.log("\n📊 登録結果:");
    console.log(`   会場: ${venueCount.rows[0].count}件`);
    console.log(`   大会フォーマット: ${formatCount.rows[0].count}件`);
    console.log(`   試合テンプレート: ${templateCount.rows[0].count}件`);
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    process.exit(1);
  }
}

main();
