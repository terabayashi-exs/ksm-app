// scripts/fix-tournament-75-t9.mjs
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env.local') });

// 本番データベースに接続
const db = createClient({
  url: 'libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg',
});

async function fixTournament75T9() {
  try {
    console.log('=== ID:75大会 試合③9のC3位チーム設定修正 ===\n');

    // 1. 現在の試合③9の状態を確認
    const currentMatch = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_display_name,
        ml.team2_display_name
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 75 AND ml.match_code = '③9'
    `);

    if (currentMatch.rows.length === 0) {
      console.error('試合③9が見つかりません');
      return;
    }

    console.log('修正前の試合③9:');
    console.log(JSON.stringify(currentMatch.rows[0], null, 2));

    const matchId = currentMatch.rows[0].match_id;

    // 2. C3位チーム（PARTIDA TONAMI）を取得
    const c3Team = 'partidat'; // 診断結果から判明したチームID
    const c3TeamName = 'PARTIDA TONAMI'; // 診断結果から判明したチーム名

    // 3. 試合③9のteam1を更新
    console.log('\n試合③9を更新中...');
    await db.execute({
      sql: `
        UPDATE t_matches_live
        SET team1_id = ?, team1_display_name = ?, updated_at = datetime('now', '+9 hours')
        WHERE match_id = ?
      `,
      args: [c3Team, c3TeamName, matchId]
    });

    // 4. 更新後の確認
    const updatedMatch = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_display_name,
        ml.team2_display_name
      FROM t_matches_live ml
      WHERE ml.match_id = ?
    `, [matchId]);

    console.log('\n修正後の試合③9:');
    console.log(JSON.stringify(updatedMatch.rows[0], null, 2));
    console.log('\n✅ 修正完了しました！');

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

fixTournament75T9();
