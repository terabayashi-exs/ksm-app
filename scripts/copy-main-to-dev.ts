import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// main環境（読み取り元）
const mainDb = createClient({
  url: process.env.DATABASE_URL_MAIN!,
  authToken: process.env.DATABASE_AUTH_TOKEN_MAIN,
});

// dev環境（書き込み先）
const devDb = createClient({
  url: process.env.DATABASE_URL_DEV!,
  authToken: process.env.DATABASE_AUTH_TOKEN_DEV,
});

const TARGET_TOURNAMENT_ID = 80;

async function copyMainToDev() {
  try {
    console.log("=== main → dev データコピースクリプト開始 ===\n");

    // 1. main環境から部門ID:80のデータを取得
    console.log("1. main環境から部門データを取得中...");
    const tournament = await mainDb.execute({
      sql: "SELECT * FROM t_tournaments WHERE tournament_id = ?",
      args: [TARGET_TOURNAMENT_ID],
    });

    if (tournament.rows.length === 0) {
      throw new Error(`tournament_id:${TARGET_TOURNAMENT_ID} がmain環境に見つかりません`);
    }

    const t: any = tournament.rows[0];
    console.log(`部門名: ${t.tournament_name}`);
    console.log(`group_id: ${t.group_id}`);

    // 2. 大会グループのデータを取得
    console.log("\n2. 大会グループデータを取得中...");
    const group = await mainDb.execute({
      sql: "SELECT * FROM t_tournament_groups WHERE group_id = ?",
      args: [t.group_id],
    });

    if (group.rows.length === 0) {
      throw new Error(`group_id:${t.group_id} がmain環境に見つかりません`);
    }

    const g: any = group.rows[0];
    console.log(`大会名: ${g.group_name}`);
    console.log(`主催者: ${g.organizer}`);
    console.log(`管理者: ${g.admin_login_id} / login_user_id: ${g.login_user_id}`);

    // 3. 同じgroup_idに属する全部門を取得
    console.log("\n3. 同じ大会グループの全部門を取得中...");
    const allTournaments = await mainDb.execute({
      sql: "SELECT * FROM t_tournaments WHERE group_id = ? ORDER BY tournament_id",
      args: [t.group_id],
    });
    console.log(`部門数: ${allTournaments.rows.length}`);
    allTournaments.rows.forEach((row: any) => {
      console.log(`  - tournament_id: ${row.tournament_id}, name: ${row.tournament_name}`);
    });

    // 4. トーナメントルールを取得
    console.log("\n4. トーナメントルールを取得中...");
    const allRules: any[] = [];
    for (const tr of allTournaments.rows) {
      const rules = await mainDb.execute({
        sql: "SELECT * FROM t_tournament_rules WHERE tournament_id = ?",
        args: [(tr as any).tournament_id],
      });
      allRules.push({ tournamentId: (tr as any).tournament_id, rules: rules.rows });
      console.log(
        `  - tournament_id: ${(tr as any).tournament_id}: ${rules.rows.length}件のルール`,
      );
    }

    // === dev環境への書き込み ===

    // 5. dev環境に大会グループが既に存在するか確認
    console.log("\n5. dev環境にデータを作成中...");

    const existingGroup = await devDb.execute({
      sql: "SELECT * FROM t_tournament_groups WHERE group_id = ?",
      args: [g.group_id],
    });

    if (existingGroup.rows.length > 0) {
      console.log(`⚠️  group_id:${g.group_id} は既にdev環境に存在します。スキップします。`);

      // 部門も確認
      const existingTournament = await devDb.execute({
        sql: "SELECT * FROM t_tournaments WHERE tournament_id = ?",
        args: [TARGET_TOURNAMENT_ID],
      });
      if (existingTournament.rows.length > 0) {
        console.log(`⚠️  tournament_id:${TARGET_TOURNAMENT_ID} も既にdev環境に存在します。`);
        console.log("処理を中止します。既存データを削除してから再実行してください。");
        return;
      }
    }

    // 6. 管理者/ログインユーザーの存在確認
    if (g.admin_login_id) {
      const adminExists = await devDb.execute({
        sql: "SELECT admin_login_id FROM m_administrators WHERE admin_login_id = ?",
        args: [g.admin_login_id],
      });
      if (adminExists.rows.length === 0) {
        console.log(
          `⚠️  管理者 ${g.admin_login_id} がdev環境に存在しません。admin_login_idをNULLにして作成します。`,
        );
        g.admin_login_id = null;
      }
    }

    if (g.login_user_id) {
      const userExists = await devDb.execute({
        sql: "SELECT login_user_id FROM m_login_users WHERE login_user_id = ?",
        args: [g.login_user_id],
      });
      if (userExists.rows.length === 0) {
        console.log(
          `⚠️  ログインユーザー ${g.login_user_id} がdev環境に存在しません。login_user_idをNULLにして作成します。`,
        );
        g.login_user_id = null;
      }
    }

    // 7. 会場の存在確認
    if (g.venue_id) {
      const venueExists = await devDb.execute({
        sql: "SELECT venue_id FROM m_venues WHERE venue_id = ?",
        args: [g.venue_id],
      });
      if (venueExists.rows.length === 0) {
        console.log(
          `⚠️  会場 venue_id:${g.venue_id} がdev環境に存在しません。mainからコピーします...`,
        );
        const venue = await mainDb.execute({
          sql: "SELECT * FROM m_venues WHERE venue_id = ?",
          args: [g.venue_id],
        });
        if (venue.rows.length > 0) {
          const v: any = venue.rows[0];
          await devDb.execute({
            sql: `INSERT OR IGNORE INTO m_venues (
              venue_id, venue_name, address, prefecture_id, available_courts,
              google_maps_url, latitude, longitude, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
            args: [
              v.venue_id,
              v.venue_name,
              v.address,
              v.prefecture_id,
              v.available_courts,
              v.google_maps_url,
              v.latitude,
              v.longitude,
            ],
          });
          console.log(`  会場をコピーしました: ${v.venue_name}`);
        }
      }
    }

    // 8. 大会グループをINSERT（IDを保持）
    if (existingGroup.rows.length === 0) {
      console.log("\n6. 大会グループを作成中...");
      await devDb.execute({
        sql: `INSERT INTO t_tournament_groups (
          group_id, group_name, organizer, venue_id, event_start_date, event_end_date,
          recruitment_start_date, recruitment_end_date, visibility,
          event_description, admin_login_id, login_user_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
        args: [
          g.group_id,
          g.group_name,
          g.organizer,
          g.venue_id,
          g.event_start_date,
          g.event_end_date,
          g.recruitment_start_date,
          g.recruitment_end_date,
          g.visibility,
          g.event_description,
          g.admin_login_id,
          g.login_user_id,
        ],
      });
      console.log(`✅ 大会グループを作成: group_id=${g.group_id}, ${g.group_name}`);
    }

    // 9. 部門をINSERT（IDを保持）
    console.log("\n7. 部門を作成中...");

    // フォーマットの存在確認
    const formatIds = new Set(allTournaments.rows.map((r: any) => r.format_id));
    for (const formatId of formatIds) {
      const formatExists = await devDb.execute({
        sql: "SELECT format_id FROM m_tournament_formats WHERE format_id = ?",
        args: [formatId],
      });
      if (formatExists.rows.length === 0) {
        console.log(
          `⚠️  フォーマット format_id:${formatId} がdev環境に存在しません。mainからコピーします...`,
        );
        const format = await mainDb.execute({
          sql: "SELECT * FROM m_tournament_formats WHERE format_id = ?",
          args: [formatId],
        });
        if (format.rows.length > 0) {
          const f: any = format.rows[0];
          await devDb.execute({
            sql: `INSERT OR IGNORE INTO m_tournament_formats (
              format_id, format_name, target_team_count, format_description,
              phases, visibility, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
            args: [
              f.format_id,
              f.format_name,
              f.target_team_count,
              f.format_description,
              f.phases,
              f.visibility,
            ],
          });
          console.log(`  フォーマットをコピーしました: ${f.format_name}`);
        }
      }
    }

    for (const tr of allTournaments.rows) {
      const td: any = tr;

      // 既にdev環境に存在するか確認
      const existing = await devDb.execute({
        sql: "SELECT tournament_id FROM t_tournaments WHERE tournament_id = ?",
        args: [td.tournament_id],
      });
      if (existing.rows.length > 0) {
        console.log(`  ⚠️  tournament_id:${td.tournament_id} は既に存在します。スキップ。`);
        continue;
      }

      await devDb.execute({
        sql: `INSERT INTO t_tournaments (
          tournament_id, tournament_name, format_id, format_name, venue_id, team_count, court_count,
          tournament_dates, match_duration_minutes, break_duration_minutes,
          status, visibility, public_start_date, recruitment_start_date, recruitment_end_date,
          sport_type_id, created_by, archive_ui_version, is_archived,
          files_count, group_order, category_name, group_id, show_players_public,
          phases, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
        args: [
          td.tournament_id,
          td.tournament_name,
          td.format_id,
          td.format_name || null,
          td.venue_id,
          td.team_count,
          td.court_count,
          td.tournament_dates,
          td.match_duration_minutes,
          td.break_duration_minutes,
          td.status,
          td.visibility,
          td.public_start_date,
          td.recruitment_start_date,
          td.recruitment_end_date,
          td.sport_type_id,
          td.created_by,
          td.archive_ui_version,
          td.is_archived || 0,
          td.files_count || 0,
          td.group_order,
          td.category_name,
          td.group_id,
          td.show_players_public || 0,
          td.phases ? JSON.stringify(td.phases) : null,
        ],
      });
      console.log(`✅ 部門を作成: tournament_id=${td.tournament_id}, ${td.tournament_name}`);
    }

    // 10. トーナメントルールをINSERT
    console.log("\n8. トーナメントルールを作成中...");
    for (const ruleSet of allRules) {
      for (const rule of ruleSet.rules) {
        const r: any = rule;

        // 既存チェック
        const existingRule = await devDb.execute({
          sql: "SELECT tournament_rule_id FROM t_tournament_rules WHERE tournament_id = ? AND phase = ?",
          args: [ruleSet.tournamentId, r.phase],
        });
        if (existingRule.rows.length > 0) {
          console.log(
            `  ⚠️  tournament_id:${ruleSet.tournamentId}, phase:${r.phase} のルールは既に存在。スキップ。`,
          );
          continue;
        }

        await devDb.execute({
          sql: `INSERT INTO t_tournament_rules (
            tournament_id, phase, use_extra_time, use_penalty, active_periods,
            notes, point_system, walkover_settings, tie_breaking_rules,
            tie_breaking_enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
          args: [
            ruleSet.tournamentId,
            r.phase,
            r.use_extra_time,
            r.use_penalty,
            r.active_periods,
            r.notes,
            r.point_system,
            r.walkover_settings,
            r.tie_breaking_rules,
            r.tie_breaking_enabled,
          ],
        });
      }
      if (ruleSet.rules.length > 0) {
        console.log(
          `✅ ルールを作成: tournament_id=${ruleSet.tournamentId} (${ruleSet.rules.length}件)`,
        );
      }
    }

    // 11. 表示設定（t_display_settings）のコピー
    console.log("\n9. 表示設定を確認中...");
    for (const tr of allTournaments.rows) {
      const td: any = tr;
      const displaySettings = await mainDb.execute({
        sql: "SELECT * FROM t_display_settings WHERE tournament_id = ?",
        args: [td.tournament_id],
      });

      for (const ds of displaySettings.rows) {
        const d: any = ds;
        await devDb.execute({
          sql: `INSERT OR IGNORE INTO t_display_settings (
            tournament_id, setting_key, setting_value, created_at, updated_at
          ) VALUES (?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
          args: [d.tournament_id, d.setting_key, d.setting_value],
        });
      }

      if (displaySettings.rows.length > 0) {
        console.log(
          `✅ 表示設定をコピー: tournament_id=${td.tournament_id} (${displaySettings.rows.length}件)`,
        );
      }
    }

    console.log("\n=== コピー完了 ===");
    console.log(`大会グループ: group_id=${g.group_id}, ${g.group_name}`);
    console.log(`部門数: ${allTournaments.rows.length}`);
    console.log("※ チーム情報・組合せ情報はスキップしました");
  } catch (error) {
    console.error("エラーが発生しました:", error);
    throw error;
  }
}

copyMainToDev().catch(console.error);
