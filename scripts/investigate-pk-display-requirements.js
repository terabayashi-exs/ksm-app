// PK戦表示要件の調査
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function investigatePKDisplayRequirements() {
  try {
    console.log('=== PK戦表示要件調査 ===\n');
    
    // 1. 現在のスコア保存形式を確認
    console.log('🔍 現在のスコア保存形式:');
    const scoreExamples = await client.execute(`
      SELECT 
        match_code,
        team1_scores,
        team2_scores,
        period_count,
        winner_team_id,
        is_draw
      FROM t_matches_final 
      WHERE tournament_id = 43
      ORDER BY match_code
      LIMIT 10
    `);
    
    scoreExamples.rows.forEach(match => {
      console.log(`  ${match.match_code}: ${match.team1_scores} vs ${match.team2_scores} (${match.period_count}ピリオド)`);
    });
    
    // 2. サッカー向けの期待する表示例
    console.log('\n⚽ サッカーでの期待する表示形式:');
    console.log('  通常戦のみ: "2-1" (90分で決着)');
    console.log('  延長戦: "2-1" (120分で決着、延長込み)');
    console.log('  PK戦: "2-2(PK 5-4)" (120分後PK戦)');
    console.log('  →通常戦スコア + PK戦スコアの分離表示が必要');
    
    // 3. 現在のデータ構造でPK戦を区別できるかチェック
    console.log('\n🏗️ 現在のデータ構造分析:');
    
    const tableStructure = await client.execute(`PRAGMA table_info(t_matches_final);`);
    const relevantColumns = tableStructure.rows.filter(col => 
      col.name.includes('score') || 
      col.name.includes('period') || 
      col.name.includes('pk') ||
      col.name.includes('penalty')
    );
    
    console.log('  スコア関連の列:');
    relevantColumns.forEach(col => {
      console.log(`    ${col.name}: ${col.type}`);
    });
    
    // 4. PK戦判定の可能性を調査
    console.log('\n🎯 PK戦判定の可能性:');
    
    // period_count > 2 の場合はPK戦の可能性
    const possiblePKMatches = await client.execute(`
      SELECT 
        match_code,
        team1_scores,
        team2_scores,
        period_count,
        winner_team_id,
        is_draw
      FROM t_matches_final 
      WHERE tournament_id = 43 AND period_count > 2
    `);
    
    if (possiblePKMatches.rows.length > 0) {
      console.log('  PK戦の可能性がある試合:');
      possiblePKMatches.rows.forEach(match => {
        console.log(`    ${match.match_code}: ${match.team1_scores} vs ${match.team2_scores} (${match.period_count}ピリオド)`);
      });
    } else {
      console.log('  現在PK戦の試合なし（または判定不可）');
    }
    
    // 5. スコア解析のシミュレーション
    console.log('\n🧮 スコア解析シミュレーション:');
    
    function analyzeScore(scoreString, periodCount) {
      if (!scoreString || !scoreString.includes(',')) {
        return {
          regularTime: parseInt(scoreString) || 0,
          pkScore: null,
          display: scoreString || '0'
        };
      }
      
      const periods = scoreString.split(',').map(s => parseInt(s.trim()) || 0);
      
      if (periodCount <= 2) {
        // 通常戦のみ（前半・後半）
        return {
          regularTime: periods.reduce((sum, p) => sum + p, 0),
          pkScore: null,
          display: periods.reduce((sum, p) => sum + p, 0).toString()
        };
      } else if (periodCount === 3) {
        // 延長戦あり（前半・後半・延長）
        return {
          regularTime: periods.reduce((sum, p) => sum + p, 0),
          pkScore: null,
          display: periods.reduce((sum, p) => sum + p, 0).toString()
        };
      } else if (periodCount >= 4) {
        // PK戦の可能性（前半・後半・延長・PK）
        const regularScore = periods.slice(0, -1).reduce((sum, p) => sum + p, 0);
        const pkScore = periods[periods.length - 1];
        
        return {
          regularTime: regularScore,
          pkScore: pkScore,
          display: `${regularScore}(PK ${pkScore})`
        };
      }
    }
    
    // テストケース
    const testCases = [
      { score: '1,1', periods: 2, desc: '通常戦90分' },
      { score: '1,1,1', periods: 3, desc: '延長戦120分' },
      { score: '1,1,0,4', periods: 4, desc: 'PK戦' },
      { score: '2,0,0,3', periods: 4, desc: 'PK戦2' }
    ];
    
    testCases.forEach(test => {
      const analysis = analyzeScore(test.score, test.periods);
      console.log(`  ${test.desc}: "${test.score}" → "${analysis.display}"`);
    });
    
    // 6. 既存の表示箇所を確認
    console.log('\n📺 スコア表示箇所の確認:');
    console.log('  1. 順位表 - 総得点・総失点として集計');
    console.log('  2. 戦績表 - 対戦結果として表示');
    console.log('  3. 試合一覧 - 個別試合のスコア表示');
    console.log('  4. HTML出力 - 戦績表のスコア表示');
    
    // 7. 実装要件の整理
    console.log('\n📋 PK戦対応の実装要件:');
    console.log('  ✅ スコア解析: カンマ区切りスコアからPK戦部分を分離');
    console.log('  ✅ 順位表: 通常戦スコアのみで得失点計算');
    console.log('  ✅ 戦績表: PK戦込みの表示 "2-2(PK 5-4)"');
    console.log('  ✅ 勝敗判定: PK戦の勝者を正しく認識');
    
    // 8. calculateMultiSportBlockStandingsでの対応可能性
    console.log('\n🔧 calculateMultiSportBlockStandings対応可能性:');
    console.log('  ✅ 多競技対応なのでサッカー特有の処理追加可能');
    console.log('  ✅ parseScore関数をサッカー用に拡張可能');
    console.log('  ✅ スコア表示ロジックを競技別に分岐可能');
    console.log('  ✅ PK戦判定とスコア分離ロジック追加可能');
    
    // 9. 実装方針の提案
    console.log('\n💡 実装方針の提案:');
    console.log('  1. parseScore関数をサッカー用に拡張');
    console.log('     - 通常戦スコア（順位計算用）');
    console.log('     - 表示用スコア（PK戦込み）');
    console.log('  2. calculateMultiSportBlockStandingsを修正');
    console.log('     - TypeScriptエラー解決');
    console.log('     - サッカー用スコア処理追加');
    console.log('  3. 表示コンポーネントでPK戦表示対応');
    console.log('     - 戦績表でのPK戦表示');
    console.log('     - 試合一覧でのPK戦表示');
    
    console.log('\n🎯 結論:');
    console.log('  ✅ PK戦の特殊表示は実現可能');
    console.log('  ✅ calculateMultiSportBlockStandingsで対応可能');
    console.log('  ✅ 大会43のサッカー対応を進めるべき');
    
  } catch (error) {
    console.error('調査エラー:', error);
  } finally {
    client.close();
  }
}

investigatePKDisplayRequirements();