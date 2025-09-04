// scripts/final-promotion-test.js
const { createClient } = require("@libsql/client");

// データベース接続設定
const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function finalPromotionTest() {
  const tournamentId = 9;
  
  try {
    console.log('=== 最終進出処理テスト（大会ID:9専用） ===\n');

    // 大会9の決勝ブロックIDを特定
    const finalBlockResult = await db.execute({
      sql: `SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ? AND phase = 'final'`,
      args: [tournamentId]
    });
    
    if (finalBlockResult.rows.length === 0) {
      console.log('決勝ブロックが見つかりません');
      return;
    }
    
    const finalBlockId = finalBlockResult.rows[0].match_block_id;
    console.log(`大会9の決勝ブロックID: ${finalBlockId}\n`);

    // F2位, H2位の実際の進出チーム情報を取得
    const fBlock = await db.execute({
      sql: `SELECT team_rankings FROM t_match_blocks WHERE tournament_id = ? AND block_name = 'F'`,
      args: [tournamentId]
    });

    const hBlock = await db.execute({
      sql: `SELECT team_rankings FROM t_match_blocks WHERE tournament_id = ? AND block_name = 'H'`,
      args: [tournamentId]
    });

    if (fBlock.rows.length === 0 || hBlock.rows.length === 0) {
      console.log('FブロックまたはHブロックの順位表が見つかりません');
      return;
    }

    const fRankings = JSON.parse(fBlock.rows[0].team_rankings);
    const hRankings = JSON.parse(hBlock.rows[0].team_rankings);
    
    const f2Team = fRankings.find(team => team.position === 2);
    const h2Team = hRankings.find(team => team.position === 2);

    console.log(`F2位: ${f2Team.team_name} (ID: ${f2Team.team_id})`);
    console.log(`H2位: ${h2Team.team_name} (ID: ${h2Team.team_id})\n`);

    // M1, M2試合を正確に特定して更新
    console.log('=== プレースホルダー更新実行 ===');
    
    const m1UpdateResult = await db.execute({
      sql: `
        UPDATE t_matches_live 
        SET team2_id = ?, team2_display_name = ?, updated_at = datetime('now', '+9 hours')
        WHERE match_block_id = ? AND match_code = 'M1' AND team2_display_name = 'F2位'
      `,
      args: [f2Team.team_id, f2Team.team_name, finalBlockId]
    });

    const m2UpdateResult = await db.execute({
      sql: `
        UPDATE t_matches_live 
        SET team1_id = ?, team1_display_name = ?, updated_at = datetime('now', '+9 hours')
        WHERE match_block_id = ? AND match_code = 'M2' AND team1_display_name = 'H2位'
      `,
      args: [h2Team.team_id, h2Team.team_name, finalBlockId]
    });

    console.log(`M1 F2位更新: ${m1UpdateResult.rowsAffected}行`);
    console.log(`M2 H2位更新: ${m2UpdateResult.rowsAffected}行\n`);

    // 更新後の確認
    const updatedMatchesResult = await db.execute({
      sql: `
        SELECT 
          match_code,
          team1_id,
          team2_id,
          team1_display_name,
          team2_display_name
        FROM t_matches_live
        WHERE match_block_id = ? AND match_code IN ('M1', 'M2')
        ORDER BY match_code
      `,
      args: [finalBlockId]
    });

    console.log('=== 更新後の試合情報 ===');
    updatedMatchesResult.rows.forEach(match => {
      console.log(`${match.match_code}: ${match.team1_display_name} (${match.team1_id || '未設定'}) vs ${match.team2_display_name} (${match.team2_id || '未設定'})`);
    });

    // 残りのプレースホルダーをまとめて確認
    console.log('\n=== 残存プレースホルダー確認 ===');
    const remainingPlaceholders = await db.execute({
      sql: `
        SELECT 
          match_code,
          team1_display_name,
          team2_display_name
        FROM t_matches_live
        WHERE match_block_id = ?
        AND (team1_display_name LIKE '%位' OR team2_display_name LIKE '%位')
        ORDER BY match_code
      `,
      args: [finalBlockId]
    });

    console.log(`残存プレースホルダー: ${remainingPlaceholders.rows.length}試合`);
    remainingPlaceholders.rows.slice(0, 5).forEach(match => {
      console.log(`${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
    });

    if (remainingPlaceholders.rows.length > 5) {
      console.log(`... 他${remainingPlaceholders.rows.length - 5}試合`);
    }

    console.log('\n✅ F2位・H2位の更新が完了しました');
    console.log('🌐 Webページ (http://localhost:3000/tournaments/9) で結果をご確認ください');

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    process.exit(0);
  }
}

finalPromotionTest();