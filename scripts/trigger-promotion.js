// scripts/trigger-promotion.js
const { createClient } = require("@libsql/client");

// データベース接続設定
const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

// 修正されたpromoteTeamsToFinalTournament関数をシミュレート
async function testPromoteTeams() {
  const tournamentId = 9;
  
  try {
    console.log('=== 進出処理シミュレーション開始 ===\n');

    // 1. 各ブロックの順位表を取得
    const blocksResult = await db.execute({
      sql: `
        SELECT 
          block_name,
          team_rankings
        FROM t_match_blocks 
        WHERE tournament_id = ? 
        AND phase = 'preliminary'
        AND team_rankings IS NOT NULL
        ORDER BY block_name
      `,
      args: [tournamentId]
    });

    console.log('取得されたブロック順位表:');
    const blockRankings = [];
    const promotions = {};

    for (const block of blocksResult.rows) {
      const blockName = block.block_name;
      const rankings = JSON.parse(block.team_rankings);
      
      console.log(`\n${blockName}ブロック:`);
      
      blockRankings.push({
        block_name: blockName,
        rankings: rankings
      });
      
      // 上位4位までの進出情報を作成
      for (let position = 1; position <= 4; position++) {
        const teamsAtPosition = rankings.filter(team => team.position === position);
        if (teamsAtPosition.length === 1) {
          const key = `${blockName}_${position}`;
          promotions[key] = {
            team_id: teamsAtPosition[0].team_id,
            team_name: teamsAtPosition[0].team_name
          };
          console.log(`  ${position}位: ${teamsAtPosition[0].team_name} → ${key}`);
        } else if (teamsAtPosition.length > 1) {
          console.log(`  ${position}位: 同着${teamsAtPosition.length}チーム（手動決定待ち）`);
        }
      }
    }

    console.log('\n=== 進出チーム情報 ===');
    Object.entries(promotions).forEach(([key, team]) => {
      console.log(`${key}: ${team.team_name} (ID: ${team.team_id})`);
    });

    // 2. 決勝トーナメント試合の更新対象を確認
    console.log('\n=== 更新対象試合確認 ===');
    const finalMatchesResult = await db.execute({
      sql: `
        SELECT 
          match_id,
          match_code,
          team1_id,
          team2_id,
          team1_display_name,
          team2_display_name
        FROM t_matches_live
        WHERE match_block_id = (
          SELECT match_block_id 
          FROM t_match_blocks 
          WHERE tournament_id = ? AND phase = 'final'
        )
        ORDER BY match_code
      `,
      args: [tournamentId]
    });

    console.log('\n更新予定:');
    
    for (const match of finalMatchesResult.rows) {
      const matchCode = match.match_code;
      const team1Name = match.team1_display_name;
      const team2Name = match.team2_display_name;
      
      // team1の更新チェック
      const team1Update = findTeamUpdate(team1Name, promotions);
      const team2Update = findTeamUpdate(team2Name, promotions);
      
      if (team1Update || team2Update) {
        console.log(`\n${matchCode}:`);
        if (team1Update) {
          console.log(`  Team1: "${team1Name}" → "${team1Update.team_name}"`);
        } else {
          console.log(`  Team1: "${team1Name}" (変更なし)`);
        }
        
        if (team2Update) {
          console.log(`  Team2: "${team2Name}" → "${team2Update.team_name}"`);
        } else {
          console.log(`  Team2: "${team2Name}" (変更なし)`);
        }
      }
    }

    // 3. 実際のデータベース更新（F2位、H2位の例）
    console.log('\n=== 実際のデータベース更新 ===');
    
    const f2Team = promotions['F_2'];
    const h2Team = promotions['H_2'];
    
    if (f2Team) {
      console.log(`F2位 → ${f2Team.team_name} の更新処理...`);
      await db.execute({
        sql: `
          UPDATE t_matches_live 
          SET team2_id = ?, team2_display_name = ?, updated_at = datetime('now', '+9 hours')
          WHERE match_code = 'M1' AND team2_display_name = 'F2位'
        `,
        args: [f2Team.team_id, f2Team.team_name]
      });
      console.log('✅ M1試合のF2位を更新しました');
    }
    
    if (h2Team) {
      console.log(`H2位 → ${h2Team.team_name} の更新処理...`);
      await db.execute({
        sql: `
          UPDATE t_matches_live 
          SET team1_id = ?, team1_display_name = ?, updated_at = datetime('now', '+9 hours')
          WHERE match_code = 'M2' AND team1_display_name = 'H2位'
        `,
        args: [h2Team.team_id, h2Team.team_name]
      });
      console.log('✅ M2試合のH2位を更新しました');
    }

    // 4. 更新結果確認
    console.log('\n=== 更新結果確認 ===');
    const updatedMatchesResult = await db.execute({
      sql: `
        SELECT 
          match_code,
          team1_display_name,
          team2_display_name
        FROM t_matches_live
        WHERE match_code IN ('M1', 'M2')
        ORDER BY match_code
      `,
      args: []
    });

    updatedMatchesResult.rows.forEach(match => {
      console.log(`${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
    });

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    process.exit(0);
  }
}

function findTeamUpdate(displayName, promotions) {
  // A-Lブロック対応の正規表現
  const blockPositionMatch = displayName.match(/([A-L])([1-4])位/);
  if (blockPositionMatch) {
    const block = blockPositionMatch[1];
    const position = blockPositionMatch[2];
    const key = `${block}_${position}`;
    if (promotions[key]) {
      return promotions[key];
    }
  }
  return null;
}

testPromoteTeams();