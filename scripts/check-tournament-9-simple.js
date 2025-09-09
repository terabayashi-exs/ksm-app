// scripts/check-tournament-9-simple.js
const { createClient } = require('@libsql/client');

// データベース接続設定
const FALLBACK_CONFIG = {
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
};

async function checkTournament9Data() {
  const db = createClient(FALLBACK_CONFIG);
  
  console.log('=== 大会ID:9 データ量調査（簡易版） ===\n');
  
  try {
    // 1. 大会基本情報（最小限のカラムのみ）
    console.log('1. 大会基本情報');
    const tournament = await db.execute(`
      SELECT tournament_id, tournament_name, format_id, status
      FROM t_tournaments 
      WHERE tournament_id = 9
    `);
    
    if (tournament.rows.length > 0) {
      console.log('大会名:', tournament.rows[0].tournament_name);
      console.log('ステータス:', tournament.rows[0].status);
      console.log('フォーマットID:', tournament.rows[0].format_id);
    } else {
      console.log('大会ID:9が見つかりません');
      return;
    }
    
    // 2. 参加チーム数
    console.log('\n2. 参加チーム数');
    const teams = await db.execute(`
      SELECT COUNT(*) as team_count 
      FROM t_tournament_teams 
      WHERE tournament_id = 9
    `);
    console.log('参加チーム数:', teams.rows[0].team_count, 'チーム');
    
    // 3. 試合数（シンプル版）
    console.log('\n3. 試合数');
    
    // 全試合数（t_matches_live）
    const allMatches = await db.execute(`
      SELECT COUNT(*) as match_count 
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
    `);
    console.log('全試合数（t_matches_live）:', allMatches.rows[0].match_count, '試合');
    
    // フェーズ別内訳を試みる
    try {
      const phaseBreakdown = await db.execute(`
        SELECT mb.phase, COUNT(*) as match_count 
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9
        GROUP BY mb.phase
      `);
      console.log('\nフェーズ別内訳:');
      phaseBreakdown.rows.forEach(phase => {
        console.log(`  ${phase.phase}: ${phase.match_count}試合`);
      });
    } catch (e) {
      console.log('フェーズ別内訳の取得に失敗');
    }
    
    // 確定済み試合数
    const confirmedMatches = await db.execute(`
      SELECT COUNT(*) as match_count 
      FROM t_matches_final mf
      JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
    `);
    console.log('確定済み試合数（t_matches_final）:', confirmedMatches.rows[0].match_count, '試合');
    
    // 4. 選手数（tournament_idベースで検索）
    console.log('\n4. 選手数');
    
    // まず tournament_team_id を取得
    const tournamentTeamIds = await db.execute(`
      SELECT tournament_team_id 
      FROM t_tournament_teams 
      WHERE tournament_id = 9
    `);
    
    if (tournamentTeamIds.rows.length > 0) {
      const teamIds = tournamentTeamIds.rows.map(row => row.tournament_team_id).join(',');
      
      // tournament_team_idで選手数をカウント
      const players = await db.execute(`
        SELECT COUNT(*) as player_count
        FROM t_tournament_players
        WHERE tournament_team_id IN (${teamIds})
      `);
      console.log('登録選手総数:', players.rows[0].player_count, '人');
      
      // チーム別選手数（上位5チーム）
      const playersByTeam = await db.execute(`
        SELECT tt.tournament_team_id, m.team_name, COUNT(tp.player_id) as player_count
        FROM t_tournament_teams tt
        JOIN m_teams m ON tt.team_id = m.team_id
        LEFT JOIN t_tournament_players tp ON tt.tournament_team_id = tp.tournament_team_id
        WHERE tt.tournament_id = 9
        GROUP BY tt.tournament_team_id, m.team_name
        ORDER BY player_count DESC
        LIMIT 5
      `);
      
      console.log('\nチーム別選手数（上位5チーム）:');
      playersByTeam.rows.forEach((team, index) => {
        console.log(`  ${index + 1}. ${team.team_name}: ${team.player_count}人`);
      });
    }
    
    // 5. ブロック情報
    console.log('\n5. ブロック情報');
    const blocks = await db.execute(`
      SELECT block_name, phase, match_block_id
      FROM t_match_blocks
      WHERE tournament_id = 9
      ORDER BY phase, block_name
    `);
    
    console.log('ブロック数:', blocks.rows.length);
    blocks.rows.forEach(block => {
      console.log(`  ${block.phase === 'preliminary' ? '予選' : '決勝'} ${block.block_name} (ID: ${block.match_block_id})`);
    });
    
    // 6. データサマリー
    console.log('\n6. データサマリー');
    console.log('====================');
    console.log('参加チーム数:', teams.rows[0].team_count, 'チーム');
    console.log('全試合数:', allMatches.rows[0].match_count, '試合');
    console.log('確定済み試合数:', confirmedMatches.rows[0].match_count, '試合');
    console.log('進行率:', ((confirmedMatches.rows[0].match_count / allMatches.rows[0].match_count) * 100).toFixed(1), '%');
    
  } catch (error) {
    console.error('エラーが発生しました:', error.message);
    console.error('詳細:', error);
  } finally {
    db.close();
  }
}

// メイン実行
checkTournament9Data().catch(console.error);