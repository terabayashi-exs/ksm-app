/**
 * スコアデータをJSON形式に統一するマイグレーションスクリプト
 *
 * 【対象】
 * - t_matches_live.team1_scores, team2_scores
 * - t_matches_final.team1_scores, team2_scores
 *
 * 【変換内容】
 * - JSON配列形式: "[2,1]" → そのまま
 * - カンマ区切り形式: "2,1" → "[2,1]"
 * - 数値のみ形式: "2" → "[2]"
 * - null → "[0]"
 *
 * 【使用方法】
 * ```bash
 * # ドライラン（実際の更新はしない）
 * node scripts/migrate-scores-to-json.mjs --dry-run
 *
 * # 本番実行
 * node scripts/migrate-scores-to-json.mjs
 * ```
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

// コマンドライン引数チェック
const isDryRun = process.argv.includes('--dry-run');

console.log('==============================================');
console.log('  スコアデータJSON形式統一マイグレーション');
console.log('==============================================\n');

if (isDryRun) {
  console.log('【ドライランモード】実際のデータ更新は行いません\n');
} else {
  console.log('【本番モード】データを実際に更新します\n');
}

/**
 * スコアデータをJSON形式に変換する
 */
function convertToJson(score) {
  if (!score) return '[0]';

  const scoreStr = String(score);

  // すでにJSON配列形式
  if (scoreStr.startsWith('[') && scoreStr.endsWith(']')) {
    // 妥当性チェック
    try {
      JSON.parse(scoreStr);
      return scoreStr;
    } catch {
      console.warn(`  ⚠️ Invalid JSON format: ${scoreStr} -> converting to [0]`);
      return '[0]';
    }
  }

  // カンマ区切り形式
  if (scoreStr.includes(',')) {
    const scores = scoreStr.split(',').map(s => parseInt(s.trim()) || 0);
    return JSON.stringify(scores);
  }

  // 数値のみ形式
  const num = parseInt(scoreStr);
  return JSON.stringify([isNaN(num) ? 0 : num]);
}

/**
 * テーブルのスコアデータを移行する
 */
async function migrateTable(tableName) {
  console.log(`\n📋 ${tableName} の処理開始...\n`);

  // 全レコードを取得
  const result = await db.execute(`
    SELECT match_id, team1_scores, team2_scores
    FROM ${tableName}
  `);

  console.log(`  対象レコード数: ${result.rows.length}件`);

  let updatedCount = 0;
  let skippedCount = 0;
  const updates = [];

  for (const match of result.rows) {
    const team1Original = match.team1_scores;
    const team2Original = match.team2_scores;

    const team1Converted = convertToJson(team1Original);
    const team2Converted = convertToJson(team2Original);

    // 変更があるかチェック
    const team1Changed = String(team1Original) !== team1Converted;
    const team2Changed = String(team2Original) !== team2Converted;

    if (team1Changed || team2Changed) {
      updatedCount++;
      updates.push({
        match_id: match.match_id,
        team1_original: team1Original,
        team1_converted: team1Converted,
        team2_original: team2Original,
        team2_converted: team2Converted
      });

      console.log(`  [Match ${match.match_id}]`);
      if (team1Changed) {
        console.log(`    team1_scores: "${team1Original}" → "${team1Converted}"`);
      }
      if (team2Changed) {
        console.log(`    team2_scores: "${team2Original}" → "${team2Converted}"`);
      }

      // 本番モードの場合は実際に更新
      if (!isDryRun) {
        await db.execute(`
          UPDATE ${tableName}
          SET team1_scores = ?, team2_scores = ?
          WHERE match_id = ?
        `, [team1Converted, team2Converted, match.match_id]);
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`\n  ✅ 更新対象: ${updatedCount}件`);
  console.log(`  ⏭️  スキップ: ${skippedCount}件`);

  return { total: result.rows.length, updated: updatedCount, skipped: skippedCount, updates };
}

/**
 * マイグレーション実行
 */
async function runMigration() {
  try {
    const startTime = Date.now();

    // t_matches_live を移行
    const liveResults = await migrateTable('t_matches_live');

    // t_matches_final を移行
    const finalResults = await migrateTable('t_matches_final');

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // サマリー表示
    console.log('\n==============================================');
    console.log('  マイグレーション完了');
    console.log('==============================================\n');

    console.log(`【t_matches_live】`);
    console.log(`  総レコード数: ${liveResults.total}件`);
    console.log(`  更新: ${liveResults.updated}件`);
    console.log(`  スキップ: ${liveResults.skipped}件\n`);

    console.log(`【t_matches_final】`);
    console.log(`  総レコード数: ${finalResults.total}件`);
    console.log(`  更新: ${finalResults.updated}件`);
    console.log(`  スキップ: ${finalResults.skipped}件\n`);

    console.log(`処理時間: ${duration}秒\n`);

    if (isDryRun) {
      console.log('💡 ドライランモードで実行されました');
      console.log('   実際に更新する場合は --dry-run オプションなしで実行してください\n');
    } else {
      console.log('✨ データベースが正常に更新されました\n');
      console.log('⚠️  次のステップ:');
      console.log('   1. アプリケーションを再起動してください');
      console.log('   2. 順位表の再計算を実行してください');
      console.log('   3. 主要な画面で表示が正しいか確認してください\n');
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// メイン処理実行
runMigration();
