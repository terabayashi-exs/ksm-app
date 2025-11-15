#!/usr/bin/env node

const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.DATABASE_URL || "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: process.env.DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function checkTournament55() {
  const tournamentId = 55;
  
  console.log(`🔍 大会ID ${tournamentId} の関連データを調査中...`);
  console.log('='.repeat(50));

  try {
    // 1. 大会の基本情報
    const tournament = await client.execute(
      'SELECT tournament_id, tournament_name, status, is_archived FROM t_tournaments WHERE tournament_id = ?',
      [tournamentId]
    );
    
    if (tournament.rows.length === 0) {
      console.log('❌ 大会ID 55 が見つかりません');
      return;
    }
    
    console.log('📊 大会基本情報:');
    console.log(`  - 大会名: ${tournament.rows[0].tournament_name}`);
    console.log(`  - ステータス: ${tournament.rows[0].status}`);
    console.log(`  - アーカイブ済み: ${tournament.rows[0].is_archived}`);
    console.log();

    // 2. 各テーブルの関連レコード数をチェック
    const tables = [
      { name: 't_tournament_teams', column: 'tournament_id' },
      { name: 't_tournament_players', column: 'tournament_id' },
      { name: 't_match_blocks', column: 'tournament_id' },
      { name: 't_matches_live', column: 'match_block_id', subquery: 'SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?' },
      { name: 't_matches_final', column: 'match_block_id', subquery: 'SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?' },
      { name: 't_match_status', column: 'match_block_id', subquery: 'SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?' },
      { name: 't_archived_tournament_json', column: 'tournament_id' },
      { name: 't_tournament_files', column: 'tournament_id' },
      { name: 't_tournament_notifications', column: 'tournament_id' },
      { name: 't_tournament_rules', column: 'tournament_id' }
    ];

    console.log('📋 関連レコード数:');
    
    for (const table of tables) {
      try {
        let query;
        let params;
        
        if (table.subquery) {
          query = `SELECT COUNT(*) as count FROM ${table.name} WHERE ${table.column} IN (${table.subquery})`;
          params = [tournamentId];
        } else {
          query = `SELECT COUNT(*) as count FROM ${table.name} WHERE ${table.column} = ?`;
          params = [tournamentId];
        }
        
        const result = await client.execute(query, params);
        const count = result.rows[0].count;
        
        console.log(`  - ${table.name}: ${count} 件`);
        
        // レコードが存在する場合は詳細を表示
        if (count > 0) {
          let detailQuery;
          if (table.subquery) {
            detailQuery = `SELECT * FROM ${table.name} WHERE ${table.column} IN (${table.subquery}) LIMIT 3`;
          } else {
            detailQuery = `SELECT * FROM ${table.name} WHERE ${table.column} = ? LIMIT 3`;
          }
          
          const details = await client.execute(detailQuery, params);
          console.log(`    サンプルレコード:`);
          details.rows.forEach((row, index) => {
            if (index < 2) { // 最大2件表示
              const key = Object.keys(row)[0]; // 主キー列
              console.log(`    - ${key}: ${row[key]}`);
            }
          });
        }
      } catch (error) {
        console.log(`  - ${table.name}: エラー (${error.message})`);
      }
    }

    console.log();
    console.log('🔧 外部キー制約の詳細分析:');
    
    // 3. 具体的な外部キー制約の確認
    const constraints = [
      {
        parent: 't_tournaments',
        child: 't_tournament_teams',
        message: 't_tournament_teams.tournament_id → t_tournaments.tournament_id'
      },
      {
        parent: 't_tournaments', 
        child: 't_tournament_players',
        message: 't_tournament_players.tournament_id → t_tournaments.tournament_id'
      },
      {
        parent: 't_tournaments',
        child: 't_match_blocks', 
        message: 't_match_blocks.tournament_id → t_tournaments.tournament_id'
      },
      {
        parent: 't_match_blocks',
        child: 't_matches_live',
        message: 't_matches_live.match_block_id → t_match_blocks.match_block_id'
      },
      {
        parent: 't_match_blocks',
        child: 't_matches_final',
        message: 't_matches_final.match_block_id → t_match_blocks.match_block_id'
      },
      {
        parent: 't_match_blocks',
        child: 't_match_status',
        message: 't_match_status.match_block_id → t_match_blocks.match_block_id'
      }
    ];

    for (const constraint of constraints) {
      console.log(`  - ${constraint.message}`);
    }

    console.log();
    console.log('🚨 削除時の推奨順序:');
    console.log('  1. t_match_status (t_match_blocks参照)');
    console.log('  2. t_matches_final (t_match_blocks参照)');
    console.log('  3. t_matches_live (t_match_blocks参照)');
    console.log('  4. t_match_blocks (t_tournaments参照)');
    console.log('  5. t_tournament_players (t_tournaments参照)');
    console.log('  6. t_tournament_teams (t_tournaments参照)');
    console.log('  7. t_tournament_files (t_tournaments参照)');
    console.log('  8. t_tournament_notifications (t_tournaments参照)');
    console.log('  9. t_tournament_rules (t_tournaments参照)');
    console.log(' 10. t_archived_tournament_json (t_tournaments参照)');
    console.log(' 11. t_tournaments (メインテーブル)');

  } catch (error) {
    console.error('❌ データベース接続エラー:', error);
  } finally {
    client.close();
  }
}

checkTournament55();