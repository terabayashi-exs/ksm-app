// scripts/force-promotion-update.js
// 手動順位設定後の進出処理を強制実行するスクリプト

const { createClient } = require('@libsql/client');

const db = createClient({
  url: 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

async function forcePromotionUpdate() {
  const tournamentId = 9;
  
  try {
    console.log('=== 強制進出処理実行 (大会ID:9) ===\n');

    // 1. 全ブロックの順位表から進出チームを構築
    const blocksResult = await db.execute({
      sql: `
        SELECT block_name, team_rankings 
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'preliminary' AND team_rankings IS NOT NULL
        ORDER BY block_name
      `,
      args: [tournamentId]
    });

    const promotions = {};
    console.log('=== 進出チーム一覧構築 ===');

    for (const block of blocksResult.rows) {
      const blockName = block.block_name;
      const rankings = JSON.parse(block.team_rankings);
      
      console.log(`${blockName}ブロック:`);
      
      // 1位から4位まで進出チームを設定
      for (let position = 1; position <= 4; position++) {
        const teamsAtPosition = rankings.filter(team => team.position === position);
        if (teamsAtPosition.length === 1) {
          const key = `${blockName}_${position}`;
          promotions[key] = {
            team_id: teamsAtPosition[0].team_id,
            team_name: teamsAtPosition[0].team_name
          };
          console.log(`  ${position}位: ${teamsAtPosition[0].team_name} (${teamsAtPosition[0].team_id})`);
        }
      }
    }

    console.log(`\n進出チーム総数: ${Object.keys(promotions).length}`);

    // 2. 決勝トーナメント試合を一括更新
    const finalBlockResult = await db.execute({
      sql: `SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ? AND phase = 'final'`,
      args: [tournamentId]
    });

    const finalBlockId = finalBlockResult.rows[0].match_block_id;

    const placeholderMatches = await db.execute({
      sql: `
        SELECT match_id, match_code, team1_display_name, team2_display_name
        FROM t_matches_live
        WHERE match_block_id = ?
        ORDER BY match_code
      `,
      args: [finalBlockId]
    });

    console.log(`\n=== 決勝トーナメント更新処理 (${placeholderMatches.rows.length}試合) ===`);

    let updatedCount = 0;

    for (const match of placeholderMatches.rows) {
      const matchId = match.match_id;
      const matchCode = match.match_code;
      const team1Name = match.team1_display_name;
      const team2Name = match.team2_display_name;

      let hasUpdate = false;
      let newTeam1Id = null;
      let newTeam2Id = null;
      let newTeam1Name = team1Name;
      let newTeam2Name = team2Name;

      // Team1の更新チェック
      const team1Update = findTeamPromotion(team1Name, promotions);
      if (team1Update) {
        newTeam1Id = team1Update.team_id;
        newTeam1Name = team1Update.team_name;
        hasUpdate = true;
      }

      // Team2の更新チェック
      const team2Update = findTeamPromotion(team2Name, promotions);
      if (team2Update) {
        newTeam2Id = team2Update.team_id;
        newTeam2Name = team2Update.team_name;
        hasUpdate = true;
      }

      if (hasUpdate) {
        await db.execute({
          sql: `
            UPDATE t_matches_live 
            SET team1_id = ?, team2_id = ?, team1_display_name = ?, team2_display_name = ?, updated_at = datetime('now', '+9 hours')
            WHERE match_id = ?
          `,
          args: [newTeam1Id, newTeam2Id, newTeam1Name, newTeam2Name, matchId]
        });

        console.log(`${matchCode}: [${team1Name} vs ${team2Name}] → [${newTeam1Name} vs ${newTeam2Name}]`);
        updatedCount++;
      }
    }

    console.log(`\n✅ ${updatedCount}試合を更新しました`);

    // 3. 特にD_2の更新を確認
    console.log('\n=== D_2進出確認 ===');
    const d2Team = promotions['D_2'];
    if (d2Team) {
      console.log(`D_2進出チーム: ${d2Team.team_name} (${d2Team.team_id})`);
      
      // M9の最終確認
      const m9Check = await db.execute({
        sql: `
          SELECT team1_display_name, team2_display_name, team1_id, team2_id
          FROM t_matches_live
          WHERE match_code = 'M9' AND match_block_id = ?
        `,
        args: [finalBlockId]
      });
      
      const m9 = m9Check.rows[0];
      console.log(`M9現在: ${m9.team1_display_name} vs ${m9.team2_display_name}`);
      
      if (m9.team2_id === d2Team.team_id) {
        console.log('✅ D_2の進出が正常に反映されています');
      } else {
        console.log('❌ D_2の進出に問題があります');
      }
    } else {
      console.log('❌ D_2進出チームが見つかりません');
    }

    console.log('\n🎯 進出処理が完了しました');
    console.log('🌐 http://localhost:3001/tournaments/9 で結果をご確認ください');

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    process.exit(0);
  }
}

function findTeamPromotion(displayName, promotions) {
  // A-Lブロック・1-4位対応の正規表現
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

forcePromotionUpdate();