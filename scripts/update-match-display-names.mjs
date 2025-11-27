#!/usr/bin/env node

/**
 * 既存試合データのdisplay_name更新スクリプト
 *
 * 目的: 組合せ保存済みの大会について、team1_display_name と team2_display_name を
 *       「A1チーム」「A2チーム」から実際のチーム名に更新する
 *
 * 実行方法:
 *   開発環境: node scripts/update-match-display-names.mjs
 *   本番環境: DATABASE_URL="<本番URL>" DATABASE_AUTH_TOKEN="<本番トークン>" node scripts/update-match-display-names.mjs
 *
 * 注意事項:
 *   - このスクリプトは既存データを直接更新します
 *   - 実行前にバックアップを推奨します
 *   - 予選リーグ（phase='preliminary'）の試合のみが対象です
 */

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL || 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: process.env.DATABASE_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

/**
 * 表示名から実際のチーム名を取得する関数
 */
async function getTeamNameByPosition(tournamentId, blockName, displayName) {
  // "A1チーム" -> ブロックA、1番目のチーム
  const match = displayName.match(/^([A-Z])(\d+)チーム$/);
  if (!match) return null;

  const [, expectedBlockName, position] = match;
  if (expectedBlockName !== blockName) return null;

  const positionNum = parseInt(position);

  // COALESCE関数で大会固有のチーム名を優先し、なければマスターチーム名を使用
  const result = await db.execute({
    sql: `
      SELECT COALESCE(tt.team_omission, tt.team_name) as team_name
      FROM t_tournament_teams tt
      WHERE tt.tournament_id = ? AND tt.assigned_block = ? AND tt.block_position = ?
    `,
    args: [tournamentId, blockName, positionNum]
  });

  return result.rows.length > 0 ? result.rows[0].team_name : null;
}

/**
 * 特定の大会の試合表示名を更新する
 */
async function updateTournamentMatches(tournamentId) {
  console.log(`\n大会ID ${tournamentId} の試合データを更新中...`);

  // 予選リーグの試合データを取得
  const matchesResult = await db.execute({
    sql: `
      SELECT
        ml.match_id,
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        mb.block_name
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND mb.phase = 'preliminary'
    `,
    args: [tournamentId]
  });

  if (matchesResult.rows.length === 0) {
    console.log(`  ⚠️  予選試合が見つかりません`);
    return { updated: 0, skipped: 0, errors: 0 };
  }

  console.log(`  対象試合数: ${matchesResult.rows.length}`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // 各試合について表示名を更新
  for (const match of matchesResult.rows) {
    try {
      const blockName = match.block_name;
      const team1DisplayName = match.team1_display_name;
      const team2DisplayName = match.team2_display_name;

      // 既に実際のチーム名が設定されている場合はスキップ
      // （「〇〇チーム」という形式でない場合はスキップ）
      if (!team1DisplayName.match(/^[A-Z]\d+チーム$/) || !team2DisplayName.match(/^[A-Z]\d+チーム$/)) {
        skipped++;
        continue;
      }

      // 実際のチーム名を取得
      const team1Name = await getTeamNameByPosition(tournamentId, blockName, team1DisplayName);
      const team2Name = await getTeamNameByPosition(tournamentId, blockName, team2DisplayName);

      if (team1Name && team2Name) {
        await db.execute({
          sql: `
            UPDATE t_matches_live
            SET team1_display_name = ?, team2_display_name = ?
            WHERE match_id = ?
          `,
          args: [team1Name, team2Name, match.match_id]
        });

        console.log(`  ✓ [${match.match_code}] ${team1DisplayName} vs ${team2DisplayName} → ${team1Name} vs ${team2Name}`);
        updated++;
      } else {
        console.log(`  ⚠️  [${match.match_code}] チーム名が見つかりません（スキップ）`);
        skipped++;
      }
    } catch (error) {
      console.error(`  ✗ [${match.match_code}] エラー:`, error.message);
      errors++;
    }
  }

  return { updated, skipped, errors };
}

/**
 * メイン処理
 */
async function main() {
  console.log('=================================');
  console.log('試合表示名更新スクリプト');
  console.log('=================================');

  try {
    // 全大会を取得
    const tournamentsResult = await db.execute(`
      SELECT tournament_id, tournament_name
      FROM t_tournaments
      ORDER BY tournament_id
    `);

    if (tournamentsResult.rows.length === 0) {
      console.log('大会が見つかりません');
      return;
    }

    console.log(`\n対象大会数: ${tournamentsResult.rows.length}`);

    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // 各大会について処理
    for (const tournament of tournamentsResult.rows) {
      const stats = await updateTournamentMatches(tournament.tournament_id);
      totalUpdated += stats.updated;
      totalSkipped += stats.skipped;
      totalErrors += stats.errors;
    }

    // 結果サマリー
    console.log('\n=================================');
    console.log('処理完了');
    console.log('=================================');
    console.log(`更新した試合数: ${totalUpdated}`);
    console.log(`スキップした試合数: ${totalSkipped}`);
    console.log(`エラー数: ${totalErrors}`);

    if (totalErrors > 0) {
      console.log('\n⚠️  エラーが発生しました。ログを確認してください。');
      process.exit(1);
    }

  } catch (error) {
    console.error('致命的なエラー:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// スクリプト実行
main();
