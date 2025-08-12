#!/usr/bin/env node

// 確定APIの動作テスト
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function testConfirmAPI() {
  try {
    console.log('🧪 確定API動作テスト...\n');
    
    // A3試合の状況確認
    console.log('1️⃣ A3試合の現在状況:');
    const liveMatch = await client.execute(`
      SELECT 
        ml.*,
        mb.tournament_id,
        ms.match_status
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      WHERE ml.match_code = 'A3'
    `);
    
    if (liveMatch.rows.length === 0) {
      console.log('❌ A3試合が見つかりません');
      return;
    }
    
    const match = liveMatch.rows[0];
    console.log(`   試合ID: ${match.match_id}`);
    console.log(`   対戦: ${match.team1_id} vs ${match.team2_id}`);
    console.log(`   スコア: ${match.team1_scores}-${match.team2_scores}`);
    console.log(`   勝者: ${match.winner_team_id}`);
    console.log(`   ステータス: ${match.match_status || 'なし'}`);
    
    // 既に確定済みかチェック
    const finalMatch = await client.execute(`
      SELECT * FROM t_matches_final WHERE match_id = ?
    `, [match.match_id]);
    
    console.log(`   確定済み: ${finalMatch.rows.length > 0 ? 'Yes' : 'No'}`);
    
    if (finalMatch.rows.length > 0) {
      console.log(`   確定日時: ${finalMatch.rows[0].created_at}`);
    }
    
    // confirm APIのロジックをシミュレート
    console.log('\\n2️⃣ 確定処理シミュレーション:');
    
    if (finalMatch.rows.length > 0) {
      console.log('   ⚠️ 既に確定済みです。t_matches_finalから削除して再テストします。');
      
      // テスト用に一時的に削除
      await client.execute(`DELETE FROM t_matches_final WHERE match_id = ?`, [match.match_id]);
      console.log('   ✅ t_matches_finalから削除完了');
    }
    
    // 確定処理実行
    console.log('\\n3️⃣ 確定処理実行:');
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const confirmedBy = 'test-user';
    
    console.log('   t_matches_finalへのデータ移行...');
    await client.execute(`
      INSERT INTO t_matches_final (
        match_id, match_block_id, tournament_date, match_number, match_code,
        team1_id, team2_id, team1_display_name, team2_display_name,
        court_number, start_time, team1_scores, team2_scores, winner_team_id,
        is_draw, is_walkover, remarks, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      match.match_id,
      match.match_block_id,
      match.tournament_date,
      match.match_number,
      match.match_code,
      match.team1_id,
      match.team2_id,
      match.team1_display_name,
      match.team2_display_name,
      match.court_number,
      match.start_time,
      Math.floor(Number(match.team1_scores) || 0),
      Math.floor(Number(match.team2_scores) || 0),
      match.winner_team_id,
      match.winner_team_id ? 0 : 1, // is_draw
      0, // is_walkover
      match.remarks,
      now,
      now
    ]);
    
    console.log(`   ✅ t_matches_final登録完了 (確定者: ${confirmedBy})`);
    
    // 順位表更新前の状態記録
    console.log('\\n4️⃣ 順位表更新前の状態:');
    const beforeUpdate = await client.execute(`
      SELECT team_rankings, updated_at FROM t_match_blocks WHERE match_block_id = ?
    `, [match.match_block_id]);
    
    const beforeTime = beforeUpdate.rows[0]?.updated_at;
    console.log(`   更新前時刻: ${beforeTime}`);
    
    // standings-calculatorの更新を手動実行
    console.log('\\n5️⃣ 順位表更新実行:');
    console.log('   updateBlockRankingsOnMatchConfirm相当の処理...');
    
    // チーム取得
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
    `, [match.tournament_id, match.match_block_id]);
    
    // 確定試合取得
    const matchesResult = await client.execute(`
      SELECT 
        match_id, match_block_id, team1_id, team2_id,
        team1_scores as team1_goals, team2_scores as team2_goals,
        winner_team_id, is_draw, is_walkover
      FROM t_matches_final
      WHERE match_block_id = ?
      AND (team1_id IS NOT NULL AND team2_id IS NOT NULL)
    `, [match.match_block_id]);
    
    console.log(`   チーム数: ${teamsResult.rows.length}件`);
    console.log(`   確定試合数: ${matchesResult.rows.length}件`);
    
    // 大会設定取得
    const tournamentResult = await client.execute(`
      SELECT win_points, draw_points, loss_points
      FROM t_tournaments WHERE tournament_id = ?
    `, [match.tournament_id]);
    
    const winPoints = tournamentResult.rows?.[0]?.win_points || 3;
    const drawPoints = tournamentResult.rows?.[0]?.draw_points || 1;
    const lossPoints = tournamentResult.rows?.[0]?.loss_points || 0;
    
    // ランキング計算
    const teamStandings = teamsResult.rows.map(team => {
      const teamId = team.team_id;
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
        points, matches_played: teamMatches.length,
        wins, draws, losses,
        goals_for: goalsFor, goals_against: goalsAgainst,
        goal_difference: goalsFor - goalsAgainst
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
    
    // データベース更新
    const updateResult = await client.execute(`
      UPDATE t_match_blocks 
      SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
      WHERE match_block_id = ?
    `, [JSON.stringify(teamStandings), match.match_block_id]);
    
    console.log(`   ✅ DB更新完了: ${updateResult.rowsAffected}行が更新されました`);
    
    // 更新後の確認
    const afterUpdate = await client.execute(`
      SELECT team_rankings, updated_at FROM t_match_blocks WHERE match_block_id = ?
    `, [match.match_block_id]);
    
    const afterTime = afterUpdate.rows[0]?.updated_at;
    console.log(`   更新後時刻: ${afterTime}`);
    
    if (afterTime !== beforeTime) {
      console.log('   ✅ 更新時刻が変更されました（正常に更新されました）');
    } else {
      console.log('   ⚠️ 更新時刻が変更されていません');
    }
    
    console.log('\\n6️⃣ 最終結果:');
    teamStandings.forEach(team => {
      console.log(`   ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GF:${team.goals_for} GA:${team.goals_against} GD:${team.goal_difference}`);
    });
    
    console.log('\\n🎯 確定API動作テスト完了');
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.close();
  }
}

testConfirmAPI();