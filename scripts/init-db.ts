// scripts/init-db.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { initializeDatabaseSimple, seedInitialData } from '../lib/database-init-simple';

async function main() {
  console.log('Starting database initialization...');
  
  // データベース初期化
  const initResult = await initializeDatabaseSimple();
  if (!initResult.success) {
    console.error('Database initialization failed:', initResult.error);
    process.exit(1);
  }
  
  // 初期データ投入
  const seedResult = await seedInitialData();
  if (!seedResult.success) {
    console.error('Data seeding failed:', seedResult.error);
    process.exit(1);
  }
  
  console.log('Database setup completed successfully!');
}

main().catch(console.error);