import { createClient } from "@libsql/client";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkTable() {
  try {
    console.log('Checking t_tournament_players table...');
    
    // テーブル構造を確認
    const tableInfo = await db.execute(`PRAGMA table_info(t_tournament_players)`);
    console.log('Table structure:', tableInfo.rows);
    
    // レコード数を確認
    const countResult = await db.execute(`SELECT COUNT(*) as count FROM t_tournament_players`);
    console.log('Record count:', countResult.rows[0]);
    
    // 全レコードを表示
    const allRecords = await db.execute(`SELECT * FROM t_tournament_players`);
    console.log('All records:', allRecords.rows);
    
    // t_tournament_teamsも確認
    const teamCount = await db.execute(`SELECT COUNT(*) as count FROM t_tournament_teams`);
    console.log('Tournament teams count:', teamCount.rows[0]);
    
    const teamRecords = await db.execute(`SELECT * FROM t_tournament_teams`);
    console.log('Tournament teams:', teamRecords.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    db.close();
  }
}

checkTable();