// scripts/analyze-tournament-9.js
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.DATABASE_URL || "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: process.env.DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function analyzeTournament9() {
  console.log('=== Tournament 9 Analysis ===');
  
  try {
    // 1. 大会の基本情報
    const tournament = await db.execute({
      sql: 'SELECT tournament_id, tournament_name, format_id, status FROM t_tournaments WHERE tournament_id = 9'
    });
    console.log('Tournament Info:', tournament.rows[0]);
    
    // 2. ブロック順位表の確認
    const blocks = await db.execute({
      sql: 'SELECT block_name, team_rankings FROM t_match_blocks WHERE tournament_id = 9 AND phase = "preliminary" ORDER BY block_name'
    });
    
    console.log('\n=== Block Rankings ===');
    blocks.rows.forEach(block => {
      console.log(`${block.block_name}ブロック:`);
      if (block.team_rankings) {
        const rankings = JSON.parse(block.team_rankings);
        rankings.forEach(team => {
          console.log(`  ${team.position}位: ${team.team_name} (勝点:${team.points})`);
        });
      } else {
        console.log('  順位表未設定');
      }
    });
    
    // 3. 決勝トーナメントの現在の対戦カード
    const finalMatches = await db.execute({
      sql: `
        SELECT match_code, team1_display_name, team2_display_name, team1_id, team2_id
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
        ORDER BY match_code
      `
    });
    
    console.log('\n=== Final Tournament Matches ===');
    finalMatches.rows.forEach(match => {
      console.log(`${match.match_code}: "${match.team1_display_name}" vs "${match.team2_display_name}"`);
      console.log(`  Team IDs: ${match.team1_id || 'null'} vs ${match.team2_id || 'null'}`);
    });
    
    // 4. フォーマットテンプレートの確認（3位・4位が必要か）
    const formatId = tournament.rows[0]?.format_id;
    if (formatId) {
      const templates = await db.execute({
        sql: `
          SELECT match_code, team1_source, team2_source, team1_display_name, team2_display_name
          FROM m_match_templates
          WHERE format_id = ? AND phase = 'final'
          ORDER BY match_code
        `,
        args: [formatId]
      });
      
      console.log('\n=== Format Templates (Final Phase) ===');
      templates.rows.forEach(template => {
        console.log(`${template.match_code}: ${template.team1_source} vs ${template.team2_source}`);
        console.log(`  Display: "${template.team1_display_name}" vs "${template.team2_display_name}"`);
      });
      
      // 必要な進出条件を分析
      const requiredPromotions = new Set();
      templates.rows.forEach(row => {
        if (row.team1_source && row.team1_source.match(/^[ABCD]_[1-4]$/)) {
          requiredPromotions.add(row.team1_source);
        }
        if (row.team2_source && row.team2_source.match(/^[ABCD]_[1-4]$/)) {
          requiredPromotions.add(row.team2_source);
        }
      });
      
      console.log('\n=== Required Promotions ===');
      console.log('必要な進出条件:', Array.from(requiredPromotions).sort());
      
      // 3位・4位チームが必要かどうか判定
      const needs3rd = Array.from(requiredPromotions).some(p => p.endsWith('_3'));
      const needs4th = Array.from(requiredPromotions).some(p => p.endsWith('_4'));
      
      console.log('\n=== Analysis Result ===');
      console.log('3位チーム必要:', needs3rd);
      console.log('4位チーム必要:', needs4th);
      
      if (!needs3rd && !needs4th) {
        console.log('\n⚠️  現在のフォーマットでは上位2チームのみで十分です');
        console.log('3位・4位チームは決勝トーナメントに進出しません');
      } else {
        console.log('\n✅ 3位・4位チームの進出が必要なフォーマットです');
      }
    }
    
  } catch (error) {
    console.error('Analysis error:', error);
  }
}

analyzeTournament9();