import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * M18修正後の進出処理を再実行
 */
async function rerunPromotion() {
  try {
    console.log('🔄 M18修正後の進出処理を再実行...');
    
    const tournamentId = 9;
    
    // Round2の勝者を確認
    console.log('■ Round2勝者の確認:');
    const round2Winners = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_display_name, ml.team2_display_name,
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
    
    round2Winners.rows.forEach(match => {
      console.log(`${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name} → 勝者: ${match.winner_name} (${match.winner_team_id})`);
    });
    
    // Round3のテンプレートに基づく正しい対戦カードを計算
    console.log('\\n■ Round3の正しい対戦カード:');
    const round3Templates = await db.execute({
      sql: `
        SELECT match_code, team1_source, team2_source
        FROM m_match_templates
        WHERE format_id = 10 AND phase = 'final'
          AND match_code IN ('M25', 'M26', 'M27', 'M28')
        ORDER BY match_code
      `
    });
    
    const round2WinnerMap = {};
    round2Winners.rows.forEach(row => {
      round2WinnerMap[row.match_code + '_winner'] = {
        team_id: row.winner_team_id,
        team_name: row.winner_name
      };
    });
    
    console.log('Round2勝者マッピング:', round2WinnerMap);
    
    // 各Round3試合の正しい構成を計算して修正
    for (const template of round3Templates.rows) {
      const team1Source = round2WinnerMap[template.team1_source];
      const team2Source = round2WinnerMap[template.team2_source];
      
      if (team1Source && team2Source) {
        console.log(`\\n🔧 ${template.match_code}の修正:`);
        console.log(`  テンプレート: ${template.team1_source} vs ${template.team2_source}`);
        console.log(`  正しい対戦: ${team1Source.team_name} vs ${team2Source.team_name}`);
        
        // 現在の設定を確認
        const current = await db.execute({
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
        
        if (current.rows.length > 0) {
          const match = current.rows[0];
          console.log(`  現在の設定: ${match.team1_display_name} vs ${match.team2_display_name}`);
          
          const team1Correct = match.team1_id === team1Source.team_id;
          const team2Correct = match.team2_id === team2Source.team_id;
          
          if (!team1Correct || !team2Correct) {
            console.log(`  修正が必要: Team1=${!team1Correct ? '❌' : '✅'}, Team2=${!team2Correct ? '❌' : '✅'}`);
            
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
              
              // 確定済みの結果をクリア（新しい対戦カードのため）
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
              
              console.log(`  🔄 ${template.match_code}の確定済み結果をリセットしました`);
              
            } else {
              console.log(`  ❌ ${template.match_code}の修正に失敗しました`);
            }
          } else {
            console.log(`  ✅ ${template.match_code}は既に正しく設定されています`);
          }
        }
      }
    }
    
    console.log('\\n🎉 進出処理の再実行が完了しました');
    console.log('\\n📊 期待される結果:');
    console.log('1. DEEP BLUEはM28のみに出場（M26から削除）');
    console.log('2. ベスト16チーム数が正常になる（4チーム）');
    console.log('3. 順位表の計算が正しく動作する');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
rerunPromotion();