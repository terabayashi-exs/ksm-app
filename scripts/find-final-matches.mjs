#!/usr/bin/env node

// 全ての試合を確認して決勝T試合を探す
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function findFinalMatches() {
  try {
    console.log('🔍 全ての試合を確認して決勝T試合を探す...\n');
    
    // 全試合確認
    const allMatches = await client.execute(`
      SELECT 
        match_code,
        team1_display_name,
        team2_display_name,
        team1_id,
        team2_id,
        match_block_id
      FROM t_matches_live
      ORDER BY match_code
    `);
    
    console.log(`全試合: ${allMatches.rows.length}件`);
    
    // ブロックごとに分類
    const blockMatches = {};
    allMatches.rows.forEach(match => {
      const blockId = match.match_block_id;
      if (!blockMatches[blockId]) blockMatches[blockId] = [];
      blockMatches[blockId].push(match);
    });
    
    Object.keys(blockMatches).forEach(blockId => {
      console.log(`\nブロック ${blockId}:`);
      blockMatches[blockId].forEach(match => {
        console.log(`  ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name} (ID: ${match.team1_id || 'null'} vs ${match.team2_id || 'null'})`);
      });
    });
    
    // A1チーム、A2チームが含まれる試合を探す
    console.log(`\n🎯 A1チーム、A2チームが含まれる試合:`);
    const aTeamMatches = allMatches.rows.filter(match => 
      match.team1_display_name && match.team1_display_name.includes('A') || 
      match.team2_display_name && match.team2_display_name.includes('A') ||
      match.team1_display_name && match.team1_display_name.includes('1位') ||
      match.team2_display_name && match.team2_display_name.includes('1位')
    );
    
    if (aTeamMatches.length > 0) {
      aTeamMatches.forEach(match => {
        console.log(`  ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
      });
    } else {
      console.log('  該当する試合が見つかりません');
    }
    
    // ブロック情報も確認
    console.log(`\n📊 ブロック情報:`);
    const blocks = await client.execute(`
      SELECT match_block_id, phase, display_round_name, block_name
      FROM t_match_blocks
      ORDER BY match_block_id
    `);
    
    blocks.rows.forEach(block => {
      console.log(`  ブロック${block.match_block_id}: ${block.phase} - ${block.display_round_name} (${block.block_name})`);
    });
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    client.close();
  }
}

findFinalMatches();