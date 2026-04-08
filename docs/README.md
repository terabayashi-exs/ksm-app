# KSM-App ドキュメント

このディレクトリには、KSM-Appプロジェクトの詳細なドキュメントが含まれています。

## ドキュメント構成

### [技術仕様 (specs/)](./specs/)
- **[architecture.md](./specs/architecture.md)** — 技術スタック、コーディング規約、ファイル構成
- **[database.md](./specs/database.md)** — データベース設計、制約、タイムゾーン仕様
- **[implementation-status.md](./specs/implementation-status.md)** — 実装状況、運用実績、将来計画
- **[tournament-bracket-logic.md](./specs/tournament-bracket-logic.md)** — トーナメント表描画ロジック

### [機能仕様 (features/)](./features/)
機能の詳細仕様については、[implemented-features.md](./features/implemented-features.md)をご覧ください。

#### 課金・プラン管理
- [subscription-system.md](./features/subscription-system.md) — サブスクリプション・課金

#### 順位・成績管理
- [standings-system.md](./features/standings-system.md) — 順位表システム
- [standings-integration.md](./features/standings-integration.md) — 順位表統合
- [manual-rankings.md](./features/manual-rankings.md) — 手動順位設定
- [results-matrix.md](./features/results-matrix.md) — 戦績表

#### 試合運営
- [match-management.md](./features/match-management.md) — 試合管理システム
- [live-news.md](./features/live-news.md) — 試合速報エリア
- [schedule-preview.md](./features/schedule-preview.md) — スケジュールプレビュー
- [score-parser.md](./features/score-parser.md) — スコアパーサー

#### 大会管理
- [tournament-status.md](./features/tournament-status.md) — 大会ステータス管理
- [tournament-progression.md](./features/tournament-progression.md) — トーナメント進行
- [multi-team.md](./features/multi-team.md) — 複数チーム参加

#### チーム・選手管理
- [csv-import.md](./features/csv-import.md) — CSV一括登録
- [csv-import-complete.md](./features/csv-import-complete.md) — CSV一括登録（完全仕様）
- [withdrawal-system.md](./features/withdrawal-system.md) — 辞退管理
- [withdrawal-details.md](./features/withdrawal-details.md) — 辞退管理（詳細）

#### 通知・メール
- [email-broadcast.md](./features/email-broadcast.md) — メール一括送信

#### 広告・スポンサー
- [sponsor-banners.md](./features/sponsor-banners.md) — スポンサーバナー管理

#### 認証・セキュリティ
- [authentication-system.md](./features/authentication-system.md) — 認証システム

#### アーカイブ
- [archive-system.md](./features/archive-system.md) — 大会アーカイブシステム

### [開発ガイド (guides/)](./guides/)
- **[onboarding.md](./guides/onboarding.md)** — 新規開発者向けセットアップ
- **[development.md](./guides/development.md)** — 環境設定、開発コマンド
- **[database-migration.md](./guides/database-migration.md)** — マイグレーション手順
- **[drizzle-orm-guide.md](./guides/drizzle-orm-guide.md)** — Drizzle ORM入門
- **[drizzle-seeder-guide.md](./guides/drizzle-seeder-guide.md)** — マスターデータ投入
- **[blob-setup-guide.md](./guides/blob-setup-guide.md)** — Vercel Blob Storage設定

### [デザイン (design/)](./design/)
- **[uidesign-basic-policy.md](./design/uidesign-basic-policy.md)** — UI設計方針（カラー、レイアウト）

### [データベース (database/)](./database/)
- **[KSM.md](./database/KSM.md)** — ER図（Mermaid形式）

## クイックナビゲーション

- **はじめて読む方**: [../CLAUDE.md](../CLAUDE.md) → [onboarding.md](./guides/onboarding.md)
- **機能を知りたい**: [implemented-features.md](./features/implemented-features.md)
- **開発を始める**: [onboarding.md](./guides/onboarding.md)
- **データベース設計**: [database.md](./specs/database.md)
- **実装状況**: [implementation-status.md](./specs/implementation-status.md)
