#!/usr/bin/env node

// Fix decimal scores in database
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function fixDecimalScores() {
  try {
    console.log('🔄 Fixing decimal scores in database...');
    
    // Check current state
    console.log('\n📋 Current scores before fix:');
    const beforeLive = await client.execute(`
      SELECT match_code, team1_scores, team2_scores
      FROM t_matches_live 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL
      ORDER BY match_code
    `);
    
    beforeLive.rows.forEach(row => {
      console.log(`  Live: ${row.match_code}: ${row.team1_scores} vs ${row.team2_scores}`);
    });
    
    const beforeFinal = await client.execute(`
      SELECT match_code, team1_scores, team2_scores
      FROM t_matches_final 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL
      ORDER BY match_code
    `);
    
    beforeFinal.rows.forEach(row => {
      console.log(`  Final: ${row.match_code}: ${row.team1_scores} vs ${row.team2_scores}`);
    });
    
    // Fix t_matches_live
    const liveUpdate = await client.execute(`
      UPDATE t_matches_live 
      SET team1_scores = CAST(ROUND(CAST(team1_scores AS REAL)) AS INTEGER),
          team2_scores = CAST(ROUND(CAST(team2_scores AS REAL)) AS INTEGER)
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL
    `);
    
    console.log(`\\n🔧 Updated ${liveUpdate.rowsAffected} rows in t_matches_live`);
    
    // Fix t_matches_final
    const finalUpdate = await client.execute(`
      UPDATE t_matches_final 
      SET team1_scores = CAST(ROUND(CAST(team1_scores AS REAL)) AS INTEGER),
          team2_scores = CAST(ROUND(CAST(team2_scores AS REAL)) AS INTEGER)
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL
    `);
    
    console.log(`🔧 Updated ${finalUpdate.rowsAffected} rows in t_matches_final`);
    
    // Check after fix
    console.log('\\n📋 Scores after fix:');
    const afterLive = await client.execute(`
      SELECT match_code, team1_scores, team2_scores
      FROM t_matches_live 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL
      ORDER BY match_code
    `);
    
    afterLive.rows.forEach(row => {
      console.log(`  Live: ${row.match_code}: ${row.team1_scores} vs ${row.team2_scores}`);
    });
    
    const afterFinal = await client.execute(`
      SELECT match_code, team1_scores, team2_scores
      FROM t_matches_final 
      WHERE team1_scores IS NOT NULL AND team2_scores IS NOT NULL
      ORDER BY match_code
    `);
    
    afterFinal.rows.forEach(row => {
      console.log(`  Final: ${row.match_code}: ${row.team1_scores} vs ${row.team2_scores}`);
    });
    
    console.log('\\n✅ Decimal score fix completed');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

fixDecimalScores();