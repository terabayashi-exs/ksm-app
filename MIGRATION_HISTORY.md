# データベースマイグレーション履歴

このファイルには、データベーススキーマの変更履歴を記録します。

## マイグレーション記録ルール

各マイグレーション実行時に以下の情報を記録してください：

- **日付**: マイグレーション実行日
- **環境**: dev/stag/main
- **方法**: db:push / db:migrate / 手動スクリプト
- **変更内容**: 何を変更したか（テーブル名、カラム名、理由）
- **影響範囲**: どのファイルを修正したか
- **スクリプト**: 使用したスクリプトファイルのパス（該当する場合）
- **スナップショット**: Drizzleのスナップショット番号（該当する場合）

---

## 0003: m_tournament_formatsにphasesフィールド追加（2026-02-09）

### 基本情報
- **日付**: 2026年2月9日
- **環境**: dev
- **方法**: 手動スクリプト（drizzle-kit migrateがSQLパースエラーのため）
- **実行者**: Claude Code
- **マイグレーションファイル**: `drizzle/0003_rapid_stephen_strange.sql`

### 変更内容

#### テーブル変更
**m_tournament_formats:**
- `phases` TEXT (JSON形式) カラムを追加
- 既存の`preliminary_format_type`と`final_format_type`は維持（後方互換性）

#### データ変換
既存の16フォーマット全てで、`preliminary_format_type`と`final_format_type`から新しいJSON形式のphasesフィールドにデータを変換しました。

**変換例:**
```
Before:
  preliminary_format_type: "league"
  final_format_type: "tournament"

After:
  phases: {
    "phases": [
      {"id": "preliminary", "order": 1, "name": "予選", "format_type": "league"},
      {"id": "final", "order": 2, "name": "決勝トーナメント", "format_type": "tournament"}
    ]
  }
```

### 変更理由
- 現在の2フェーズ固定構造（予選・決勝）から、柔軟な複数フェーズ構造への移行
- 将来的に「1次予選→2次予選→3次予選→決勝」のような複雑な大会構成に対応
- テンプレート変更が既存大会に影響を与えないスナップショット方式の導入準備（Stage 1/3）

### 実行コマンド
```bash
# 1. スキーマ更新
npm run db:generate

# 2. マイグレーションSQL適用
npx tsx scripts/apply-phases-migration.mts

# 3. データ変換
npx tsx scripts/migrate-phases-field.mts

# 4. 検証
npx tsx scripts/verify-phases-migration.mts
```

### 実行結果
- ✅ phasesカラム追加成功
- ✅ 全16フォーマットのデータ変換成功
- ✅ 全16フォーマットの検証成功
- ✅ 既存フィールドとの整合性確認完了

### 影響を受けたファイル

#### 新規作成
- `lib/types/tournament-phases.ts` - TypeScript型定義
- `lib/tournament-phases.ts` - ヘルパー関数（11関数）
- `__tests__/lib/tournament-phases.test.ts` - ユニットテスト（53ケース）
- `scripts/apply-phases-migration.mts` - マイグレーション実行スクリプト
- `scripts/migrate-phases-field.mts` - データ変換スクリプト
- `scripts/verify-phases-migration.mts` - 検証スクリプト
- `drizzle/0003_rapid_stephen_strange.sql` - マイグレーションSQL

#### 更新
- `src/db/schema.ts` (Line 128-148) - phasesフィールド追加
- `package.json` - testスクリプト追加
- `vitest.config.ts` - ユニットテストプロジェクト追加
- `drizzle/0001_thankful_selene.sql` - SQLパースエラー対策のプレースホルダー追加
- `drizzle/meta/0002_snapshot.json` - IDとprevID修正
- `drizzle/meta/_journal.json` - 0003エントリ追加

### 後方互換性
- ✅ 既存の`preliminary_format_type`と`final_format_type`フィールドは維持
- ✅ 既存コードはそのまま動作
- ✅ 新しいコードは`phases`フィールドを優先し、なければ既存フィールドにフォールバック
- ✅ `getPhasesWithFallback()`関数で自動フォールバック対応

### 注意事項
- この変更は**Stage 1/3**です
- Stage 2で`t_tournaments`にphasesフィールドを追加予定（スナップショット実装）
- Stage 3で`t_matches_live`/`t_matches_final`に試合詳細フィールドを追加予定
- 現時点では既存フィールドを参照している既存コードは変更不要

### テスト結果
**ユニットテスト:**
- 53 tests passed (19ms)
- 全ヘルパー関数のテストカバレッジ: 100%

**データ変換:**
- Total formats: 16
- ✅ Migrated: 16
- ⏭️ Skipped: 0
- ❌ Errors: 0

