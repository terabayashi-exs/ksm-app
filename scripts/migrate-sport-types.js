// 競技種別マスタ関連のテーブル作成とマイグレーション
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function runMigration() {
  console.log('🚀 競技種別マスタマイグレーション開始...');
  
  try {
    // 1. m_sport_types テーブル作成
    console.log('\n📋 競技種別マスタテーブル作成中...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_sport_types (
        sport_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sport_name TEXT NOT NULL,
        sport_code TEXT UNIQUE NOT NULL,
        max_period_count INTEGER NOT NULL,
        regular_period_count INTEGER NOT NULL,
        score_type TEXT NOT NULL DEFAULT 'numeric',
        default_match_duration INTEGER,
        score_unit TEXT DEFAULT 'ゴール',
        period_definitions TEXT NOT NULL,
        result_format TEXT DEFAULT 'score',
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
      )
    `);
    console.log('✅ m_sport_types テーブル作成完了');
    
    // 2. t_tournament_rules テーブル作成
    console.log('\n📋 大会ルール設定テーブル作成中...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_tournament_rules (
        tournament_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        phase TEXT NOT NULL,
        use_extra_time BOOLEAN DEFAULT 0,
        use_penalty BOOLEAN DEFAULT 0,
        active_periods TEXT NOT NULL,
        win_condition TEXT DEFAULT 'score',
        notes TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments (tournament_id),
        UNIQUE (tournament_id, phase)
      )
    `);
    console.log('✅ t_tournament_rules テーブル作成完了');
    
    // 3. m_tournament_formats に sport_type_id カラム追加
    console.log('\n🔧 m_tournament_formats テーブルに競技種別カラム追加中...');
    
    // カラムが既に存在するかチェック
    const formatColumns = await db.execute('PRAGMA table_info(m_tournament_formats)');
    const hasFormatSportType = formatColumns.rows.some(col => col.name === 'sport_type_id');
    
    if (!hasFormatSportType) {
      await db.execute('ALTER TABLE m_tournament_formats ADD COLUMN sport_type_id INTEGER DEFAULT 1');
      console.log('✅ m_tournament_formats.sport_type_id カラム追加完了');
    } else {
      console.log('⏭️ m_tournament_formats.sport_type_id カラムは既に存在します');
    }
    
    // 4. t_tournaments に sport_type_id カラム追加
    console.log('\n🔧 t_tournaments テーブルに競技種別カラム追加中...');
    
    const tournamentColumns = await db.execute('PRAGMA table_info(t_tournaments)');
    const hasTournamentSportType = tournamentColumns.rows.some(col => col.name === 'sport_type_id');
    
    if (!hasTournamentSportType) {
      await db.execute('ALTER TABLE t_tournaments ADD COLUMN sport_type_id INTEGER DEFAULT 1');
      console.log('✅ t_tournaments.sport_type_id カラム追加完了');
    } else {
      console.log('⏭️ t_tournaments.sport_type_id カラムは既に存在します');
    }
    
    // 5. テーブル構造の確認
    console.log('\n📊 作成されたテーブル構造:');
    
    console.log('\n[m_sport_types]');
    const sportTypesInfo = await db.execute('PRAGMA table_info(m_sport_types)');
    sportTypesInfo.rows.forEach(col => {
      console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });
    
    console.log('\n[t_tournament_rules]');
    const rulesInfo = await db.execute('PRAGMA table_info(t_tournament_rules)');
    rulesInfo.rows.forEach(col => {
      console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });
    
    console.log('\n✅ マイグレーション完了！');
    
  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  }
}

// メイン実行
runMigration()
  .then(() => {
    console.log('\n🎉 競技種別マスタマイグレーション正常完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 マイグレーション失敗:', error);
    process.exit(1);
  });