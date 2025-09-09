// scripts/check-tournament-9-data.js
const { createClient } = require('@libsql/client');

// データベース接続設定
const FALLBACK_CONFIG = {
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
};

async function checkTournament9Data() {
  const db = createClient(FALLBACK_CONFIG);
  
  console.log('=== 大会ID:9 データ量調査 ===\n');
  
  try {
    // 1. 大会基本情報
    console.log('1. 大会基本情報');
    const tournament = await db.execute(`
      SELECT tournament_id, tournament_name, format_id, status,
             tournament_dates, event_start_date
      FROM t_tournaments 
      WHERE tournament_id = 9
    `);
    
    if (tournament.rows.length > 0) {
      console.log('大会名:', tournament.rows[0].tournament_name);
      console.log('ステータス:', tournament.rows[0].status);
      console.log('開催日程:', tournament.rows[0].tournament_dates);
    }
    
    // 2. 参加チーム数
    console.log('\n2. 参加チーム数');
    const teams = await db.execute(`
      SELECT COUNT(*) as team_count 
      FROM t_tournament_teams 
      WHERE tournament_id = 9
    `);
    console.log('参加チーム数:', teams.rows[0].team_count, 'チーム');
    
    // 詳細なチーム情報
    const teamDetails = await db.execute(`
      SELECT tt.tournament_team_id, tt.team_id, m.team_name, m.team_omission,
             tt.assigned_block, tt.withdrawal_status
      FROM t_tournament_teams tt
      JOIN m_teams m ON tt.team_id = m.team_id
      WHERE tt.tournament_id = 9
      ORDER BY tt.assigned_block, m.team_name
    `);
    console.log('\nブロック別チーム分布:');
    const blocks = {};
    teamDetails.rows.forEach(team => {
      const block = team.assigned_block || '未割当';
      blocks[block] = (blocks[block] || 0) + 1;
    });
    Object.entries(blocks).forEach(([block, count]) => {
      console.log(`  ${block}ブロック: ${count}チーム`);
    });
    
    // 3. 試合数
    console.log('\n3. 試合数');
    
    // 予選試合数（t_matches_live）
    const prelimMatches = await db.execute(`
      SELECT COUNT(*) as match_count 
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9 AND mb.phase = 'preliminary'
    `);
    console.log('予選試合数:', prelimMatches.rows[0].match_count, '試合');
    
    // 決勝トーナメント試合数
    const finalMatches = await db.execute(`
      SELECT COUNT(*) as match_count 
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9 AND mb.phase = 'final'
    `);
    console.log('決勝トーナメント試合数:', finalMatches.rows[0].match_count, '試合');
    
    // 確定済み試合数
    const confirmedMatches = await db.execute(`
      SELECT COUNT(*) as match_count 
      FROM t_matches_final mf
      JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
    `);
    console.log('確定済み試合数:', confirmedMatches.rows[0].match_count, '試合');
    
    // 試合状態別の内訳
    const matchStatusBreakdown = await db.execute(`
      SELECT ml.match_status, COUNT(*) as count
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
      GROUP BY ml.match_status
    `);
    console.log('\n試合状態別内訳:');
    matchStatusBreakdown.rows.forEach(status => {
      console.log(`  ${status.match_status}: ${status.count}試合`);
    });
    
    // 4. 選手数
    console.log('\n4. 選手数');
    const players = await db.execute(`
      SELECT COUNT(*) as player_count,
             COUNT(DISTINCT tournament_team_id) as teams_with_players
      FROM t_tournament_players
      WHERE tournament_id = 9
    `);
    console.log('登録選手数:', players.rows[0].player_count, '人');
    console.log('選手登録済みチーム数:', players.rows[0].teams_with_players, 'チーム');
    
    // チーム別選手数分布
    const playerDistribution = await db.execute(`
      SELECT m.team_name, COUNT(tp.player_id) as player_count
      FROM t_tournament_teams tt
      JOIN m_teams m ON tt.team_id = m.team_id
      LEFT JOIN t_tournament_players tp ON tt.tournament_team_id = tp.tournament_team_id
      WHERE tt.tournament_id = 9
      GROUP BY tt.tournament_team_id, m.team_name
      ORDER BY player_count DESC
      LIMIT 10
    `);
    console.log('\nチーム別選手数（上位10チーム）:');
    playerDistribution.rows.forEach(team => {
      console.log(`  ${team.team_name}: ${team.player_count}人`);
    });
    
    // 5. ブロック情報
    console.log('\n5. ブロック情報');
    const blocks_info = await db.execute(`
      SELECT block_name, phase, team_rankings
      FROM t_match_blocks
      WHERE tournament_id = 9
      ORDER BY phase, block_name
    `);
    
    blocks_info.rows.forEach(block => {
      const rankings = block.team_rankings ? JSON.parse(block.team_rankings) : [];
      console.log(`\n${block.phase === 'preliminary' ? '予選' : '決勝'} ${block.block_name}:`,
                  rankings.length, 'チームの順位情報あり');
    });
    
    // 6. データサイズの概算
    console.log('\n6. データサイズ概算');
    
    // 総レコード数
    const totalRecords = 
      Number(teams.rows[0].team_count) +
      Number(prelimMatches.rows[0].match_count) +
      Number(finalMatches.rows[0].match_count) +
      Number(players.rows[0].player_count);
    
    console.log('総レコード数:', totalRecords, 'レコード');
    
    // 概算データサイズ（1レコード平均500バイトと仮定）
    const estimatedSizeKB = (totalRecords * 500) / 1024;
    console.log('概算データサイズ:', estimatedSizeKB.toFixed(2), 'KB');
    
  } catch (error) {
    console.error('エラーが発生しました:', error.message);
  } finally {
    db.close();
  }
}

// メイン実行
checkTournament9Data().catch(console.error);