**検証:**
- Total formats: 16
- ✅ Valid: 16
- ❌ Errors: 0

### 今後の予定
1. **Stage 2**: `t_tournaments`にphasesフィールド追加（スナップショット実装）
2. **Stage 3**: `t_matches_live`/`t_matches_final`に試合詳細フィールド追加
3. 動的UIタブ生成の実装
4. 既存コードの段階的移行

---

## 0002: マイグレーション管理体制の整備（2026-02-05）

### 基本情報
- **日付**: 2026年2月5日
- **環境**: 該当なし（ドキュメント・プロセス整備）
- **方法**: ドキュメント更新 + Git Hook追加
- **実行者**: システム管理者

### 変更内容

#### 追加したファイル
1. **MIGRATION_HISTORY.md** - マイグレーション履歴管理ファイル（本ファイル）
2. **.husky/pre-commit-migration-check.sh** - スキーマ変更時の履歴更新チェック

#### 更新したファイル
**CLAUDE.md:**
- 「実際の開発フロー」セクションに履歴更新ステップを追加
- 「⚠️ マイグレーション実行時の必須ルール」セクションを新設
- ClaudeCodeに対する明示的な指示を追加

### 変更理由
- マイグレーション履歴が体系的に管理されていなかった
- 将来的に「何をいつ変更したか」を追跡可能にする必要があった
- ClaudeCodeによる自動マイグレーション時の記録漏れを防止

### 実装した仕組み

#### 1. MIGRATION_HISTORY.md
- 各マイグレーションの詳細を記録
- 統一フォーマットのテンプレート提供
- 日付、環境、変更内容、理由、影響ファイルを記録

#### 2. CLAUDE.mdへの明記
ClaudeCodeが読み込むプロジェクト仕様書に以下を追加：
- マイグレーション実行時の必須手順としてMIGRATION_HISTORY.md更新を明記
- 記録すべき情報の詳細を列挙
- コミット時のルール（同じコミットに含める、メッセージ規約）

#### 3. Git Hook（オプション）
- スキーマファイル変更時にMIGRATION_HISTORY.md更新を確認
- 更新されていない場合はコミットを拒否
- `--no-verify` で強制コミット可能

### 影響を受けたファイル
- `MIGRATION_HISTORY.md` - 新規作成
- `CLAUDE.md` - マイグレーションフロー更新
- `.husky/pre-commit-migration-check.sh` - 新規作成

### 運用方法

#### ClaudeCodeによるマイグレーション
ClaudeCodeは`CLAUDE.md`を自動的に読み込むため、マイグレーション実行時に自動的に`MIGRATION_HISTORY.md`を更新するようになります。

#### 手動マイグレーション
開発者が直接マイグレーションを実行する場合：
```bash
# 1. スキーマ変更
vim src/db/schema.ts

# 2. マイグレーション実行
npm run db:push:dev

# 3. 履歴記録
vim MIGRATION_HISTORY.md
# テンプレートをコピーして記入

# 4. コミット
git add MIGRATION_HISTORY.md src/db/schema.ts
git commit -m "migration: フィールドXXXを追加"
```

Git Hookが有効な場合、記録漏れがあればコミット時に警告されます。

### 注意事項
- ✅ MIGRATION_HISTORY.mdは`.gitignore`対象外（必ずコミット）
- ✅ マイグレーションとドキュメント更新は同じコミットに含める
- ℹ️ Git Hookは任意（Husky未導入の場合は不要）
- ℹ️ データベーススキーマの変更のみを記録（コード変更のみは記録不要）

### 今後の展望
このマイグレーション管理体制により：
- 変更履歴の可視化
- チーム開発時の情報共有
- トラブルシューティングの効率化
- ロールバック時の判断材料提供

が実現されます。

---

## 0001: team_idカラムの削除（2026-02-05）

### 基本情報
- **日付**: 2026年2月5日
- **環境**: dev
- **方法**: 手動スクリプト（`scripts/remove-team-id-columns.mjs`）
- **Drizzleスナップショット**: `0001_thankful_selene`
- **実行者**: システム管理者

### 変更内容

#### 削除したカラム
**t_matches_final テーブル:**
- `team1_id` (TEXT, 外部キー: m_teams.team_id) → 削除
- `team2_id` (TEXT, 外部キー: m_teams.team_id) → 削除
- `winner_team_id` (TEXT, 外部キー: m_teams.team_id) → 削除

**t_matches_live テーブル:**
- `team1_id` (TEXT, 外部キー: m_teams.team_id) → 削除
- `team2_id` (TEXT, 外部キー: m_teams.team_id) → 削除
- `winner_team_id` (TEXT, 外部キー: m_teams.team_id) → 削除

