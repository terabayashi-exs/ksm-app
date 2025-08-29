import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * 進出処理のデバッグ
 */
async function debugPromotion() {
  try {
    console.log('🔍 大会9の進出処理デバッグ...');
    
    const tournamentId = 9;
    
    // 1. 各ブロックの順位表を確認
    console.log('\n■ 各ブロック順位表:');
    const blocks = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          block_name,
          team_rankings,
          updated_at
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'preliminary'
        ORDER BY block_name
      `,
      args: [tournamentId]
    });

    const blockRankings = {};
    for (const block of blocks.rows) {
      if (block.team_rankings) {
        try {
          const rankings = JSON.parse(block.team_rankings);
          blockRankings[block.block_name] = rankings.sort((a, b) => a.position - b.position);
          console.log(`${block.block_name}ブロック:`);
          rankings.slice(0, 3).forEach(team => {
            console.log(`  ${team.position}位: ${team.team_name} (${team.team_id})`);
          });
        } catch (e) {
          console.error(`${block.block_name}ブロックの順位表パースエラー:`, e);
        }
      } else {
        console.log(`${block.block_name}ブロック: 順位表なし`);
      }
    }
    
    // 2. 必要な進出条件を確認
    console.log('\n■ 必要な進出条件:');
    const templateResult = await db.execute({
      sql: `
        SELECT DISTINCT team1_source, team2_source
        FROM m_match_templates
        WHERE format_id = 10 AND phase = 'final'
        AND (team1_source LIKE '%_1' OR team1_source LIKE '%_2' OR team1_source LIKE '%_3' OR team1_source LIKE '%_4'
             OR team2_source LIKE '%_1' OR team2_source LIKE '%_2' OR team2_source LIKE '%_3' OR team2_source LIKE '%_4')
      `
    });
    
    const requiredPromotions = new Set();
    templateResult.rows.forEach(row => {
      if (row.team1_source && row.team1_source.match(/^[A-L]_[1-4]$/)) {
        requiredPromotions.add(row.team1_source);
      }
      if (row.team2_source && row.team2_source.match(/^[A-L]_[1-4]$/)) {
        requiredPromotions.add(row.team2_source);
      }
    });
    
    console.log('必要な進出条件:', Array.from(requiredPromotions));
    
    // 3. 実際の進出状況を確認
    console.log('\n■ 現在の決勝トーナメント状況:');
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
      console.log(`  Team IDs: ${match.team1_id} vs ${match.team2_id}`);
    });
    
    // 4. 期待値と実際の違いをチェック
    console.log('\n■ 期待値と実際の比較:');
    console.log('C1位（期待値）: アカデミー (team11)');
    console.log('M18 Team1（実際）:', matches.rows.find(m => m.match_code === 'M18')?.team1_display_name);
    console.log('B1位（期待値）: TEAM ヤマサン(みねお) (team)');  
    console.log('M20 Team1（実際）:', matches.rows.find(m => m.match_code === 'M20')?.team1_display_name);
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
debugPromotion();