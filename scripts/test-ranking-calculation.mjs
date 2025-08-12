#!/usr/bin/env node

// ランキング計算テスト
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function manualRankingsUpdate() {
  try {
    console.log('🔄 手動でランキング計算を実行...\n');
    
    const matchBlockId = 14;
    const tournamentId = 3;
    
    // チーム一覧を取得
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
    
    // 確定済み試合を取得
    const matchesResult = await client.execute(`
      SELECT 
        team1_id,
        team2_id,
        team1_scores,
        team2_scores,
        winner_team_id
      FROM t_matches_final
      WHERE match_block_id = ?
    `, [matchBlockId]);
    
    console.log(`チーム数: ${teamsResult.rows.length}, 確定試合数: ${matchesResult.rows.length}`);
    
    // ランキング計算
    const teamStandings = teamsResult.rows.map(team => {
      const teamId = team.team_id;
      const teamMatches = matchesResult.rows.filter(match => 
        match.team1_id === teamId || match.team2_id === teamId
      );
      
      let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, points = 0;
      
      teamMatches.forEach(match => {
        const isTeam1 = match.team1_id === teamId;
        const teamGoals = isTeam1 ? Number(match.team1_scores) : Number(match.team2_scores);
        const opponentGoals = isTeam1 ? Number(match.team2_scores) : Number(match.team1_scores);
        
        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;
        
        if (!match.winner_team_id) {
          draws++;
          points += 1;
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += 3;
        } else {
          losses++;
        }
      });
      
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
    
    console.log('\n📊 計算結果:');
    teamStandings.forEach(team => {
      console.log(`  ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GD:${team.goal_difference}`);
    });
    
    // データベースに保存
    await client.execute(`
      UPDATE t_match_blocks 
      SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
      WHERE match_block_id = ?
    `, [JSON.stringify(teamStandings), matchBlockId]);
    
    console.log('\n✅ ランキングをデータベースに保存しました');
    
    // 保存結果確認
    const verifyResult = await client.execute(`
      SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?
    `, [matchBlockId]);
    
    if (verifyResult.rows[0]?.team_rankings) {
      console.log('✅ 保存確認: team_rankingsデータが正常に保存されています');
    } else {
      console.log('❌ 保存確認: team_rankingsデータが保存されていません');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

manualRankingsUpdate();