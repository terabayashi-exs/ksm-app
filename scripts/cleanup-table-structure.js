// SQLiteのALTER DROP COLUMNが使えないため、テーブル再作成で不要フィールドを削除
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function cleanupTableStructure() {
  console.log('🔄 テーブル構造クリーンアップ開始...');
  
  try {
    // 既存データをバックアップ
    console.log('📦 既存データバックアップ中...');
    const backupResult = await db.execute(`
      SELECT 
        template_id,
        format_id,
        match_number,
        match_code,
        match_type,
        phase,
        round_name,
        block_name,
        team1_source,
        team2_source,
        team1_display_name,
        team2_display_name,
        day_number,
        execution_priority,
        created_at,
        updated_at,
        court_number,
        suggested_start_time,
        start_time,
        loser_position_start,
        loser_position_end,
        position_note,
        winner_position
      FROM m_match_templates
    `);
    
    console.log(`📊 バックアップ完了: ${backupResult.rows.length}行`);
    
    // 一時テーブル作成
    console.log('🆕 クリーンな構造の一時テーブル作成中...');
    await db.execute(`
      CREATE TABLE m_match_templates_new (
        template_id INTEGER PRIMARY KEY AUTOINCREMENT,
        format_id INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        match_type TEXT NOT NULL,
        phase TEXT NOT NULL,
        round_name TEXT,
        block_name TEXT,
        team1_source TEXT,
        team2_source TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        day_number INTEGER NOT NULL,
        execution_priority INTEGER NOT NULL,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        court_number INTEGER,
        suggested_start_time TEXT,
        start_time TEXT,
        loser_position_start INTEGER,
        loser_position_end INTEGER,
        position_note TEXT,
        winner_position INTEGER,
        FOREIGN KEY (format_id) REFERENCES m_tournament_formats (format_id)
      )
    `);
    
    // データを新テーブルに移行
    console.log('📤 データ移行中...');
    for (const row of backupResult.rows) {
      await db.execute(`
        INSERT INTO m_match_templates_new (
          template_id,
          format_id,
          match_number,
          match_code,
          match_type,
          phase,
          round_name,
          block_name,
          team1_source,
          team2_source,
          team1_display_name,
          team2_display_name,
          day_number,
          execution_priority,
          created_at,
          updated_at,
          court_number,
          suggested_start_time,
          start_time,
          loser_position_start,
          loser_position_end,
          position_note,
          winner_position
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.template_id,
        row.format_id,
        row.match_number,
        row.match_code,
        row.match_type,
        row.phase,
        row.round_name,
        row.block_name,
        row.team1_source,
        row.team2_source,
        row.team1_display_name,
        row.team2_display_name,
        row.day_number,
        row.execution_priority,
        row.created_at,
        row.updated_at,
        row.court_number,
        row.suggested_start_time,
        row.start_time,
        row.loser_position_start,
        row.loser_position_end,
        row.position_note,
        row.winner_position
      ]);
    }
    
    // 古いテーブルを削除し、新しいテーブルをリネーム
    console.log('🔄 テーブル置換中...');
    await db.execute('DROP TABLE m_match_templates');
    await db.execute('ALTER TABLE m_match_templates_new RENAME TO m_match_templates');
    
    // 新しい構造を確認
    console.log('\n📋 クリーンアップ後のテーブル構造:');
    const finalResult = await db.execute('PRAGMA table_info(m_match_templates)');
    finalResult.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : 'NULL'}`);
    });
    
    // データ件数確認
    const countResult = await db.execute('SELECT COUNT(*) as count FROM m_match_templates');
    console.log(`\n📊 最終データ件数: ${countResult.rows[0].count}行`);
    
    console.log('\n✅ テーブル構造クリーンアップ完了');
    console.log('🎯 不要なフィールド（winner_advances_to_match_code, match_stage）を削除しました');
    console.log('🔧 既存の次戦進出システムには影響ありません');
    
  } catch (error) {
    console.error('❌ テーブル構造クリーンアップエラー:', error);
    
    // エラー時の復旧処理
    try {
      await db.execute('DROP TABLE IF EXISTS m_match_templates_new');
      console.log('🧹 一時テーブルを削除しました');
    } catch (cleanupError) {
      console.error('復旧処理エラー:', cleanupError);
    }
    
    throw error;
  }
}

cleanupTableStructure()
  .then(() => {
    console.log('🎉 テーブル構造クリーンアップ正常完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 テーブル構造クリーンアップ失敗:', error);
    process.exit(1);
  });