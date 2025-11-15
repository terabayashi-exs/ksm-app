// Direct standings update for tournament 43
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// Import the actual standings calculation function
async function importStandingsCalculator() {
  // We can't directly import the TypeScript module, so we'll implement the fix here
  
  // parseScore function copy
  function parseScore(score) {
    if (score === null || score === undefined) {
      return 0;
    }
    
    if (typeof score === 'number') {
      return isNaN(score) ? 0 : score;
    }
    
    if (typeof score === 'bigint') {
      return Number(score);
    }
    
    if (typeof score === 'string') {
      if (score.trim() === '') {
        return 0;
      }
      
      if (score.includes(',')) {
        const total = score.split(',').reduce((sum, s) => sum + (parseInt(s.trim()) || 0), 0);
        return isNaN(total) ? 0 : total;
      }
      
      const parsed = parseInt(score.trim());
      return isNaN(parsed) ? 0 : parsed;
    }
    
    return 0;
  }

  async function calculateBlockStandings(matchBlockId, tournamentId) {
    console.log(`[STANDINGS] 順位計算開始: ブロック ${matchBlockId}, 大会 ${tournamentId}`);
    
    // チーム情報を取得
    const teamsResult = await client.execute({
      sql: `
        SELECT DISTINCT 
          tt.team_id,
          COALESCE(t.team_name, tt.team_name) as team_name,
          t.team_omission
        FROM t_tournament_teams tt
        LEFT JOIN m_teams t ON tt.team_id = t.team_id
        JOIN t_match_blocks mb ON tt.tournament_id = mb.tournament_id
        WHERE mb.match_block_id = ?
        AND tt.withdrawal_status != 'withdrawal_approved'
        ORDER BY tt.team_id
      `,
      args: [matchBlockId]
    });

    if (!teamsResult.rows || teamsResult.rows.length === 0) {
      console.log('[STANDINGS] チームが見つかりません');
      return [];
    }

    // 確定試合結果を取得
    const matchesResult = await client.execute({
      sql: `
        SELECT 
          match_id,
          match_block_id,
          team1_id,
          team2_id,
          team1_scores,
          team2_scores,
          winner_team_id,
          is_draw,
          is_walkover
        FROM t_matches_final
        WHERE match_block_id = ?
        AND (team1_id IS NOT NULL AND team2_id IS NOT NULL)
      `,
      args: [matchBlockId]
    });

    const matches = matchesResult.rows;
    console.log(`[STANDINGS] 確定済み試合数: ${matches.length}`);

    // 各チームの成績を計算
    const teamStandings = teamsResult.rows.map(team => {
      const teamId = team.team_id;
      
      // チームが関わる試合を抽出
      const teamMatches = matches.filter(match => 
        match.team1_id === teamId || match.team2_id === teamId
      );

      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      let points = 0;

      // 各試合の結果を集計
      teamMatches.forEach(match => {
        const isTeam1 = match.team1_id === teamId;
        let teamGoals;
        let opponentGoals;

        // 不戦勝・不戦敗の場合は設定値を使用
        if (match.is_walkover) {
          if (match.winner_team_id === teamId) {
            teamGoals = 3; // walkoverWinnerGoals
            opponentGoals = 0; // walkoverLoserGoals
          } else {
            teamGoals = 0; // walkoverLoserGoals
            opponentGoals = 3; // walkoverWinnerGoals
          }
        } else {
          // 通常の試合（カンマ区切りスコア対応）- ここが修正されたポイント
          teamGoals = isTeam1 ? parseScore(match.team1_scores) : parseScore(match.team2_scores);
          opponentGoals = isTeam1 ? parseScore(match.team2_scores) : parseScore(match.team1_scores);
        }

        // 得失点を集計
        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;

        // 勝敗を判定
        if (match.is_draw) {
          draws++;
          points += 1; // drawPoints
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += 3; // winPoints
        } else {
          losses++;
          // points += 0; // lossPoints
        }
      });

      return {
        team_id: teamId,
        team_name: team.team_name,
        team_omission: team.team_omission || undefined,
        position: 0, // 後で設定
        points,
        matches_played: teamMatches.length,
        wins,
        draws,
        losses,
        goals_for: Number(goalsFor),
        goals_against: Number(goalsAgainst),
        goal_difference: Number(goalsFor) - Number(goalsAgainst)
      };
    });

    // 順位を決定（正しい順序: 1.勝点 > 2.得失点差 > 3.総得点 > 4.直接対決 > 5.抽選）
    teamStandings.sort((a, b) => {
      // 1. 勝点の多い順
      if (a.points !== b.points) {
        return b.points - a.points;
      }
      
      // 2. 得失点差の良い順
      if (a.goal_difference !== b.goal_difference) {
        return b.goal_difference - a.goal_difference;
      }
      
      // 3. 総得点の多い順
      if (a.goals_for !== b.goals_for) {
        return b.goals_for - a.goals_for;
      }
      
      // 4. 直接対決の結果（簡略版）
      // 5. 抽選（チーム名の辞書順で代用）
      return a.team_name.localeCompare(b.team_name, 'ja');
    });

    // 同着対応の順位を設定
    let currentPosition = 1;
    for (let i = 0; i < teamStandings.length; i++) {
      if (i === 0) {
        teamStandings[i].position = 1;
      } else {
        const currentTeam = teamStandings[i];
        const previousTeam = teamStandings[i - 1];
        
        // 勝点、得失点差、総得点がすべて同じ場合のみ同順位
        const isTied = currentTeam.points === previousTeam.points &&
                      currentTeam.goal_difference === previousTeam.goal_difference &&
                      currentTeam.goals_for === previousTeam.goals_for;
        
        if (isTied) {
          teamStandings[i].position = previousTeam.position;
        } else {
          currentPosition = i + 1;
          teamStandings[i].position = currentPosition;
        }
      }
    }

    console.log(`[STANDINGS] 順位計算完了: ${teamStandings.length}チーム`);
    return teamStandings;
  }

  return { calculateBlockStandings };
}

