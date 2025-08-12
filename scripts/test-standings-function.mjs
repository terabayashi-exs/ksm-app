#!/usr/bin/env node

// standings-calculator関数の動作テスト
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

// standings-calculatorのupdateBlockRankingsOnMatchConfirm相当の処理をシミュレート
async function testStandingsCalculatorFunction() {
  try {
    console.log('🧪 standings-calculator関数テスト...\n');
    
    const matchBlockId = 14;
    const tournamentId = 3;
    
    console.log(`🔄 updateBlockRankingsOnMatchConfirm(${matchBlockId}, ${tournamentId}) シミュレート`);
    
    // 1. チーム一覧取得（calculateBlockStandingsのロジック）
    console.log('\n1️⃣ チーム一覧取得:');
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
    
    console.log(`   チーム数: ${teamsResult.rows.length}件`);
    
    // 2. 確定試合結果取得
    console.log('\n2️⃣ 確定試合結果取得:');
    const matchesResult = await client.execute(`
      SELECT 
        match_id,
        match_block_id,
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
    `, [matchBlockId]);
    
    console.log(`   確定済み試合: ${matchesResult.rows.length}件`);
    matchesResult.rows.forEach(match => {
      console.log(`     ${match.team1_id} vs ${match.team2_id}: ${match.team1_goals}-${match.team2_goals} (勝者:${match.winner_team_id || '引分'})`);
    });
    
    // 3. 大会設定取得
    console.log('\n3️⃣ 大会設定取得:');
    const tournamentResult = await client.execute(`
      SELECT 
        win_points, 
        draw_points, 
        loss_points,
        walkover_winner_goals,
        walkover_loser_goals
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);
    
    const winPoints = tournamentResult.rows?.[0]?.win_points || 3;
    const drawPoints = tournamentResult.rows?.[0]?.draw_points || 1;
    const lossPoints = tournamentResult.rows?.[0]?.loss_points || 0;
    
    console.log(`   勝点設定: 勝利=${winPoints}pts, 引分=${drawPoints}pts, 敗北=${lossPoints}pts`);
    
    if (!teamsResult.rows || teamsResult.rows.length === 0) {
      console.log('❌ チームが見つかりません');
      return;
    }
    
    // 4. 各チーム成績計算
    console.log('\n4️⃣ 各チーム成績計算:');
    const teamStandings = teamsResult.rows.map(team => {
      const teamId = team.team_id;
      
      // チームが関わる試合を抽出
      const teamMatches = matchesResult.rows.filter(match => 
        match.team1_id === teamId || match.team2_id === teamId
      );
      
      let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, points = 0;
      
      teamMatches.forEach(match => {
        const isTeam1 = match.team1_id === teamId;
        const teamGoals = isTeam1 ? Number(match.team1_goals) : Number(match.team2_goals);
        const opponentGoals = isTeam1 ? Number(match.team2_goals) : Number(match.team1_goals);
        
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
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        goal_difference: goalsFor - goalsAgainst
      };
    });
    
    // 5. ソート（standings-calculatorと同じロジック）
    teamStandings.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goals_for !== b.goals_for) return b.goals_for - a.goals_for;
      if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
      return a.team_name.localeCompare(b.team_name, 'ja');
    });
    
    // 6. 順位設定
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
    
    console.log('   計算結果:');
    teamStandings.forEach(team => {
      console.log(`     ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
    });
    
    // 7. データベース更新のテスト（実際には更新しない）
    console.log('\n5️⃣ データベース更新テスト:');
    console.log('   更新予定のJSON:');
    console.log(JSON.stringify(teamStandings, null, 2));
    
    // 現在のDBの値と比較
    const currentRankings = await client.execute(`
      SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?
    `, [matchBlockId]);
    
    if (currentRankings.rows[0]?.team_rankings) {
      const current = JSON.parse(currentRankings.rows[0].team_rankings);
      
      // 差分チェック
      let hasDiscrepancy = false;
      for (let i = 0; i < teamStandings.length; i++) {
        const calc = teamStandings[i];
        const db = current.find(c => c.team_id === calc.team_id);
        
        if (!db || calc.points !== db.points || calc.wins !== db.wins || calc.goals_for !== db.goals_for) {
          hasDiscrepancy = true;
          console.log(`   差異: ${calc.team_name} - 計算:${calc.points}pts DB:${db?.points || 'N/A'}pts`);
        }
      }
      
      if (!hasDiscrepancy) {
        console.log('   ✅ 計算結果とDB値が一致しています');
      } else {
        console.log('   ⚠️ 計算結果とDB値に差異があります');
      }
    }
    
    console.log('\n🎯 関数動作テスト完了');
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.close();
  }
}

testStandingsCalculatorFunction();