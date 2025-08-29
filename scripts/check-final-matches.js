// scripts/check-final-matches.js
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.DATABASE_URL || "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: process.env.DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function checkFinalMatches() {
  console.log('=== Final Tournament Updated Matches ===');
  
  try {
    const finalMatches = await db.execute({
      sql: `
        SELECT match_code, team1_display_name, team2_display_name, team1_id, team2_id
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
        ORDER BY match_code
      `
    });
    
    console.log('決勝トーナメント試合の現在の状況:');
    
    finalMatches.rows.forEach(match => {
      const hasRealTeam1 = match.team1_id && !match.team1_display_name.includes('勝') && !match.team1_display_name.includes('負') && !match.team1_display_name.includes('位');
      const hasRealTeam2 = match.team2_id && !match.team2_display_name.includes('勝') && !match.team2_display_name.includes('負') && !match.team2_display_name.includes('位');
      
      const status1 = hasRealTeam1 ? '✅' : '⏳';
      const status2 = hasRealTeam2 ? '✅' : '⏳';
      
      console.log(`${match.match_code}: ${status1} "${match.team1_display_name}" vs ${status2} "${match.team2_display_name}"`);
      if (match.team1_id) console.log(`  Team1 ID: ${match.team1_id}`);
      if (match.team2_id) console.log(`  Team2 ID: ${match.team2_id}`);
    });
    
    // 3位チーム進出が成功したかどうかの統計
    const updatedMatches = finalMatches.rows.filter(match => {
      const team1Updated = match.team1_id && !match.team1_display_name.includes('勝') && !match.team1_display_name.includes('負') && !match.team1_display_name.includes('位');
      const team2Updated = match.team2_id && !match.team2_display_name.includes('勝') && !match.team2_display_name.includes('負') && !match.team2_display_name.includes('位');
      return team1Updated || team2Updated;
    });
    
    console.log(`\n=== 統計 ===`);
    console.log(`実チーム名が反映された試合: ${updatedMatches.length}/${finalMatches.rows.length}`);
    
    // 3位チームが含まれているか確認
    const thirdPlaceMatches = finalMatches.rows.filter(match => 
      (match.team1_display_name.includes('3位') && match.team1_id) ||
      (match.team2_display_name.includes('3位') && match.team2_id)
    );
    
    console.log(`3位チームが進出した試合数: ${thirdPlaceMatches.length}`);
    
    if (thirdPlaceMatches.length > 0) {
      console.log('\n✅ 3位チーム進出成功例:');
      thirdPlaceMatches.forEach(match => {
        if (match.team1_display_name.includes('3位') && match.team1_id) {
          console.log(`  ${match.match_code}: ${match.team1_display_name} → ${match.team1_id}`);
        }
        if (match.team2_display_name.includes('3位') && match.team2_id) {
          console.log(`  ${match.match_code}: ${match.team2_display_name} → ${match.team2_id}`);
        }
      });
    }
    
  } catch (error) {
    console.error('Check final matches error:', error);
  }
}

checkFinalMatches().catch(console.error);