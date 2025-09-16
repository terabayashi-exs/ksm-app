import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function analyzeBackupStructure() {
  try {
    console.log('=== バックアップテーブルの構造分析 ===\n');

    // 1. t_match_blocks_backup の構造を確認
    console.log('1. t_match_blocks_backup_20250912_182026 の構造:');
    const matchBlocksInfo = await db.execute(`
      PRAGMA table_info(t_match_blocks_backup_20250912_182026)
    `);
    
    console.log('カラム一覧:');
    matchBlocksInfo.rows.forEach(col => {
      console.log(`  - ${col.name} (${col.type})`);
    });

    // 2. t_tournament_teams_backup から大会情報を取得
    console.log('\n2. t_tournament_teams_backup から大会情報:');
    const tournamentInfo = await db.execute(`
      SELECT COUNT(*) as team_count,
             MIN(created_at) as first_created,
             MAX(created_at) as last_created
      FROM t_tournament_teams_backup_20250912_182026 
      WHERE tournament_id = 9
    `);
    
    if (tournamentInfo.rows.length > 0) {
      console.log(`  - チーム数: ${tournamentInfo.rows[0].team_count}`);
      console.log(`  - 最初の登録: ${tournamentInfo.rows[0].first_created}`);
      console.log(`  - 最後の登録: ${tournamentInfo.rows[0].last_created}`);
    }

    // 3. t_matches_live_backup から試合情報を取得
    console.log('\n3. t_matches_live_backup から試合情報:');
    const matchesInfo = await db.execute(`
      SELECT COUNT(*) as match_count,
             COUNT(DISTINCT court_number) as court_count,
             MIN(tournament_date) as first_date,
             MAX(tournament_date) as last_date
      FROM t_matches_live_backup_20250912_182026 
      WHERE match_block_id IN (
        SELECT match_block_id 
        FROM t_match_blocks_backup_20250912_182026 
        WHERE tournament_id = 9
      )
    `);
    
    if (matchesInfo.rows.length > 0) {
      console.log(`  - 試合数: ${matchesInfo.rows[0].match_count}`);
      console.log(`  - コート数: ${matchesInfo.rows[0].court_count}`);
      console.log(`  - 開始日: ${matchesInfo.rows[0].first_date}`);
      console.log(`  - 終了日: ${matchesInfo.rows[0].last_date}`);
    }

    // 4. 既存の大会10の設定を確認
    console.log('\n4. 参考: 大会10の設定値:');
    const tournament10 = await db.execute(`
      SELECT tournament_id, tournament_name, format_id, venue_id, team_count, court_count
      FROM t_tournaments 
      WHERE tournament_id = 10
    `);
    
    if (tournament10.rows.length > 0) {
      console.log(JSON.stringify(tournament10.rows[0], null, 2));
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

analyzeBackupStructure();