// scripts/check-registration-type-prod.mjs
// 本番環境（ksm-main）のregistration_method確認スクリプト
import { createClient } from '@libsql/client';

// 本番用データベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

const db = createClient({
  url: PROD_DB_URL,
  authToken: PROD_DB_AUTH_TOKEN,
});

async function checkRegistrationTypes() {
  try {
    console.log('=== 本番環境（ksm-main）registration_method確認 ===\n');

    // 全チームの参加情報を取得
    const result = await db.execute(`
      SELECT
        tt.tournament_team_id,
        tt.team_id,
        tt.tournament_id,
        t.tournament_name,
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
      INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      ORDER BY tt.tournament_id, tt.created_at DESC
    `);

    console.log(`見つかったチーム参加数: ${result.rows.length}\n`);

    // 大会別にグループ化して表示
    const tournamentGroups = {};
    result.rows.forEach(row => {
      if (!tournamentGroups[row.tournament_id]) {
        tournamentGroups[row.tournament_id] = {
          tournament_name: row.tournament_name,
          teams: []
        };
      }
      tournamentGroups[row.tournament_id].teams.push(row);
    });

    Object.entries(tournamentGroups).forEach(([tournamentId, group]) => {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`大会ID: ${tournamentId} - ${group.tournament_name}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      group.teams.forEach((row, index) => {
        console.log(`\n--- チーム ${index + 1} ---`);
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
      });
    });

    // 全体集計
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('=== 大会参加方法 (registration_method) の集計 ===');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const adminProxyCount = result.rows.filter(r => r.registration_method === 'admin_proxy').length;
    const selfRegisteredCount = result.rows.filter(r => r.registration_method === 'self_registered').length;
    const nullCount = result.rows.filter(r => !r.registration_method).length;

    console.log(`管理者代行 (admin_proxy): ${adminProxyCount}件`);
    console.log(`自己登録 (self_registered): ${selfRegisteredCount}件`);
    console.log(`NULL: ${nullCount}件`);
    console.log(`合計: ${result.rows.length}件`);

  } catch (error) {
    console.error('エラー:', error);
  }
}

checkRegistrationTypes();
