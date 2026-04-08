
drizzle-seeder-guide.md
1
/
1
ページ
100%
# Drizzle ORM シーダーガイド

データベースに初期データを投入するためのシーダー実装方法

---

## 目次

1. [概要](#概要)
2. [基本構成](#基本構成)
3. [実装パターン](#実装パターン)
4. [実行方法](#実行方法)
5. [実践的なテクニック](#実践的なテクニック)
6. [KSMプロジェクト向けサンプル](#ksmプロジェクト向けサンプル)

---

## 概要

Drizzle ORM には公式のシーダー機能は含まれていませんが、TypeScript スクリプトで簡単に実装できます。

### シーダーの用途

- **開発環境**: テスト用ダミーデータの投入
- **本番環境**: マスターデータの初期投入
- **テスト**: E2Eテスト用のフィクスチャ準備

### ファイル構成例

```
src/
├── db/
│   ├── index.ts        # DB接続
│   ├── schema.ts       # スキーマ定義
│   └── seed/
│       ├── index.ts    # メインシーダー
│       ├── masters.ts  # マスターデータ
│       └── fixtures.ts # テストデータ
```

---

## 基本構成

### 最小限のシーダー

```typescript
// src/db/seed.ts
import { db } from './index';
import { teams, players } from './schema';

async function main() {
  console.log('🌱 Seeding start...');

  // データ挿入
  await db.insert(teams).values([
    { name: '東京チーム', division: 'A' },
    { name: '大阪チーム', division: 'B' },
  ]);

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
```

### Turso / LibSQL 向け

```typescript
// src/db/seed.ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { teams, players } from './schema';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client);

async function main() {
  console.log('🌱 Seeding start...');

  await db.insert(teams).values([
    { name: '東京チーム', division: 'A' },
    { name: '大阪チーム', division: 'B' },
  ]);

  console.log('✅ Seeding complete!');
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
```

---

## 実装パターン

### パターン1: クリア＆挿入（開発向け）

```typescript
async function seed() {
  console.log('🗑️  Clearing existing data...');
  
  // 外部キー制約を考慮した順序で削除
  await db.delete(players);  // 子テーブル先
  await db.delete(teams);    // 親テーブル後

  console.log('🌱 Inserting seed data...');
  
  // 親テーブル先に挿入
  const insertedTeams = await db.insert(teams).values([
    { name: '東京ユナイテッド', division: 'A' },
    { name: '大阪サンダース', division: 'A' },
    { name: '名古屋ウィングス', division: 'B' },
  ]).returning();

  // 子テーブルは親のIDを参照
  await db.insert(players).values([
    { name: '山田太郎', number: 10, teamId: insertedTeams[0].id },
    { name: '鈴木一郎', number: 7, teamId: insertedTeams[0].id },
    { name: '佐藤花子', number: 11, teamId: insertedTeams[1].id },
    { name: '田中次郎', number: 9, teamId: insertedTeams[2].id },
  ]);

  console.log('✅ Seeding complete!');
}
```

### パターン2: Upsert（冪等性を保証）

```typescript
import { eq } from 'drizzle-orm';

async function seedMasters() {
  const masterData = [
    { id: 1, name: 'A部門', code: 'DIV_A' },
    { id: 2, name: 'B部門', code: 'DIV_B' },
    { id: 3, name: 'C部門', code: 'DIV_C' },
  ];

  for (const data of masterData) {
    // PostgreSQL: onConflictDoUpdate
    await db.insert(divisions)
      .values(data)
      .onConflictDoUpdate({
        target: divisions.id,
        set: { name: data.name, code: data.code },
      });
  }
}

// SQLite / Turso の場合
async function seedMastersSQLite() {
  const masterData = [
    { id: 1, name: 'A部門' },
    { id: 2, name: 'B部門' },
  ];

  for (const data of masterData) {
    const existing = await db
      .select()
      .from(divisions)
      .where(eq(divisions.id, data.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(divisions).values(data);
    } else {
      await db.update(divisions)
        .set({ name: data.name })
        .where(eq(divisions.id, data.id));
    }
  }
}
```

### パターン3: トランザクション使用

```typescript
async function seedWithTransaction() {
  await db.transaction(async (tx) => {
    // トランザクション内で実行
    await tx.delete(players);
    await tx.delete(teams);

    const teams = await tx.insert(teams).values([
      { name: '東京チーム' },
      { name: '大阪チーム' },
    ]).returning();

    await tx.insert(players).values([
      { name: '山田', teamId: teams[0].id },
      { name: '鈴木', teamId: teams[1].id },
    ]);
  });
  
  // エラー時は自動ロールバック
}
```

### パターン4: 環境別シーダー

```typescript
// src/db/seed.ts
import 'dotenv/config';

const ENV = process.env.NODE_ENV || 'development';

async function main() {
  console.log(`🌱 Seeding for ${ENV} environment...`);

  // 共通: マスターデータ
  await seedMasters();

  // 開発環境のみ: テストデータ
  if (ENV === 'development') {
    await seedTestData();
  }

  console.log('✅ Complete!');
}

async function seedMasters() {
  // 大会形式、会場など変更頻度の低いデータ
  await db.insert(tournamentFormats).values([
    { id: 1, name: 'トーナメント' },
    { id: 2, name: 'リーグ戦' },
    { id: 3, name: ' 予選リーグ＋決勝T' },
  ]).onConflictDoNothing();
}

async function seedTestData() {
  // 開発用ダミーデータ
  await db.delete(players);
  await db.delete(teams);

  // 大量のテストデータ...
}

main();
```

---

## 実行方法

### 必要なパッケージ

```bash
# TypeScript実行用（いずれか）
npm install -D tsx        # 推奨
npm install -D ts-node
npm install -D bun        # Bun使用時

# 環境変数読み込み
npm install dotenv
```

### package.json スクリプト

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/db/seed.ts",
    "db:reset": "npm run db:push && npm run db:seed"
  }
}
```

### 実行コマンド

```bash
# 通常実行
npm run db:seed

# 環境指定
NODE_ENV=production npm run db:seed

# 直接実行
npx tsx src/db/seed.ts
```

---

## 実践的なテクニック

### ファクトリー関数でデータ生成

```typescript
// src/db/seed/factories.ts
import { InferInsertModel } from 'drizzle-orm';
import { teams, players } from '../schema';

type NewTeam = InferInsertModel<typeof teams>;
type NewPlayer = InferInsertModel<typeof players>;

// チーム生成ファクトリー
export function createTeam(overrides: Partial<NewTeam> = {}): NewTeam {
  return {
    name: `テストチーム_${Date.now()}`,
    division: 'A',
    isActive: true,
    ...overrides,
  };
}

// 選手生成ファクトリー
export function createPlayer(teamId: number, overrides: Partial<NewPlayer> = {}): NewPlayer {
  return {
    name: `選手_${Math.random().toString(36).slice(2, 8)}`,
    number: Math.floor(Math.random() * 99) + 1,
    teamId,
    position: 'FW',
    ...overrides,
  };
}

// 使用例
const team = createTeam({ name: '特別チーム', division: 'S' });
const players = Array.from({ length: 11 }, (_, i) => 
  createPlayer(1, { number: i + 1 })
);
```

### 大量データ生成

```typescript
async function seedBulkData() {
  const TEAM_COUNT = 100;
  const PLAYERS_PER_TEAM = 20;

  console.log(`Creating ${TEAM_COUNT} teams...`);

  // チームを一括挿入
  const teamData = Array.from({ length: TEAM_COUNT }, (_, i) => ({
    name: `チーム${String(i + 1).padStart(3, '0')}`,
    division: ['A', 'B', 'C'][i % 3],
  }));

  const insertedTeams = await db.insert(teams).values(teamData).returning();

  console.log(`Creating ${TEAM_COUNT * PLAYERS_PER_TEAM} players...`);

  // 選手データを生成
  const playerData = insertedTeams.flatMap((team) =>
    Array.from({ length: PLAYERS_PER_TEAM }, (_, i) => ({
      name: `選手${team.id}-${i + 1}`,
      number: i + 1,
      teamId: team.id,
    }))
  );

  // バッチ挿入（1000件ずつ）
  const BATCH_SIZE = 1000;
  for (let i = 0; i < playerData.length; i += BATCH_SIZE) {
    const batch = playerData.slice(i, i + BATCH_SIZE);
    await db.insert(players).values(batch);
    console.log(`  Inserted ${Math.min(i + BATCH_SIZE, playerData.length)}/${playerData.length}`);
  }
}
```

### 外部データの読み込み

```typescript
import fs from 'fs';
import path from 'path';

async function seedFromJson() {
  // JSONファイルから読み込み
  const dataPath = path.join(__dirname, 'data', 'teams.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const teamsData = JSON.parse(rawData);

  await db.insert(teams).values(teamsData);
}

async function seedFromCsv() {
  // CSVファイルから読み込み（簡易版）
  const csvPath = path.join(__dirname, 'data', 'players.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  const playersData = lines.slice(1).map((line) => {
    const values = line.split(',');
    return {
      name: values[0],
      number: parseInt(values[1]),
      teamId: parseInt(values[2]),
    };
  });

  await db.insert(players).values(playersData);
}
```

### シーダーの分割管理

```typescript
// src/db/seed/index.ts
import { seedDivisions } from './masters/divisions';
import { seedVenues } from './masters/venues';
import { seedTournamentFormats } from './masters/formats';
import { seedTeams } from './fixtures/teams';
import { seedPlayers } from './fixtures/players';

async function main() {
  const args = process.argv.slice(2);
  const target = args[0];

  console.log('🌱 Seeding start...');

  switch (target) {
    case 'masters':
      await seedMasters();
      break;
    case 'fixtures':
      await seedFixtures();
      break;
    case 'all':
    default:
      await seedMasters();
      await seedFixtures();
  }

  console.log('✅ Complete!');
}

async function seedMasters() {
  console.log('📋 Seeding master data...');
  await seedDivisions();
  await seedVenues();
  await seedTournamentFormats();
}

async function seedFixtures() {
  console.log('🎭 Seeding fixture data...');
  await seedTeams();
  await seedPlayers();
}

main();
```

```bash
# 使い分け
npm run db:seed              # 全部
npm run db:seed -- masters   # マスターのみ
npm run db:seed -- fixtures  # テストデータのみ
```

---

## KSMプロジェクト向けサンプル

スポーツ大会管理システム向けのシーダー例

```typescript
// src/db/seed.ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import {
  teams,
  players,
  venues,
  tournamentFormats,
  matches,
} from './schema';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client);

async function main() {
  const ENV = process.env.NODE_ENV || 'development';
  console.log(`🌱 KSM Seeding (${ENV})...`);

  // 1. マスターデータ（常に実行）
  await seedMasters();

  // 2. 開発環境のみテストデータ
  if (ENV !== 'production') {
    await seedTestData();
  }

  console.log('✅ Seeding complete!');
}

// マスターデータ
async function seedMasters() {
  console.log('📋 Master data...');

  // 大会形式
  await db.insert(tournamentFormats).values([
    { id: 1, name: 'シングルエリミネーション', description: '負けたら終わりのトーナメント' },
    { id: 2, name: 'ダブルエリミネーション', description: '2敗で敗退のトーナメント' },
    { id: 3, name: 'ラウンドロビン', description: '総当たりリーグ戦' },
  ]).onConflictDoNothing();

  // 会場
  await db.insert(venues).values([
    { id: 1, name: '中央体育館', address: '東京都中央区...', capacity: 500 },
    { id: 2, name: '西スポーツセンター', address: '東京都西区...', capacity: 300 },
  ]).onConflictDoNothing();
}

// テストデータ
async function seedTestData() {
  console.log('🎭 Test data...');

  // 既存データクリア
  await db.delete(matches);
  await db.delete(players);
  await db.delete(teams);

  // チーム
  const insertedTeams = await db.insert(teams).values([
    { name: '東京ファイターズ', division: 'A', representativeName: '山田太郎', contactEmail: 'tokyo@example.com' },
    { name: '大阪サンダース', division: 'A', representativeName: '鈴木一郎', contactEmail: 'osaka@example.com' },
    { name: '名古屋ウィングス', division: 'B', representativeName: '佐藤花子', contactEmail: 'nagoya@example.com' },
    { name: '福岡ライオンズ', division: 'B', representativeName: '田中次郎', contactEmail: 'fukuoka@example.com' },
  ]).returning();

  // 各チームに選手を追加
  const positions = ['GK', 'DF', 'MF', 'FW'];
  const playerData = insertedTeams.flatMap((team, teamIndex) =>
    Array.from({ length: 15 }, (_, i) => ({
      name: `選手${teamIndex + 1}-${String(i + 1).padStart(2, '0')}`,
      number: i + 1,
      teamId: team.id,
      position: positions[i % 4],
    }))
  );
  await db.insert(players).values(playerData);

  // サンプル試合
  await db.insert(matches).values([
    {
      homeTeamId: insertedTeams[0].id,
      awayTeamId: insertedTeams[1].id,
      venueId: 1,
      scheduledAt: new Date('2025-04-01T10:00:00'),
      status: 'scheduled',
    },
    {
      homeTeamId: insertedTeams[2].id,
      awayTeamId: insertedTeams[3].id,
      venueId: 2,
      scheduledAt: new Date('2025-04-01T13:00:00'),
      status: 'scheduled',
    },
  ]);

  console.log(`  Created ${insertedTeams.length} teams`);
  console.log(`  Created ${playerData.length} players`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
```

---

## まとめ

| ポイント | 説明 |
|---------|------|
| **削除順序** | 外部キー制約を考慮し、子テーブル → 親テーブルの順 |
| **挿入順序** | 親テーブル → 子テーブルの順 |
| **冪等性** | `onConflictDoNothing()` や `onConflictDoUpdate()` を活用 |
| **環境分離** | `NODE_ENV` で本番とテストデータを分ける |
| **トランザクション** | 整合性が必要な場合は `db.transaction()` を使用 |

---

## 参考リンク

- Drizzle ORM Docs: https://orm.drizzle.team
- Drizzle Insert API: https://orm.drizzle.team/docs/insert

---

*このドキュメントは Drizzle ORM v0.30+ を対象としています*
drizzle-seeder-guide.md を表示しています。