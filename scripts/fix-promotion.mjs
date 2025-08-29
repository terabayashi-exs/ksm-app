import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * 進出処理の修正実行
 */
async function fixPromotion() {
  try {
    console.log('🔧 大会9の進出処理を修正...');
    
    const tournamentId = 9;
    
    // 1. 各ブロックの順位表から正しい進出チームを抽出
    const blocks = await db.execute({
      sql: `
        SELECT 
          block_name,
          team_rankings
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'preliminary'
        AND team_rankings IS NOT NULL
        ORDER BY block_name
      `,
      args: [tournamentId]
    });

    const promotions = {};
    
    for (const block of blocks.rows) {
      if (block.team_rankings) {
        try {
          const rankings = JSON.parse(block.team_rankings);
          const sortedRankings = rankings.sort((a, b) => a.position - b.position);
          
          // 各順位のチームを抽出
          for (let position = 1; position <= 4; position++) {
            const teamsAtPosition = sortedRankings.filter(team => team.position === position);
            if (teamsAtPosition.length === 1) {
              const key = `${block.block_name}_${position}`;
              promotions[key] = {
                team_id: teamsAtPosition[0].team_id,
                team_name: teamsAtPosition[0].team_name
              };
              console.log(`✅ ${block.block_name}${position}位: ${teamsAtPosition[0].team_name}`);
            }
          }
        } catch (e) {
          console.error(`${block.block_name}ブロックの順位表パースエラー:`, e);
        }
      }
    }
    
    console.log(`\n進出チーム総数: ${Object.keys(promotions).length}チーム`);
    
    // 2. 修正が必要な試合を特定して修正
    const fixMapping = [
      // [matchCode, position, expectedKey, currentWrongTeam]
      ['M18', 'team1', 'C_1', 'DEEP BLUE'],  // C1位（アカデミー）
      ['M20', 'team1', 'B_1', 'KICKOFF！TOYAMA']  // B1位（TEAM ヤマサン(みねお)）
    ];
    
    for (const [matchCode, position, promotionKey, wrongTeam] of fixMapping) {
      if (promotions[promotionKey]) {
        const correctTeam = promotions[promotionKey];
        
        console.log(`\n🔧 ${matchCode} ${position}を修正:`);
        console.log(`  間違い: ${wrongTeam}`);
        console.log(`  正解: ${correctTeam.team_name} (${correctTeam.team_id})`);
        
        // 決勝トーナメントの該当試合を更新
        const updateResult = await db.execute({
          sql: `
            UPDATE t_matches_live 
            SET ${position}_id = ?, ${position}_display_name = ?, updated_at = datetime('now', '+9 hours')
            WHERE match_code = ? 
            AND match_block_id = (
              SELECT match_block_id FROM t_match_blocks 
              WHERE tournament_id = ? AND phase = 'final'
            )
          `,
          args: [correctTeam.team_id, correctTeam.team_name, matchCode, tournamentId]
        });
        
        if (updateResult.rowsAffected > 0) {
          console.log(`  ✅ ${matchCode} ${position}を更新しました`);
        } else {
          console.log(`  ❌ ${matchCode} ${position}の更新に失敗しました`);
        }
      } else {
        console.log(`❌ ${promotionKey}に対応するチームが見つかりません`);
      }
    }
    
    // 3. 修正後の状況を確認
    console.log('\n■ 修正後の決勝トーナメント状況:');
    const matches = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.team1_id,
          ml.team2_id
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.phase = 'final'
          AND ml.match_code IN ('M17', 'M18', 'M19', 'M20')
        ORDER BY ml.match_code
      `,
      args: [tournamentId]
    });
    
    matches.rows.forEach(match => {
      console.log(`${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
    });
    
    console.log('\n🎉 進出処理の修正が完了しました');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
fixPromotion();