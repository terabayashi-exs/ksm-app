// 既存の36チーム形式テンプレートに順位決定データを追加
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// 決勝トーナメントの順位決定ルール定義（実際のMコード形式）
// 順位決定ルール定義（必要最小限）
const positionRules = [
  // 準々決勝（M29-M32）: 敗者は5位
  {
    match_code: 'M29',
    loser_position_start: 5,
    loser_position_end: 5,
    position_note: '準々決勝敗退'
  },
  {
    match_code: 'M30',
    loser_position_start: 5,
    loser_position_end: 5,
    position_note: '準々決勝敗退'
  },
  {
    match_code: 'M31',
    loser_position_start: 5,
    loser_position_end: 5,
    position_note: '準々決勝敗退'
  },
  {
    match_code: 'M32',
    loser_position_start: 5,
    loser_position_end: 5,
    position_note: '準々決勝敗退'
  },
  
  // 準決勝（M33-M34）: 敗者は3位決定戦があるので順位未定
  {
    match_code: 'M33',
    loser_position_start: null,
    loser_position_end: null,
    position_note: '準決勝（3位決定戦に進出）'
  },
  {
    match_code: 'M34',
    loser_position_start: null,
    loser_position_end: null,
    position_note: '準決勝（3位決定戦に進出）'
  },
  
  // 3位決定戦（M35）
  {
    match_code: 'M35',
    loser_position_start: 4,
    loser_position_end: 4,
    position_note: '3位決定戦',
    winner_position: 3
  },
  
  // 決勝戦（M36）
  {
    match_code: 'M36',
    loser_position_start: 2,
    loser_position_end: 2,
    position_note: '決勝戦',
    winner_position: 1
  }
];

async function updateTemplatePositions() {
  console.log('🔄 テンプレート順位データ更新開始...');
  
  try {
    // 決勝トーナメントがあるフォーマットを取得（M形式）
    const formatResult = await db.execute(`
      SELECT DISTINCT mt.format_id, tf.format_name
      FROM m_match_templates mt
      JOIN m_tournament_formats tf ON mt.format_id = tf.format_id
      WHERE mt.phase = 'final' AND mt.match_code IN ('M29', 'M30', 'M31', 'M32', 'M33', 'M34', 'M35', 'M36')
      ORDER BY mt.format_id DESC
      LIMIT 1
    `);
    
    if (formatResult.rows.length === 0) {
      console.log('⚠️  決勝トーナメント形式が見つかりませんでした');
      return;
    }
    
    const formatId = formatResult.rows[0].format_id;
    const formatName = formatResult.rows[0].format_name;
    console.log(`📋 対象フォーマット: ${formatName} (ID: ${formatId})`);
    
    // 各ルールを適用
    for (const rule of positionRules) {
      console.log(`🔧 ${rule.match_code} の順位ルール設定中...`);
      
      await db.execute(`
        UPDATE m_match_templates 
        SET 
          loser_position_start = ?,
          loser_position_end = ?,
          position_note = ?,
          winner_position = ?,
          updated_at = datetime('now', '+9 hours')
        WHERE format_id = ? AND match_code = ? AND phase = 'final'
      `, [
        rule.loser_position_start,
        rule.loser_position_end,
        rule.position_note,
        rule.winner_position || null,
        formatId,
        rule.match_code
      ]);
    }
    
    console.log('✅ テンプレート更新完了');
    
    // 更新結果確認
    console.log('\n📊 更新されたテンプレート:');
    const result = await db.execute(`
      SELECT match_code, loser_position_start, loser_position_end, 
             winner_position, position_note
      FROM m_match_templates 
      WHERE format_id = ? AND phase = 'final'
      ORDER BY execution_priority
    `, [formatId]);
    
    result.rows.forEach(row => {
      console.log(`  ${row.match_code}: 敗者順位:${row.loser_position_start || 'TBD'} | 勝者順位:${row.winner_position || 'TBD'} | 備考:${row.position_note || 'なし'}`);
    });
    
  } catch (error) {
    console.error('❌ テンプレート更新エラー:', error);
    throw error;
  }
}

updateTemplatePositions()
  .then(() => {
    console.log('🎉 テンプレート更新正常完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 テンプレート更新失敗:', error);
    process.exit(1);
  });