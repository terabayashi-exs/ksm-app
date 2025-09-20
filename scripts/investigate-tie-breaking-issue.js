// 大会43のAブロック同着問題を詳細調査
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function investigateTieBreakingIssue() {
  try {
    console.log('=== 大会43 Aブロック 同着問題調査 ===\n');
    
    // 1. 大会43のt_tournament_rulesを確認
    console.log('🔍 大会43の順位決定ルール:');
    const rulesResult = await client.execute(`
      SELECT 
        tournament_id,
        phase,
        tie_breaking_rules,
        point_system,
        created_at
      FROM t_tournament_rules
      WHERE tournament_id = 43
      ORDER BY phase, created_at
    `);
    
    if (rulesResult.rows.length === 0) {
      console.log('  ❌ t_tournament_rulesにデータが登録されていません');
    } else {
      rulesResult.rows.forEach(rule => {
        console.log(`  フェーズ: ${rule.phase}`);
        if (rule.tie_breaking_rules) {
          try {
            const tieRules = JSON.parse(rule.tie_breaking_rules);
            console.log(`  順位決定ルール: ${tieRules.map(r => r.type).join(' → ')}`);
          } catch (e) {
            console.log(`  順位決定ルール: 解析エラー`);
          }
        }
        if (rule.point_system) {
          try {
            const pointSystem = JSON.parse(rule.point_system);
            console.log(`  勝点システム: 勝利${pointSystem.win}点, 引分${pointSystem.draw}点, 敗北${pointSystem.loss}点`);
          } catch (e) {
            console.log(`  勝点システム: 解析エラー`);
          }
        }
        console.log('');
      });
    }
    
    // 2. Aブロックの詳細情報取得
    const aBlockResult = await client.execute(`
      SELECT match_block_id, block_name 
      FROM t_match_blocks 
      WHERE tournament_id = 43 AND block_name = 'A'
    `);
    
    if (aBlockResult.rows.length === 0) {
      console.log('❌ Aブロックが見つかりません');
      return;
    }
    
    const aBlockId = aBlockResult.rows[0].match_block_id;
    console.log(`📊 Aブロック ID: ${aBlockId}`);
    
    // 3. Aブロックの確定済み試合と結果を詳細に確認
    console.log('\n⚽ Aブロック確定済み試合詳細:');
    const matchesResult = await client.execute(`
      SELECT 
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        COALESCE(t1.team_name, ml.team1_display_name) as team1_name,
        COALESCE(t2.team_name, ml.team2_display_name) as team2_name,
        mf.team1_scores,
        mf.team2_scores,
        mf.period_count,
        mf.winner_team_id,
        mf.is_draw,
        mf.is_walkover
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
      LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
      WHERE ml.match_block_id = ? AND mf.match_id IS NOT NULL
      ORDER BY ml.match_code
    `, [aBlockId]);
    
    matchesResult.rows.forEach(match => {
      const resultText = match.is_draw ? '引分' : 
                        match.winner_team_id === match.team1_id ? `${match.team1_name}勝利` :
                        `${match.team2_name}勝利`;
      console.log(`  ${match.match_code}: ${match.team1_name} ${match.team1_scores} - ${match.team2_scores} ${match.team2_name} [${resultText}]`);
    });
    
    // 4. 各チームの成績を手動計算
    console.log('\n📊 各チームの成績詳細計算:');
    
    // 参加チーム一覧
    const teamsResult = await client.execute(`
      SELECT DISTINCT tt.team_id, t.team_name
      FROM t_tournament_teams tt
      INNER JOIN m_teams t ON tt.team_id = t.team_id
      WHERE tt.tournament_id = 43 AND tt.assigned_block = 'A'
      ORDER BY t.team_name
    `, []);
    
    const teamStats = {};
    
    // 各チームの初期化
    teamsResult.rows.forEach(team => {
      teamStats[team.team_id] = {
        team_id: team.team_id,
        team_name: team.team_name,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        head_to_head: {}
      };
    });
    
    // 各試合の結果を集計
    matchesResult.rows.forEach(match => {
      const team1_id = match.team1_id;
      const team2_id = match.team2_id;
      
      if (!teamStats[team1_id] || !teamStats[team2_id]) return;
      
      // スコア計算（カンマ区切り対応）
      const team1_goals = match.team1_scores ? 
        String(match.team1_scores).split(',').reduce((sum, s) => sum + (parseInt(s.trim()) || 0), 0) : 0;
      const team2_goals = match.team2_scores ? 
        String(match.team2_scores).split(',').reduce((sum, s) => sum + (parseInt(s.trim()) || 0), 0) : 0;
      
      // 両チームの統計更新
      teamStats[team1_id].matches_played++;
      teamStats[team2_id].matches_played++;
      teamStats[team1_id].goals_for += team1_goals;
      teamStats[team1_id].goals_against += team2_goals;
      teamStats[team2_id].goals_for += team2_goals;
      teamStats[team2_id].goals_against += team1_goals;
      
      // 勝敗・勝点計算
      if (match.is_draw) {
        teamStats[team1_id].draws++;
        teamStats[team2_id].draws++;
        teamStats[team1_id].points += 1;
        teamStats[team2_id].points += 1;
      } else if (match.winner_team_id === team1_id) {
        teamStats[team1_id].wins++;
        teamStats[team2_id].losses++;
        teamStats[team1_id].points += 3;
      } else {
        teamStats[team2_id].wins++;
        teamStats[team1_id].losses++;
        teamStats[team2_id].points += 3;
      }
      
      // 直接対戦記録
      if (!teamStats[team1_id].head_to_head[team2_id]) {
        teamStats[team1_id].head_to_head[team2_id] = { wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 };
      }
      if (!teamStats[team2_id].head_to_head[team1_id]) {
        teamStats[team2_id].head_to_head[team1_id] = { wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 };
      }
      
      teamStats[team1_id].head_to_head[team2_id].goals_for += team1_goals;
      teamStats[team1_id].head_to_head[team2_id].goals_against += team2_goals;
      teamStats[team2_id].head_to_head[team1_id].goals_for += team2_goals;
      teamStats[team2_id].head_to_head[team1_id].goals_against += team1_goals;
      
      if (match.is_draw) {
        teamStats[team1_id].head_to_head[team2_id].draws++;
        teamStats[team2_id].head_to_head[team1_id].draws++;
      } else if (match.winner_team_id === team1_id) {
        teamStats[team1_id].head_to_head[team2_id].wins++;
        teamStats[team2_id].head_to_head[team1_id].losses++;
      } else {
        teamStats[team2_id].head_to_head[team1_id].wins++;
        teamStats[team1_id].head_to_head[team2_id].losses++;
      }
    });
    
    // 得失点差計算
    Object.values(teamStats).forEach(team => {
      team.goal_difference = team.goals_for - team.goals_against;
    });
    
    // 成績表示
    const sortedTeams = Object.values(teamStats).sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
      if (a.goals_for !== b.goals_for) return b.goals_for - a.goals_for;
      return a.team_name.localeCompare(b.team_name);
    });
    
    sortedTeams.forEach((team, index) => {
      console.log(`  ${index + 1}位: ${team.team_name}`);
      console.log(`    勝点: ${team.points} (${team.wins}W ${team.draws}D ${team.losses}L)`);
      console.log(`    得失点: ${team.goals_for}-${team.goals_against} (差: ${team.goal_difference})`);
    });
    
    // 5. 同着チームの特定
    console.log('\n🎯 同着チーム分析:');
    const pointGroups = {};
    sortedTeams.forEach(team => {
      const key = `${team.points}_${team.goal_difference}_${team.goals_for}`;
      if (!pointGroups[key]) pointGroups[key] = [];
      pointGroups[key].push(team);
    });
    
    Object.entries(pointGroups).forEach(([key, teams]) => {
      if (teams.length > 1) {
        console.log(`  同着グループ (勝点${teams[0].points}, 得失点差${teams[0].goal_difference}, 総得点${teams[0].goals_for}):`);
        teams.forEach(team => {
          console.log(`    - ${team.team_name}`);
        });
        
        // 直接対戦結果確認
        if (teams.length === 2) {
          const team1 = teams[0];
          const team2 = teams[1];
          const h2h = team1.head_to_head[team2.team_id];
          if (h2h) {
            console.log(`    直接対戦: ${team1.team_name} ${h2h.wins}勝 ${h2h.draws}分 ${h2h.losses}敗 (${h2h.goals_for}-${h2h.goals_against})`);
            if (h2h.draws > 0 && h2h.wins === 0 && h2h.losses === 0) {
              console.log(`    → 引き分けのため抽選・手動順位設定が必要`);
            }
          }
        }
      }
    });
    
    // 6. 現在の順位表確認
    console.log('\n📋 現在システムの順位表:');
    const currentRankings = await client.execute(`
      SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?
    `, [aBlockId]);
    
    if (currentRankings.rows[0]?.team_rankings) {
      try {
        const rankings = JSON.parse(currentRankings.rows[0].team_rankings);
        rankings.slice(0, 6).forEach(team => {
          console.log(`  ${team.position}位: ${team.team_name} (${team.points}点, ${team.goals_for}-${team.goals_against})`);
        });
      } catch (e) {
        console.log('  順位表データの解析エラー');
      }
    }
    
    console.log('\n🎯 問題の特定:');
    console.log('1. t_tournament_rulesのカスタムルールが適用されているか？');
    console.log('2. 同着処理で直接対戦の引き分けが正しく処理されているか？');
    console.log('3. 抽選・手動順位設定の通知が作成されているか？');
    
  } catch (error) {
    console.error('調査エラー:', error);
  } finally {
    client.close();
  }
}

investigateTieBreakingIssue();