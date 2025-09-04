// scripts/comprehensive-promotion-fix.js
const { createClient } = require("@libsql/client");

// データベース接続設定
const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function comprehensivePromotionFix() {
  const tournamentId = 9;
  
  try {
    console.log('=== 包括的進出処理修正 (大会ID:9) ===\n');

    // 1. 決勝ブロックIDを取得
    const finalBlockResult = await db.execute({
      sql: `SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ? AND phase = 'final'`,
      args: [tournamentId]
    });
    
    if (finalBlockResult.rows.length === 0) {
      console.log('決勝ブロックが見つかりません');
      return;
    }
    
    const finalBlockId = finalBlockResult.rows[0].match_block_id;
    console.log(`決勝ブロックID: ${finalBlockId}\n`);

    // 2. 全予選ブロックの順位表から進出チームを作成
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
    console.log('=== 進出チーム情報構築 ===');

    for (const block of blocksResult.rows) {
      const blockName = block.block_name;
      const rankings = JSON.parse(block.team_rankings);
      
      console.log(`${blockName}ブロック:`);
      
      for (let position = 1; position <= 4; position++) {
        const teamsAtPosition = rankings.filter(team => team.position === position);
        if (teamsAtPosition.length === 1) {
          const key = `${blockName}_${position}`;
          promotions[key] = {
            team_id: teamsAtPosition[0].team_id,
            team_name: teamsAtPosition[0].team_name
          };
          console.log(`  ${position}位: ${teamsAtPosition[0].team_name}`);
        }
      }
    }

    console.log(`\n進出チーム総数: ${Object.keys(promotions).length}\n`);

    // 3. プレースホルダーが残っている試合を一括取得・更新
    const placeholderMatches = await db.execute({
      sql: `
        SELECT 
          match_id,
          match_code,
          team1_id,
          team2_id,
          team1_display_name,
          team2_display_name
        FROM t_matches_live
        WHERE match_block_id = ?
        AND (team1_display_name LIKE '%位' OR team2_display_name LIKE '%位')
        ORDER BY match_code
      `,
      args: [finalBlockId]
    });

    console.log(`=== プレースホルダー更新処理 (${placeholderMatches.rows.length}試合) ===`);

    let updatedCount = 0;

    for (const match of placeholderMatches.rows) {
      const matchId = match.match_id;
      const matchCode = match.match_code;
      const team1Name = match.team1_display_name;
      const team2Name = match.team2_display_name;
      
      let hasUpdate = false;
      let newTeam1Id = match.team1_id;
      let newTeam2Id = match.team2_id;
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

    console.log(`\n✅ ${updatedCount}試合のプレースホルダーを更新しました`);

    // 4. 最終結果確認
    const remainingPlaceholders = await db.execute({
      sql: `
        SELECT COUNT(*) as count
        FROM t_matches_live
        WHERE match_block_id = ?
        AND (team1_display_name LIKE '%位' OR team2_display_name LIKE '%位')
      `,
      args: [finalBlockId]
    });

    const remainingCount = remainingPlaceholders.rows[0].count;
    console.log(`\n残存プレースホルダー: ${remainingCount}試合`);

    if (remainingCount === 0) {
      console.log('🎉 全てのプレースホルダーが解決されました！');
    } else {
      // 残存プレースホルダーの詳細確認
      const remainingDetails = await db.execute({
        sql: `
          SELECT 
            match_code,
            team1_display_name,
            team2_display_name
          FROM t_matches_live
          WHERE match_block_id = ?
          AND (team1_display_name LIKE '%位' OR team2_display_name LIKE '%位')
          ORDER BY match_code
          LIMIT 5
        `,
        args: [finalBlockId]
      });

      console.log('\n未解決のプレースホルダー:');
      remainingDetails.rows.forEach(match => {
        console.log(`  ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
      });
    }

    console.log('\n🌐 http://localhost:3001/tournaments/9 で結果をご確認ください');

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

comprehensivePromotionFix();