async function updateStandings() {
  try {
    console.log('=== 大会43順位表直接更新 ===\n');
    
    const { calculateBlockStandings } = await importStandingsCalculator();
    
    // 大会43の全ブロックを取得
    const blocksResult = await client.execute(`
      SELECT match_block_id, block_name 
      FROM t_match_blocks 
      WHERE tournament_id = 43 AND phase = 'preliminary'
      ORDER BY block_name
    `);
    
    console.log('対象ブロック:');
    blocksResult.rows.forEach(block => {
      console.log(`  ${block.block_name}ブロック (ID: ${block.match_block_id})`);
    });
    
    // 各ブロックの順位を再計算・保存
    for (const block of blocksResult.rows) {
      console.log(`\n${block.block_name}ブロックの順位再計算中...`);
      
      try {
        const standings = await calculateBlockStandings(block.match_block_id, 43);
        
        // データベースに保存
        await client.execute({
          sql: `
            UPDATE t_match_blocks 
            SET 
              team_rankings = ?,
              updated_at = datetime('now', '+9 hours')
            WHERE match_block_id = ?
          `,
          args: [JSON.stringify(standings), block.match_block_id]
        });
        
        console.log(`  ✅ ${block.block_name}ブロック更新成功`);
        console.log(`    順位: ${standings.map(t => `${t.position}位 ${t.team_name}(${t.points}pt, ${t.goal_difference}差, ${t.goals_for}得点)`).join(', ')}`);
        
      } catch (blockError) {
        console.error(`  ❌ ${block.block_name}ブロック更新失敗:`, blockError);
      }
    }
    
    console.log('\n=== 順位表更新完了 ===');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    client.close();
  }
}

updateStandings();