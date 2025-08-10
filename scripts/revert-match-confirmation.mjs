// scripts/revert-match-confirmation.mjs
import { createClient } from '@libsql/client';
import { config } from 'dotenv';

// 環境変数を読み込み
config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function revertMatchConfirmation() {
  try {
    const matchId = 33;
    
    console.log('=== 試合ID 33 の確定状態を戻しています ===');
    
    // 1. 現在の状態を確認
    console.log('1. 現在の状態を確認中...');
    const finalCheck = await client.execute({
      sql: 'SELECT * FROM t_matches_final WHERE match_id = ?',
      args: [matchId]
    });
    
    if (finalCheck.rows && finalCheck.rows.length > 0) {
      console.log('t_matches_final に確定済みレコードが存在します');
      console.log('確定日時:', finalCheck.rows[0].confirmed_at);
      console.log('確定者:', finalCheck.rows[0].confirmed_by);
    } else {
      console.log('t_matches_final に該当レコードが見つかりません（既に未確定状態）');
      return;
    }
    
    // 2. t_matches_final から該当レコードを削除
    console.log('2. t_matches_final からレコードを削除中...');
    const deleteResult = await client.execute({
      sql: 'DELETE FROM t_matches_final WHERE match_id = ?',
      args: [matchId]
    });
    console.log('削除されたレコード数:', deleteResult.rowsAffected);
    
    // 3. t_matches_live の状態を確認
    console.log('3. t_matches_live の状態を確認中...');
    const liveMatch = await client.execute({
      sql: `
        SELECT 
          ml.match_id, 
          ml.match_code, 
          ml.match_status,
          ml.team1_scores, 
          ml.team2_scores,
          ml.match_block_id,
          mb.tournament_id
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE ml.match_id = ?
      `,
      args: [matchId]
    });
    
    if (liveMatch.rows && liveMatch.rows.length > 0) {
      const match = liveMatch.rows[0];
      console.log('試合コード:', match.match_code);
      console.log('現在のステータス:', match.match_status);
      console.log('スコア:', match.team1_scores, '-', match.team2_scores);
      console.log('ブロックID:', match.match_block_id);
      console.log('大会ID:', match.tournament_id);
      
      // 4. 関連するブロックの順位表をリセット
      console.log('4. 関連ブロックの順位表をクリア中...');
      const clearRankings = await client.execute({
        sql: 'UPDATE t_match_blocks SET team_rankings = NULL WHERE match_block_id = ?',
        args: [match.match_block_id]
      });
      console.log('ブロック', match.match_block_id, 'の順位表をクリアしました');
      
    } else {
      console.log('エラー: t_matches_live にレコードが見つかりません');
    }
    
    console.log('=== 完了: 試合ID 33 が確定前の状態に戻りました ===');
    console.log('✅ 試合管理画面で再度確定操作をテストできます');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    client.close();
  }
}

revertMatchConfirmation();