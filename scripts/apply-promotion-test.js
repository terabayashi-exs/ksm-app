// scripts/apply-promotion-test.js
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.DATABASE_URL || "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: process.env.DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function applyPromotionTest() {
  const tournamentId = 9;
  
  console.log('=== Applying Promotion Test ===');
  
  try {
    // テスト用の確定進出チーム（A～Dブロック + 単独1位のG,H,I,J,Kブロック）
    const confirmedPromotions = {
      'A_1': { team_id: 'u60', team_name: 'おらっちゃU-60エッホエッホ' },
      'A_2': { team_id: 'team03', team_name: '高岡南シニア' },
      'A_3': { team_id: 'ac', team_name: 'AC堀川' },
      'B_1': { team_id: 'team', team_name: 'TEAM ヤマサン(みねお)' },
      'B_2': { team_id: 'team05', team_name: 'チーム琴月' },
      'B_3': { team_id: 'kickofft', team_name: 'KICKOFF！TOYAMA' },
      'C_1': { team_id: 'team11', team_name: 'アカデミー' },
      'C_2': { team_id: 'teambayf', team_name: 'Team BayFlash' },
      'C_3': { team_id: 'deepblue', team_name: 'DEEP BLUE' },
      'D_1': { team_id: 'rb', team_name: 'R&B' },
      'D_2': { team_id: 'team15', team_name: 'チーム朝日' },
      'D_3': { team_id: 'team1', team_name: 'TEAM ヤマサン(ざきやま)' },
      'G_1': { team_id: 'team2', team_name: 'Team 岩本' },
      'H_1': { team_id: '8810', team_name: '8810' },
      'I_1': { team_id: 'fc1', team_name: 'FCやまもと' },
      'J_1': { team_id: 'muhi', team_name: 'チーム MUHI' },
      'K_1': { team_id: 'team41', team_name: 'モンスター！' }
    };

    console.log('Confirmed promotions:', Object.keys(confirmedPromotions).length);

    // 決勝トーナメントブロックを取得
    const finalBlockResult = await db.execute({
      sql: `
        SELECT match_block_id
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'final'
      `,
      args: [tournamentId]
    });

    if (finalBlockResult.rows.length === 0) {
      console.log('決勝トーナメントブロックが見つかりません');
      return;
    }

    const finalBlockId = finalBlockResult.rows[0].match_block_id;
    
    // 決勝トーナメント試合を取得
    const matchesResult = await db.execute({
      sql: `
        SELECT match_id, match_code, team1_id, team2_id, team1_display_name, team2_display_name
        FROM t_matches_live
        WHERE match_block_id = ?
        ORDER BY match_code
      `,
      args: [finalBlockId]
    });

    console.log(`決勝トーナメント試合: ${matchesResult.rows.length}件`);

    let updatesApplied = 0;

    // 各試合のチーム情報を更新
    for (const match of matchesResult.rows) {
      const matchId = match.match_id;
      const matchCode = match.match_code;
      const currentTeam1Name = match.team1_display_name;
      const currentTeam2Name = match.team2_display_name;
      
      let newTeam1Id = match.team1_id;
      let newTeam2Id = match.team2_id;
      let newTeam1Name = currentTeam1Name;
      let newTeam2Name = currentTeam2Name;
      let hasUpdate = false;
      
      console.log(`\n${matchCode}: "${currentTeam1Name}" vs "${currentTeam2Name}"`);
      
      // チーム1の更新
      const team1Match = findMatchingPromotion(currentTeam1Name, confirmedPromotions);
      if (team1Match) {
        newTeam1Id = team1Match.team_id;
        newTeam1Name = team1Match.team_name;
        hasUpdate = true;
        console.log(`  Team1 更新: "${currentTeam1Name}" → "${team1Match.team_name}"`);
      }
      
      // チーム2の更新
      const team2Match = findMatchingPromotion(currentTeam2Name, confirmedPromotions);
      if (team2Match) {
        newTeam2Id = team2Match.team_id;
        newTeam2Name = team2Match.team_name;
        hasUpdate = true;
        console.log(`  Team2 更新: "${currentTeam2Name}" → "${team2Match.team_name}"`);
      }
      
      // 更新が必要な場合のみ実行
      if (hasUpdate) {
        await db.execute({
          sql: `
            UPDATE t_matches_live 
            SET team1_id = ?, team2_id = ?, team1_display_name = ?, team2_display_name = ?, updated_at = datetime('now', '+9 hours')
            WHERE match_id = ?
          `,
          args: [newTeam1Id, newTeam2Id, newTeam1Name, newTeam2Name, matchId]
        });
        
        updatesApplied++;
        console.log(`  ✅ 更新完了`);
      } else {
        console.log(`  変更なし`);
      }
    }
    
    console.log(`\n=== 更新結果 ===`);
    console.log(`更新された試合数: ${updatesApplied}/${matchesResult.rows.length}`);
    
  } catch (error) {
    console.error('Apply promotion test error:', error);
    throw error;
  }
}

/**
 * プレースホルダーテキストから対応する進出チームを検索
 */
function findMatchingPromotion(displayName, promotions) {
  // パターン1: "A1位", "B2位", "C3位" などの形式（1-4位対応）
  const blockPositionMatch = displayName.match(/([A-L])([1-4])位/);
  if (blockPositionMatch) {
    const block = blockPositionMatch[1];
    const position = blockPositionMatch[2];
    const key = `${block}_${position}`;
    if (promotions[key]) {
      console.log(`    パターンマッチ成功: "${displayName}" → "${key}"`);
      return promotions[key];
    }
  }

  // パターン2: "A組1位", "B組2位" などの形式
  const blockGroupMatch = displayName.match(/([A-L])組([1-4])位/);
  if (blockGroupMatch) {
    const block = blockGroupMatch[1];
    const position = blockGroupMatch[2];
    const key = `${block}_${position}`;
    if (promotions[key]) {
      console.log(`    パターンマッチ成功: "${displayName}" → "${key}"`);
      return promotions[key];
    }
  }

  // パターン3: 個別パターン
  for (const [promotionKey, teamInfo] of Object.entries(promotions)) {
    const [block, position] = promotionKey.split('_');
    const blockPositionPattern = `${block}${position}位`;
    
    if (displayName.includes(blockPositionPattern)) {
      console.log(`    個別パターンマッチ成功: "${displayName}" → "${blockPositionPattern}"`);
      return teamInfo;
    }
  }

  return null;
}

applyPromotionTest().catch(console.error);