// scripts/debug-promotion.js
const { createClient } = require('@libsql/client');
const db = createClient({
  url: 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

async function testPromotionLogic() {
  const tournamentId = 9;
  
  console.log('=== 進出処理デバッグ (Tournament 9) ===');
  
  // 1. ブロック順位表を取得
  console.log('\n1. ブロック順位表取得...');
  const blocks = await db.execute({
    sql: `
      SELECT block_name, team_rankings
      FROM t_match_blocks 
      WHERE tournament_id = ? AND phase = 'preliminary' AND team_rankings IS NOT NULL
      ORDER BY block_name
    `,
    args: [tournamentId]
  });

  const blockRankings = [];
  for (const block of blocks.rows) {
    if (block.team_rankings) {
      try {
        const rankings = JSON.parse(block.team_rankings);
        blockRankings.push({
          block_name: block.block_name,
          rankings: rankings
        });
        console.log(`  ${block.block_name}ブロック: ${rankings.length}チーム`);
      } catch (e) {
        console.error(`  ${block.block_name}ブロック: パースエラー`);
      }
    }
  }
  
  // 2. 必要な進出条件を取得
  console.log('\n2. 進出条件取得...');
  const formatResult = await db.execute({
    sql: 'SELECT format_id FROM t_tournaments WHERE tournament_id = ?',
    args: [tournamentId]
  });
  
  const formatId = formatResult.rows[0].format_id;
  
  const templateResult = await db.execute({
    sql: `
      SELECT DISTINCT team1_source, team2_source
      FROM m_match_templates
      WHERE format_id = ? AND phase = 'final'
    `,
    args: [formatId]
  });
  
  const requiredPromotions = new Set();
  templateResult.rows.forEach(row => {
    const team1Source = row.team1_source;
    const team2Source = row.team2_source;
    
    if (team1Source && team1Source.match(/^[A-Z]_\d+$/)) {
      requiredPromotions.add(team1Source);
    }
    if (team2Source && team2Source.match(/^[A-Z]_\d+$/)) {
      requiredPromotions.add(team2Source);
    }
  });
  
  console.log('  必要な進出条件:', Array.from(requiredPromotions));
  
  // 3. 進出チーム抽出
  console.log('\n3. 進出チーム抽出...');
  const promotions = {};
  
  blockRankings.forEach(block => {
    const sortedRankings = block.rankings.sort((a, b) => a.position - b.position);
    console.log(`\n  ${block.block_name}ブロック順位:`);
    
    sortedRankings.forEach(team => {
      console.log(`    ${team.position}位: ${team.team_name} (ID: ${team.team_id})`);
    });
    
    const blockPromotions = Array.from(requiredPromotions).filter(key => key.startsWith(`${block.block_name}_`));
    
    blockPromotions.forEach(promotionKey => {
      const [, positionStr] = promotionKey.split('_');
      const position = parseInt(positionStr);
      
      if (!isNaN(position)) {
        const teamsAtPosition = sortedRankings.filter(team => team.position === position);
        
        if (teamsAtPosition.length === 1) {
          promotions[promotionKey] = {
            team_id: teamsAtPosition[0].team_id,
            team_name: teamsAtPosition[0].team_name
          };
          console.log(`    → ${promotionKey}: ${teamsAtPosition[0].team_name}`);
        } else if (teamsAtPosition.length > 1) {
          console.log(`    → ${promotionKey}: 同着${teamsAtPosition.length}チーム（手動決定待ち）`);
        } else {
          console.log(`    → ${promotionKey}: チームなし`);
        }
      }
    });
  });
  
  console.log('\n4. 進出チーム一覧:');
  Object.entries(promotions).forEach(([key, value]) => {
    console.log(`  ${key}: ${value.team_name} (${value.team_id})`);
  });
  
  // 5. D_2の具体的な確認
  console.log('\n5. D_2の詳細チェック:');
  if (promotions['D_2']) {
    console.log(`  D_2進出チーム: ${promotions['D_2'].team_name} (${promotions['D_2'].team_id})`);
  } else {
    console.log('  D_2進出チーム: 見つかりません');
  }
  
  process.exit(0);
}

testPromotionLogic();