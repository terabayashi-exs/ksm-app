#!/usr/bin/env node

// Test rankings calculation
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function testRankingsCalculation() {
  try {
    console.log('🔄 Testing rankings calculation via API...');
    
    const response = await fetch('http://localhost:3000/api/tournaments/3/update-rankings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    const result = await response.json();
    console.log('API Response:', result);
    
    if (result.success) {
      // Check the results
      const dbResult = await client.execute(`
        SELECT match_block_id, block_name, team_rankings FROM t_match_blocks 
        WHERE tournament_id = 3 AND team_rankings IS NOT NULL
      `);
      
      console.log('\n📊 Updated Rankings:');
      dbResult.rows.forEach(row => {
        console.log(`\nBlock ${row.block_name} (ID: ${row.match_block_id}):`);
        if (row.team_rankings) {
          const rankings = JSON.parse(row.team_rankings);
          rankings.forEach(team => {
            console.log(`  ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GD:${team.goal_difference}`);
          });
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

testRankingsCalculation();