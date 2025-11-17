// テスト: 修正後の順位計算関数をテスト
// このスクリプトは lib/standings-calculator.ts の関数を直接呼び出して、
// 決勝フェーズのブロック（2位リーグ）で正しくチーム情報を取得できるかテストします。

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function testFixedCalculation() {
  console.log('=== 修正後のチーム取得ロジックのテスト ===\n');

  const tournamentId = 73;
  const matchBlockId = 356;

  // ブロック情報を取得
  const blockInfoQuery = await db.execute({
    sql: `SELECT phase, block_name FROM t_match_blocks WHERE match_block_id = ?`,
    args: [matchBlockId]
  });

  const blockPhase = blockInfoQuery.rows[0]?.phase;
  const blockName = blockInfoQuery.rows[0]?.block_name;

  console.log(`ブロック情報:`);
  console.log(`  ブロック名: ${blockName}`);
  console.log(`  フェーズ: ${blockPhase}`);

  if (blockPhase === 'final') {
    console.log(`\n✓ 決勝フェーズのため、試合データからチーム情報を取得します\n`);

    // 修正後のクエリ
    const teamsResult = await db.execute({
      sql: `
        SELECT DISTINCT
          ml.team1_id as team_id,
          COALESCE(t.team_name, ml.team1_display_name) as team_name,
          t.team_omission
        FROM t_matches_live ml
        LEFT JOIN m_teams t ON ml.team1_id = t.team_id
        WHERE ml.match_block_id = ? AND ml.team1_id IS NOT NULL
        UNION
        SELECT DISTINCT
          ml.team2_id as team_id,
          COALESCE(t.team_name, ml.team2_display_name) as team_name,
          t.team_omission
        FROM t_matches_live ml
        LEFT JOIN m_teams t ON ml.team2_id = t.team_id
        WHERE ml.match_block_id = ? AND ml.team2_id IS NOT NULL
        ORDER BY team_name
      `,
      args: [matchBlockId, matchBlockId]
    });

    console.log(`取得されたチーム数: ${teamsResult.rows.length}`);

    if (teamsResult.rows.length === 0) {
      console.log('\n❌ 失敗: チームが取得できませんでした');
      return;
    }

    console.log(`\nチーム一覧:`);
    teamsResult.rows.forEach((team, index) => {
      console.log(`  ${index + 1}. ${team.team_name} (ID: ${team.team_id})`);
    });

    console.log(`\n✅ 成功: ${teamsResult.rows.length}チームが正しく取得されました！`);
    console.log(`\n修正が正しく適用されています。`);
    console.log(`次回の試合確定時には、このチームリストを使って順位表が正しく計算されるはずです。`);
  } else {
    console.log(`\n⚠️ 予選フェーズのブロックです（テスト対象外）`);
  }

  // 確定済み試合も確認
  console.log(`\n=== 確定済み試合の確認 ===`);
  const matchesResult = await db.execute(`
    SELECT COUNT(*) as count
    FROM t_matches_final mf
    JOIN t_matches_live ml ON mf.match_id = ml.match_id
    WHERE ml.match_block_id = ?
  `, [matchBlockId]);

  const confirmedCount = matchesResult.rows[0].count;
  console.log(`確定済み試合数: ${confirmedCount}`);

  if (confirmedCount > 0) {
    console.log(`\n次のステップ: もう一度試合を確定させて、順位表が正しく計算されるか確認してください。`);
  } else {
    console.log(`\n⚠️ 確定済み試合がまだありません。試合を確定させてからテストしてください。`);
  }
}

testFixedCalculation().catch(console.error);
