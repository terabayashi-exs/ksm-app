#!/usr/bin/env node

// A3確定後の正しいランキング計算
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function manualRankingFix() {
  try {
    console.log('🔄 A3確定後の正しいランキング計算実行...\n');
    
    const matchBlockId = 14; // Block A
    const tournamentId = 3;
    
    // 1. チーム一覧を取得
    console.log('1️⃣ チーム一覧取得:');
    const teamsResult = await client.execute(`
      SELECT DISTINCT
        tt.team_id,
        t.team_name,
        t.team_omission
      FROM t_tournament_teams tt
      JOIN m_teams t ON tt.team_id = t.team_id
      WHERE tt.tournament_id = ? AND tt.assigned_block = 'A'
      ORDER BY t.team_name
    `, [tournamentId]);
    
    console.log(`   チーム数: ${teamsResult.rows.length}件`);
    teamsResult.rows.forEach(team => {
      console.log(`     - ${team.team_name} (${team.team_id})`);
    });
    
    // 2. 確定済み試合を取得（A3含む）
    console.log('\n2️⃣ 確定済み試合取得:');
    const matchesResult = await client.execute(`
      SELECT 
        match_code,
        team1_id,
        team2_id,
        team1_scores,
        team2_scores,
        winner_team_id,
        is_draw,
        is_walkover
      FROM t_matches_final
      WHERE match_block_id = ?
      ORDER BY match_code
    `, [matchBlockId]);
    
    console.log(`   確定済み試合: ${matchesResult.rows.length}件`);
    matchesResult.rows.forEach(match => {
      console.log(`     ${match.match_code}: ${match.team1_id} vs ${match.team2_id} (${match.team1_scores}-${match.team2_scores}) 勝者:${match.winner_team_id || '引分'}`);
    });
    
    // 3. 大会設定取得
    const tournamentResult = await client.execute(`
      SELECT win_points, draw_points, loss_points
      FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);
    
    const winPoints = tournamentResult.rows[0]?.win_points || 3;
    const drawPoints = tournamentResult.rows[0]?.draw_points || 1;
    const lossPoints = tournamentResult.rows[0]?.loss_points || 0;
    
    console.log(`\n3️⃣ 大会設定: 勝利=${winPoints}pts, 引分=${drawPoints}pts, 敗北=${lossPoints}pts`);
    
    // 4. 手動ランキング計算
    console.log('\n4️⃣ 手動ランキング計算:');
    const teamStandings = teamsResult.rows.map(team => {
      const teamId = team.team_id;
      console.log(`\n  📊 ${team.team_name} (${teamId}):`);
      
      // チームが関わる試合を抽出
      const teamMatches = matchesResult.rows.filter(match => 
        match.team1_id === teamId || match.team2_id === teamId
      );
      
      console.log(`    参加試合: ${teamMatches.length}件`);
      
      let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, points = 0;
      
      teamMatches.forEach(match => {
        const isTeam1 = match.team1_id === teamId;
        const teamGoals = Number(isTeam1 ? match.team1_scores : match.team2_scores);
        const opponentGoals = Number(isTeam1 ? match.team2_scores : match.team1_scores);
        
        console.log(`      ${match.match_code}: ${teamGoals}-${opponentGoals} (${isTeam1 ? 'Team1' : 'Team2'})`);
        
        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;
        
        if (match.is_draw) {
          draws++;
          points += drawPoints;
          console.log(`        → 引き分け: +${drawPoints}pts`);
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += winPoints;
          console.log(`        → 勝利: +${winPoints}pts`);
        } else {
          losses++;
          points += lossPoints;
          console.log(`        → 敗北: +${lossPoints}pts`);
        }
      });
      
      console.log(`    合計: ${points}pts (${wins}W ${draws}D ${losses}L) GF:${goalsFor} GA:${goalsAgainst} GD:${goalsFor - goalsAgainst}`);
      
      return {
        team_id: teamId,
        team_name: team.team_name,
        team_omission: team.team_omission,
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
    
    // 5. ソート（正しい順序：勝点 → 得失点差 → 総得点）
    teamStandings.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
      if (a.goals_for !== b.goals_for) return b.goals_for - a.goals_for;
      return a.team_name.localeCompare(b.team_name, 'ja');
    });
    
    // 6. 順位設定（修正されたロジック適用）
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
          // 同着判定（直接対決は省略、基本条件のみ）
          teamStandings[i].position = previousTeam.position;
        } else {
          currentPosition = i + 1;
          teamStandings[i].position = currentPosition;
        }
      }
    }
    
    console.log('\n5️⃣ 正しい計算結果:');
    teamStandings.forEach(team => {
      console.log(`  ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
    });
    
    // 6. データベース更新
    console.log('\n6️⃣ データベース更新実行...');
    await client.execute(`
      UPDATE t_match_blocks 
      SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
      WHERE match_block_id = ?
    `, [JSON.stringify(teamStandings), matchBlockId]);
    
    console.log('✅ ランキング更新完了');
    
    // 7. 更新確認
    const verifyResult = await client.execute(`
      SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?
    `, [matchBlockId]);
    
    if (verifyResult.rows[0]?.team_rankings) {
      const updated = JSON.parse(verifyResult.rows[0].team_rankings);
      console.log('\n📊 更新後のランキング確認:');
      updated.forEach(team => {
        console.log(`  ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

manualRankingFix();