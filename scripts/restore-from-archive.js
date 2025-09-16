// scripts/restore-from-archive.js
const { createClient } = require('@libsql/client');

// 環境変数を取得
const databaseUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!databaseUrl || !authToken) {
  console.error('❌ 環境変数が設定されていません:');
  console.error('   DATABASE_URL:', !!databaseUrl);
  console.error('   DATABASE_AUTH_TOKEN:', !!authToken);
  process.exit(1);
}

const db = createClient({
  url: databaseUrl,
  authToken: authToken,
});

// コマンドライン引数から大会IDを取得
const tournamentId = parseInt(process.argv[2]);
if (!tournamentId || isNaN(tournamentId)) {
  console.error('❌ 使用方法: node scripts/restore-from-archive.js <tournament_id>');
  console.error('   例: node scripts/restore-from-archive.js 9');
  process.exit(1);
}

async function restoreFromArchive(tournamentId) {
  try {
    console.log(`🔄 大会ID ${tournamentId} のアーカイブデータから復元を開始します...\n`);

    // 1. アーカイブデータの存在確認
    console.log('📊 アーカイブデータを確認中...');
    const archiveResult = await db.execute(`
      SELECT 
        tournament_data,
        teams_data,
        matches_data,
        standings_data,
        archived_at,
        archived_by
      FROM t_archived_tournament_json
      WHERE tournament_id = ?
    `, [tournamentId]);

    if (archiveResult.rows.length === 0) {
      console.error(`❌ 大会ID ${tournamentId} のアーカイブデータが見つかりません`);
      process.exit(1);
    }

    const archive = archiveResult.rows[0];
    console.log(`✅ アーカイブデータ確認済み (${archive.archived_at} に ${archive.archived_by} が作成)\n`);

    // 2. JSONデータのパース
    const tournamentData = JSON.parse(archive.tournament_data);
    const teamsData = JSON.parse(archive.teams_data);
    const matchesData = JSON.parse(archive.matches_data);
    const standingsData = JSON.parse(archive.standings_data);

    console.log('📋 アーカイブ内容:');
    console.log(`   - 大会名: ${tournamentData.tournament_name}`);
    console.log(`   - チーム数: ${teamsData.length}`);
    console.log(`   - 試合数: ${matchesData.length}`);
    console.log(`   - ブロック数: ${standingsData.length}\n`);

    // ユーザーに確認
    console.log('⚠️  警告: この操作により既存データが上書きされます！');
    console.log('続行しますか？ (yes/no): ');
    
    // 標準入力を待つ
    await new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        const answer = data.toString().trim().toLowerCase();
        if (answer !== 'yes') {
          console.log('❌ 復元をキャンセルしました');
          process.exit(0);
        }
        resolve();
      });
    });

    // 3. 既存データの削除
    console.log('\n🗑️  既存データを削除中...');
    
    // t_matches_final の削除
    await db.execute(`
      DELETE FROM t_matches_final WHERE match_id IN (
        SELECT ml.match_id FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
      )
    `, [tournamentId]);
    
    // t_tournament_teams の削除
    await db.execute(`DELETE FROM t_tournament_teams WHERE tournament_id = ?`, [tournamentId]);
    
    // t_matches_live の削除
    await db.execute(`
      DELETE FROM t_matches_live WHERE match_block_id IN (
        SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
      )
    `, [tournamentId]);
    
    // t_match_blocks の削除
    await db.execute(`DELETE FROM t_match_blocks WHERE tournament_id = ?`, [tournamentId]);
    
    console.log('✅ 既存データの削除完了\n');

    // 4. ブロック情報の復元
    console.log('🏗️  ブロック情報を復元中...');
    const blockIdMap = new Map(); // 古いblock_id -> 新しいblock_id のマップ
    
    // ブロック情報を試合データから復元
    const uniqueBlocks = new Map();
    matchesData.forEach(match => {
      if (!uniqueBlocks.has(match.match_block_id)) {
        uniqueBlocks.set(match.match_block_id, {
          phase: match.phase,
          block_name: match.block_name || '',
          display_round_name: match.display_round_name || match.phase
        });
      }
    });

    // ブロックを順番に作成
    let blockOrder = 0;
    for (const [oldBlockId, blockInfo] of uniqueBlocks) {
      const result = await db.execute(`
        INSERT INTO t_match_blocks (
          tournament_id,
          phase,
          display_round_name,
          block_name,
          match_type,
          block_order,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, '通常', ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        tournamentId,
        blockInfo.phase,
        blockInfo.display_round_name,
        blockInfo.block_name,
        blockOrder++
      ]);
      
      blockIdMap.set(oldBlockId, Number(result.lastInsertRowid));
    }
    console.log(`✅ ${uniqueBlocks.size} 個のブロックを復元\n`);

    // 5. チーム情報の復元
    console.log('👥 チーム情報を復元中...');
    let teamsRestored = 0;
    
    for (const team of teamsData) {
      await db.execute(`
        INSERT INTO t_tournament_teams (
          tournament_id,
          team_id,
          team_name,
          team_omission,
          contact_person,
          contact_email,
          contact_phone,
          assigned_block,
          block_position,
          withdrawal_status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        tournamentId,
        team.team_id,
        team.team_name,
        team.team_omission,
        team.contact_person || '',
        team.contact_email || '',
        team.contact_phone || '',
        team.assigned_block,
        team.block_position
      ]);
      teamsRestored++;
    }
    console.log(`✅ ${teamsRestored} チームを復元\n`);

    // 6. 試合情報の復元（t_matches_live）
    console.log('🎮 試合情報を復元中...');
    let matchesRestored = 0;
    
    for (const match of matchesData) {
      const newBlockId = blockIdMap.get(match.match_block_id);
      if (!newBlockId) {
        console.warn(`⚠️  ブロックID ${match.match_block_id} のマッピングが見つかりません`);
        continue;
      }

      // t_matches_live に挿入
      await db.execute(`
        INSERT INTO t_matches_live (
          match_block_id,
          tournament_date,
          match_number,
          match_code,
          team1_id,
          team2_id,
          team1_display_name,
          team2_display_name,
          court_number,
          start_time,
          team1_scores,
          team2_scores,
          period_count,
          winner_team_id,
          match_status,
          remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
      `, [
        newBlockId,
        match.tournament_date,
        match.match_number,
        match.match_code,
        match.team1_id,
        match.team2_id,
        match.team1_display_name || '',
        match.team2_display_name || '',
        match.court_number,
        match.start_time,
        match.team1_scores,
        match.team2_scores,
        match.period_count || 1,
        match.winner_team_id,
        match.remarks || null
      ]);

      // 確定済み試合は t_matches_final にも挿入
      if (match.is_confirmed) {
        const liveResult = await db.execute(`
          SELECT match_id FROM t_matches_live 
          WHERE match_block_id = ? AND match_code = ?
        `, [newBlockId, match.match_code]);
        
        if (liveResult.rows.length > 0) {
          const newMatchId = liveResult.rows[0].match_id;
          
          await db.execute(`
            INSERT INTO t_matches_final (
              match_id,
              team1_goals,
              team2_goals,
              team1_pk_details,
              team2_pk_details,
              winner_team_id,
              is_draw,
              is_walkover,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'))
          `, [
            newMatchId,
            match.team1_goals || 0,
            match.team2_goals || 0,
            JSON.stringify(match.team1_pk_details || []),
            JSON.stringify(match.team2_pk_details || []),
            match.winner_team_id,
            match.is_draw || 0,
            match.is_walkover || 0
          ]);
        }
      }
      
      matchesRestored++;
    }
    console.log(`✅ ${matchesRestored} 試合を復元\n`);

    // 7. 順位表データの復元
    console.log('📊 順位表データを復元中...');
    let standingsRestored = 0;
    
    for (const standing of standingsData) {
      // 新しいブロックIDを取得
      let newBlockId = null;
      for (const [oldId, blockInfo] of uniqueBlocks) {
        if (blockInfo.phase === standing.phase && 
            blockInfo.block_name === (standing.block_name || '')) {
          newBlockId = blockIdMap.get(oldId);
          break;
        }
      }
      
      if (newBlockId && standing.team_rankings) {
        await db.execute(`
          UPDATE t_match_blocks 
          SET team_rankings = ?,
              updated_at = datetime('now', '+9 hours')
          WHERE match_block_id = ?
        `, [
          JSON.stringify(standing.team_rankings),
          newBlockId
        ]);
        standingsRestored++;
      }
    }
    console.log(`✅ ${standingsRestored} ブロックの順位表を復元\n`);

    // 8. 大会のis_archivedフラグを維持
    await db.execute(`
      UPDATE t_tournaments 
      SET is_archived = 1,
          updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ?
    `, [tournamentId]);

    console.log('🎉 復元が完了しました！\n');
    
    // 復元結果の確認
    console.log('📋 復元結果の確認:');
    
    // チーム数確認
    const teamCountResult = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournament_teams WHERE tournament_id = ?
    `, [tournamentId]);
    console.log(`   - 復元されたチーム数: ${teamCountResult.rows[0].count}`);
    
    // 試合数確認
    const matchCountResult = await db.execute(`
      SELECT COUNT(*) as count FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);
    console.log(`   - 復元された試合数: ${matchCountResult.rows[0].count}`);
    
    // 確定済み試合数確認
    const finalMatchCountResult = await db.execute(`
      SELECT COUNT(*) as count FROM t_matches_final mf
      JOIN t_matches_live ml ON mf.match_id = ml.match_id
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);
    console.log(`   - 復元された確定済み試合数: ${finalMatchCountResult.rows[0].count}`);

    console.log('\n✅ すべての処理が正常に完了しました');

  } catch (error) {
    console.error('❌ 復元エラー:', error);
    console.error('エラー詳細:', error.message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// メイン処理を実行
restoreFromArchive(tournamentId);