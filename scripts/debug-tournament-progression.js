// scripts/debug-tournament-progression.js
const { createClient } = require("@libsql/client");

// データベース接続設定
const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function debugTournamentProgression() {
  const tournamentId = 9;
  
  try {
    console.log(`\n=== 大会ID:${tournamentId} 決勝トーナメント進行状況調査 ===\n`);

    // 1. 決勝トーナメントブロックを取得
    const finalBlockResult = await db.execute({
      sql: `SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ? AND phase = 'final'`,
      args: [tournamentId]
    });
    
    if (finalBlockResult.rows.length === 0) {
      console.log('決勝トーナメントブロックが見つかりません');
      return;
    }
    
    const finalBlockId = finalBlockResult.rows[0].match_block_id;
    console.log(`決勝トーナメントブロックID: ${finalBlockId}\n`);

    // 2. 予選ブロックの順位表を確認
    console.log('=== 予選ブロック順位表 ===');
    const preliminaryBlocksResult = await db.execute({
      sql: `
        SELECT 
          block_name, 
          team_rankings 
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'preliminary' AND team_rankings IS NOT NULL
        ORDER BY block_name
      `,
      args: [tournamentId]
    });

    for (const block of preliminaryBlocksResult.rows) {
      const rankings = JSON.parse(block.team_rankings);
      console.log(`\n${block.block_name}ブロック:`);
      
      // 上位4チームのみ表示
      const topTeams = rankings
        .sort((a, b) => a.position - b.position)
        .slice(0, 4);
        
      topTeams.forEach(team => {
        console.log(`  ${team.position}位: ${team.team_name} (ID: ${team.team_id})`);
      });
    }

    // 3. 決勝トーナメントの試合状況を確認
    console.log('\n=== 決勝トーナメント試合状況 ===');
    const finalMatchesResult = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.match_status,
          CASE WHEN mf.match_id IS NOT NULL THEN '確定済' ELSE '未確定' END as confirm_status
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
        ORDER BY ml.match_code
      `,
      args: [finalBlockId]
    });

    console.log('\nプレースホルダーが残っている試合:');
    finalMatchesResult.rows.forEach(match => {
      // プレースホルダーパターンをチェック
      const hasPlaceholder1 = !match.team1_id || match.team1_display_name.includes('位');
      const hasPlaceholder2 = !match.team2_id || match.team2_display_name.includes('位');
      
      if (hasPlaceholder1 || hasPlaceholder2) {
        console.log(`\n${match.match_code}:`);
        console.log(`  Team1: ${match.team1_display_name} (ID: ${match.team1_id || 'なし'})`);
        console.log(`  Team2: ${match.team2_display_name} (ID: ${match.team2_id || 'なし'})`);
        console.log(`  状態: ${match.match_status} / ${match.confirm_status}`);
      }
    });

    // 4. マッチテンプレートの確認
    console.log('\n=== マッチテンプレート確認 ===');
    const templateResult = await db.execute({
      sql: `
        SELECT 
          match_code,
          team1_source,
          team2_source,
          team1_display_name,
          team2_display_name
        FROM m_match_templates
        WHERE format_id = (SELECT format_id FROM t_tournaments WHERE tournament_id = ?)
        AND phase = 'final'
        AND (team1_display_name LIKE '%2位' OR team2_display_name LIKE '%2位')
        ORDER BY match_code
      `,
      args: [tournamentId]
    });

    console.log('\n2位チームを含む試合テンプレート:');
    templateResult.rows.forEach(template => {
      console.log(`\n${template.match_code}:`);
      console.log(`  Team1: ${template.team1_display_name} (source: ${template.team1_source})`);
      console.log(`  Team2: ${template.team2_display_name} (source: ${template.team2_source})`);
    });

    // 5. F, Hブロックの存在確認
    console.log('\n=== F, Hブロック確認 ===');
    const fhBlocksResult = await db.execute({
      sql: `
        SELECT 
          block_name,
          team_rankings
        FROM t_match_blocks
        WHERE tournament_id = ?
        AND phase = 'preliminary'
        AND block_name IN ('F', 'H')
      `,
      args: [tournamentId]
    });

    if (fhBlocksResult.rows.length === 0) {
      console.log('F, Hブロックは存在しません');
      console.log('=> これが「F2位」「H2位」が更新されない原因です');
    } else {
      fhBlocksResult.rows.forEach(block => {
        console.log(`${block.block_name}ブロックが存在します`);
      });
    }

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    process.exit(0);
  }
}

debugTournamentProgression();