import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * Round3テンプレートと実際の構成を詳細比較
 */
async function checkRound3Templates() {
  try {
    console.log('🔍 Round3テンプレートと実際の構成を詳細比較...');
    
    const tournamentId = 9;
    
    // Round3のテンプレートを確認
    const templates = await db.execute({
      sql: `
        SELECT match_code, team1_source, team2_source
        FROM m_match_templates
        WHERE format_id = 10 AND phase = 'final'
          AND match_code IN ('M25', 'M26', 'M27', 'M28')
        ORDER BY match_code
      `
    });
    
    // Round2の勝者マッピング
    const round2Winners = {
      'M17_winner': { team_id: 'team22', team_name: 'アース・k' },
      'M18_winner': { team_id: 'team11', team_name: 'アカデミー' },
      'M19_winner': { team_id: 'team13', team_name: 'ＨＯＫＵーＦ' },
      'M20_winner': { team_id: 'deepblue', team_name: 'DEEP BLUE' },
      'M21_winner': { team_id: 'team05', team_name: 'チーム琴月' },
      'M22_winner': { team_id: 'team46', team_name: 'ファースト' },
      'M23_winner': { team_id: '8810', team_name: '8810' },
      'M24_winner': { team_id: 'fc2', team_name: '十文字FC' }
    };
    
    console.log('Round3テンプレート構成:');
    console.log('═══════════════════════════════════════════════');
    
    for (const template of templates.rows) {
      const team1Expected = round2Winners[template.team1_source];
      const team2Expected = round2Winners[template.team2_source];
      
      console.log(`\\n${template.match_code}:`);
      console.log(`  テンプレート: ${template.team1_source} vs ${template.team2_source}`);
      
      if (team1Expected && team2Expected) {
        console.log(`  期待値: ${team1Expected.team_name} vs ${team2Expected.team_name}`);
        
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
          console.log(`  実際の値: ${match.team1_display_name} vs ${match.team2_display_name}`);
          
          const team1Correct = match.team1_id === team1Expected.team_id;
          const team2Correct = match.team2_id === team2Expected.team_id;
          
          console.log(`  Team1: ${team1Correct ? '✅' : '❌'} (${team1Correct ? '正しい' : '間違い'})`);
          console.log(`  Team2: ${team2Correct ? '✅' : '❌'} (${team2Correct ? '正しい' : '間違い'})`);
          
          if (!team1Correct) {
            console.log(`    修正必要: ${match.team1_display_name} (${match.team1_id}) → ${team1Expected.team_name} (${team1Expected.team_id})`);
          }
          if (!team2Correct) {
            console.log(`    修正必要: ${match.team2_display_name} (${match.team2_id}) → ${team2Expected.team_name} (${team2Expected.team_id})`);
          }
        }
      } else {
        console.log('  ❌ テンプレートソースに対応する勝者が見つかりません');
      }
    }
    
    // 現在のDEEP BLUEの出場状況を確認
    console.log('\\n🔍 現在のDEEP BLUE出場状況:');
    const deepBlueMatches = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_display_name, ml.team2_display_name,
          ml.team1_id, ml.team2_id
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.phase = 'final'
          AND (ml.team1_id = 'deepblue' OR ml.team2_id = 'deepblue')
          AND ml.match_code IN ('M25', 'M26', 'M27', 'M28')
        ORDER BY ml.match_code
      `,
      args: [tournamentId]
    });
    
    deepBlueMatches.rows.forEach(match => {
      const position = match.team1_id === 'deepblue' ? 'Team1' : 'Team2';
      console.log(`  ${match.match_code}: DEEP BLUE as ${position}`);
    });
    
    console.log(`\\nDEEP BLUEのRound3出場数: ${deepBlueMatches.rows.length} (期待値: 1)`);
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
checkRound3Templates();