# 開発レシピ集

よくある開発タスクのステップバイステップの手順書です。
本プロジェクトのコードパターンに沿って実装するための参考にしてください。

## レシピ1: 新しいAPIエンドポイントを追加する

### 例: `GET /api/example` と `POST /api/example` を追加

#### ステップ1: ルートファイルを作成

```
app/api/example/route.ts
```

#### ステップ2: 基本的なAPI構造を実装

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// 一覧取得
export async function GET() {
  try {
    const session = await auth();
    if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
      return NextResponse.json(
        { success: false, error: "管理者権限が必要です" },
        { status: 401 }
      );
    }

    const result = await db.execute(
      `SELECT * FROM table_name WHERE is_active = 1 ORDER BY created_at DESC`
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("取得エラー:", error);
    return NextResponse.json(
      { success: false, error: "データの取得に失敗しました" },
      { status: 500 }
    );
  }
}

// 新規作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "管理者権限が必要です" },
        { status: 401 }
      );
    }

    const body = await request.json();

    // バリデーション
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: "名前は必須です" },
        { status: 400 }
      );
    }

    await db.execute(
      `INSERT INTO table_name (name, created_at, updated_at)
       VALUES (?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
      [body.name]
    );

    return NextResponse.json({ success: true, message: "作成しました" });
  } catch (error) {
    console.error("作成エラー:", error);
    return NextResponse.json(
      { success: false, error: "作成に失敗しました" },
      { status: 500 }
    );
  }
}
```

#### ポイント
- **認証**: `auth()` でセッションを取得し、ロールをチェック
- **DB**: `db.execute(sql, params)` で生SQLを実行（パラメータは配列で渡す）
- **タイムスタンプ**: `datetime('now', '+9 hours')` でJST
- **レスポンス形式**: `{ success: boolean, data?: any, error?: string }`
- **エラーメッセージ**: ユーザー向けは日本語で返す

---

## レシピ2: 新しい管理画面ページを追加する

### 例: `/admin/example` ページを追加

#### ステップ1: ページファイル（Server Component）を作成

```typescript
// app/admin/example/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import { ExampleManagement } from "@/components/features/admin/ExampleManagement";

export const metadata = { title: "例の管理" };

export default async function ExamplePage() {
  const session = await auth();
  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* パンくずリスト */}
        <nav className="text-sm text-gray-500 mb-4">
          <a href="/admin" className="hover:text-gray-700">ダッシュボード</a>
          <span className="mx-2">/</span>
          <span className="text-gray-900">例の管理</span>
        </nav>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">例の管理</h1>
        <p className="text-gray-600 mb-8">説明テキスト</p>

        <ExampleManagement
          loginUserId={session.user.loginUserId}
          isSuperadmin={session.user.isSuperadmin}
        />
      </div>
    </div>
  );
}
```

#### ステップ2: 管理コンポーネント（Client Component）を作成

```typescript
// components/features/admin/ExampleManagement.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ExampleManagementProps {
  loginUserId: number;
  isSuperadmin: boolean;
}

export function ExampleManagement({ loginUserId, isSuperadmin }: ExampleManagementProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      setLoading(true);
      const res = await fetch("/api/example");
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>読み込み中...</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.id} className="p-4">
          {/* 表示内容 */}
        </Card>
      ))}
    </div>
  );
}
```

#### ポイント
- **Server Component**（page.tsx）: 認証チェック、メタデータ、レイアウト
- **Client Component**（Management.tsx）: `"use client"` 必須、状態管理、API呼び出し
- **UIコンポーネント**: `components/ui/` の shadcn/ui を使用
- **レイアウト**: `max-w-7xl mx-auto` で最大幅を統一

---

## レシピ3: テーブルにカラムを追加する

### 例: `t_tournaments` テーブルに `note` カラムを追加

#### ステップ1: スキーマを編集

```typescript
// src/db/schema.ts の該当テーブル定義にカラムを追加
note: text("note"),
```

#### ステップ2: マイグレーションファイルを生成

```bash
npm run db:generate
```

`drizzle/` ディレクトリに新しいSQLファイルが生成されます。

#### ステップ3: dev環境に適用

```bash
npm run db:migrate
```

#### ステップ4: マイグレーション履歴を記録

`MIGRATION_HISTORY.md` の**最上部**にエントリを追加:

```markdown
## 0035: t_tournaments に note カラム追加 (2026-04-10)

- **環境**: dev
- **実行方法**: `npm run db:migrate`
- **変更内容**: `t_tournaments` テーブルに `note TEXT` カラムを追加
- **理由**: 部門ごとの管理者メモ機能を追加するため
- **影響ファイル**:
  - `src/db/schema.ts` - スキーマ定義
  - `drizzle/0035_*.sql` - マイグレーションファイル
```

#### ステップ5: コミット

スキーマ変更・マイグレーションファイル・MIGRATION_HISTORY.md を**同一コミット**にする。

```bash
git add src/db/schema.ts drizzle/0035_*.sql MIGRATION_HISTORY.md
git commit -m "migration: t_tournamentsにnoteカラムを追加"
```

#### ステップ6: ステージング・本番に適用（必要に応じて）

```bash
npm run db:migrate:stag   # ステージング
npm run db:migrate:main   # 本番
```

---

## レシピ4: 既存のAPIにオペレーター権限チェックを追加する

### 例: 特定の大会に対する権限を確認

```typescript
import { checkOperatorPermission } from "@/lib/operator-permission-check";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
  }

  const tournamentId = 123;

  // 管理者は常にOK、オペレーターは権限チェック
  if (session.user.role === "operator") {
    const hasPermission = await checkOperatorPermission(
      session.user.loginUserId,
      tournamentId,
      "canInputResults"  // 必要な権限名
    );
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: "権限がありません" }, { status: 403 });
    }
  }

  // ... 処理
}
```

---

## レシピ5: フォーマット後にコミットする

コミット前の一連の流れ:

```bash
# 1. フォーマットチェック
npm run format:check

# 2. フォーマット適用
npm run format

# 3. ESLintチェック
npm run lint

# 4. ビルド確認
npm run build

# 5. 変更内容を確認してコミット
git diff --stat
git add <対象ファイル>
git commit -m "feat: 機能の説明"
```

### コミットメッセージの規約

| プレフィックス | 用途 |
|--------------|------|
| `feat:` | 新機能 |
| `fix:` | バグ修正 |
| `refactor:` | リファクタリング |
| `docs:` | ドキュメント変更 |
| `chore:` | 設定変更、依存関係更新など |
| `migration:` | スキーマ変更（マイグレーション） |

---

## 参考: プロジェクト内のファイル配置規則

| 種類 | 配置場所 | 例 |
|------|---------|-----|
| APIルート | `app/api/<feature>/route.ts` | `app/api/venues/route.ts` |
| 管理画面ページ | `app/admin/<feature>/page.tsx` | `app/admin/venues/page.tsx` |
| 機能コンポーネント | `components/features/admin/<Feature>.tsx` | `components/features/admin/VenueManagement.tsx` |
| UIコンポーネント | `components/ui/<component>.tsx` | `components/ui/button.tsx` |
| ユーティリティ | `lib/<utility>.ts` | `lib/score-parser.ts` |
| 型定義 | `lib/types.ts` または `lib/types/<feature>.ts` | `lib/types/operator.ts` |
| DBスキーマ | `src/db/schema.ts` | — |
| マスターデータ | `data/<table>.json` | `data/venues.json` |
