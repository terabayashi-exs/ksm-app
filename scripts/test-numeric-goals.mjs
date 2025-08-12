#!/usr/bin/env node

// 数値化修正後のstandings-calculator動作テスト
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function testNumericGoals() {
  try {
    console.log('🔢 数値化修正後のstandings-calculator動作テスト...\n');
    
    const matchBlockId = 14;
    const tournamentId = 3;
    
    // チーム一覧取得
    const teamsResult = await client.execute(`
      SELECT DISTINCT
        tt.team_id,
        t.team_name,
        t.team_omission
      FROM t_tournament_teams tt
      JOIN m_teams t ON tt.team_id = t.team_id
      WHERE tt.tournament_id = ?
      AND tt.assigned_block = (
        SELECT block_name 
        FROM t_match_blocks 
        WHERE match_block_id = ?
      )
      ORDER BY t.team_name
    `, [tournamentId, matchBlockId]);
    
    // 修正されたクエリで確定試合結果を取得
    console.log('1️⃣ 確定試合とスコア確認:');
    const matchesResult = await client.execute(`
      SELECT 
        match_code,
        team1_id,
        team2_id,
        team1_scores as team1_goals,
        team2_scores as team2_goals,
        winner_team_id,
        is_draw,
        is_walkover
      FROM t_matches_final
      WHERE match_block_id = ?
      AND (team1_id IS NOT NULL AND team2_id IS NOT NULL)
      ORDER BY match_code
    `, [matchBlockId]);
    
    console.log(`   確定済み試合: ${matchesResult.rows.length}件`);
    matchesResult.rows.forEach(match => {
      console.log(`     ${match.match_code}: ${match.team1_id} vs ${match.team2_id} (${match.team1_goals}-${match.team2_goals}) 勝者:${match.winner_team_id || '引分'}`);
    });
    
    // 大会設定取得
    const tournamentResult = await client.execute(`
      SELECT win_points, draw_points, loss_points
      FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);
    
    const winPoints = tournamentResult.rows?.[0]?.win_points || 3;
    const drawPoints = tournamentResult.rows?.[0]?.draw_points || 1;
    const lossPoints = tournamentResult.rows?.[0]?.loss_points || 0;
    
    console.log(`\n2️⃣ 数値計算テスト:`);
    
    // 各チームの成績を計算
    const teamStandings = teamsResult.rows.map(team => {
      const teamId = team.team_id;
      console.log(`\n  📊 ${team.team_name} (${teamId}):`);
      
      // チームが関わる試合を抽出
      const teamMatches = matchesResult.rows.filter(match => 
        match.team1_id === teamId || match.team2_id === teamId
      );
      
      let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, points = 0;
      
      teamMatches.forEach(match => {
        const isTeam1 = match.team1_id === teamId;
        
        // 修正: 明示的にNumber()で数値変換
        const teamGoals = isTeam1 ? Number(match.team1_goals) : Number(match.team2_goals);
        const opponentGoals = isTeam1 ? Number(match.team2_goals) : Number(match.team1_goals);
        
        console.log(`    ${match.match_code}: ${teamGoals}-${opponentGoals} (数値確認: ${typeof teamGoals}, ${typeof opponentGoals})`);
        
        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;
        
        if (match.is_draw) {
          draws++;
          points += drawPoints;
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += winPoints;
        } else {
          losses++;
          points += lossPoints;
        }
      });
      
      // 修正: 最終値も明示的に数値変換
      const finalGoalsFor = Number(goalsFor);
      const finalGoalsAgainst = Number(goalsAgainst);
      const finalGoalDifference = finalGoalsFor - finalGoalsAgainst;
      
      console.log(`    合計: ${points}pts (${wins}W ${draws}D ${losses}L)`);
      console.log(`    得点: ${finalGoalsFor} (型: ${typeof finalGoalsFor})`);
      console.log(`    失点: ${finalGoalsAgainst} (型: ${typeof finalGoalsAgainst})`);
      console.log(`    得失点差: ${finalGoalDifference} (型: ${typeof finalGoalDifference})`);
      
      return {
        team_id: teamId,
        team_name: team.team_name,
        team_omission: team.team_omission || undefined,
        position: 0,
        points,
        matches_played: teamMatches.length,
        wins,
        draws,
        losses,
        goals_for: finalGoalsFor,
        goals_against: finalGoalsAgainst,
        goal_difference: finalGoalDifference
      };
    });
    
    // ソート
    teamStandings.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goals_for !== b.goals_for) return b.goals_for - a.goals_for;
      if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
      return a.team_name.localeCompare(b.team_name, 'ja');
    });
    
    // 順位設定
    let currentPosition = 1;
    for (let i = 0; i < teamStandings.length; i++) {
      if (i === 0) {
        teamStandings[i].position = 1;
      } else {
        const currentTeam = teamStandings[i];
        const previousTeam = teamStandings[i - 1];
        
        const isTied = currentTeam.points === previousTeam.points &&
                       currentTeam.goals_for === previousTeam.goals_for &&
                       currentTeam.goal_difference === previousTeam.goal_difference;
        
        if (isTied) {
          teamStandings[i].position = previousTeam.position;
        } else {
          currentPosition = i + 1;
          teamStandings[i].position = currentPosition;
        }
      }
    }
    
    console.log('\n3️⃣ 修正後のランキング結果:');
    teamStandings.forEach(team => {
      console.log(`  ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
    });
    
    // データベース更新
    console.log('\n4️⃣ データベース更新実行...');
    const updateResult = await client.execute(`
      UPDATE t_match_blocks 
      SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
      WHERE match_block_id = ?
    `, [JSON.stringify(teamStandings), matchBlockId]);
    
    console.log(`✅ DB更新完了: ${updateResult.rowsAffected}行が更新されました`);
    
    // 更新後確認
    const verifyResult = await client.execute(`
      SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?
    `, [matchBlockId]);
    
    if (verifyResult.rows[0]?.team_rankings) {
      const updated = JSON.parse(verifyResult.rows[0].team_rankings);
      console.log('\n📊 更新後のDB値確認:');
      updated.forEach(team => {
        console.log(`  ${team.position}. ${team.team_name} - GF:${team.goals_for}(${typeof team.goals_for}) GA:${team.goals_against}(${typeof team.goals_against}) GD:${team.goal_difference}(${typeof team.goal_difference})`);
      });
    }
    
    console.log('\n✅ 数値化修正テスト完了');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

testNumericGoals();