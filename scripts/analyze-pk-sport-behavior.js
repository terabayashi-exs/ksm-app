// PK競技でのスコア表示ロジック分析
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function analyzePKSportBehavior() {
  try {
    console.log('=== PK競技でのスコア表示ロジック分析 ===\n');
    
    // 1. 競技種別の確認
    console.log('🔍 登録されている競技種別:');
    const sportsResult = await client.execute(`
      SELECT sport_type_id, sport_name, sport_code 
      FROM m_sport_types 
      ORDER BY sport_type_id
    `);
    
    sportsResult.rows.forEach(sport => {
      console.log(`  ${sport.sport_type_id}: ${sport.sport_name} (${sport.sport_code})`);
    });
    
    // 2. 現在のスコア解析ロジックをシミュレーション
    console.log('\n🧮 現在のスコア解析ロジック:');
    
    // analyzeSoccerScore関数の挙動をテスト
    function analyzeSoccerScore(scoreString, periodCount, sportCode = 'soccer') {
      if (!scoreString || scoreString === null || scoreString === undefined) {
        return {
          regularTime: 0,
          pkScore: null,
          totalScore: 0,
          display: '0',
          forStandings: 0
        };
      }
      
      const scoreStr = String(scoreString);
      
      if (!scoreStr.includes(',')) {
        const score = parseInt(scoreStr) || 0;
        return {
          regularTime: score,
          pkScore: null,
          totalScore: score,
          display: scoreStr,
          forStandings: score
        };
      }
      
      const periods = scoreStr.split(',').map(s => parseInt(s.trim()) || 0);
      
      if (periodCount <= 2) {
        // 通常戦のみ（前半・後半）
        const total = periods.reduce((sum, p) => sum + p, 0);
        return {
          regularTime: total,
          pkScore: null,
          totalScore: total,
          display: total.toString(),
          forStandings: total
        };
      } else if (periodCount === 3) {
        // 延長戦あり（前半・後半・延長）
        const total = periods.reduce((sum, p) => sum + p, 0);
        return {
          regularTime: total,
          pkScore: null,
          totalScore: total,
          display: total.toString(),
          forStandings: total
        };
      } else if (periodCount >= 4) {
        // PK戦の可能性（前半・後半・延長・PK）
        const regularScore = periods.slice(0, -1).reduce((sum, p) => sum + p, 0);
        const pkScore = periods[periods.length - 1];
        
        return {
          regularTime: regularScore,
          pkScore: pkScore,
          totalScore: regularScore + pkScore,
          display: `${regularScore}(PK ${pkScore})`,
          forStandings: regularScore  // 順位表では通常戦スコアのみ
        };
      }
      
      return {
        regularTime: 0,
        pkScore: null,
        totalScore: 0,
        display: '0',
        forStandings: 0
      };
    }
    
    // 3. PK競技のテストケース
    console.log('\n⚽ PK競技でのテストケース:');
    const pkTestCases = [
      { score: '5', periods: 1, desc: 'PK戦単発（通常）', expected: '5-4のような単純表示' },
      { score: '3,2', periods: 2, desc: 'PK戦複数ピリオド（稀）', expected: '合計5' },
      { score: '4', periods: 1, desc: 'PK戦勝利', expected: '4' }
    ];
    
    pkTestCases.forEach(test => {
      const analysis = analyzeSoccerScore(test.score, test.periods, 'pk');
      console.log(`  ${test.desc}: "${test.score}" (${test.periods}ピリオド)`);
      console.log(`    現在の表示: "${analysis.display}"`);
      console.log(`    期待される表示: ${test.expected}`);
      console.log(`    問題: ${analysis.display.includes('(PK') ? 'サッカー用表示になっている' : 'OK'}`);
    });
    
    console.log('\n🎯 PK競技の要件:');
    console.log('✅ ピリオド数: 通常1つ（単発のPK戦）');
    console.log('✅ 表示形式: シンプルな数値表示（5, 4など）');
    console.log('❌ 不要: "(PK 5-4)"のような複雑な表示');
    console.log('❌ 不要: 通常戦とPK戦の分離');
    
    console.log('\n🔧 修正が必要な箇所:');
    console.log('1. calculateMultiSportBlockStandings内のanalyzeSoccerScore関数');
    console.log('2. 競技種別による分岐処理の追加');
    console.log('3. PKスポーツ用の単純なスコア処理ロジック');
    
    console.log('\n💡 提案する修正:');
    console.log('analyzeSoccerScore → analyzeScore に名前変更');
    console.log('sportCode引数を追加して競技別処理');
    console.log('- soccer: 現在のロジック（PK戦分離）');
    console.log('- pk: シンプルな合計計算');
    console.log('- その他: 従来の合計計算');
    
    // 4. 現在のcalculateMultiSportBlockStandingsでの処理確認
    console.log('\n📋 calculateMultiSportBlockStandingsでの処理:');
    console.log('現在: if (sportCode === "soccer") { サッカー用解析 } else { 従来処理 }');
    console.log('修正後: 各競技用の解析関数を呼び分け');
    
    console.log('\n🚀 実装計画:');
    console.log('1. analyzeScore関数の汎用化（競技種別対応）');
    console.log('2. PK競技でのシンプルスコア表示テスト');
    console.log('3. 後方互換性の確認');
    console.log('4. 不要関数の整理・削除');
    
  } catch (error) {
    console.error('分析エラー:', error);
  } finally {
    client.close();
  }
}

analyzePKSportBehavior();