// lib/database-init.ts
import { db } from './db';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function initializeDatabase() {
  try {
    // スキーマファイルを読み込み
    const schemaPath = join(process.cwd(), 'docs', 'database', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // SQLをセミコロンで分割して個別に実行
    const allStatements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    // CREATE TABLE文とINDEX文を分離して、CREATE TABLEを先に実行
    const createStatements = allStatements.filter(stmt => stmt.startsWith('CREATE TABLE'));
    const indexStatements = allStatements.filter(stmt => stmt.startsWith('CREATE INDEX'));
    const otherStatements = allStatements.filter(stmt => 
      !stmt.startsWith('CREATE TABLE') && !stmt.startsWith('CREATE INDEX')
    );
    
    const statements = [...createStatements, ...otherStatements, ...indexStatements];
    
    console.log(`CREATE TABLE statements: ${createStatements.length}`);
    console.log(`INDEX statements: ${indexStatements.length}`);
    console.log(`Other statements: ${otherStatements.length}`);
    console.log(`Total statements: ${statements.length}`);
    
    if (createStatements.length > 0) {
      console.log('First CREATE TABLE statement:', createStatements[0].substring(0, 100));
    }
    if (statements.length > 0) {
      console.log('First statement to execute:', statements[0].substring(0, 100));
    }
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}: ${statement.substring(0, 50)}...`);
          await db.execute(statement);
        } catch (statementError) {
          console.error(`Error executing statement ${i + 1}:`, statement);
          console.error('Error:', statementError);
          throw statementError;
        }
      }
    }
    
    console.log('Database initialized successfully');
    return { success: true, message: 'Database initialized successfully' };
  } catch (error) {
    console.error('Database initialization failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function seedInitialData() {
  try {
    // 会場データの初期投入
    await db.execute(`
      INSERT OR IGNORE INTO m_venues (venue_name, address, available_courts) VALUES 
      ('メイン会場', '東京都渋谷区', 4),
      ('サブ会場A', '東京都新宿区', 2),
      ('サブ会場B', '東京都世田谷区', 3)
    `);

    // 大会フォーマットデータの初期投入
    await db.execute(`
      INSERT OR IGNORE INTO m_tournament_formats (format_name, target_team_count, format_description) VALUES 
      ('8チーム予選リーグ+決勝トーナメント', 8, '8チームを2つのリーグに分けて予選を行い、上位チームで決勝トーナメントを実施'),
      ('16チーム予選リーグ+決勝トーナメント', 16, '16チームを4つのリーグに分けて予選を行い、上位チームで決勝トーナメントを実施'),
      ('6チーム総当たりリーグ戦', 6, '6チーム全てが総当たりでリーグ戦を実施')
    `);

    // 管理者アカウントの初期投入
    const bcrypt = await import('bcryptjs');
    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    await db.execute(`
      INSERT OR IGNORE INTO m_administrators (admin_login_id, password_hash, email) VALUES 
      ('admin', ?, ?)
    `, [hashedPassword, process.env.ADMIN_DEFAULT_EMAIL || 'admin@example.com']);

    console.log('Initial data seeded successfully');
    return { success: true, message: 'Initial data seeded successfully' };
  } catch (error) {
    console.error('Data seeding failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}