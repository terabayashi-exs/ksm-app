import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * M28の問題を詳細調査
 */
async function checkM28() {
  try {
    console.log('🔍 M28の問題を詳細調査...');
    
    // M16の勝者確認
    const m16Result = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_name,
          COALESCE(tw.team_name, 
            CASE WHEN mf.winner_team_id = ml.team1_id THEN ml.team1_display_name
                 WHEN mf.winner_team_id = ml.team2_id THEN ml.team2_display_name
                 ELSE '不明' END
          ) as winner_name,
          mf.winner_team_id
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        LEFT JOIN m_teams tw ON mf.winner_team_id = tw.team_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
          AND ml.match_code = 'M16'
      `
    });
    
    if (m16Result.rows.length > 0) {
      const m16 = m16Result.rows[0];
      console.log('M16の勝者確認:');
      console.log('═══════════════════════════════════════════════');
      console.log(`対戦: ${m16.team1_name} vs ${m16.team2_name}`);
      console.log(`勝者: ${m16.winner_name} (${m16.winner_team_id})`);
    }
    
    // M20の勝者確認
    const m20Result = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          COALESCE(tw.team_name, 
            CASE WHEN mf.winner_team_id = ml.team1_id THEN ml.team1_display_name
                 WHEN mf.winner_team_id = ml.team2_id THEN ml.team2_display_name
                 ELSE '不明' END
          ) as winner_name,
          mf.winner_team_id
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams tw ON mf.winner_team_id = tw.team_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
          AND ml.match_code = 'M20'
      `
    });
    
    // 現在のM28確認
    const m28Result = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_name,
          ml.team1_id,
          ml.team2_id,
          mf.winner_team_id
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
          AND ml.match_code = 'M28'
      `
    });
    
    console.log('\n🔍 M28の問題分析:');
    console.log('═══════════════════════════════════════════════');
    
    if (m16Result.rows.length > 0 && m20Result.rows.length > 0 && m28Result.rows.length > 0) {
      const m16Winner = m16Result.rows[0].winner_name;
      const m20Winner = m20Result.rows[0].winner_name;
      const m28 = m28Result.rows[0];
      
      console.log(`テンプレート: M16勝者 vs M20勝者`);
      console.log(`期待値: ${m16Winner} vs ${m20Winner}`);
      console.log(`実際の値: ${m28.team1_name} vs ${m28.team2_name}`);
      
      const team1Correct = m28.team1_name === m16Winner;
      const team2Correct = m28.team2_name === m20Winner;
      
      console.log(`\nTeam1チェック: ${team1Correct ? '✅' : '❌'} (${team1Correct ? '正しい' : '間違い'})`);
      console.log(`Team2チェック: ${team2Correct ? '✅' : '❌'} (${team2Correct ? '正しい' : '間違い'})`);
      
      if (!team1Correct || !team2Correct) {
        console.log('\n🔧 修正が必要:');
        if (!team1Correct) {
          console.log(`  Team1: ${m28.team1_name} → ${m16Winner}`);
        }
        if (!team2Correct) {
          console.log(`  Team2: ${m28.team2_name} → ${m20Winner}`);
        }
        
        // 修正を実行するかどうか
        console.log('\n❗ この修正により、M28の確定済み結果がリセットされます');
        console.log('❗ トーナメント進行処理を再実行する必要があります');
      } else {
        console.log('\n✅ M28の対戦カードは正しく設定されています');
      }
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
checkM28();