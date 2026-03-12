import { config } from 'dotenv';
import { createClient } from '@libsql/client';

config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL_DEV!,
  authToken: process.env.DATABASE_AUTH_TOKEN_DEV!,
});

async function checkGroup14() {
  try {
    console.log('group_id:14のデータを確認中...\n');

    // 1. t_tournament_groupsテーブルの確認
    console.log('=== t_tournament_groups ===');
    const groupResult = await client.execute(`
      SELECT * FROM t_tournament_groups WHERE group_id = 14
    `);

    if (groupResult.rows.length === 0) {
      console.log('❌ group_id:14 が見つかりません');
      return;
    }

    console.log('✅ group_id:14 が存在します');
    console.log(JSON.stringify(groupResult.rows[0], null, 2));

    // 2. 所属する部門（t_tournaments）の確認
    console.log('\n=== 所属部門（t_tournaments） ===');
    const tournamentsResult = await client.execute(`
      SELECT
        tournament_id,
        tournament_name,
        group_id,
        status,
        visibility,
        is_archived
      FROM t_tournaments
      WHERE group_id = 14
      ORDER BY tournament_id
    `);

    console.log(`所属部門数: ${tournamentsResult.rows.length}`);
    if (tournamentsResult.rows.length > 0) {
      tournamentsResult.rows.forEach(row => {
        console.log(`\n  tournament_id: ${row.tournament_id}`);
        console.log(`  tournament_name: ${row.tournament_name}`);
        console.log(`  status: ${row.status}`);
        console.log(`  visibility: ${row.visibility}`);
        console.log(`  is_archived: ${row.is_archived}`);
      });
    } else {
      console.log('ℹ️  所属する部門がありません');
    }

    // 3. login_user_idの確認
    console.log('\n=== login_user_id の確認 ===');
    const loginUserId = groupResult.rows[0].login_user_id;
    console.log(`login_user_id: ${loginUserId}`);

    if (loginUserId) {
      const userResult = await client.execute(`
        SELECT login_user_id, display_name, email FROM m_login_users WHERE login_user_id = ?
      `, [loginUserId]);

      if (userResult.rows.length > 0) {
        console.log('ユーザー情報:');
        console.log(`  display_name: ${userResult.rows[0].display_name}`);
        console.log(`  email: ${userResult.rows[0].email}`);

        // ロール確認
        const rolesResult = await client.execute(`
          SELECT role FROM m_login_user_roles WHERE login_user_id = ?
        `, [loginUserId]);

        console.log(`  roles: ${rolesResult.rows.map(r => r.role).join(', ')}`);
      }
    } else {
      console.log('⚠️  login_user_idがNULLです');
    }

    // 4. group_orderの確認
    console.log('\n=== group_order の確認 ===');
    const groupOrder = groupResult.rows[0].group_order;
    console.log(`group_order: ${groupOrder}`);

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    client.close();
  }
}

checkGroup14();
