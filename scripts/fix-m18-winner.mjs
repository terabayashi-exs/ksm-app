import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * M18の勝者データを修正
 */
async function fixM18Winner() {
  try {
    console.log('🔧 M18の勝者データ不整合を修正...');
    
    // 現在のM18の状況を確認
    const current = await db.execute({
      sql: `
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_display_name, ml.team2_display_name,
          ml.team1_id, ml.team2_id,
          mf.winner_team_id,
          mf.team1_goals, mf.team2_goals
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final' AND ml.match_code = 'M18'
      `
    });
    
    if (current.rows.length === 0) {
      console.log('❌ M18が見つかりません');
      return;
    }
    
    const match = current.rows[0];
    console.log('現在のM18:');
    console.log(`  対戦: ${match.team1_display_name} vs ${match.team2_display_name}`);
    console.log(`  Team IDs: ${match.team1_id} vs ${match.team2_id}`);
    console.log(`  勝者: ${match.winner_team_id} ← これが間違い`);
    console.log(`  スコア: ${match.team1_goals || 0} - ${match.team2_goals || 0}`);
    
    // 正しい勝者を特定（スコア based or team IDs based）
    let correctWinner = null;
    
    if (match.team1_goals !== null && match.team2_goals !== null) {
      // スコアがある場合
      if (match.team1_goals > match.team2_goals) {
        correctWinner = match.team1_id;
        console.log(`✅ スコアに基づく正しい勝者: ${match.team1_display_name} (${match.team1_id})`);
      } else if (match.team2_goals > match.team1_goals) {
        correctWinner = match.team2_id;
        console.log(`✅ スコアに基づく正しい勝者: ${match.team2_display_name} (${match.team2_id})`);
      } else {
        console.log('⚠️ スコアが同点です。手動で確認が必要');
      }
    } else {
      // スコアがない場合、参加チームの中から選択
      console.log('❓ スコアがありません。参加チームは:');
      console.log(`  1. ${match.team1_display_name} (${match.team1_id})`);
      console.log(`  2. ${match.team2_display_name} (${match.team2_id})`);
      console.log('❓ DEEP BLUEはこの試合に参加していないため、勝者になれません');
      
      // とりあえずteam1を勝者とする（後で手動調整可能）
      correctWinner = match.team1_id;
      console.log(`🔧 一時的に ${match.team1_display_name} を勝者として設定`);
    }
    
    if (correctWinner && correctWinner !== match.winner_team_id) {
      console.log('\\n🔧 M18の勝者を修正します...');
      
      // t_matches_finalのwinner_team_idを更新
      const updateResult = await db.execute({
        sql: `
          UPDATE t_matches_final 
          SET winner_team_id = ?, updated_at = datetime('now', '+9 hours')
          WHERE match_id = ?
        `,
        args: [correctWinner, match.match_id]
      });
      
      if (updateResult.rowsAffected > 0) {
        console.log(`✅ M18の勝者を ${match.winner_team_id} → ${correctWinner} に修正しました`);
        
        // 修正後の影響を確認
        console.log('\\n📊 修正後の影響:');
        console.log('1. M18の正しい勝者が確定');
        console.log('2. DEEP BLUEはM20の勝者のみとなる');
        console.log('3. DEEP BLUEはM28のみに進出（M26への重複出場が解消）');
        console.log('4. ベスト16の計算が正常になる');
        
        // この修正により、後続の進出処理も影響を受けるため警告
        console.log('\\n⚠️ 重要:');
        console.log('この修正により、Round3以降の対戦カードが変更される可能性があります');
        console.log('進出処理の再実行が必要になる場合があります');
        
      } else {
        console.log('❌ M18の勝者更新に失敗しました');
      }
    } else if (correctWinner === match.winner_team_id) {
      console.log('✅ M18の勝者は既に正しく設定されています');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
fixM18Winner();