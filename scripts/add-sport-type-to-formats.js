const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.DATABASE_URL || "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: process.env.DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function addSportTypeToFormats() {
  try {
    console.log('=== m_tournament_formats テーブル構造確認 ===');
    const schemaResult = await db.execute('PRAGMA table_info(m_tournament_formats)');
    console.table(schemaResult.rows);
    
    // sport_type_idフィールドが存在するかチェック
    const hasSportTypeId = schemaResult.rows.some(row => row.name === 'sport_type_id');
    
    if (!hasSportTypeId) {
      console.log('\n=== sport_type_idフィールドを追加 ===');
      await db.execute(`
        ALTER TABLE m_tournament_formats 
        ADD COLUMN sport_type_id INTEGER DEFAULT 1 REFERENCES m_sport_types(sport_type_id)
      `);
      console.log('✅ sport_type_idフィールドを追加しました');
    } else {
      console.log('✅ sport_type_idフィールドは既に存在します');
    }
    
    console.log('\n=== 更新後のテーブル構造 ===');
    const updatedSchemaResult = await db.execute('PRAGMA table_info(m_tournament_formats)');
    console.table(updatedSchemaResult.rows);
    
    console.log('\n=== 現在のフォーマット一覧 ===');
    const formats = await db.execute(`
      SELECT 
        tf.format_id,
        tf.format_name,
        tf.target_team_count,
        tf.sport_type_id,
        st.sport_name
      FROM m_tournament_formats tf
      LEFT JOIN m_sport_types st ON tf.sport_type_id = st.sport_type_id
      LIMIT 5
    `);
    console.table(formats.rows);
    
  } catch (error) {
    console.error('エラー:', error);
  }
}

addSportTypeToFormats();