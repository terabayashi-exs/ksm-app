#!/usr/bin/env node

// standings-calculator関数を直接インポートしてテスト
import { updateBlockRankingsOnMatchConfirm } from '../lib/standings-calculator.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testCalculatorDirectly() {
  try {
    console.log('🧪 standings-calculator関数の直接テスト...\n');
    
    const matchBlockId = 14;
    const tournamentId = 3;
    
    console.log(`🔄 updateBlockRankingsOnMatchConfirm(${matchBlockId}, ${tournamentId}) 実行中...`);
    
    // 実際の関数を直接呼び出し
    await updateBlockRankingsOnMatchConfirm(matchBlockId, tournamentId);
    
    console.log('✅ 関数実行完了');
    
  } catch (error) {
    console.error('❌ 関数実行エラー:', error);
    console.error('エラー詳細:', {
      message: error.message,
      stack: error.stack
    });
  }
}

testCalculatorDirectly();