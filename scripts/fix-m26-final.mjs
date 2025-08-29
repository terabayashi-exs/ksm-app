import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * M26のt_matches_finalレコードを適切に作成
 */
async function fixM26Final() {
  try {
    console.log('🔧 M26のt_matches_finalレコードを作成...');
    
    const tournamentId = 9;
    
    // M26のt_matches_liveデータを取得
    const liveData = await db.execute({
      sql: `
        SELECT 
          ml.*
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.phase = 'final' AND ml.match_code = 'M26'
      `,
      args: [tournamentId]
    });
    
    if (liveData.rows.length === 0) {
      console.log('❌ M26のt_matches_liveデータが見つかりません');
      return;
    }
    
    const match = liveData.rows[0];
    console.log('M26のライブデータ:');
    console.log(`  対戦: ${match.team1_display_name} vs ${match.team2_display_name}`);
    console.log(`  Match ID: ${match.match_id}`);
    
    // t_matches_finalに既存レコードがあるかチェック
    const existing = await db.execute({
      sql: `SELECT match_id FROM t_matches_final WHERE match_id = ?`,
      args: [match.match_id]
    });
    
    if (existing.rows.length > 0) {
      console.log('既存のt_matches_finalレコードを削除...');
      await db.execute({
        sql: `DELETE FROM t_matches_final WHERE match_id = ?`,
        args: [match.match_id]
      });
    }
    
    // チームごろりんこ(team17)を勝者として設定
    const winnerTeamId = match.team1_id; // team17 (チームごろりんこ)
    
    console.log(`\\n🔧 M26の最終結果を作成:`);
    console.log(`  勝者: ${match.team1_display_name} (${winnerTeamId})`);
    console.log(`  敗者: ${match.team2_display_name} (${match.team2_id})`);
    
    // t_matches_finalに完全なレコードを挿入
    const insertResult = await db.execute({
      sql: `
        INSERT INTO t_matches_final (
          match_id, match_block_id, tournament_date, match_number, match_code,
          team1_id, team2_id, team1_display_name, team2_display_name,
          court_number, start_time, team1_scores, team2_scores, period_count,
          winner_team_id, is_draw, is_walkover, match_status, result_status,
          remarks, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, datetime('now', '+9 hours'), datetime('now', '+9 hours')
        )
      `,
      args: [
        match.match_id, match.match_block_id, match.tournament_date, match.match_number, match.match_code,
        match.team1_id, match.team2_id, match.team1_display_name, match.team2_display_name,
        match.court_number, match.start_time, null, null, 1, // スコアは未設定、期間1
        winnerTeamId, 0, 0, 'completed', 'confirmed', // 勝者設定、完了・確定済み
        '進出処理修正により復元'
      ]
    });
    
    if (insertResult.rowsAffected > 0) {
      console.log('✅ M26のt_matches_finalレコードを作成しました');
      
      // 確認のため結果をチェック
      const verification = await db.execute({
        sql: `
          SELECT 
            ml.match_code,
            ml.team1_display_name, ml.team2_display_name,
            mf.winner_team_id,
            CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
          FROM t_matches_live ml
          LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
          JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
          WHERE mb.tournament_id = ? AND mb.phase = 'final' AND ml.match_code = 'M26'
        `,
        args: [tournamentId]
      });
      
      if (verification.rows.length > 0) {
        const result = verification.rows[0];
        console.log('\\n✅ 作成後のM26:');
        console.log(`  対戦: ${result.team1_display_name} vs ${result.team2_display_name}`);
        console.log(`  勝者: ${result.winner_team_id}`);
        console.log(`  確定: ${result.is_confirmed ? 'Yes' : 'No'}`);
      }
      
      console.log('\\n📊 これでベスト16検出が正常になるはずです');
      
    } else {
      console.log('❌ M26のt_matches_final作成に失敗しました');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
fixM26Final();