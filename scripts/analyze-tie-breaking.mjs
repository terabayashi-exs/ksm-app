#!/usr/bin/env node

// 同着順位の分析
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function analyzeTieBreaking() {
  try {
    console.log('🔍 同着順位の分析...\n');
    
    // 現在のランキング確認
    const rankings = await client.execute(`
      SELECT team_rankings FROM t_match_blocks WHERE match_block_id = 14
    `);
    
    if (rankings.rows[0]?.team_rankings) {
      const rankingData = JSON.parse(rankings.rows[0].team_rankings);
      console.log('📊 現在のランキング表示:');
      rankingData.forEach(team => {
        console.log(`  ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
      });
      
      // 同着判定分析
      console.log('\n🔍 同着判定分析:');
      const teamsByPoints = {};
      rankingData.forEach(team => {
        if (!teamsByPoints[team.points]) {
          teamsByPoints[team.points] = [];
        }
        teamsByPoints[team.points].push(team);
      });
      
      Object.keys(teamsByPoints).forEach(points => {
        const teams = teamsByPoints[points];
        if (teams.length > 1) {
          console.log(`\n  📌 ${points}pts で同着のチーム:(${teams.length}チーム)`);
          teams.forEach(team => {
            console.log(`    - ${team.team_name}: ${team.points}pts, GF:${team.goals_for}, GA:${team.goals_against}, GD:${team.goal_difference}`);
          });
          
          // 同着かどうかの確認
          const sameGoalsFor = teams.every(team => team.goals_for === teams[0].goals_for);
          const sameGoalDiff = teams.every(team => team.goal_difference === teams[0].goal_difference);
          
          console.log(`    📋 総得点同じ: ${sameGoalsFor ? 'Yes' : 'No'}`);
          console.log(`    📋 得失点差同じ: ${sameGoalDiff ? 'Yes' : 'No'}`);
          
          if (sameGoalsFor && sameGoalDiff) {
            console.log(`    ✅ これらのチームは同着であるべきです（同じ順位）`);
            
            // 実際の順位確認
            const positions = teams.map(team => team.position);
            const uniquePositions = [...new Set(positions)];
            
            if (uniquePositions.length === 1) {
              console.log(`    ✅ 正しく同着処理されています（全て${uniquePositions[0]}位）`);
            } else {
              console.log(`    ❌ 同着処理が正しくありません（順位: ${positions.join(', ')}）`);
            }
          } else {
            console.log(`    💡 これらのチームは異なる順位であるべきです`);
          }
        }
      });
      
      // 直接対決確認（1ptチーム同士）
      const onePointTeams = rankingData.filter(team => team.points === 1);
      if (onePointTeams.length === 2) {
        console.log('\n🥅 直接対決確認（1ptチーム同士）:');
        const team1 = onePointTeams[0];
        const team2 = onePointTeams[1];
        
        const directMatch = await client.execute(`
          SELECT match_code, team1_id, team2_id, team1_scores, team2_scores, is_draw
          FROM t_matches_final
          WHERE (team1_id = ? AND team2_id = ?) OR (team1_id = ? AND team2_id = ?)
        `, [team1.team_id, team2.team_id, team2.team_id, team1.team_id]);
        
        if (directMatch.rows.length > 0) {
          const match = directMatch.rows[0];
          console.log(`  📋 直接対決結果: ${match.match_code} - ${match.team1_scores}vs${match.team2_scores} (引分:${match.is_draw})`);
          if (match.is_draw) {
            console.log(`  ✅ 直接対決も引き分けのため、完全に同着です`);
            console.log(`  💡 正しい順位: 両方とも2位（1位の次）`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

analyzeTieBreaking();