// チーム登録種別フィールドを追加するマイグレーションスクリプト
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

// .env.local を読み込み
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function addRegistrationTypeField() {
  try {
    console.log('マイグレーション開始: registration_type フィールドを追加');

    // フィールドを追加
    await db.execute(`
      ALTER TABLE m_teams ADD COLUMN registration_type TEXT DEFAULT 'self_registered'
    `);
    console.log('✅ registration_type フィールドを追加しました');

    // 既存データの確認
    const existingTeams = await db.execute(`
      SELECT team_id, team_name, registration_type, created_at 
      FROM m_teams 
      ORDER BY created_at DESC
    `);
    
    console.log('📊 既存チーム一覧:');
    existingTeams.rows.forEach(team => {
      console.log(`  - ${team.team_name} (${team.team_id}): ${team.registration_type}`);
    });

    console.log('🎉 マイグレーション完了');

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    if (error.message?.includes('duplicate column name')) {
      console.log('⚠️  registration_type フィールドは既に存在します');
      
      // 既存データの確認
      try {
        const existingTeams = await db.execute(`
          SELECT team_id, team_name, registration_type, created_at 
          FROM m_teams 
          ORDER BY created_at DESC
        `);
        
        console.log('📊 現在のチーム一覧:');
        existingTeams.rows.forEach(team => {
          console.log(`  - ${team.team_name} (${team.team_id}): ${team.registration_type}`);
        });
      } catch (selectError) {
        console.error('データ確認エラー:', selectError);
      }
    }
  }
}

// スクリプト実行
addRegistrationTypeField();