// 競技種別詳細調査スクリプト
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function investigateSportTypes() {
  try {
    console.log('=== 競技種別詳細調査 ===\n');
    
    // 1. m_sport_typesテーブルの全データを確認
    const sportTypesResult = await client.execute(`
      SELECT * FROM m_sport_types ORDER BY sport_type_id
    `);
    
    console.log('🏃 登録されている競技種別一覧:');
    sportTypesResult.rows.forEach(sport => {
      console.log(`  ID ${sport.sport_type_id}: ${sport.sport_name} (コード: ${sport.sport_code})`);
    });
    
    // 2. 大会43の競技種別を特定
    const tournament43SportResult = await client.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.sport_type_id,
        st.sport_name,
        st.sport_code,
        tf.format_name
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      LEFT JOIN m_tournament_formats tf ON t.format_id = tf.format_id
      WHERE t.tournament_id = 43
    `);
    
    console.log('\n🎯 大会43の競技種別詳細:');
    if (tournament43SportResult.rows.length > 0) {
      const tournament = tournament43SportResult.rows[0];
      console.log(`  大会名: ${tournament.tournament_name}`);
      console.log(`  競技種別ID: ${tournament.sport_type_id}`);
      console.log(`  競技種別名: ${tournament.sport_name}`);
      console.log(`  競技種別コード: ${tournament.sport_code}`);
      console.log(`  使用フォーマット: ${tournament.format_name}`);
    }
    
    // 3. フォーマットの競技種別も確認
    const formatSportResult = await client.execute(`
      SELECT 
        tf.format_id,
        tf.format_name,
        tf.sport_type_id,
        st.sport_name,
        st.sport_code
      FROM m_tournament_formats tf
      LEFT JOIN m_sport_types st ON tf.sport_type_id = st.sport_type_id
      WHERE tf.format_id = 18
    `);
    
    console.log('\n📊 大会43のフォーマットの競技種別:');
    if (formatSportResult.rows.length > 0) {
      const format = formatSportResult.rows[0];
      console.log(`  フォーマット名: ${format.format_name}`);
      console.log(`  競技種別ID: ${format.sport_type_id}`);
      console.log(`  競技種別名: ${format.sport_name}`);
      console.log(`  競技種別コード: ${format.sport_code}`);
    }
    
    // 4. 大会とフォーマットで競技種別が一致しているかチェック
    const consistencyCheckResult = await client.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.sport_type_id as tournament_sport_type_id,
        st1.sport_code as tournament_sport_code,
        tf.sport_type_id as format_sport_type_id,
        st2.sport_code as format_sport_code,
        CASE 
          WHEN t.sport_type_id = tf.sport_type_id THEN '一致'
          ELSE '不一致'
        END as consistency
      FROM t_tournaments t
      LEFT JOIN m_sport_types st1 ON t.sport_type_id = st1.sport_type_id
      LEFT JOIN m_tournament_formats tf ON t.format_id = tf.format_id
      LEFT JOIN m_sport_types st2 ON tf.sport_type_id = st2.sport_type_id
      WHERE t.tournament_id = 43
    `);
    
    console.log('\n🔍 大会とフォーマットの競技種別一致性チェック:');
    if (consistencyCheckResult.rows.length > 0) {
      const check = consistencyCheckResult.rows[0];
      console.log(`  大会の競技種別: ${check.tournament_sport_code} (ID: ${check.tournament_sport_type_id})`);
      console.log(`  フォーマットの競技種別: ${check.format_sport_code} (ID: ${check.format_sport_type_id})`);
      console.log(`  一致性: ${check.consistency}`);
      
      if (check.consistency === '不一致') {
        console.log('  ⚠️  警告: 大会とフォーマットで競技種別が一致していません');
      }
    }
    
    // 5. 他の大会で同じフォーマットを使用している例を確認
    const otherTournamentsResult = await client.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.sport_type_id,
        st.sport_code,
        t.created_at
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.format_id = 18 AND t.tournament_id != 43
      ORDER BY t.created_at DESC
      LIMIT 5
    `);
    
    console.log('\n🔗 同じフォーマット(ID:18)を使用する他の大会:');
    if (otherTournamentsResult.rows.length > 0) {
      otherTournamentsResult.rows.forEach(t => {
        console.log(`  大会${t.tournament_id}: ${t.tournament_name} (${t.sport_code}) - ${t.created_at}`);
      });
    } else {
      console.log('  同じフォーマットを使用する他の大会なし');
    }
    
    // 6. システムの競技種別判定ロジックを模擬
    console.log('\n🎯 システム競技種別判定の模擬:');
    
    const systemLogicResult = await client.execute(`
      SELECT 
        COALESCE(st.sport_code, 'pk_championship') as determined_sport_code,
        st.sport_code as actual_sport_code,
        st.sport_name
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.tournament_id = 43
    `);
    
    if (systemLogicResult.rows.length > 0) {
      const logic = systemLogicResult.rows[0];
      console.log(`  実際の競技種別: ${logic.actual_sport_code} (${logic.sport_name})`);
      console.log(`  システム判定: ${logic.determined_sport_code}`);
      
      if (logic.actual_sport_code === 'soccer') {
        console.log('  ✅ 大会43は正式にサッカー競技として設定されています');
        console.log('  ❗ calculateMultiSportBlockStandingsの使用が本来は適切です');
        console.log('  ❗ calculateBlockStandingsの使用は競技種別に合致していません');
      } else if (logic.actual_sport_code === 'pk_championship') {
        console.log('  ✅ 大会43はPK選手権として設定されています');
        console.log('  ✅ calculateBlockStandingsの使用が適切です');
      } else {
        console.log(`  ❓ 予期しない競技種別: ${logic.actual_sport_code}`);
      }
    }
    
    // 7. 最終判定
    console.log('\n📝 調査結果の最終判定:');
    const finalResult = tournament43SportResult.rows[0];
    if (finalResult && finalResult.sport_code === 'soccer') {
      console.log('🏆 結論: 大会43はサッカー競技として作成・設定されています');
      console.log('🔧 修正方針:');
      console.log('  1. calculateMultiSportBlockStandingsを使用するべき');
      console.log('  2. または、PK選手権として扱うなら競技種別を変更するべき');
      console.log('  3. 現在のcalculateBlockStandingsの使用は競技種別と不一致');
    } else if (finalResult && finalResult.sport_code === 'pk_championship') {
      console.log('🏆 結論: 大会43はPK選手権として設定されています');
      console.log('✅ 現在の修正（calculateBlockStandings使用）は適切');
    } else {
      console.log('❓ 競技種別が不明または予期しない設定です');
    }
    
  } catch (error) {
    console.error('調査エラー:', error);
  } finally {
    client.close();
  }
}

investigateSportTypes();