// サッカーとPK選手権の処理分離の妥当性を分析
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function analyzeSportLogicSeparation() {
  try {
    console.log('=== サッカー・PK選手権処理分離の妥当性分析 ===\n');
    
    // 1. 競技種別別の順位決定ルールを確認
    const soccerRulesResult = await client.execute(`
      SELECT 
        tr.tournament_id,
        t.tournament_name,
        st.sport_name,
        st.sport_code,
        tr.tie_breaking_rules,
        tr.point_system
      FROM t_tournament_rules tr
      JOIN t_tournaments t ON tr.tournament_id = t.tournament_id
      JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE st.sport_code = 'soccer' AND tr.phase = 'preliminary'
      LIMIT 5
    `);
    
    console.log('🏈 サッカー競技の順位決定ルール例:');
    soccerRulesResult.rows.forEach(rule => {
      console.log(`  大会${rule.tournament_id} (${rule.tournament_name}):`);
      if (rule.tie_breaking_rules) {
        try {
          const parsed = JSON.parse(rule.tie_breaking_rules);
          console.log(`    順位決定: ${parsed.map(r => r.type).join(' → ')}`);
        } catch (e) {
          console.log(`    順位決定: 解析エラー`);
        }
      }
      if (rule.point_system) {
        try {
          const pointSystem = JSON.parse(rule.point_system);
          console.log(`    勝点システム: 勝利${pointSystem.win}点, 引分${pointSystem.draw}点, 敗北${pointSystem.loss}点`);
        } catch (e) {
          console.log(`    勝点システム: 解析エラー`);
        }
      }
    });
    
    const pkRulesResult = await client.execute(`
      SELECT 
        tr.tournament_id,
        t.tournament_name,
        st.sport_name,
        st.sport_code,
        tr.tie_breaking_rules,
        tr.point_system
      FROM t_tournament_rules tr
      JOIN t_tournaments t ON tr.tournament_id = t.tournament_id
      JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE st.sport_code = 'pk' AND tr.phase = 'preliminary'
      LIMIT 5
    `);
    
    console.log('\n⚽ PK選手権の順位決定ルール例:');
    if (pkRulesResult.rows.length > 0) {
      pkRulesResult.rows.forEach(rule => {
        console.log(`  大会${rule.tournament_id} (${rule.tournament_name}):`);
        if (rule.tie_breaking_rules) {
          try {
            const parsed = JSON.parse(rule.tie_breaking_rules);
            console.log(`    順位決定: ${parsed.map(r => r.type).join(' → ')}`);
          } catch (e) {
            console.log(`    順位決定: 解析エラー`);
          }
        }
        if (rule.point_system) {
          try {
            const pointSystem = JSON.parse(rule.point_system);
            console.log(`    勝点システム: 勝利${pointSystem.win}点, 引分${pointSystem.draw}点, 敗北${pointSystem.loss}点`);
          } catch (e) {
            console.log(`    勝点システム: 解析エラー`);
          }
        }
      });
    } else {
      console.log('  PK選手権の大会なし（または設定なし）');
    }
    
    // 2. 両競技の共通点と相違点を分析
    console.log('\n🔍 サッカーとPK選手権の比較分析:');
    
    // デフォルト順位決定ルールの比較
    console.log('\n📋 順位決定ルールの比較:');
    console.log('  サッカー: 勝点 → 得失点差 → 総得点 → 直接対決 → 抽選');
    console.log('  PK選手権: 勝点 → 得失点差 → 総得点 → 直接対決 → 抽選');
    console.log('  → 基本的な順位決定ルールは同一');
    
    console.log('\n💯 勝点システムの比較:');
    console.log('  サッカー: 勝利3点, 引分1点, 敗北0点');
    console.log('  PK選手権: 勝利3点, 引分1点, 敗北0点 (但しPK戦により引分は稀)');
    console.log('  → 勝点システムも基本的に同一');
    
    console.log('\n⚽ スコア管理の比較:');
    console.log('  サッカー: ピリオド別スコア (例: "1,2" = 前半1点+後半2点=合計3点)');
    console.log('  PK選手権: ピリオド別スコア (例: "1,2" = 通常戦1点+PK戦2点=合計3点)');
    console.log('  → スコア管理形式も同一');
    
    // 3. 実際の関数の比較
    console.log('\n🔧 現在の実装の比較:');
    console.log('  calculateBlockStandings:');
    console.log('    - PK選手権想定の実装');
    console.log('    - しかし実際にはサッカーと同じロジック');
    console.log('    - 基本的な順位計算、parseScore、勝点計算');
    
    console.log('  calculateMultiSportBlockStandings:');
    console.log('    - サッカー等の多競技対応想定');
    console.log('    - カスタム順位決定ルール対応');
    console.log('    - より複雑な処理、しかし基本ロジックは同一');
    
    // 4. 処理統合の可能性を検討
    console.log('\n💡 処理統合の可能性:');
    console.log('  ✅ 順位決定基準が同一 (勝点→得失点差→総得点→直接対決→抽選)');
    console.log('  ✅ 勝点システムが同一 (3-1-0)');
    console.log('  ✅ スコア解析ロジックが同一 (parseScore関数)');
    console.log('  ✅ 基本的なデータ構造が同一');
    
    console.log('\n🚧 現在の問題点:');
    console.log('  ❌ 関数が分離されているため、どちらを使うか判断が困難');
    console.log('  ❌ calculateBlockStandings → PK選手権「想定」だが実際はサッカーと同じ');
    console.log('  ❌ calculateMultiSportBlockStandings → TypeScriptエラーで使用不可');
    console.log('  ❌ 競技種別チェックが不十分で間違った関数を使用しやすい');
    
    console.log('\n🎯 統合化の提案:');
    console.log('  1. 単一の順位計算関数 (calculateUniversalBlockStandings)');
    console.log('  2. 競技種別を引数として受け取る');
    console.log('  3. 競技固有の処理は条件分岐で対応');
    console.log('  4. カスタムルール対応を標準化');
    
    console.log('\n📈 メリット:');
    console.log('  ✅ 関数選択の迷いがなくなる');
    console.log('  ✅ バグの混入リスクが減る');
    console.log('  ✅ 新競技追加時の影響範囲が明確');
    console.log('  ✅ テストとメンテナンスが簡素化');
    
    // 5. 既存コードの調査
    console.log('\n🔎 既存コードでの関数使用状況:');
    
    // calculateBlockStandingsの使用箇所（推定）
    console.log('  calculateBlockStandings 使用箇所:');
    console.log('    - updateBlockRankingsOnMatchConfirm');
    console.log('    - match-result-handler.ts (試合確定時)');
    console.log('    - 手動順位再計算API');
    
    console.log('  calculateMultiSportBlockStandings 使用箇所:');
    console.log('    - standings-enhanced API (コメントアウト済み)');
    console.log('    - updateBlockRankingsMultiSport (コメントアウト済み)');
    
    console.log('\n🔧 推奨する対応:');
    console.log('  【短期】大会43のサッカー対応:');
    console.log('    1. calculateMultiSportBlockStandingsのTypeScriptエラー修正');
    console.log('    2. サッカー競技では適切な関数を使用');
    console.log('  【長期】処理統合:');
    console.log('    1. 共通のcalculateBlockStandingsUniversal作成');
    console.log('    2. 競技種別による自動振り分け');
    console.log('    3. 段階的に既存関数を置換');
    
  } catch (error) {
    console.error('分析エラー:', error);
  } finally {
    client.close();
  }
}

analyzeSportLogicSeparation();