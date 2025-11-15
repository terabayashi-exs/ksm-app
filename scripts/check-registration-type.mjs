// scripts/check-registration-type.mjs
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkRegistrationTypes() {
  try {
    console.log('チェック中: ID:73の部門に参加しているチームのregistration_type\n');

    // ID:73の部門に参加しているチームを取得
    const result = await db.execute(`
      SELECT
        tt.tournament_team_id,
        tt.team_id,
        tt.team_name as tournament_team_name,
        tt.team_omission as tournament_team_omission,
        tt.registration_method,
        m.team_name as master_team_name,
        m.team_omission as master_team_omission,
        m.registration_type as master_registration_type,
        m.contact_email,
        tt.created_at
      FROM t_tournament_teams tt
      INNER JOIN m_teams m ON tt.team_id = m.team_id
      WHERE tt.tournament_id = 73
      ORDER BY tt.created_at DESC
    `);

    console.log(`見つかったチーム数: ${result.rows.length}\n`);

    result.rows.forEach((row, index) => {
      console.log(`=== チーム ${index + 1} ===`);
      console.log(`tournament_team_id: ${row.tournament_team_id}`);
      console.log(`team_id: ${row.team_id}`);
      console.log(`大会参加チーム名: ${row.tournament_team_name}`);
      console.log(`大会参加チーム略称: ${row.tournament_team_omission}`);
      console.log(`マスターチーム名: ${row.master_team_name}`);
      console.log(`マスター略称: ${row.master_team_omission}`);
      console.log(`【大会参加方法】registration_method: ${row.registration_method || '(NULL)'}`);
      console.log(`【マスター登録方法】master_registration_type: ${row.master_registration_type || '(NULL)'}`);
      console.log(`contact_email: ${row.contact_email}`);
      console.log(`登録日時: ${row.created_at}`);
      console.log('');
    });

    // 全チームのregistration_methodを集計
    console.log('\n=== 大会参加方法 (registration_method) の集計 ===');
    const adminProxyCount = result.rows.filter(r => r.registration_method === 'admin_proxy').length;
    const selfRegisteredCount = result.rows.filter(r => r.registration_method === 'self_registered').length;
    const nullCount = result.rows.filter(r => !r.registration_method).length;

    console.log(`管理者代行 (admin_proxy): ${adminProxyCount}件`);
    console.log(`自己登録 (self_registered): ${selfRegisteredCount}件`);
    console.log(`NULL: ${nullCount}件`);

  } catch (error) {
    console.error('エラー:', error);
  }
}

checkRegistrationTypes();
