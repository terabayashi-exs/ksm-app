// scripts/check-current-standings.mjs
import { createClient } from '@libsql/client';
import { config } from 'dotenv';

// 環境変数を読み込み
config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkCurrentStandings() {
  try {
    const tournamentId = 3;
    
    console.log('=== 大会3の現在の試合結果と順位表 ===');
    
    // 確定済み試合を確認
    console.log('\n【確定済み試合】');
    const matches = await client.execute({
      sql: `
        SELECT 
          mf.match_code,
          t1.team_name as team1_name,
          t2.team_name as team2_name,
          mf.team1_goals,
          mf.team2_goals,
          CASE 
            WHEN mf.is_draw = 1 THEN '引き分け'
            WHEN mf.winner_team_id = mf.team1_id THEN t1.team_name || ' 勝利'
            WHEN mf.winner_team_id = mf.team2_id THEN t2.team_name || ' 勝利'
            ELSE '未定'
          END as result
        FROM t_matches_final mf
        JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
        LEFT JOIN t_tournament_teams tt1 ON mf.team1_id = tt1.team_id AND mb.tournament_id = tt1.tournament_id
        LEFT JOIN m_teams t1 ON tt1.team_id = t1.team_id
        LEFT JOIN t_tournament_teams tt2 ON mf.team2_id = tt2.team_id AND mb.tournament_id = tt2.tournament_id
        LEFT JOIN m_teams t2 ON tt2.team_id = t2.team_id
        WHERE mb.tournament_id = ?
        ORDER BY mf.match_code
      `,
      args: [tournamentId]
    });
    
    if (matches.rows && matches.rows.length > 0) {
      matches.rows.forEach((match) => {
        console.log(`${match.match_code}: ${match.team1_name} ${match.team1_goals}-${match.team2_goals} ${match.team2_name} (${match.result})`);
      });
    } else {
      console.log('確定済み試合はありません');
    }
    
    // 現在の順位表を確認
    console.log('\n【現在の順位表】');
    const standings = await client.execute({
      sql: `
        SELECT 
          match_block_id,
          block_name,
          display_round_name,
          team_rankings
        FROM t_match_blocks 
        WHERE tournament_id = ?
        ORDER BY block_order
      `,
      args: [tournamentId]
    });
    
    standings.rows.forEach((block) => {
      console.log(`\n${block.display_round_name} ${block.block_name || ''}ブロック:`);
      
      if (block.team_rankings) {
        try {
          const rankings = JSON.parse(block.team_rankings);
          rankings.forEach((team) => {
            console.log(`  ${team.position}位: ${team.team_name} (勝点:${team.points}, 得点:${team.goals_for}, 失点:${team.goals_against}, 得失差:${team.goal_difference})`);
          });
        } catch (e) {
          console.log('  順位表の解析に失敗:', e.message);
        }
      } else {
        console.log('  順位表はまだ計算されていません');
      }
    });
    
    console.log('\n=== 確認完了 ===');
    console.log('新しい順位決定ルールを適用するには、以下のいずれかを実行してください:');
    console.log('1. 試合管理画面の「順位表更新」ボタンをクリック');
    console.log('   URL: http://localhost:3000/admin/tournaments/3/matches');
    console.log('2. 新しい試合を確定する（自動で順位表が更新されます）');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    client.close();
  }
}

checkCurrentStandings();