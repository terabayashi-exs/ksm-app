// PK戦表示要件の調査（修正版）
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function investigatePKDisplayRequirements() {
  try {
    console.log('=== PK戦表示要件調査 ===\n');
    
    // 1. 現在のスコア保存形式を確認（大会43の試合）
    console.log('🔍 現在のスコア保存形式:');
    const scoreExamples = await client.execute(`
      SELECT 
        mf.match_code,
        mf.team1_scores,
        mf.team2_scores,
        mf.period_count,
        mf.winner_team_id,
        mf.is_draw
      FROM t_matches_final mf
      JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 43
      ORDER BY mf.match_code
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
        mf.match_code,
        mf.team1_scores,
        mf.team2_scores,
        mf.period_count,
        mf.winner_team_id,
        mf.is_draw
      FROM t_matches_final mf
      JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 43 AND mf.period_count > 2
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
    
    function analyzeSoccerScore(scoreString, periodCount) {
      if (!scoreString || !scoreString.includes(',')) {
        return {
          regularTime: parseInt(scoreString) || 0,
          pkScore: null,
          totalScore: parseInt(scoreString) || 0,
          display: scoreString || '0',
          forStandings: parseInt(scoreString) || 0  // 順位表用（PK戦除外）
        };
      }
      
      const periods = scoreString.split(',').map(s => parseInt(s.trim()) || 0);
      
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
    }
    
    // テストケース
    const testCases = [
      { score: '1,1', periods: 2, desc: '通常戦90分' },
      { score: '1,1,1', periods: 3, desc: '延長戦120分' },
      { score: '1,1,0,4', periods: 4, desc: 'PK戦' },
      { score: '2,0,0,3', periods: 4, desc: 'PK戦2' }
    ];
    
    console.log('  サッカー用スコア解析テスト:');
    testCases.forEach(test => {
      const analysis = analyzeSoccerScore(test.score, test.periods);
      console.log(`    ${test.desc}: "${test.score}"`);
      console.log(`      表示用: "${analysis.display}"`);
      console.log(`      順位表用: ${analysis.forStandings}`);
      console.log(`      PK戦: ${analysis.pkScore !== null ? 'あり' : 'なし'}`);
    });
    
    // 6. 実際の大会43データで解析テスト
    console.log('\n📊 大会43実データでの解析テスト:');
    scoreExamples.rows.forEach(match => {
      const team1Analysis = analyzeSoccerScore(match.team1_scores, match.period_count);
      const team2Analysis = analyzeSoccerScore(match.team2_scores, match.period_count);
      
      console.log(`  ${match.match_code}:`);
      console.log(`    表示: ${team1Analysis.display} - ${team2Analysis.display}`);
      console.log(`    順位表用: ${team1Analysis.forStandings} - ${team2Analysis.forStandings}`);
    });
    
    // 7. 既存の表示箇所を確認
    console.log('\n📺 スコア表示箇所の修正要件:');
    console.log('  1. 順位表 - 通常戦スコアのみで得失点計算（PK戦除外）');
    console.log('  2. 戦績表 - PK戦込み表示 "2-2(PK 5-4)"');
    console.log('  3. 試合一覧 - PK戦込み表示');
    console.log('  4. HTML出力 - PK戦込み表示');
    
    // 8. calculateMultiSportBlockStandingsでの対応可能性
    console.log('\n🔧 calculateMultiSportBlockStandings対応方針:');
    console.log('  ✅ サッカー用parseScore関数の追加');
    console.log('     - parseSoccerScore(score, periodCount)');
    console.log('     - 順位表用スコア（通常戦のみ）');
    console.log('     - 表示用スコア（PK戦込み）');
    console.log('  ✅ 競技種別による分岐処理');
    console.log('     - soccer: PK戦考慮ロジック');
    console.log('     - pk/その他: 従来ロジック');
    console.log('  ✅ TypeScriptエラー修正');
    console.log('     - 依存関数の問題解決');
    
    // 9. 実装手順の提案
    console.log('\n📋 実装手順の提案:');
    console.log('  1. calculateMultiSportBlockStandingsのTypeScriptエラー修正');
    console.log('  2. サッカー用スコア解析関数の追加');
    console.log('  3. 順位表計算でのPK戦除外処理');
    console.log('  4. 表示コンポーネントでのPK戦表示対応');
    console.log('  5. 大会43での動作確認');
    
    console.log('\n🎯 結論:');
    console.log('  ✅ PK戦の特殊表示は完全に実現可能');
    console.log('  ✅ 順位表では通常戦スコア、表示ではPK戦込みの分離が可能');
    console.log('  ✅ calculateMultiSportBlockStandingsで対応可能');
    console.log('  ✅ 大会43のサッカー対応を進めるべき');
    console.log('  ✅ 懸念は解決可能、修正を開始してよい');
    
  } catch (error) {
    console.error('調査エラー:', error);
  } finally {
    client.close();
  }
}

investigatePKDisplayRequirements();