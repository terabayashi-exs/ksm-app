// scripts/check-tournament-9-final.js
const { createClient } = require('@libsql/client');

// データベース接続設定
const FALLBACK_CONFIG = {
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
};

async function checkTournament9Data() {
  const db = createClient(FALLBACK_CONFIG);
  
  console.log('=== 大会ID:9 データ量調査（最終版） ===\n');
  
  try {
    // 1. 大会基本情報
    console.log('1. 大会基本情報');
    const tournament = await db.execute(`
      SELECT tournament_id, tournament_name, format_id, status, tournament_dates
      FROM t_tournaments 
      WHERE tournament_id = 9
    `);
    
    if (tournament.rows.length > 0) {
      console.log('大会名:', tournament.rows[0].tournament_name);
      console.log('ステータス:', tournament.rows[0].status);
      console.log('フォーマットID:', tournament.rows[0].format_id);
      console.log('開催日程JSON:', tournament.rows[0].tournament_dates);
    } else {
      console.log('大会ID:9が見つかりません');
      return;
    }
    
    // 2. 参加チーム数とブロック配置
    console.log('\n2. 参加チーム数');
    const teams = await db.execute(`
      SELECT COUNT(*) as team_count 
      FROM t_tournament_teams 
      WHERE tournament_id = 9
    `);
    console.log('参加チーム数:', teams.rows[0].team_count, 'チーム');
    
    // ブロック別チーム分布
    const blockDistribution = await db.execute(`
      SELECT assigned_block, COUNT(*) as team_count
      FROM t_tournament_teams 
      WHERE tournament_id = 9
      GROUP BY assigned_block
      ORDER BY assigned_block
    `);
    
    console.log('\nブロック別チーム分布:');
    blockDistribution.rows.forEach(block => {
      const blockName = block.assigned_block || '未配置';
      console.log(`  ${blockName}: ${block.team_count}チーム`);
    });
    
    // 3. 試合数詳細
    console.log('\n3. 試合数詳細');
    
    // 全試合数
    const allMatches = await db.execute(`
      SELECT COUNT(*) as match_count 
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
    `);
    console.log('全試合数（t_matches_live）:', allMatches.rows[0].match_count, '試合');
    
    // フェーズ別内訳
    const phaseBreakdown = await db.execute(`
      SELECT mb.phase, COUNT(*) as match_count 
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
      GROUP BY mb.phase
    `);
    phaseBreakdown.rows.forEach(phase => {
      console.log(`  ${phase.phase}フェーズ: ${phase.match_count}試合`);
    });
    
    // 確定済み試合数
    const confirmedMatches = await db.execute(`
      SELECT COUNT(*) as match_count 
      FROM t_matches_final mf
      JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
    `);
    console.log('確定済み試合数（t_matches_final）:', confirmedMatches.rows[0].match_count, '試合');
    
    // 試合状態別内訳
    const matchStatus = await db.execute(`
      SELECT ml.match_status, COUNT(*) as count
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
      GROUP BY ml.match_status
    `);
    
    console.log('\n試合状態別内訳:');
    matchStatus.rows.forEach(status => {
      console.log(`  ${status.match_status}: ${status.count}試合`);
    });
    
    // 4. 選手数（tournamentを基準に）
    console.log('\n4. 選手数');
    
    // シンプルに tournament_id = 9 で選手数をカウント
    try {
      const players = await db.execute(`
        SELECT COUNT(*) as player_count
        FROM t_tournament_players
        WHERE tournament_id = 9
      `);
      console.log('登録選手総数:', players.rows[0].player_count, '人');
      
      // チーム別選手数（tournament_idとteam_idで結合）
      const playersByTeam = await db.execute(`
        SELECT m.team_name, COUNT(tp.player_id) as player_count
        FROM t_tournament_teams tt
        JOIN m_teams m ON tt.team_id = m.team_id
        LEFT JOIN t_tournament_players tp ON tp.tournament_id = tt.tournament_id AND tp.team_id = tt.team_id
        WHERE tt.tournament_id = 9
        GROUP BY tt.team_id, m.team_name
        ORDER BY player_count DESC
        LIMIT 8
      `);
      
      console.log('\nチーム別選手数（上位8チーム）:');
      playersByTeam.rows.forEach((team, index) => {
        console.log(`  ${index + 1}. ${team.team_name}: ${team.player_count}人`);
      });
      
      // 選手登録状況の統計
      const playerStats = await db.execute(`
        SELECT 
          COUNT(DISTINCT tt.team_id) as teams_with_players,
          AVG(player_counts.count) as avg_players_per_team
        FROM (
          SELECT tt.team_id, COUNT(tp.player_id) as count
          FROM t_tournament_teams tt
          LEFT JOIN t_tournament_players tp ON tp.tournament_id = tt.tournament_id AND tp.team_id = tt.team_id
          WHERE tt.tournament_id = 9
          GROUP BY tt.team_id
        ) player_counts
        JOIN t_tournament_teams tt ON tt.team_id = player_counts.team_id
        WHERE player_counts.count > 0
      `);
      
      if (playerStats.rows.length > 0) {
        console.log('\n選手登録統計:');
        console.log(`選手登録済みチーム数: ${playerStats.rows[0].teams_with_players}チーム`);
        console.log(`チーム平均選手数: ${Number(playerStats.rows[0].avg_players_per_team).toFixed(1)}人`);
      }
      
    } catch (e) {
      console.log('選手データの取得でエラー:', e.message);
    }
    
    // 5. ブロック詳細情報
    console.log('\n5. ブロック詳細情報');
    const blocks = await db.execute(`
      SELECT block_name, phase, match_block_id, team_rankings
      FROM t_match_blocks
      WHERE tournament_id = 9
      ORDER BY phase, block_name
    `);
    
    console.log(`ブロック数: ${blocks.rows.length}ブロック`);
    
    let preliminaryBlocks = 0;
    let finalBlocks = 0;
    
    blocks.rows.forEach(block => {
      if (block.phase === 'preliminary') {
        preliminaryBlocks++;
      } else {
        finalBlocks++;
      }
      
      const hasRankings = block.team_rankings && block.team_rankings !== 'null';
      const phaseJP = block.phase === 'preliminary' ? '予選' : '決勝';
      console.log(`  ${phaseJP} ${block.block_name} (ID: ${block.match_block_id}) - 順位表: ${hasRankings ? 'あり' : 'なし'}`);
    });
    
    console.log(`\n予選ブロック: ${preliminaryBlocks}ブロック`);
    console.log(`決勝ブロック: ${finalBlocks}ブロック`);
    
    // 6. データサイズ概算と総括
    console.log('\n6. データサイズ概算と総括');
    console.log('==========================');
    
    const totalTeams = Number(teams.rows[0].team_count);
    const totalMatches = Number(allMatches.rows[0].match_count);
    const confirmedMatchesCount = Number(confirmedMatches.rows[0].match_count);
    
    console.log(`大会名: ${tournament.rows[0].tournament_name}`);
    console.log(`参加チーム数: ${totalTeams}チーム`);
    console.log(`総試合数: ${totalMatches}試合`);
    console.log(`　予選試合: ${phaseBreakdown.rows.find(p => p.phase === 'preliminary')?.match_count || 0}試合`);
    console.log(`　決勝試合: ${phaseBreakdown.rows.find(p => p.phase === 'final')?.match_count || 0}試合`);
    console.log(`確定済み試合数: ${confirmedMatchesCount}試合`);
    console.log(`進行率: ${((confirmedMatchesCount / totalMatches) * 100).toFixed(1)}%`);
    
    // データベースレコード概算
    const estimatedRecords = totalTeams + totalMatches + (totalTeams * 10); // チーム + 試合 + 選手（推定）
    console.log(`\n概算総レコード数: ${estimatedRecords.toLocaleString()}レコード`);
    console.log(`概算データサイズ: ${((estimatedRecords * 0.5) / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error('メインエラー:', error.message);
  } finally {
    db.close();
  }
}

// メイン実行
checkTournament9Data().catch(console.error);