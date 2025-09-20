// 大会43の順位表強制再計算スクリプト
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function recalculateTournament43() {
  try {
    console.log('=== 大会43 順位表強制再計算開始 ===\n');
    
    // 各ブロックのIDを取得
    const blocks = await client.execute(`
      SELECT match_block_id, block_name, phase 
      FROM t_match_blocks 
      WHERE tournament_id = 43 
      ORDER BY block_order
    `);
    
    console.log(`対象ブロック数: ${blocks.rows.length}`);
    
    for (const block of blocks.rows) {
      console.log(`\n--- ${block.block_name}ブロック (ID: ${block.match_block_id}) の再計算 ---`);
      
      // 確定済み試合を取得
      const matches = await client.execute(`
        SELECT 
          ml.match_id, ml.team1_id, ml.team2_id,
          mf.team1_scores, mf.team2_scores, mf.winner_team_id, mf.is_draw
        FROM t_matches_live ml
        JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_block_id = ?
      `, [block.match_block_id]);
      
      console.log(`確定済み試合数: ${matches.rows.length}`);
      
      if (matches.rows.length === 0) {
        console.log('確定済み試合がないためスキップ');
        continue;
      }
      
      // チーム成績を計算
      const teamStats = {};
      
      // すべてのチームを初期化
      const allTeams = new Set();
      matches.rows.forEach(match => {
        if (match.team1_id) allTeams.add(match.team1_id);
        if (match.team2_id) allTeams.add(match.team2_id);
      });
      
      allTeams.forEach(teamId => {
        teamStats[teamId] = {
          team_id: teamId,
          points: 0,
          matches_played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0
        };
      });
      
      // 試合結果を集計
      matches.rows.forEach(match => {
        if (!match.team1_id || !match.team2_id) return;
        
        const team1Goals = Number(match.team1_scores) || 0;
        const team2Goals = Number(match.team2_scores) || 0;
        
        // 基本統計を更新
        teamStats[match.team1_id].matches_played++;
        teamStats[match.team2_id].matches_played++;
        teamStats[match.team1_id].goals_for += team1Goals;
        teamStats[match.team1_id].goals_against += team2Goals;
        teamStats[match.team2_id].goals_for += team2Goals;
        teamStats[match.team2_id].goals_against += team1Goals;
        
        // 勝敗と勝点を計算
        if (match.is_draw) {
          teamStats[match.team1_id].draws++;
          teamStats[match.team2_id].draws++;
          teamStats[match.team1_id].points += 1;
          teamStats[match.team2_id].points += 1;
        } else if (match.winner_team_id === match.team1_id) {
          teamStats[match.team1_id].wins++;
          teamStats[match.team2_id].losses++;
          teamStats[match.team1_id].points += 3;
        } else if (match.winner_team_id === match.team2_id) {
          teamStats[match.team2_id].wins++;
          teamStats[match.team1_id].losses++;
          teamStats[match.team2_id].points += 3;
        }
      });
      
      // 得失点差を計算
      Object.values(teamStats).forEach(team => {
        team.goal_difference = team.goals_for - team.goals_against;
      });
      
      // チーム名を取得
      for (const teamId of Object.keys(teamStats)) {
        const teamInfo = await client.execute(`
          SELECT team_name, team_omission FROM m_teams WHERE team_id = ?
        `, [teamId]);
        
        if (teamInfo.rows.length > 0) {
          teamStats[teamId].team_name = teamInfo.rows[0].team_name;
          teamStats[teamId].team_omission = teamInfo.rows[0].team_omission;
        }
      }
      
      // 修正された順位決定ロジックを適用
      const standings = Object.values(teamStats).sort((a, b) => {
        // 1. 勝点
        if (a.points !== b.points) return b.points - a.points;
        // 2. 得失点差
        if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
        // 3. 総得点
        if (a.goals_for !== b.goals_for) return b.goals_for - a.goals_for;
        // 4. チーム名
        return a.team_name.localeCompare(b.team_name);
      });
      
      // 修正された同着判定で順位を設定
      let currentPosition = 1;
      for (let i = 0; i < standings.length; i++) {
        if (i === 0) {
          standings[i].position = 1;
        } else {
          const current = standings[i];
          const previous = standings[i - 1];
          
          // 勝点、得失点差、総得点がすべて同じ場合のみ同順位
          const isTied = current.points === previous.points &&
                        current.goal_difference === previous.goal_difference &&
                        current.goals_for === previous.goals_for;
          
          if (isTied) {
            standings[i].position = previous.position;
          } else {
            currentPosition = i + 1;
            standings[i].position = currentPosition;
          }
        }
      }
      
      console.log('計算結果:');
      standings.forEach(team => {
        console.log(`${team.position}位: ${team.team_name} (勝点:${team.points}, 得失点差:${team.goal_difference}, 総得点:${team.goals_for})`);
      });
      
      // データベースに保存
      const updatedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await client.execute(`
        UPDATE t_match_blocks 
        SET team_rankings = ?, updated_at = ?
        WHERE match_block_id = ?
      `, [JSON.stringify(standings), updatedAt, block.match_block_id]);
      
      console.log(`${block.block_name}ブロック 更新完了`);
    }
    
    console.log('\n=== 全ブロック再計算完了 ===');
    
  } catch (error) {
    console.error('エラー:', error);
  }
}

recalculateTournament43();