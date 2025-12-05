#!/usr/bin/env node
/**
 * ブロック順位表を強制再計算するスクリプト
 * Usage: node scripts/recalc-block-rankings.mjs <tournament_id> <match_block_id>
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .envファイルを読み込み
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || '',
});

async function recalculateBlockRankings(tournamentId, matchBlockId) {
  try {
    console.log(`\n=== ブロック順位表再計算 ===`);
    console.log(`Tournament ID: ${tournamentId}`);
    console.log(`Match Block ID: ${matchBlockId}\n`);

    // ブロック情報を取得
    const blockResult = await db.execute({
      sql: `
        SELECT match_block_id, phase, block_name, display_round_name
        FROM t_match_blocks
        WHERE match_block_id = ? AND tournament_id = ?
      `,
      args: [matchBlockId, tournamentId]
    });

    if (blockResult.rows.length === 0) {
      console.error('❌ ブロックが見つかりません');
      return;
    }

    const block = blockResult.rows[0];
    console.log(`📋 ブロック: ${block.block_name} (${block.phase})`);

    // 確定済み試合を確認
    const matchesResult = await db.execute({
      sql: `
        SELECT COUNT(*) as total_matches,
               SUM(CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END) as confirmed_matches
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
      `,
      args: [matchBlockId]
    });

    const stats = matchesResult.rows[0];
    console.log(`📊 試合統計: ${stats.confirmed_matches}/${stats.total_matches} 試合確定`);

    // 順位表を再計算（standings-calculatorのロジックを呼び出す）
    console.log(`\n🔄 順位表を再計算中...`);

    // Node.jsでESMモジュールを動的にインポート
    const { updateBlockRankingsOnMatchConfirm } = await import('../lib/standings-calculator.ts');

    await updateBlockRankingsOnMatchConfirm(matchBlockId, tournamentId);

    console.log(`✅ 順位表の再計算が完了しました`);

    // 更新後の順位表を表示
    const rankingsResult = await db.execute({
      sql: `SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?`,
      args: [matchBlockId]
    });

    if (rankingsResult.rows[0]?.team_rankings) {
      const rankings = JSON.parse(rankingsResult.rows[0].team_rankings);
      console.log(`\n📈 更新後の順位表:`);
      rankings.forEach(team => {
        console.log(`  ${team.position}位: ${team.team_name} - 勝点${team.points} (${team.matches_played}試合 ${team.wins}勝${team.draws}分${team.losses}敗)`);
      });
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

// コマンドライン引数を取得
const tournamentId = parseInt(process.argv[2]);
const matchBlockId = parseInt(process.argv[3]);

if (isNaN(tournamentId) || isNaN(matchBlockId)) {
  console.error('Usage: node scripts/recalc-block-rankings.mjs <tournament_id> <match_block_id>');
  console.error('Example: node scripts/recalc-block-rankings.mjs 84 10');
  process.exit(1);
}

recalculateBlockRankings(tournamentId, matchBlockId)
  .then(() => {
    console.log('\n✅ 処理が完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 処理中にエラーが発生しました:', error);
    process.exit(1);
  });
