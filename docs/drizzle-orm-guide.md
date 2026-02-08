
drizzle-orm-guide.md
1
/
1
ページ
100%
# Drizzle ORM 入門ガイド

TypeScript/JavaScript 向けの軽量・型安全な ORM

---

## 目次

1. [Drizzle とは](#drizzle-とは)
2. [インストール](#インストール)
3. [スキーマ定義](#スキーマ定義)
4. [データベース接続](#データベース接続)
5. [マイグレーション](#マイグレーション)
6. [CRUD操作](#crud操作)
7. [型の活用](#型の活用)
8. [リレーション](#リレーション)
9. [Prismaとの比較](#prismaとの比較)

---

## Drizzle とは

Drizzle ORM は「**If you know SQL, you know Drizzle**」をコンセプトにした TypeScript ORM です。

### 主な特徴

- **SQLライクな構文** - SQLを知っていれば直感的に使える
- **完全な型安全性** - スキーマ定義から自動的に型が推論される
- **軽量** - バンドルサイズが小さく、サーバーレス環境に最適
- **ゼロ依存** - 外部依存が最小限
- **マイグレーション管理** - drizzle-kit による自動生成

### 対応データベース

- PostgreSQL
- MySQL
- SQLite / Turso / LibSQL
- Cloudflare D1
- Neon, PlanetScale, Supabase など

---

## インストール

### 基本パッケージ

```bash
# ORM本体
npm install drizzle-orm

# マイグレーションツール
npm install -D drizzle-kit
```

### データベース別ドライバ

```bash
# PostgreSQL
npm install pg
npm install -D @types/pg

# MySQL
npm install mysql2

# SQLite
npm install better-sqlite3
npm install -D @types/better-sqlite3

# Turso / LibSQL
npm install @libsql/client
```

---

## スキーマ定義

### 基本構造 (PostgreSQL の例)

```typescript
// src/db/schema.ts
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';

// チームテーブル
export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  division: varchar('division', { length: 50 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 選手テーブル
export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  number: integer('number'),
  teamId: integer('team_id').references(() => teams.id),
  position: varchar('position', { length: 50 }),
});
```

### SQLite / Turso の場合

```typescript
// src/db/schema.ts
import {
  sqliteTable,
  integer,
  text,
} from 'drizzle-orm/sqlite-core';

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  division: text('division'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});
```

### 主なカラム型

| PostgreSQL | SQLite | 説明 |
|------------|--------|------|
| `serial()` | `integer().primaryKey({ autoIncrement: true })` | 自動採番ID |
| `varchar()` | `text()` | 文字列 |
| `integer()` | `integer()` | 整数 |
| `boolean()` | `integer({ mode: 'boolean' })` | 真偽値 |
| `timestamp()` | `integer({ mode: 'timestamp' })` | 日時 |
| `text()` | `text()` | 長文テキスト |

---

## データベース接続

### PostgreSQL

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

### Turso / LibSQL

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
```

### SQLite (ローカルファイル)

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('local.db');
export const db = drizzle(sqlite, { schema });
```

---

## マイグレーション

### 設定ファイル

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql', // または 'sqlite', 'mysql', 'turso'
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Turso用の設定

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
```

### コマンド

```bash
# マイグレーションファイル生成
npx drizzle-kit generate

# マイグレーション適用
npx drizzle-kit migrate

# 開発時: スキーマを直接DBに反映（履歴なし）
npx drizzle-kit push

# DBの状態をスキーマに取り込む
npx drizzle-kit pull

# Drizzle Studio（GUI）を起動
npx drizzle-kit studio
```

### package.json スクリプト例

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### ⚠️ Turso/LibSQL使用時の注意事項と解決方法

#### 問題の概要

Drizzle Kitが生成するマイグレーションファイルには`--> statement-breakpoint`という構文が含まれますが、TursoのSQL Parserはこれを解釈できず、エラーが発生する場合があります。

```bash
# デフォルト設定でのマイグレーション実行時にエラー
npm run db:migrate
# → LibsqlError: SQL_PARSE_ERROR:
#    non-terminated block comment at (3, 1)
```

**原因:**
- Drizzle Kitは全データベース共通で`--> statement-breakpoint`をマーカーとして使用
- PostgreSQL/MySQLは寛容に無視するが、Tursoは厳密でエラーを返す

#### ✅ 解決方法：`breakpoints: false` の設定（推奨）

**`drizzle.config.ts`に`breakpoints: false`を追加することで、この問題を完全に解決できます。**

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  breakpoints: false, // ← この1行を追加
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
```

**効果:**
- ✅ `--> statement-breakpoint`が生成されなくなる
- ✅ 純粋な標準SQLのみが生成される
- ✅ Tursoで問題なく実行できる
- ✅ マイグレーション履歴も正常に管理される
- ✅ `npm run db:migrate`が正常に動作する

**検証結果:**
```sql
-- breakpoints: false の場合
ALTER TABLE `t_matches_final` ADD `test_field` text;

-- breakpoints: true の場合（デフォルト）
ALTER TABLE `t_matches_final` ADD `test_field` text;--> statement-breakpoint
```

この設定により、**Tursoでも標準的なDrizzle Kitマイグレーションフローが使用可能**になります。

#### 代替手段（breakpoints: false が使えない場合）

**`breakpoints: false`の設定で解決できない場合**、以下の代替手段があります：

**方法1: 開発環境で`db:push`を使用（履歴なし）**

```bash
# スキーマを直接データベースに反映
npm run db:push:dev

# メリット: 素早く、Tursoで確実に動作
# デメリット: マイグレーション履歴が残らない
```

**方法2: 本番環境で手動マイグレーションスクリプトを作成**

```javascript
// scripts/migration-xxx.mjs
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function migrate() {
  console.log('🔧 Starting migration...');

  try {
    // 外部キー制約を一時無効化
    await client.execute('PRAGMA foreign_keys=OFF');

    // 標準的なSQLのみ記述（Turso互換）
    await client.execute(`
      CREATE TABLE new_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `);

    // データ移行
    await client.execute(`
      INSERT INTO new_table SELECT * FROM old_table
    `);

    // 古いテーブル削除
    await client.execute('DROP TABLE old_table');

    // リネーム
    await client.execute('ALTER TABLE new_table RENAME TO old_table');

    // 外部キー制約を再有効化
    await client.execute('PRAGMA foreign_keys=ON');

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.close();
  }
}

migrate();
```

**実行方法:**

```bash
# dev環境
node scripts/migration-xxx.mjs

# stag環境
DATABASE_URL=$DATABASE_URL_STAG \
DATABASE_AUTH_TOKEN=$DATABASE_AUTH_TOKEN_STAG \
node scripts/migration-xxx.mjs

# main環境
DATABASE_URL=$DATABASE_URL_MAIN \
DATABASE_AUTH_TOKEN=$DATABASE_AUTH_TOKEN_MAIN \
node scripts/migration-xxx.mjs
```

**メリット:**
- ✅ 完全なコントロールが可能
- ✅ Turso固有の問題を回避できる
- ✅ Gitで履歴管理できる
- ✅ 環境別に実行できる
- ✅ 詳細なログ出力・エラーハンドリングが可能

**参考実装:** `scripts/remove-team-id-columns.mjs`

#### 推奨される運用方針

**`breakpoints: false`を設定した場合（推奨）:**

```
全環境共通
  └─ 標準的なDrizzle Kitマイグレーションフロー
      1. src/db/schema.ts を編集
      2. npm run db:generate でマイグレーションファイル生成
      3. npm run db:migrate:dev / :stag / :main で適用
      4. MIGRATION_HISTORY.md に記録
```

**`breakpoints: false`を使わない場合（非推奨）:**

```
開発環境（dev）
  ├─ 日常的な変更: npm run db:push:dev
  └─ 重要な変更: 手動スクリプト

ステージング環境（stag）
  └─ 手動スクリプト（devでテスト済み）

本番環境（main）
  └─ 手動スクリプト（stagで検証済み）
```

---

## CRUD操作

### Select（読み取り）

```typescript
import { db } from './db';
import { teams, players } from './db/schema';
import { eq, like, and, or, desc, asc } from 'drizzle-orm';

// 全件取得
const allTeams = await db.select().from(teams);

// 条件付き取得
const activeTeams = await db
  .select()
  .from(teams)
  .where(eq(teams.isActive, true));

// 特定カラムのみ
const teamNames = await db
  .select({ id: teams.id, name: teams.name })
  .from(teams);

// 複数条件
const filtered = await db
  .select()
  .from(players)
  .where(
    and(
      eq(players.teamId, 1),
      like(players.name, '%田%')
    )
  );

// ソートと件数制限
const topPlayers = await db
  .select()
  .from(players)
  .orderBy(desc(players.number))
  .limit(10);

// 1件取得
const team = await db
  .select()
  .from(teams)
  .where(eq(teams.id, 1))
  .limit(1);
```

### Insert（作成）

```typescript
// 1件挿入
await db.insert(teams).values({
  name: '東京チーム',
  division: 'A',
});

// 複数件挿入
await db.insert(players).values([
  { name: '山田太郎', number: 10, teamId: 1 },
  { name: '鈴木花子', number: 7, teamId: 1 },
]);

// 挿入して結果を取得
const newTeam = await db
  .insert(teams)
  .values({ name: '大阪チーム' })
  .returning();
```

### Update（更新）

```typescript
// 条件付き更新
await db
  .update(teams)
  .set({ isActive: false })
  .where(eq(teams.id, 1));

// 更新して結果を取得
const updated = await db
  .update(players)
  .set({ number: 11 })
  .where(eq(players.id, 5))
  .returning();
```

### Delete（削除）

```typescript
// 条件付き削除
await db
  .delete(players)
  .where(eq(players.teamId, 1));

// 削除して結果を取得
const deleted = await db
  .delete(teams)
  .where(eq(teams.id, 1))
  .returning();
```

---

## 型の活用

### 自動推論される型

```typescript
import { db } from './db';
import { teams } from './db/schema';

// クエリ結果は自動的に型付けされる
const allTeams = await db.select().from(teams);
// 型: {
//   id: number;
//   name: string;
//   division: string | null;
//   isActive: boolean | null;
//   createdAt: Date | null;
// }[]

// 部分選択も正確に型付け
const names = await db.select({ name: teams.name }).from(teams);
// 型: { name: string }[]
```

### 型のエクスポート

```typescript
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { teams } from './db/schema';

// SELECT結果の型
export type Team = InferSelectModel<typeof teams>;

// INSERT用の型（デフォルト値のあるカラムはオプショナル）
export type NewTeam = InferInsertModel<typeof teams>;

// 使用例
function createTeam(data: NewTeam): Promise<Team> {
  return db.insert(teams).values(data).returning().then(rows => rows[0]);
}
```

### 型安全なWHERE条件

```typescript
// ✅ 正しい型
await db.select().from(teams).where(eq(teams.id, 1));

// ❌ コンパイルエラー（型が合わない）
await db.select().from(teams).where(eq(teams.id, 'abc'));
```

---

## リレーション

### リレーションの定義

```typescript
// src/db/schema.ts
import { relations } from 'drizzle-orm';
import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
});

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  teamId: integer('team_id').references(() => teams.id),
});

// リレーション定義
export const teamsRelations = relations(teams, ({ many }) => ({
  players: many(players),
}));

export const playersRelations = relations(players, ({ one }) => ({
  team: one(teams, {
    fields: [players.teamId],
    references: [teams.id],
  }),
}));
```

### リレーション込みクエリ

```typescript
// チームと所属選手を一緒に取得
const teamsWithPlayers = await db.query.teams.findMany({
  with: {
    players: true,
  },
});
// 型: { id: number; name: string; players: Player[] }[]

// 選手と所属チームを一緒に取得
const playersWithTeam = await db.query.players.findMany({
  with: {
    team: true,
  },
});
// 型: { id: number; name: string; teamId: number; team: Team }[]

// ネストしたリレーション
const data = await db.query.teams.findMany({
  with: {
    players: {
      where: (players, { gt }) => gt(players.number, 5),
      orderBy: (players, { asc }) => asc(players.number),
    },
  },
});
```

### JOINによる取得

```typescript
import { eq } from 'drizzle-orm';

// INNER JOIN
const result = await db
  .select({
    playerName: players.name,
    teamName: teams.name,
  })
  .from(players)
  .innerJoin(teams, eq(players.teamId, teams.id));

// LEFT JOIN
const result2 = await db
  .select()
  .from(teams)
  .leftJoin(players, eq(teams.id, players.teamId));
```

---

## Prismaとの比較

| 項目 | Drizzle | Prisma |
|------|---------|--------|
| **哲学** | SQLライク、低抽象化 | 高抽象化、ORM中心 |
| **スキーマ定義** | TypeScript | 独自DSL (.prisma) |
| **型生成** | 自動（再生成不要） | `prisma generate` が必要 |
| **バンドルサイズ** | 軽量 | 重い |
| **サーバーレス** | 最適化済み | コールドスタートが重い |
| **Raw SQL** | 型安全なまま使用可能 | 型なし |
| **学習コスト** | SQL知識があれば低い | 独自APIの学習が必要 |
| **エコシステム** | 成長中 | 成熟 |

### Drizzleを選ぶべきケース

- SQLの知識を活かしたい
- サーバーレス/Edge環境で使う
- バンドルサイズを小さくしたい
- 型の再生成なしで開発したい
- Turso / LibSQL を使う

### Prismaを選ぶべきケース

- SQLをあまり書きたくない
- 充実したGUIツールが欲しい
- 大規模チームで統一した書き方を強制したい

---

## 参考リンク

- 公式ドキュメント: https://orm.drizzle.team
- GitHub: https://github.com/drizzle-team/drizzle-orm
- Drizzle Kit: https://orm.drizzle.team/kit-docs/overview

---

*このドキュメントは Drizzle ORM v0.30+ を対象としています*
drizzle-orm-guide.md を表示しています。