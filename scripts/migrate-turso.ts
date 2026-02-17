import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

// 環境に応じた接続情報を取得
const env = process.argv[2] || 'dev';
const dbUrl = env === 'stag'
  ? process.env.DATABASE_URL_STAG
  : env === 'main'
  ? process.env.DATABASE_URL_MAIN
  : process.env.DATABASE_URL;

const dbToken = env === 'stag'
  ? process.env.DATABASE_AUTH_TOKEN_STAG
  : env === 'main'
  ? process.env.DATABASE_AUTH_TOKEN_MAIN
  : process.env.DATABASE_AUTH_TOKEN;

const db = createClient({
  url: dbUrl!,
  authToken: dbToken,
});

interface Migration {
  idx: number;
  tag: string;
  when: number;
}

async function getMigrationsJournal(): Promise<Migration[]> {
  const journalPath = path.join(process.cwd(), 'drizzle/meta/_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
  return journal.entries;
}

async function getAppliedMigrations(): Promise<Set<string>> {
  try {
    const result = await db.execute('SELECT hash FROM __drizzle_migrations');
    return new Set(result.rows.map((row: any) => row.hash));
  } catch (error) {
    // テーブルが存在しない場合は空のセットを返す
    return new Set();
  }
}

async function executeMigrationFile(filePath: string, tag: string): Promise<void> {
  console.log(`\n📄 適用中: ${tag}`);

  let sql = fs.readFileSync(filePath, 'utf-8');

  // ブロックコメント /* ... */ を削除
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');

  // SQLをセミコロンで分割（空白行やコメントを除外）
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      // 空白、コメント行、SELECTプレースホルダーを除外
      return s.length > 0 &&
             !s.startsWith('--') &&
             s !== 'SELECT 1';
    });

  if (statements.length === 0) {
    console.log(`  ⊘ 実行可能なSQL文がありません（コメントのみ、または手動適用済み）`);
    return;
  }

  for (const statement of statements) {
    try {
      await db.execute(statement);
      console.log(`  ✓ ${statement.substring(0, 60).replace(/\n/g, ' ')}...`);
    } catch (error: any) {
      // 無視可能なエラー（既に適用済みの変更）
      const ignorableErrors = [
        'already exists',
        'duplicate',
        'no such column',  // カラムが既に削除済み
        'no such table',   // テーブルが既に削除済み
      ];

      const shouldIgnore = ignorableErrors.some(msg => error.message?.includes(msg));

      if (shouldIgnore) {
        console.log(`  ⊘ スキップ: ${statement.substring(0, 60).replace(/\n/g, ' ')}... (既に適用済み)`);
      } else {
        throw error;
      }
    }
  }
}

async function recordMigration(idx: number, tag: string, when: number): Promise<void> {
  try {
    await db.execute({
      sql: 'INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)',
      args: [idx + 1, tag, when]
    });
    console.log(`  ✓ マイグレーション履歴に記録: ${tag}`);
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      console.log(`  ⊘ 既に記録済み: ${tag}`);
    } else {
      throw error;
    }
  }
}

async function migrate() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Turso対応マイグレーター (環境: ${env})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // マイグレーション一覧を取得
    const allMigrations = await getMigrationsJournal();
    console.log(`\n📚 マイグレーションファイル数: ${allMigrations.length}`);

    // 適用済みマイグレーションを取得
    const appliedMigrations = await getAppliedMigrations();
    console.log(`✓ 適用済み: ${appliedMigrations.size}件`);

    // 未適用のマイグレーションをフィルタリング
    const pendingMigrations = allMigrations.filter(m => !appliedMigrations.has(m.tag));

    if (pendingMigrations.length === 0) {
      console.log('\n✨ 全てのマイグレーションが適用済みです');
      return;
    }

    console.log(`\n⏳ 未適用: ${pendingMigrations.length}件`);

    // 未適用のマイグレーションを実行
    for (const migration of pendingMigrations) {
      const filePath = path.join(process.cwd(), `drizzle/${migration.tag}.sql`);

      if (!fs.existsSync(filePath)) {
        console.log(`\n⚠️  スキップ: ${migration.tag} (ファイルが存在しません)`);
        // ファイルがなくても履歴には記録（手動適用済みの場合）
        await recordMigration(migration.idx, migration.tag, migration.when);
        continue;
      }

      await executeMigrationFile(filePath, migration.tag);
      await recordMigration(migration.idx, migration.tag, migration.when);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅ マイグレーション完了');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

migrate().catch(console.error);
