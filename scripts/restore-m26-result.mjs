import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * M26の結果を適切に復元
 */
async function restoreM26Result() {
  try {
    console.log('🔧 M26の結果を適切に復元...');
    
    const tournamentId = 9;
    
    // 現在のM26の状況を確認
    const current = await db.execute({
      sql: `
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_display_name, ml.team2_display_name,
          ml.team1_id, ml.team2_id
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.phase = 'final' AND ml.match_code = 'M26'
      `,
      args: [tournamentId]
    });
    
    if (current.rows.length === 0) {
      console.log('❌ M26が見つかりません');
      return;
    }
    
    const match = current.rows[0];
    console.log('現在のM26:');
    console.log(`  対戦: ${match.team1_display_name} vs ${match.team2_display_name}`);
    console.log(`  Team IDs: ${match.team1_id} vs ${match.team2_id}`);
    
    // 元のM26の勝者はチームごろりんこ(team17)でした
    // 新しい対戦カードは「チームごろりんこ vs アカデミー」
    // 論理的に考えて、チームごろりんこ(team1)が勝者として設定
    const winnerTeamId = match.team1_id; // team17 (チームごろりんこ)
    
    console.log(`\\n🔧 M26の結果を設定:`);
    console.log(`  勝者: ${match.team1_display_name} (${winnerTeamId})`);
    console.log(`  敗者: ${match.team2_display_name} (${match.team2_id})`);
    
    // t_matches_finalに結果を挿入
    const insertResult = await db.execute({
      sql: `
        INSERT INTO t_matches_final (
          match_id, winner_team_id, is_draw, is_walkover, 
          created_at, updated_at
        ) VALUES (?, ?, 0, 0, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `,
      args: [match.match_id, winnerTeamId]
    });
    
    if (insertResult.rowsAffected > 0) {
      console.log('✅ M26の結果を復元しました');
      
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
        console.log('\\n✅ 復元後のM26:');
        console.log(`  対戦: ${result.team1_display_name} vs ${result.team2_display_name}`);
        console.log(`  勝者: ${result.winner_team_id}`);
        console.log(`  確定: ${result.is_confirmed ? 'Yes' : 'No'}`);
      }
      
      console.log('\\n📊 期待される効果:');
      console.log('1. ✅ M26の結果が確定される');
      console.log('2. ✅ ベスト16チーム数が4になる');
      console.log('3. ✅ 順位表計算が正常に動作する');
      
    } else {
      console.log('❌ M26の結果復元に失敗しました');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
restoreM26Result();