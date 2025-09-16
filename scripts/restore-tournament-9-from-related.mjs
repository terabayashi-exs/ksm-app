import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function restoreTournament9FromRelated() {
  try {
    console.log('=== 大会ID:9の復元処理（関連テーブルから） ===\n');

    // 1. 関連テーブルから情報を収集
    console.log('1. 関連テーブルからの情報収集:');
    
    // t_match_blocks_backup から会場IDとフォーマットIDを取得
    const matchBlockInfo = await db.execute(`
      SELECT DISTINCT tournament_id, venue_id 
      FROM t_match_blocks_backup_20250912_182026 
      WHERE tournament_id = 9 
      LIMIT 1
    `);
    
    if (matchBlockInfo.rows.length > 0) {
      console.log(`- 会場ID: ${matchBlockInfo.rows[0].venue_id}`);
    }

    // t_tournament_teams_backup からチーム数を取得
    const teamCountResult = await db.execute(`
      SELECT COUNT(*) as team_count 
      FROM t_tournament_teams_backup_20250912_182026 
      WHERE tournament_id = 9
    `);
    const teamCount = teamCountResult.rows[0].team_count;
    console.log(`- チーム数: ${teamCount}`);

    // チーム数からフォーマットIDを推定
    let formatId = 1; // デフォルト
    if (teamCount <= 8) {
      formatId = 1; // 8チーム用
    } else if (teamCount <= 16) {
      formatId = 2; // 16チーム用
    } else if (teamCount <= 24) {
      formatId = 3; // 24チーム用
    } else if (teamCount <= 32) {
      formatId = 4; // 32チーム用
    } else {
      formatId = 5; // 36チーム以上用
    }
    console.log(`- 推定フォーマットID: ${formatId}`);

    // 2. 既存大会から標準的な設定値を取得
    console.log('\n2. 既存大会からの標準設定値取得:');
    const sampleTournament = await db.execute(`
      SELECT court_count, match_duration_minutes, break_duration_minutes,
             win_points, draw_points, loss_points, 
             walkover_winner_goals, walkover_loser_goals,
             cancelled_match_points, cancelled_team1_goals, cancelled_team2_goals
      FROM t_tournaments 
      WHERE tournament_id = 10 
      LIMIT 1
    `);
    
    const defaults = sampleTournament.rows[0] || {
      court_count: 8,
      match_duration_minutes: 15,
      break_duration_minutes: 5,
      win_points: 3,
      draw_points: 1,
      loss_points: 0,
      walkover_winner_goals: 5,
      walkover_loser_goals: 0,
      cancelled_match_points: 1,
      cancelled_team1_goals: 0,
      cancelled_team2_goals: 0
    };

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
        ${formatId},
        ${matchBlockInfo.rows[0]?.venue_id || 1},
        ${teamCount},
        ${defaults.court_count},
        '["2025-09-06","2025-09-07"]',
        ${defaults.match_duration_minutes},
        ${defaults.break_duration_minutes},
        ${defaults.win_points},
        ${defaults.draw_points},
        ${defaults.loss_points},
        ${defaults.walkover_winner_goals},
        ${defaults.walkover_loser_goals},
        'completed',
        'public',
        datetime('now', '+9 hours'),
        datetime('2025-08-01 00:00:00', '+9 hours'),
        datetime('2025-08-31 23:59:59', '+9 hours'),
        datetime('2025-08-01 00:00:00', '+9 hours'),
        datetime('now', '+9 hours'),
        ${defaults.cancelled_match_points},
        ${defaults.cancelled_team1_goals},
        ${defaults.cancelled_team2_goals},
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
      console.log(`大会名: ${tournament.tournament_name}`);
      console.log(`フォーマットID: ${tournament.format_id}`);
      console.log(`会場ID: ${tournament.venue_id}`);
      console.log(`チーム数: ${tournament.team_count}`);
      console.log(`ステータス: ${tournament.status}`);
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

restoreTournament9FromRelated();