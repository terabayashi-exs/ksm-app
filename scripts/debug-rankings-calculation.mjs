#!/usr/bin/env node

// ランキング計算デバッグ
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function debugRankingsCalculation() {
  try {
    console.log('🔍 ランキング計算デバッグ...\n');
    
    const matchBlockId = 14; // Block A
    const tournamentId = 3;
    
    // 1. チーム一覧取得
    console.log('1️⃣ チーム一覧取得:');
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
    
    console.log(`   見つかったチーム: ${teamsResult.rows.length}件`);
    teamsResult.rows.forEach(team => {
      console.log(`     - ${team.team_name} (ID: ${team.team_id})`);
    });
    
    // 2. 確定済み試合取得
    console.log('\n2️⃣ 確定済み試合取得:');
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
      console.log(`     ${match.team1_id} vs ${match.team2_id}: ${match.team1_goals}-${match.team2_goals} (勝者:${match.winner_team_id || '引分'}, 引分:${match.is_draw})`);
    });
    
    // 3. 大会設定取得
    console.log('\n3️⃣ 大会設定取得:');
    const tournamentResult = await client.execute(`
      SELECT 
        win_points, 
        draw_points, 
        loss_points
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);
    
    const winPoints = tournamentResult.rows?.[0]?.win_points || 3;
    const drawPoints = tournamentResult.rows?.[0]?.draw_points || 1;
    const lossPoints = tournamentResult.rows?.[0]?.loss_points || 0;
    
    console.log(`   勝点設定: 勝利=${winPoints}pts, 引分=${drawPoints}pts, 敗北=${lossPoints}pts`);
    
    // 4. 手動でランキング計算
    console.log('\n4️⃣ 手動ランキング計算:');
    const teamStandings = teamsResult.rows.map(team => {
      const teamId = team.team_id;
      console.log(`\\n   📊 ${team.team_name} (${teamId}) の計算:`);
      
      // チームが関わる試合を抽出
      const teamMatches = matchesResult.rows.filter(match => 
        match.team1_id === teamId || match.team2_id === teamId
      );
      
      console.log(`     参加試合数: ${teamMatches.length}件`);
      
      let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, points = 0;
      
      teamMatches.forEach(match => {
        const isTeam1 = match.team1_id === teamId;
        const teamGoals = isTeam1 ? Number(match.team1_goals) : Number(match.team2_goals);
        const opponentGoals = isTeam1 ? Number(match.team2_goals) : Number(match.team1_goals);
        
        console.log(`     試合詳細: ${isTeam1 ? 'Team1' : 'Team2'} - 得点:${teamGoals}, 失点:${opponentGoals}`);
        console.log(`       → is_draw:${match.is_draw}, winner_team_id:${match.winner_team_id}`);
        
        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;
        
        if (match.is_draw) {
          draws++;
          points += drawPoints;
          console.log(`       → 引き分け: +${drawPoints}pts`);
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += winPoints;
          console.log(`       → 勝利: +${winPoints}pts`);
        } else {
          losses++;
          points += lossPoints;
          console.log(`       → 敗北: +${lossPoints}pts`);
        }
      });
      
      console.log(`     最終集計: ${points}pts (${wins}W ${draws}D ${losses}L) GF:${goalsFor} GA:${goalsAgainst} GD:${goalsFor - goalsAgainst}`);
      
      return {
        team_id: teamId,
        team_name: team.team_name,
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
    
    // ソート
    teamStandings.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    });
    
    // 順位設定
    teamStandings.forEach((team, index) => {
      team.position = index + 1;
    });
    
    console.log('\n5️⃣ 計算結果:');
    teamStandings.forEach(team => {
      console.log(`   ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
    });
    
    // 現在のDBの値と比較
    console.log('\n6️⃣ 現在のDB値と比較:');
    const currentRankings = await client.execute(`
      SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?
    `, [matchBlockId]);
    
    if (currentRankings.rows[0]?.team_rankings) {
      const current = JSON.parse(currentRankings.rows[0].team_rankings);
      console.log('   現在のDB値:');
      current.forEach(team => {
        console.log(`     ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
      });
      
      // 差分チェック
      const hasDiscrepancy = teamStandings.some((calc, index) => {
        const db = current[index];
        return calc.points !== db.points || calc.draws !== db.draws || calc.goals_for !== db.goals_for;
      });
      
      if (hasDiscrepancy) {
        console.log('\\n   ❌ 計算結果とDB値に差異があります！ランキング更新が必要です。');
      } else {
        console.log('\\n   ✅ 計算結果とDB値が一致しています。');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

debugRankingsCalculation();