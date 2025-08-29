import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * M20の構成問題を詳しく調査
 */
async function investigateM20() {
  try {
    console.log('🔍 M20の進行を詳しく調査...');
    
    // M20の構成テンプレートを確認
    const template = await db.execute({
      sql: `
        SELECT team1_source, team2_source, match_code
        FROM m_match_templates 
        WHERE format_id = 10 AND match_code = 'M20'
      `
    });
    
    if (template.rows.length > 0) {
      console.log('M20テンプレート構成:');
      console.log(`  Team1: ${template.rows[0].team1_source}`);
      console.log(`  Team2: ${template.rows[0].team2_source}`);
    }
    
    // M20の実際の構成
    const actual = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_display_name, ml.team2_display_name,
          ml.team1_id, ml.team2_id,
          mf.winner_team_id
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final' AND ml.match_code = 'M20'
      `
    });
    
    if (actual.rows.length > 0) {
      const match = actual.rows[0];
      console.log('\nM20実際の構成:');
      console.log(`  Team1: ${match.team1_display_name} (${match.team1_id})`);
      console.log(`  Team2: ${match.team2_display_name} (${match.team2_id})`);
      console.log(`  勝者: ${match.winner_team_id}`);
    }
    
    // M4の勝者を確認（DEEP BLUEの正当な進出経路）
    const m4 = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_display_name, ml.team2_display_name,
          mf.winner_team_id
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final' AND ml.match_code = 'M4'
      `
    });
    
    if (m4.rows.length > 0) {
      const match = m4.rows[0];
      console.log('\nM4（DEEP BLUEの1回戦）:');
      console.log(`  対戦: ${match.team1_display_name} vs ${match.team2_display_name}`);
      console.log(`  勝者: ${match.winner_team_id}`);
    }
    
    // Round2の他の試合も確認
    console.log('\n🔍 Round2全試合を確認:');
    const round2 = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_display_name, ml.team2_display_name,
          mf.winner_team_id
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
          AND ml.match_code LIKE 'M%'
          AND CAST(SUBSTR(ml.match_code, 2) AS INTEGER) BETWEEN 17 AND 24
        ORDER BY ml.match_code
      `
    });
    
    round2.rows.forEach(match => {
      console.log(`${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name} → 勝者: ${match.winner_team_id}`);
    });
    
    // Round3への進出が正しいかチェック
    console.log('\n🔍 Round3進出チェック:');
    console.log('DEEP BLUEはM4で勝利 → M20で勝利 → Round3のM26へ進出（正当）');
    console.log('しかし、なぜM28にも出場しているのか？');
    
    // M28のテンプレートも確認
    const m28Template = await db.execute({
      sql: `
        SELECT team1_source, team2_source
        FROM m_match_templates 
        WHERE format_id = 10 AND match_code = 'M28'
      `
    });
    
    if (m28Template.rows.length > 0) {
      console.log('\nM28テンプレート構成:');
      console.log(`  Team1: ${m28Template.rows[0].team1_source}`);
      console.log(`  Team2: ${m28Template.rows[0].team2_source}`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
investigateM20();