import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL_STAG!,
  authToken: process.env.DATABASE_AUTH_TOKEN_STAG,
});

async function checkAdminSchema() {
  try {
    console.log('=== m_administrators のスキーマ ===');
    const schema = await db.execute({
      sql: `PRAGMA table_info(m_administrators)`,
      args: [],
    });
    schema.rows.forEach((row) => {
      console.log(`${row.name} (${row.type})`);
    });

    console.log('\n=== admin_login_id=test001 のデータ ===');
    const admin = await db.execute({
      sql: 'SELECT * FROM m_administrators WHERE admin_login_id = ?',
      args: ['test001'],
    });

    if (admin.rows.length > 0) {
      console.log(JSON.stringify(admin.rows[0], null, 2));
    } else {
      console.log('test001管理者が見つかりません');
    }

  } catch (error) {
    console.error('エラー:', error);
  }
}

checkAdminSchema().catch(console.error);
