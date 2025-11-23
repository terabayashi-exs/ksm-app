// scripts/check-tournament-75-promotion.mjs
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env.localを読み込む
dotenv.config({ path: resolve(__dirname, '../.env.local') });

// 本番データベースに接続（コメントアウトされている本番環境の認証情報を使用）
const db = createClient({
  url: 'libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg',
});

async function checkTournament75Promotion() {
  try {
    console.log('=== ID:75 大会のC3位進出問題診断 ===\n');

    // 1. 大会情報を確認
    const tournament = await db.execute('SELECT tournament_id, tournament_name, format_id FROM t_tournaments WHERE tournament_id = 75');
    console.log('1. 大会情報:');
    console.log(JSON.stringify(tournament.rows, null, 2));
    const formatId = tournament.rows[0].format_id;

    // 2. 予選Cブロックの順位表を確認
    const cBlock = await db.execute(`
      SELECT match_block_id, block_name, team_rankings
      FROM t_match_blocks
      WHERE tournament_id = 75 AND block_name = 'C'
    `);
    console.log('\n2. 予選Cブロック順位表（JSON）:');
    if (cBlock.rows[0]?.team_rankings) {
      const rankings = JSON.parse(cBlock.rows[0].team_rankings);
      console.log(JSON.stringify(rankings, null, 2));

      const thirdPlace = rankings.filter(r => r.position === 3);
      console.log('\n3位チーム:');
      console.log(JSON.stringify(thirdPlace, null, 2));
    } else {
      console.log('順位表データがありません');
    }

    // 3. 試合T9の現在の状態を確認
    const match9 = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_display_name,
        ml.team2_display_name,
        t1.team_name as team1_actual_name,
        t2.team_name as team2_actual_name
      FROM t_matches_live ml
      LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
      LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 75 AND ml.match_code = 'T9'
    `);
    console.log('\n3. 試合T9の現在の状態:');
    console.log(JSON.stringify(match9.rows, null, 2));

    // 4. 試合テンプレートでT9がどう定義されているか確認
    const template = await db.execute(`
      SELECT
        mt.match_code,
        mt.team1_source,
        mt.team2_source,
        mt.team1_display_name as template_team1_display,
        mt.team2_display_name as template_team2_display
      FROM m_match_templates mt
      WHERE mt.format_id = ? AND mt.match_code = 'T9'
    `, [formatId]);
    console.log('\n4. T9の試合テンプレート:');
    console.log(JSON.stringify(template.rows, null, 2));

    // 5. 全ブロックの3位チームを確認
    const allBlocks = await db.execute(`
      SELECT match_block_id, block_name, team_rankings
      FROM t_match_blocks
      WHERE tournament_id = 75 AND phase = 'preliminary'
      ORDER BY block_name
    `);
    console.log('\n5. 全予選ブロックの3位チーム:');
    for (const block of allBlocks.rows) {
      if (block.team_rankings) {
        const rankings = JSON.parse(block.team_rankings);
        const thirdPlace = rankings.filter(r => r.position === 3);
        console.log(`  ${block.block_name}ブロック3位:`, thirdPlace.length > 0 ? thirdPlace[0].team_name : 'なし');
      }
    }

    // 6. T9に関係する全ての試合を確認（C_3が使われているはずの試合）
    const c3Matches = await db.execute(`
      SELECT
        mt.match_code,
        mt.team1_source,
        mt.team2_source,
        mt.team1_display_name,
        mt.team2_display_name,
        ml.team1_id as live_team1_id,
        ml.team2_id as live_team2_id,
        ml.team1_display_name as live_team1_name,
        ml.team2_display_name as live_team2_name
      FROM m_match_templates mt
      LEFT JOIN t_matches_live ml ON mt.match_code = ml.match_code
        AND ml.match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = 75)
      WHERE mt.format_id = ?
        AND (mt.team1_source = 'C_3' OR mt.team2_source = 'C_3')
    `, [formatId]);
    console.log('\n6. C_3を使用している試合（テンプレート vs 実際）:');
    console.log(JSON.stringify(c3Matches.rows, null, 2));

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

checkTournament75Promotion();
