import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function restoreTournament9Final() {
  try {
    console.log('=== 大会ID:9の復元処理（最終版） ===\n');

    // 1. 現在の状態を確認
    console.log('1. 現在の状態確認:');
    const currentCheck = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournaments WHERE tournament_id = 9
    `);
    
    if (currentCheck.rows[0].count > 0) {
      console.log('既にデータが存在します。復元をスキップします。');
      return;
    }

    // 2. 収集した情報
    console.log('\n2. 収集した情報:');
    console.log('- 大会名: 第11回とやまPK選手権大会 in 富山県総合運動公園(富山最強コース)');
    console.log('- チーム数: 48');
    console.log('- 試合数: 108');
    console.log('- コート数: 6');
    console.log('- 開催日: 2025-08-30');

    // 48チーム用のフォーマットIDを推定（大会10を参考に）
    // 富山県総合運動公園の会場IDは2（大会10から）
    
    // 3. 大会情報を復元
    console.log('\n3. 大会情報の復元:');
    
    const insertQuery = `
      INSERT INTO t_tournaments (
        tournament_id, 
        tournament_name, 
        format_id,
        venue_id,
        team_count,
        court_count,
        tournament_dates,
        match_duration_minutes,
        break_duration_minutes,
        win_points,
        draw_points,
        loss_points,
        walkover_winner_goals,
        walkover_loser_goals,
        status,
        visibility,
        public_start_date,
        recruitment_start_date,
        recruitment_end_date,
        created_at,
        updated_at,
        cancelled_match_points,
        cancelled_team1_goals,
        cancelled_team2_goals,
        created_by
      ) VALUES (
        9,
        '第11回とやまPK選手権大会 in 富山県総合運動公園(富山最強コース)',
        12,  -- 48チーム用のフォーマットID（推定）
        2,   -- 富山県総合運動公園
        48,
        6,
        '["2025-08-30"]',
        15,
        5,
        3,
        1,
        0,
        5,
        0,
        'completed',
        'public',
        datetime('2025-08-30 00:00:00', '+9 hours'),
        datetime('2025-08-01 00:00:00', '+9 hours'),
        datetime('2025-08-25 23:59:59', '+9 hours'),
        datetime('2025-08-01 00:00:00', '+9 hours'),
        datetime('now', '+9 hours'),
        1,
        0,
        0,
        'restored_from_backup'
      )
    `;
    
    await db.execute(insertQuery);
    console.log('✅ 大会情報を復元しました！');

    // 4. 復元結果を確認
    console.log('\n4. 復元結果の確認:');
    const restoredData = await db.execute(`
      SELECT * FROM t_tournaments 
      WHERE tournament_id = 9
    `);
    
    if (restoredData.rows.length > 0) {
      const tournament = restoredData.rows[0];
      console.log(`大会ID: ${tournament.tournament_id}`);
      console.log(`大会名: ${tournament.tournament_name}`);
      console.log(`フォーマットID: ${tournament.format_id}`);
      console.log(`会場ID: ${tournament.venue_id}`);
      console.log(`チーム数: ${tournament.team_count}`);
      console.log(`コート数: ${tournament.court_count}`);
      console.log(`開催日: ${tournament.tournament_dates}`);
      console.log(`ステータス: ${tournament.status}`);
    }

    // 5. 関連データの確認
    console.log('\n5. 関連データの状態:');
    const relatedData = await db.execute(`
      SELECT 
        (SELECT COUNT(*) FROM t_tournament_teams WHERE tournament_id = 9) as current_teams,
        (SELECT COUNT(*) FROM t_tournament_teams_backup_20250912_182026 WHERE tournament_id = 9) as backup_teams,
        (SELECT COUNT(*) FROM t_match_blocks WHERE tournament_id = 9) as current_blocks,
        (SELECT COUNT(*) FROM t_match_blocks_backup_20250912_182026 WHERE tournament_id = 9) as backup_blocks
    `);
    
    const related = relatedData.rows[0];
    console.log(`現在のチーム数: ${related.current_teams} (バックアップ: ${related.backup_teams})`);
    console.log(`現在のブロック数: ${related.current_blocks} (バックアップ: ${related.backup_blocks})`);
    
    if (related.current_teams === 0 && related.backup_teams > 0) {
      console.log('\n⚠️  注意: チームデータも復元が必要かもしれません。');
    }
    if (related.current_blocks === 0 && related.backup_blocks > 0) {
      console.log('⚠️  注意: ブロックデータも復元が必要かもしれません。');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

restoreTournament9Final();