#### 残存カラム（変更なし）
両テーブルとも以下は維持：
- `team1_tournament_team_id` (INTEGER)
- `team2_tournament_team_id` (INTEGER)
- `winner_tournament_team_id` (INTEGER)

### 変更理由
- 同一マスターチームから複数エントリーを可能にする設計変更（Phase 4）
- `team_id`（マスターチームID）から`tournament_team_id`（大会別エントリーID）への移行完了
- 既存コードは全て`tournament_team_id`ベースに書き換え済み
- 不要になった`team_id`カラムを物理削除してスキーマをクリーンアップ

### 実行方法
```bash
# スキーマ定義を更新
# src/db/schema.ts から team1_id, team2_id, winner_team_id フィールドを削除

# 手動マイグレーションスクリプトを実行
node scripts/remove-team-id-columns.mjs

# スキーマを取得して確認
npm run db:pull
```

### 影響を受けたファイル（合計30ファイル）

#### スキーマ定義（1ファイル）
- `src/db/schema.ts` - テーブル定義からフィールド削除

#### 型定義（2ファイル）
- `lib/types.ts` - `MatchResult`型から`team_id`系プロパティ削除
- `lib/tournament-bracket/types.ts` - ブラケット型定義更新

#### API Routes（4ファイル）
- `app/api/admin/withdrawal-requests/[id]/impact/route.ts`
- `app/api/matches/[id]/cancel/route.ts`
- `app/api/matches/[id]/confirm/route.ts`
- `app/api/tournaments/[id]/draw/route.ts`

#### ビジネスロジック（6ファイル）
- `lib/match-result-handler.ts`
- `lib/match-results-calculator.ts`
- `lib/standings-calculator.ts`
- `lib/template-position-handler.ts`
- `lib/tournament-progression.ts`
- `lib/withdrawal-processor.ts`

#### その他（17ファイル）
- ドキュメント、バックアップ、マイグレーションファイルなど

### 技術的詳細

#### SQLiteテーブル再作成パターンを使用
```sql
-- 1. 外部キー制約を無効化
PRAGMA foreign_keys=OFF;

-- 2. 新しいテーブルを作成（不要カラムを除外）
CREATE TABLE t_matches_final_new (...);

-- 3. データをコピー
INSERT INTO t_matches_final_new SELECT ... FROM t_matches_final;

-- 4. 古いテーブルを削除
DROP TABLE t_matches_final;

-- 5. 新しいテーブルをリネーム
ALTER TABLE t_matches_final_new RENAME TO t_matches_final;

-- 6. インデックスを再作成
CREATE INDEX idx_matches_final_team1_tournament ON ...;

-- 7. 外部キー制約を再有効化
PRAGMA foreign_keys=ON;
```

### 注意事項
- ⚠️ **データ復旧不可**: 削除された`team_id`カラムのデータは復旧できません
- ✅ **データ再構築可能**: `tournament_team_id`から`t_tournament_teams`テーブルを結合すれば`team_id`を取得可能
- ⚠️ **Turso制約**: Drizzle Kitの`db:migrate`は使用不可（`--> statement-breakpoint`構文エラー）
- ✅ **回避策**: 手動スクリプトまたは`db:push`を使用

### 関連Issue
- GitHub Issue #13: team_id → tournament_team_id 完全移行

---

## 0000: 初回スキーマ取得（2026-01-XX）

### 基本情報
- **日付**: Drizzle ORM導入時
- **環境**: dev
- **方法**: `npm run db:pull`
- **Drizzleスナップショット**: `0000_motionless_major_mapleleaf`

### 変更内容
既存データベースからスキーマ定義を初回取得。30テーブル全体を`src/db/schema.ts`と`src/db/relations.ts`にエクスポート。

### 注意事項
この`0000_*`ファイルは実際のマイグレーションではなく、初回スナップショットのため`.gitignore`で除外されています。

---

## 今後のマイグレーション記録テンプレート

```markdown
## XXXX: [変更内容の簡潔な説明]（YYYY-MM-DD）

### 基本情報
- **日付**:
- **環境**: dev/stag/main
- **方法**: db:push / db:migrate / 手動スクリプト
- **Drizzleスナップショット**:
- **実行者**:

### 変更内容
[具体的な変更内容を箇条書き]

### 変更理由
[なぜこの変更が必要だったか]

### 実行方法
```bash
# 実行したコマンド
```

### 影響を受けたファイル
- ファイル1
- ファイル2

### 注意事項
[特記事項、データ損失の可能性、ロールバック方法など]

### 関連Issue/PR
- Issue #XX
- PR #XX
```
