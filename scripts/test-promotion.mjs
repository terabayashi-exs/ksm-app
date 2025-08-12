#!/usr/bin/env node

// 決勝トーナメント進出処理をテスト
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function testPromotionSystem() {
  try {
    console.log('🚀 決勝トーナメント進出処理テスト...\n');
    
    const tournamentId = 3;
    
    // 1. 各ブロックの順位表を取得
    console.log('1️⃣ 各ブロックの順位表取得:');
    const blocks = await client.execute(`
      SELECT 
        match_block_id,
        block_name,
        team_rankings
      FROM t_match_blocks 
      WHERE tournament_id = ? 
      AND phase = 'preliminary'
      AND team_rankings IS NOT NULL
      ORDER BY block_name
    `, [tournamentId]);

    const blockRankings = [];

    for (const block of blocks.rows) {
      if (block.team_rankings) {
        try {
          const rankings = JSON.parse(block.team_rankings);
          blockRankings.push({
            block_name: block.block_name,
            rankings: rankings
          });
          
          console.log(`   ${block.block_name}ブロック:`);
          const top2 = rankings.slice(0, 2);
          top2.forEach(team => {
            console.log(`     ${team.position}位: ${team.team_name} (${team.team_id})`);
          });
        } catch (parseError) {
          console.error(`   ${block.block_name}ブロック: パースエラー`);
        }
      }
    }

    // 2. 進出チーム情報を作成
    console.log('\n2️⃣ 進出チーム情報作成:');
    const promotions = {};

    blockRankings.forEach(block => {
      const sortedRankings = block.rankings.sort((a, b) => a.position - b.position);
      
      if (sortedRankings.length >= 1) {
        promotions[`${block.block_name}_1`] = {
          team_id: sortedRankings[0].team_id,
          team_name: sortedRankings[0].team_name
        };
      }
      
      if (sortedRankings.length >= 2) {
        promotions[`${block.block_name}_2`] = {
          team_id: sortedRankings[1].team_id,
          team_name: sortedRankings[1].team_name
        };
      }
    });

    console.log('   進出チーム一覧:');
    Object.keys(promotions).forEach(key => {
      console.log(`     ${key}: ${promotions[key].team_name} (${promotions[key].team_id})`);
    });

    // 3. 決勝トーナメント試合の現状確認
    console.log('\n3️⃣ 決勝トーナメント試合の現状:');
    const finalBlockResult = await client.execute(`
      SELECT match_block_id
      FROM t_match_blocks 
      WHERE tournament_id = ? AND phase = 'final'
    `, [tournamentId]);

    if (finalBlockResult.rows.length === 0) {
      console.log('   ❌ 決勝トーナメントブロックが見つかりません');
      return;
    }

    const finalBlockId = finalBlockResult.rows[0].match_block_id;
    
    const matchesResult = await client.execute(`
      SELECT match_id, match_code, team1_id, team2_id, team1_display_name, team2_display_name
      FROM t_matches_live
      WHERE match_block_id = ?
      ORDER BY match_code
    `, [finalBlockId]);

    console.log(`   決勝トーナメント試合: ${matchesResult.rows.length}件`);
    matchesResult.rows.forEach(match => {
      console.log(`     ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
      console.log(`       現在ID: ${match.team1_id} vs ${match.team2_id}`);
    });

    // 4. 実際に更新処理実行
    console.log('\n4️⃣ 決勝トーナメント試合更新実行:');
    
    for (const match of matchesResult.rows) {
      const matchId = match.match_id;
      const matchCode = match.match_code;
      const team1Id = match.team1_id;
      const team2Id = match.team2_id;
      
      let newTeam1Id = team1Id;
      let newTeam2Id = team2Id;
      let newTeam1Name = match.team1_display_name;
      let newTeam2Name = match.team2_display_name;
      
      // チーム1の更新
      if (promotions[team1Id]) {
        newTeam1Id = promotions[team1Id].team_id;
        newTeam1Name = promotions[team1Id].team_name;
      }
      
      // チーム2の更新
      if (promotions[team2Id]) {
        newTeam2Id = promotions[team2Id].team_id;
        newTeam2Name = promotions[team2Id].team_name;
      }
      
      // 更新が必要かチェック
      if (newTeam1Id !== team1Id || newTeam2Id !== team2Id) {
        await client.execute(`
          UPDATE t_matches_live 
          SET team1_id = ?, team2_id = ?, team1_display_name = ?, team2_display_name = ?
          WHERE match_id = ?
        `, [newTeam1Id, newTeam2Id, newTeam1Name, newTeam2Name, matchId]);
        
        console.log(`     ✅ ${matchCode} 更新: ${team1Id} vs ${team2Id} → ${newTeam1Id} vs ${newTeam2Id}`);
        console.log(`        表示名: ${newTeam1Name} vs ${newTeam2Name}`);
      } else {
        console.log(`     ⏭️ ${matchCode}: 更新不要`);
      }
    }

    // 5. 更新後の確認
    console.log('\n5️⃣ 更新後の確認:');
    const updatedMatches = await client.execute(`
      SELECT match_code, team1_id, team2_id, team1_display_name, team2_display_name
      FROM t_matches_live
      WHERE match_block_id = ?
      ORDER BY match_code
    `, [finalBlockId]);

    updatedMatches.rows.forEach(match => {
      console.log(`     ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
      console.log(`       ID: ${match.team1_id} vs ${match.team2_id}`);
    });

    console.log('\n✅ 決勝トーナメント進出処理テスト完了');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    client.close();
  }
}

testPromotionSystem();