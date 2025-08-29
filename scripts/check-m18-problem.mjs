import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * M18の問題を詳しく調査
 */
async function checkM18Problem() {
  try {
    console.log('🔍 M18の問題を詳細調査...');
    
    // M18のテンプレート構成を確認
    const m18Template = await db.execute({
      sql: `
        SELECT team1_source, team2_source, match_code
        FROM m_match_templates 
        WHERE format_id = 10 AND match_code = 'M18'
      `
    });
    
    if (m18Template.rows.length > 0) {
      console.log('M18テンプレート構成:');
      console.log(`  Team1: ${m18Template.rows[0].team1_source}`);
      console.log(`  Team2: ${m18Template.rows[0].team2_source}`);
    }
    
    // M18の実際の構成
    const m18Actual = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_display_name, ml.team2_display_name,
          ml.team1_id, ml.team2_id,
          mf.winner_team_id
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final' AND ml.match_code = 'M18'
      `
    });
    
    if (m18Actual.rows.length > 0) {
      const match = m18Actual.rows[0];
      console.log('\nM18実際の構成:');
      console.log(`  Team1: ${match.team1_display_name} (${match.team1_id})`);
      console.log(`  Team2: ${match.team2_display_name} (${match.team2_id})`);
      console.log(`  勝者: ${match.winner_team_id}`);
    }
    
    // M2の勝者を確認（M18のteam2_sourceに関連）
    const m2 = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_display_name, ml.team2_display_name,
          mf.winner_team_id
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final' AND ml.match_code = 'M2'
      `
    });
    
    if (m2.rows.length > 0) {
      const match = m2.rows[0];
      console.log('\nM2の結果:');
      console.log(`  対戦: ${match.team1_display_name} vs ${match.team2_display_name}`);
      console.log(`  勝者: ${match.winner_team_id}`);
    }
    
    // Cブロック1位を確認
    const cBlock = await db.execute({
      sql: `
        SELECT team_rankings
        FROM t_match_blocks 
        WHERE tournament_id = 9 AND phase = 'preliminary' AND block_name = 'C'
      `
    });
    
    if (cBlock.rows.length > 0 && cBlock.rows[0].team_rankings) {
      const rankings = JSON.parse(cBlock.rows[0].team_rankings);
      const firstPlace = rankings.find(team => team.position === 1);
      console.log('\nCブロック1位:');
      console.log(`  ${firstPlace.team_name} (${firstPlace.team_id})`);
      
      console.log('\n🔍 問題の分析:');
      console.log(`期待値 - M18 Team1: Cブロック1位 = ${firstPlace.team_name}`);
      console.log(`実際の値 - M18 Team1: ${m18Actual.rows[0]?.team1_display_name}`);
      
      const isCorrect = m18Actual.rows[0]?.team1_display_name === firstPlace.team_name;
      console.log(`結果: ${isCorrect ? '✅ 正しい' : '❌ 間違い'}`);
      
      if (!isCorrect) {
        console.log('\n❌ M18のTeam1が間違っています');
        console.log('これにより、DEEP BLUEが不正にM18に配置され、M18とM20の両方の勝者になってしまった');
        console.log('結果として、DEEP BLUEがM26とM28の両方に出場することになった');
      }
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
checkM18Problem();