import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * DEEP BLUEの全試合履歴を詳細調査
 */
async function checkDeepBlue() {
  try {
    console.log('🔍 DEEP BLUEの決勝トーナメント全試合履歴を調査...');
    
    // DEEP BLUEの全試合履歴を確認
    const result = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_name,
          ml.team1_id, ml.team2_id,
          mf.winner_team_id,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
          CASE 
            WHEN ml.match_code LIKE 'M%' AND CAST(SUBSTR(ml.match_code, 2) AS INTEGER) BETWEEN 1 AND 16 THEN 'Round1'
            WHEN ml.match_code LIKE 'M%' AND CAST(SUBSTR(ml.match_code, 2) AS INTEGER) BETWEEN 17 AND 24 THEN 'Round2'
            WHEN ml.match_code LIKE 'M%' AND CAST(SUBSTR(ml.match_code, 2) AS INTEGER) BETWEEN 25 AND 28 THEN 'Round3'
            WHEN ml.match_code LIKE 'M%' AND CAST(SUBSTR(ml.match_code, 2) AS INTEGER) BETWEEN 29 AND 32 THEN 'QF'
            WHEN ml.match_code LIKE 'M%' AND CAST(SUBSTR(ml.match_code, 2) AS INTEGER) BETWEEN 33 AND 34 THEN 'SF'
            ELSE 'Other'
          END as round
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
          AND (ml.team1_id = 'deepblue' OR ml.team2_id = 'deepblue')
        ORDER BY ml.match_code
      `
    });
    
    console.log('DEEP BLUEの決勝トーナメント全試合履歴:');
    console.log('═══════════════════════════════════════════════');
    
    result.rows.forEach(match => {
      const isTeam1 = match.team1_id === 'deepblue';
      const opponent = isTeam1 ? match.team2_name : match.team1_name;
      const won = match.winner_team_id === 'deepblue';
      const result_text = match.is_confirmed ? (won ? '勝利' : '敗北') : '未確定';
      
      console.log(`${match.match_code} (${match.round}): DEEP BLUE vs ${opponent}`);
      console.log(`  結果: ${result_text} (確定: ${match.is_confirmed ? 'Yes' : 'No'})`);
      console.log(`  勝者: ${match.winner_team_id || 'なし'}`);
      console.log('');
    });
    
    // Round3での敗北回数をカウント
    const round3Losses = result.rows.filter(match => 
      match.round === 'Round3' && 
      match.is_confirmed && 
      match.winner_team_id && 
      match.winner_team_id !== 'deepblue'
    );
    
    console.log(`📊 DEEP BLUEのRound3敗北数: ${round3Losses.length}`);
    
    if (round3Losses.length > 1) {
      console.log('❌ 異常: 同一チームがRound3で複数回敗北しています');
      console.log('Round3敗北試合:');
      round3Losses.forEach(match => {
        console.log(`  ${match.match_code}: 敗北`);
      });
    } else if (round3Losses.length === 1) {
      console.log('✅ 正常: DEEP BLUEはRound3で1回のみ敗北');
    } else {
      console.log('🤔 DEEP BLUEはRound3で敗北していません');
    }
    
    // 実際の問題を特定
    console.log('\n🔍 問題の特定:');
    console.log('DEEP BLUEがM26とM28の両方に出場している理由を調査...');
    
    const m26 = result.rows.find(m => m.match_code === 'M26');
    const m28 = result.rows.find(m => m.match_code === 'M28');
    
    if (m26 && m28) {
      console.log('M26とM28の詳細:');
      console.log(`M26: ${m26.team1_name} vs ${m26.team2_name} (勝者: ${m26.winner_team_id})`);
      console.log(`M28: ${m28.team1_name} vs ${m28.team2_name} (勝者: ${m28.winner_team_id})`);
      
      // M26で敗北したDEEP BLUEがなぜM28に進出できるのかを調査
      if (m26.winner_team_id !== 'deepblue' && (m28.team1_id === 'deepblue' || m28.team2_id === 'deepblue')) {
        console.log('\\n❌ 矛盾発見: M26で敗北したDEEP BLUEがM28に出場しています');
        console.log('これはトーナメント進行処理の問題である可能性があります');
      }
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
checkDeepBlue();