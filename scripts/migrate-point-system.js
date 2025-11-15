// 勝点システム機能のためのスキーマ更新スクリプト
// Phase 2: 勝点設定のデータベース拡張

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const migrationStatements = [
  // t_tournament_rules テーブルに勝点システム関連カラムを追加
  `ALTER TABLE t_tournament_rules ADD COLUMN point_system TEXT`, // JSON形式で {win: 3, draw: 1, loss: 0}
  
  // m_sport_types テーブルに競技種別別設定カラムを追加（既に存在する場合はスキップ）
  `ALTER TABLE m_sport_types ADD COLUMN supports_point_system INTEGER DEFAULT 1`,
  `ALTER TABLE m_sport_types ADD COLUMN supports_draws INTEGER DEFAULT 1`,
  `ALTER TABLE m_sport_types ADD COLUMN ranking_method TEXT DEFAULT 'points'`, // 'points', 'win_rate', 'time'
  
  // インデックス作成
  `CREATE INDEX IF NOT EXISTS idx_tournament_rules_point_system ON t_tournament_rules(tournament_id, point_system)`,
  
  // 更新記録
  `INSERT INTO sample_data (value) VALUES ('point_system_schema_updated_' || datetime('now', '+9 hours'))`
];

// 競技種別別のデフォルト設定データ
const sportTypeUpdates = [
  {
    sport_code: 'pk_championship',
    supports_point_system: 1,
    supports_draws: 1,
    ranking_method: 'points'
  },
  {
    sport_code: 'soccer',
    supports_point_system: 1,
    supports_draws: 1,
    ranking_method: 'points'
  },
  {
    sport_code: 'futsal',
    supports_point_system: 1,
    supports_draws: 1,
    ranking_method: 'points'
  },
  {
    sport_code: 'baseball',
    supports_point_system: 0,
    supports_draws: 0,
    ranking_method: 'win_rate'
  },
  {
    sport_code: 'basketball',
    supports_point_system: 0,
    supports_draws: 0,
    ranking_method: 'win_rate'
  },
  {
    sport_code: 'handball',
    supports_point_system: 0,
    supports_draws: 1,
    ranking_method: 'win_rate'
  },
  {
    sport_code: 'track_and_field',
    supports_point_system: 0,
    supports_draws: 0,
    ranking_method: 'time'
  }
];

async function migratePointSystem() {
  try {
    console.log('🚀 勝点システムマイグレーション開始...');
    
    // 1. スキーマ更新
    console.log('\n📋 データベーススキーマ更新中...');
    for (const stmt of migrationStatements) {
      try {
        await client.execute(stmt);
        console.log('✅', stmt.substring(0, 60) + '...');
      } catch (error) {
        if (error.message.includes('duplicate column name') || error.message.includes('already exists')) {
          console.log('⚠️  Already exists:', stmt.substring(0, 60) + '...');
        } else {
          throw error;
        }
      }
    }
    
    // 2. 競技種別別設定の更新
    console.log('\n🏃 競技種別別設定データ更新中...');
    for (const sportType of sportTypeUpdates) {
      try {
        await client.execute(`
          UPDATE m_sport_types 
          SET 
            supports_point_system = ?,
            supports_draws = ?,
            ranking_method = ?,
            updated_at = datetime('now', '+9 hours')
          WHERE sport_code = ?
        `, [
          sportType.supports_point_system,
          sportType.supports_draws,
          sportType.ranking_method,
          sportType.sport_code
        ]);
        console.log(`✅ ${sportType.sport_code}: 勝点=${sportType.supports_point_system ? 'あり' : 'なし'}, 引分=${sportType.supports_draws ? 'あり' : 'なし'}, 方式=${sportType.ranking_method}`);
      } catch (error) {
        console.log(`⚠️  ${sportType.sport_code}: スキップ (${error.message})`);
      }
    }
    
    // 3. 既存大会データにデフォルト勝点設定を追加
    console.log('\n🏆 既存大会にデフォルト勝点設定適用中...');
    
    // 勝点システム対応競技の大会を特定
    const pointSystemTournaments = await client.execute(`
      SELECT DISTINCT t.tournament_id, st.sport_code
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE st.supports_point_system = 1
    `);
    
    for (const tournament of pointSystemTournaments.rows) {
      const defaultPointSystem = JSON.stringify({
        win: 3,
        draw: 1,
        loss: 0
      });
      
      // 既存のルール設定に勝点システムを追加
      const existingRules = await client.execute(`
        SELECT tournament_rule_id, phase FROM t_tournament_rules
        WHERE tournament_id = ? AND (point_system IS NULL OR point_system = '')
      `, [tournament.tournament_id]);
      
      for (const rule of existingRules.rows) {
        await client.execute(`
          UPDATE t_tournament_rules
          SET 
            point_system = ?,
            updated_at = datetime('now', '+9 hours')
          WHERE tournament_rule_id = ?
        `, [defaultPointSystem, rule.tournament_rule_id]);
      }
      
      console.log(`✅ 大会ID:${tournament.tournament_id} (${tournament.sport_code}) - ${existingRules.rows.length}フェーズに勝点設定適用`);
    }
    
    // 4. 更新後のテーブル構造確認
    console.log('\n📊 更新後のテーブル構造:');
    
    console.log('\n[t_tournament_rules]');
    const rulesInfo = await client.execute(`PRAGMA table_info(t_tournament_rules)`);
    rulesInfo.rows.forEach(col => {
      console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });
    
    console.log('\n[m_sport_types] (新規カラムのみ)');
    const sportTypesInfo = await client.execute(`PRAGMA table_info(m_sport_types)`);
    const newColumns = sportTypesInfo.rows.filter(col => 
      ['supports_point_system', 'supports_draws', 'ranking_method'].includes(col.name)
    );
    newColumns.forEach(col => {
      console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });
    
    // 5. 動作確認用クエリ
    console.log('\n🔍 動作確認:');
    const sampleQuery = await client.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        st.sport_code,
        st.supports_point_system,
        st.supports_draws,
        st.ranking_method,
        tr.point_system
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id  
      LEFT JOIN t_tournament_rules tr ON t.tournament_id = tr.tournament_id AND tr.phase = 'preliminary'
      LIMIT 3
    `);
    
    sampleQuery.rows.forEach(row => {
      console.log(`  大会: ${row.tournament_name} | 競技: ${row.sport_code} | 勝点システム: ${row.supports_point_system ? 'あり' : 'なし'} | 設定: ${row.point_system || 'なし'}`);
    });
    
    console.log('\n✅ 勝点システムマイグレーション完了！');
    
  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// メイン実行
migratePointSystem()
  .then(() => {
    console.log('\n🎉 勝点システムマイグレーション正常完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 マイグレーション失敗:', error);
    process.exit(1);
  });