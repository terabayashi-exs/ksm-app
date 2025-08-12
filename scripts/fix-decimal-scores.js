#!/usr/bin/env node

// Fix decimal scores in database - convert to integers
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function fixDecimalScores() {
  try {
    console.log('🚀 Starting decimal score fixes...\n');

    // Fix t_matches_live
    console.log('📋 Fixing t_matches_live scores...');
    const liveUpdate = await client.execute(`
      UPDATE t_matches_live 
      SET 
        team1_scores = CAST(ROUND(team1_scores) AS INTEGER),
        team2_scores = CAST(ROUND(team2_scores) AS INTEGER)
      WHERE 
        team1_scores IS NOT NULL AND 
        team2_scores IS NOT NULL AND
        (CAST(team1_scores AS REAL) != CAST(team1_scores AS INTEGER) OR 
         CAST(team2_scores AS REAL) != CAST(team2_scores AS INTEGER))
    `);
    console.log(`  ✅ Updated ${liveUpdate.changes} records in t_matches_live`);

    // Fix t_matches_final
    console.log('📋 Fixing t_matches_final scores...');
    const finalUpdate = await client.execute(`
      UPDATE t_matches_final 
      SET 
        team1_scores = CAST(ROUND(team1_scores) AS INTEGER),
        team2_scores = CAST(ROUND(team2_scores) AS INTEGER)
      WHERE 
        team1_scores IS NOT NULL AND 
        team2_scores IS NOT NULL AND
        (CAST(team1_scores AS REAL) != CAST(team1_scores AS INTEGER) OR 
         CAST(team2_scores AS REAL) != CAST(team2_scores AS INTEGER))
    `);
    console.log(`  ✅ Updated ${finalUpdate.changes} records in t_matches_final`);

    // Verify the results
    console.log('\n📊 Verification:');
    
    // Check for remaining decimal scores in t_matches_live
    const liveCheck = await client.execute(`
      SELECT COUNT(*) as count 
      FROM t_matches_live 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL AND
        (CAST(team1_scores AS REAL) != CAST(team1_scores AS INTEGER) OR 
         CAST(team2_scores AS REAL) != CAST(team2_scores AS INTEGER))
    `);
    console.log(`  Remaining decimal scores in t_matches_live: ${liveCheck.rows[0].count}`);
    
    // Check for remaining decimal scores in t_matches_final
    const finalCheck = await client.execute(`
      SELECT COUNT(*) as count 
      FROM t_matches_final 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL AND
        (CAST(team1_scores AS REAL) != CAST(team1_scores AS INTEGER) OR 
         CAST(team2_scores AS REAL) != CAST(team2_scores AS INTEGER))
    `);
    console.log(`  Remaining decimal scores in t_matches_final: ${finalCheck.rows[0].count}`);

    // Show some sample scores
    console.log('\n📋 Sample scores after fix:');
    const samples = await client.execute(`
      SELECT match_code, team1_scores, team2_scores 
      FROM t_matches_live 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL 
      LIMIT 5
    `);
    
    samples.rows.forEach(row => {
      console.log(`  ${row.match_code}: ${row.team1_scores} vs ${row.team2_scores}`);
    });

    console.log('\n🎉 Decimal score fixes completed successfully!');

  } catch (error) {
    console.error('❌ Error fixing decimal scores:', error);
    process.exit(1);
  } finally {
    client.close();
  }
}

// Run the fix
fixDecimalScores();