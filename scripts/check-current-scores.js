#!/usr/bin/env node

// Check current scores in database
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function checkCurrentScores() {
  try {
    console.log('🔍 Checking current scores in database...\n');
    
    // Check t_matches_live scores
    const liveScores = await client.execute(`
      SELECT match_id, match_code, team1_scores, team2_scores, 
             typeof(team1_scores) as team1_type, typeof(team2_scores) as team2_type
      FROM t_matches_live 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL
      LIMIT 10
    `);
    
    console.log('📋 t_matches_live scores:');
    liveScores.rows.forEach(row => {
      console.log(`  ${row.match_code}: ${row.team1_scores} (${row.team1_type}) vs ${row.team2_scores} (${row.team2_type})`);
    });

    // Check t_matches_final scores
    const finalScores = await client.execute(`
      SELECT match_id, match_code, team1_scores, team2_scores,
             typeof(team1_scores) as team1_type, typeof(team2_scores) as team2_type
      FROM t_matches_final 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL
      LIMIT 10
    `);
    
    console.log('\n📋 t_matches_final scores:');
    finalScores.rows.forEach(row => {
      console.log(`  ${row.match_code}: ${row.team1_scores} (${row.team1_type}) vs ${row.team2_scores} (${row.team2_type})`);
    });

    // Check if any decimal scores exist
    const decimalLive = await client.execute(`
      SELECT COUNT(*) as count 
      FROM t_matches_live 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL AND
        (CAST(team1_scores AS REAL) != CAST(team1_scores AS INTEGER) OR 
         CAST(team2_scores AS REAL) != CAST(team2_scores AS INTEGER))
    `);
    
    const decimalFinal = await client.execute(`
      SELECT COUNT(*) as count 
      FROM t_matches_final 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL AND
        (CAST(team1_scores AS REAL) != CAST(team1_scores AS INTEGER) OR 
         CAST(team2_scores AS REAL) != CAST(team2_scores AS INTEGER))
    `);
    
    console.log('\n📊 Decimal scores count:');
    console.log(`  t_matches_live: ${decimalLive.rows[0].count}`);
    console.log(`  t_matches_final: ${decimalFinal.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error checking scores:', error);
  } finally {
    client.close();
  }
}

checkCurrentScores();