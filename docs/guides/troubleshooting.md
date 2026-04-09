# トラブルシューティング / FAQ

開発中によく遭遇する問題と解決方法をまとめています。

## 環境構築

### Q: `npm install` で依存関係のエラーが出る

**原因**: Node.jsのバージョンが合っていない可能性が高い。

```bash
# バージョン確認
node --version
# → v22.17.1 であること

# miseで正しいバージョンをインストール
mise install
```

### Q: `npm run dev` でデータベース接続エラーが出る

**原因**: `.env.local` が存在しないか、接続情報が間違っている。

```
Error: Environment variable DATABASE_URL not found
```

**解決**:
1. プロジェクトルートに `.env.local` があるか確認
2. `DATABASE_URL` と `DATABASE_AUTH_TOKEN` が正しく設定されているか確認
3. Turso DBが稼働しているか確認（ネットワーク接続が必要）

### Q: `NEXTAUTH_SECRET` のエラーが出る

```
[next-auth] ERROR: NO_SECRET
```

**解決**: `.env.local` に `NEXTAUTH_SECRET` を設定する。任意のランダム文字列でOK。

```bash
# ランダムな秘密鍵を生成
openssl rand -base64 32
```

---

## データベース

### Q: マイグレーションが失敗する

**原因**: Tursoのカスタムマイグレータ特有の問題。

```bash
# まずは通常のマイグレーションを試す
npm run db:migrate

# 失敗した場合、生成されたSQLファイルを確認
ls drizzle/
cat drizzle/XXXX_*.sql
```

**よくある原因**:
- テーブルや列が既に存在する → SQLに `IF NOT EXISTS` を手動追加
- Tursoのブロックコメント非対応 → `/* ... */` 形式のコメントを削除

### Q: Tursoでトランザクションが使えない

**仕様**: Turso（リモートSQLite）では `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` がサポートされていません。

**対処法**:
```typescript
// ❌ 動作しない
await db.execute('BEGIN TRANSACTION');
await db.execute('INSERT ...');
await db.execute('COMMIT');

// ✅ 推奨: 個別に順次実行
try {
  await db.execute('DELETE FROM ... WHERE ...');   // 先に削除
  await db.execute('INSERT INTO ... VALUES ...'); // 次に挿入
} catch (error) {
  // エラー時は個別にリカバリ
  console.error("処理エラー:", error);
}
```

**設計方針**:
- データの整合性を保つため、処理順序を慎重に設計する（削除→挿入）
- エラー時の復旧処理を個別に実装する

### Q: `db.execute` の結果の型がわからない

```typescript
const result = await db.execute(`SELECT * FROM m_venues WHERE venue_id = ?`, [1]);

// result.rows は配列。各行はオブジェクト（カラム名がキー）
const venue = result.rows[0];
// venue.venue_id, venue.venue_name, ...

// 行数
console.log(result.rows.length);
```

### Q: `datetime('now', '+9 hours')` を忘れてUTC時刻で保存してしまった

**確認方法**: Drizzle Studioで該当レコードのタイムスタンプを確認。

```bash
npm run db:studio
```

**修正**: 直接SQLで更新。

```sql
UPDATE table_name
SET created_at = datetime(created_at, '+9 hours')
WHERE id = ?;
```

---

## ビルド・デプロイ

### Q: `npm run build` でType Errorが出る

**まず確認**:
```bash
# TypeScriptの型チェック
npx tsc --noEmit
```

**よくある原因**:
- 新しいカラムをスキーマに追加したが、型定義（`lib/types.ts`）を更新していない
- APIレスポンスの型が変わったが、コンポーネント側を更新していない

### Q: Biomeのフォーマットエラーでコミットできない

```bash
# まずフォーマットを適用
npm run format

# 特定ファイルだけフォーマット
npx biome format --write <file-path>
```

### Q: ESLintエラーが出る

```bash
npm run lint
```

主なエラーと対処:
- `react-hooks/exhaustive-deps`: useEffectの依存配列にすべての依存を含める
- `@next/next/no-img-element`: `<img>` の代わりに `next/image` の `<Image>` を使う
- 未使用の変数: 使用されていない変数を削除するか、 `_` プレフィックスを付ける

---

## 認証・権限

### Q: 開発時にログインできない

**確認事項**:
1. `m_login_users` テーブルにユーザーが存在するか
2. `m_login_user_roles` にロールが設定されているか
3. パスワードがbcryptハッシュ化されているか

**手動でユーザーを作成する場合**: Drizzle Studioから直接データを挿入するか、既存のシードスクリプトを使用。

### Q: オペレーターが特定の操作ができないと言われた

**確認**: `t_operator_tournament_access` テーブルで、そのオペレーターの権限JSONを確認。

```sql
SELECT permissions FROM t_operator_tournament_access
WHERE operator_id = ? AND tournament_id = ?;
```

---

## よくある実装の注意点

### スコアデータの扱い

```typescript
// ❌ 直接パースしない
const scores = scoreData.split(',');

// ✅ 必ず score-parser を使う
import { parseScoreArray, parseTotalScore, formatScoreArray } from '@/lib/score-parser';
const scores = parseScoreArray(scoreData);    // [3, 2, 1]
const total = parseTotalScore(scoreData);     // 6
const saved = formatScoreArray([3, 2, 1]);    // "[3,2,1]"
```

### チームIDの扱い

```typescript
// ❌ マスターチームIDで試合を検索しない
WHERE team1_id = ?

// ✅ tournament_team_id を使う
WHERE team1_tournament_team_id = ?
```

### タイムスタンプの挿入

```sql
-- ❌ UTC時刻になる
INSERT INTO ... (created_at) VALUES (CURRENT_TIMESTAMP);
INSERT INTO ... (created_at) VALUES (datetime('now'));

-- ✅ JSTで保存
INSERT INTO ... (created_at) VALUES (datetime('now', '+9 hours'));
```

---

## 困ったときの調査方法

### 1. Drizzle Studioでデータを直接確認
```bash
npm run db:studio
```
ブラウザでDBの中身を直接閲覧・編集できます。

### 2. APIレスポンスを直接確認
```bash
# 開発サーバー起動中に
curl http://localhost:3000/api/venues | jq .
```

### 3. ログの確認
開発サーバーのターミナルにAPIのエラーログが表示されます。`console.error` の出力を確認してください。

### 4. 既存の類似実装を参考にする
新しい機能を作る場合、既存の類似機能のコードを探して参考にするのが最も確実です。

```bash
# 例: 会場管理の実装パターンを確認
cat app/api/venues/route.ts
cat app/admin/venues/page.tsx
cat components/features/admin/VenueManagement.tsx
```
