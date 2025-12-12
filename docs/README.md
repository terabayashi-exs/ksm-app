# KSM-App ドキュメント

このディレクトリには、KSM-Appプロジェクトの詳細なドキュメントが含まれています。

## 📚 ドキュメント構成

### [技術仕様 (specs/)](./specs/)
- **[architecture.md](./specs/architecture.md)** - 技術スタック、コーディング規約、ファイル構成
- **[database.md](./specs/database.md)** - データベース設計、制約、タイムゾーン仕様
- **[implementation-status.md](./specs/implementation-status.md)** - 実装状況、運用実績、将来計画

### [機能仕様 (features/)](./features/)
機能の詳細仕様については、[implemented-features.md](./features/implemented-features.md)をご覧ください。

#### 課金・プラン管理
- [subscription-system.md](./features/subscription-system.md) - サブスクリプション・課金システム

#### 順位・成績管理
- [standings-system.md](./features/standings-system.md) - 順位表システム
- [standings-integration.md](./features/standings-integration.md) - 順位表統合
- [manual-rankings.md](./features/manual-rankings.md) - 手動順位設定
- [results-matrix.md](./features/results-matrix.md) - 戦績表

#### 試合運営
- [match-management.md](./features/match-management.md) - 試合管理システム
- [live-news.md](./features/live-news.md) - 試合速報エリア
- [schedule-preview.md](./features/schedule-preview.md) - スケジュールプレビュー

#### 大会管理
- [tournament-status.md](./features/tournament-status.md) - 大会ステータス管理
- [tournament-progression.md](./features/tournament-progression.md) - トーナメント進行
- [multi-team.md](./features/multi-team.md) - 複数チーム参加

#### チーム・選手管理
- [csv-import.md](./features/csv-import.md) - CSV一括登録
- [csv-import-complete.md](./features/csv-import-complete.md) - CSV一括登録（完全仕様）
- [withdrawal-system.md](./features/withdrawal-system.md) - 辞退管理
- [withdrawal-details.md](./features/withdrawal-details.md) - 辞退管理（詳細）

#### アーカイブ
- [archive-system.md](./features/archive-system.md) - 大会アーカイブシステム

### [開発ガイド (guides/)](./guides/)
- **[development.md](./guides/development.md)** - 環境設定、開発コマンド、セットアップ手順

## 🚀 クイックナビゲーション

- **はじめて読む方**: [../CLAUDE.md](../CLAUDE.md) → [architecture.md](./specs/architecture.md)
- **機能を知りたい**: [implemented-features.md](./features/implemented-features.md)
- **開発を始める**: [development.md](./guides/development.md)
- **データベース設計**: [database.md](./specs/database.md)
- **実装状況**: [implementation-status.md](./specs/implementation-status.md)

## 📊 ドキュメント統計

- **総ドキュメント数**: 21ファイル
- **カテゴリ数**: 3カテゴリ（技術仕様、機能仕様、開発ガイド）
- **すべて40KB以下**: メンテナンス性・読みやすさを重視

---

各ドキュメントは独立して読めるように設計されていますが、相互参照により詳細な情報にアクセスできます。
