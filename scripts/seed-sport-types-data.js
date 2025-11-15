// 競技種別マスタの初期データ投入スクリプト
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const sportTypesData = [
  {
    sport_name: 'PK戦',
    sport_code: 'pk',
    max_period_count: 1,
    regular_period_count: 1,
    score_type: 'numeric',
    default_match_duration: 15,
    score_unit: 'ゴール',
    result_format: 'score',
    period_definitions: JSON.stringify([
      {
        period_id: 1,
        period_name: "PK戦",
        duration: null,
        type: "penalty",
        display_order: 1
      }
    ])
  },
  {
    sport_name: 'サッカー',
    sport_code: 'soccer',
    max_period_count: 5,
    regular_period_count: 2,
    score_type: 'numeric',
    default_match_duration: 90,
    score_unit: 'ゴール',
    result_format: 'score',
    period_definitions: JSON.stringify([
      {
        period_id: 1,
        period_name: "前半",
        duration: 45,
        type: "regular",
        display_order: 1
      },
      {
        period_id: 2,
        period_name: "後半",
        duration: 45,
        type: "regular",
        display_order: 2
      },
      {
        period_id: 3,
        period_name: "延長前半",
        duration: 15,
        type: "extra",
        display_order: 3
      },
      {
        period_id: 4,
        period_name: "延長後半",
        duration: 15,
        type: "extra",
        display_order: 4
      },
      {
        period_id: 5,
        period_name: "PK戦",
        duration: null,
        type: "penalty",
        display_order: 5
      }
    ])
  },
  {
    sport_name: '野球',
    sport_code: 'baseball',
    max_period_count: 9,
    regular_period_count: 9,
    score_type: 'numeric',
    default_match_duration: 180,
    score_unit: '得点',
    result_format: 'score',
    period_definitions: JSON.stringify([
      { period_id: 1, period_name: "1回", duration: 20, type: "regular", display_order: 1 },
      { period_id: 2, period_name: "2回", duration: 20, type: "regular", display_order: 2 },
      { period_id: 3, period_name: "3回", duration: 20, type: "regular", display_order: 3 },
      { period_id: 4, period_name: "4回", duration: 20, type: "regular", display_order: 4 },
      { period_id: 5, period_name: "5回", duration: 20, type: "regular", display_order: 5 },
      { period_id: 6, period_name: "6回", duration: 20, type: "regular", display_order: 6 },
      { period_id: 7, period_name: "7回", duration: 20, type: "regular", display_order: 7 },
      { period_id: 8, period_name: "8回", duration: 20, type: "regular", display_order: 8 },
      { period_id: 9, period_name: "9回", duration: 20, type: "regular", display_order: 9 }
    ])
  },
  {
    sport_name: '陸上（短距離）',
    sport_code: 'track_sprint',
    max_period_count: 1,
    regular_period_count: 1,
    score_type: 'time',
    default_match_duration: 5,
    score_unit: '秒',
    result_format: 'time',
    period_definitions: JSON.stringify([
      {
        period_id: 1,
        period_name: "記録",
        duration: null,
        type: "regular",
        display_order: 1
      }
    ])
  }
];

async function seedSportTypes() {
  console.log('🏟️ 競技種別マスタデータ投入開始...');
  
  try {
    // 既存データをクリア
    console.log('🧹 既存データをクリア中...');
    await db.execute('DELETE FROM m_sport_types');
    
    // 新規データを投入
    for (const sport of sportTypesData) {
      console.log(`📝 ${sport.sport_name}を登録中...`);
      
      await db.execute(`
        INSERT INTO m_sport_types (
          sport_name, sport_code, max_period_count, regular_period_count,
          score_type, default_match_duration, score_unit, period_definitions,
          result_format, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        sport.sport_name,
        sport.sport_code,
        sport.max_period_count,
        sport.regular_period_count,
        sport.score_type,
        sport.default_match_duration,
        sport.score_unit,
        sport.period_definitions,
        sport.result_format
      ]);
    }
    
    // 投入結果を確認
    const result = await db.execute('SELECT sport_type_id, sport_name, sport_code, max_period_count FROM m_sport_types ORDER BY sport_type_id');
    console.log('\n✅ 投入完了！登録された競技種別:');
    result.rows.forEach(row => {
      console.log(`  ID: ${row.sport_type_id} - ${row.sport_name} (${row.sport_code}) - 最大${row.max_period_count}ピリオド`);
    });
    
    console.log('\n🎯 競技種別マスタデータ投入完了');
    
  } catch (error) {
    console.error('❌ エラー:', error);
    throw error;
  }
}

// 既存データの更新（PK戦を競技種別ID=1として）
async function updateExistingData() {
  console.log('\n🔄 既存データの競技種別設定開始...');
  
  try {
    // 既存のフォーマットと大会をPK戦（sport_type_id = 1）に設定
    await db.execute(`
      UPDATE m_tournament_formats 
      SET sport_type_id = 1 
      WHERE sport_type_id IS NULL
    `);
    
    await db.execute(`
      UPDATE t_tournaments 
      SET sport_type_id = 1 
      WHERE sport_type_id IS NULL
    `);
    
    console.log('✅ 既存データの競技種別設定完了');
    
  } catch (error) {
    console.error('❌ 既存データ更新エラー:', error);
  }
}

// メイン実行
async function main() {
  try {
    await seedSportTypes();
    await updateExistingData();
    console.log('\n🎉 全ての処理が完了しました！');
    process.exit(0);
  } catch (error) {
    console.error('💥 処理失敗:', error);
    process.exit(1);
  }
}

main();