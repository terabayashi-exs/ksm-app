import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * Round3を完全に修正
 */
async function fixRound3Completely() {
  try {
    console.log('🔧 Round3の完全修正を実行...');
    
    const tournamentId = 9;
    
    // 全Round1の勝者を取得
    console.log('■ Round1勝者の確認:');
    const round1Winners = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          mf.winner_team_id,
          COALESCE(tw.team_name, 
            CASE WHEN mf.winner_team_id = ml.team1_id THEN ml.team1_display_name
                 WHEN mf.winner_team_id = ml.team2_id THEN ml.team2_display_name
                 ELSE '不明' END
          ) as winner_name
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams tw ON mf.winner_team_id = tw.team_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.phase = 'final'
          AND ml.match_code LIKE 'M%'
          AND CAST(SUBSTR(ml.match_code, 2) AS INTEGER) BETWEEN 1 AND 16
        ORDER BY ml.match_code
      `,
      args: [tournamentId]
    });
    
    const round1WinnerMap = {};
    round1Winners.rows.forEach(row => {
      round1WinnerMap[row.match_code + '_winner'] = {
        team_id: row.winner_team_id,
        team_name: row.winner_name
      };
      console.log(`${row.match_code}_winner: ${row.winner_name} (${row.winner_team_id})`);
    });
    
    // Round2の勝者も追加
    const round2Winners = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          mf.winner_team_id,
          COALESCE(tw.team_name, 
            CASE WHEN mf.winner_team_id = ml.team1_id THEN ml.team1_display_name
                 WHEN mf.winner_team_id = ml.team2_id THEN ml.team2_display_name
                 ELSE '不明' END
          ) as winner_name
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams tw ON mf.winner_team_id = tw.team_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.phase = 'final'
          AND ml.match_code LIKE 'M%'
          AND CAST(SUBSTR(ml.match_code, 2) AS INTEGER) BETWEEN 17 AND 24
        ORDER BY ml.match_code
      `,
      args: [tournamentId]
    });
    
    round2Winners.rows.forEach(row => {
      round1WinnerMap[row.match_code + '_winner'] = {
        team_id: row.winner_team_id,
        team_name: row.winner_name
      };
    });
    
    // Round3のテンプレートを取得して修正
    console.log('\\n■ Round3の修正:');
    const templates = await db.execute({
      sql: `
        SELECT match_code, team1_source, team2_source
        FROM m_match_templates
        WHERE format_id = 10 AND phase = 'final'
          AND match_code IN ('M25', 'M26', 'M27', 'M28')
        ORDER BY match_code
      `
    });
    
    for (const template of templates.rows) {
      console.log(`\\n🔧 ${template.match_code}を修正:`);
      console.log(`  テンプレート: ${template.team1_source} vs ${template.team2_source}`);
      
      const team1Source = round1WinnerMap[template.team1_source];
      const team2Source = round1WinnerMap[template.team2_source];
      
      if (team1Source && team2Source) {
        console.log(`  期待値: ${team1Source.team_name} vs ${team2Source.team_name}`);
        
        // 実際の構成を確認
        const actual = await db.execute({
          sql: `
            SELECT 
              ml.team1_display_name, ml.team2_display_name,
              ml.team1_id, ml.team2_id
            FROM t_matches_live ml
            JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
            WHERE mb.tournament_id = ? AND mb.phase = 'final' AND ml.match_code = ?
          `,
          args: [tournamentId, template.match_code]
        });
        
        if (actual.rows.length > 0) {
          const match = actual.rows[0];
          console.log(`  現在の値: ${match.team1_display_name} vs ${match.team2_display_name}`);
          
          const team1Correct = match.team1_id === team1Source.team_id;
          const team2Correct = match.team2_id === team2Source.team_id;
          
          if (!team1Correct || !team2Correct) {
            console.log(`  修正実行: Team1=${!team1Correct ? '❌' : '✅'}, Team2=${!team2Correct ? '❌' : '✅'}`);
            
            // 確定済み結果を削除（対戦カードが変わるため）
            await db.execute({
              sql: `
                DELETE FROM t_matches_final 
                WHERE match_id = (
                  SELECT ml.match_id FROM t_matches_live ml
                  JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
                  WHERE mb.tournament_id = ? AND mb.phase = 'final' AND ml.match_code = ?
                )
              `,
              args: [tournamentId, template.match_code]
            });
            
            // 試合データを修正
            const updateResult = await db.execute({
              sql: `
                UPDATE t_matches_live 
                SET 
                  team1_id = ?, team1_display_name = ?,
                  team2_id = ?, team2_display_name = ?,
                  updated_at = datetime('now', '+9 hours')
                WHERE match_code = ? 
                AND match_block_id = (
                  SELECT match_block_id FROM t_match_blocks 
                  WHERE tournament_id = ? AND phase = 'final'
                )
              `,
              args: [
                team1Source.team_id, team1Source.team_name,
                team2Source.team_id, team2Source.team_name,
                template.match_code, tournamentId
              ]
            });
            
            if (updateResult.rowsAffected > 0) {
              console.log(`  ✅ ${template.match_code}を修正しました`);
            } else {
              console.log(`  ❌ ${template.match_code}の修正に失敗しました`);
            }
          } else {
            console.log(`  ✅ ${template.match_code}は既に正しく設定されています`);
          }
        }
      } else {
        console.log(`  ❌ ソース試合の勝者が見つかりません`);
        console.log(`    ${template.team1_source}: ${team1Source ? team1Source.team_name : '見つからず'}`);
        console.log(`    ${template.team2_source}: ${team2Source ? team2Source.team_name : '見つからず'}`);
      }
    }
    
    console.log('\\n🎉 Round3の完全修正が完了しました');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
fixRound3Completely();