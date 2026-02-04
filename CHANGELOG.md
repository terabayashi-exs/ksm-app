# Changelog

All notable changes to the KSM-App project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 統合ブロック対応によるトーナメント表示の改善
- 決勝進出条件の動的取得機能（テンプレート＋オーバーライド対応）
- 形式別「要調整」タグの自動判定システム

### Fixed
- トーナメント形式で順位表が全て"-"表示される問題を修正
- 統合ブロック（preliminary_unified）が重複作成される問題を修正（大会ID 129）
- トーナメント表示で8試合以上のブロックがエラーになる問題を修正
- 手動順位設定画面でブロック名が重複表示される問題を修正
- トーナメント形式で不要な戦績情報（ポイント、勝敗、得失点差）が表示される問題を修正
- 決勝進出に関係ない順位での同着で「要調整」タグが表示される問題を修正

### Changed
- `analyzePromotionEligibility`関数を1位・2位固定チェックから動的チェックに変更
- `createTieNotificationIfNeeded`関数を必要順位のみチェックするように改善
- トーナメント形式では「要調整」通知を生成しないように変更
- 手動順位設定画面のブロック名表示を簡潔化（"予選トーナメント"など）

### Technical Details
- **Modified Files (15):**
  - `lib/standings-calculator.ts` - 順位計算・通知生成ロジック
  - `components/features/tournament/ManualRankingsEditor.tsx` - 手動順位設定UI
  - `app/admin/tournaments/[id]/manual-rankings/page.tsx` - サーバー側ページ
  - `components/features/tournament/TournamentBracket.tsx` - トーナメント表示
  - `components/features/tournament/TournamentStandings.tsx` - 順位表表示
  - `app/api/tournaments/create-new/route.ts` - 大会作成API
  - その他9ファイル

---

## [1.0.0] - 2026-01-08

### Added
- スポンサーバナー管理システム（Phase 7）
- お知らせ管理システム

### Changed
- データベーステーブル追加: `t_sponsor_banners`, `t_announcements`

---

## [0.9.0] - 2025-12-23

### Added
- メール認証によるチーム登録機能
- 管理者・チーム代表者ログインページの分離

### Changed
- 認証フロー改善（`/auth/admin/login`, `/auth/team/login`）

---

## [0.8.0] - 2025-12-19

### Added
- 参加チーム管理システム（Phase 6）
- メール一括送信機能（8種類のテンプレート）
- 送信履歴の自動保存機能

---

## [0.7.0] - 2025-12-12

### Changed
- スコアデータフォーマット統一（JSON配列形式への移行）
- 統一ヘルパー関数の実装（`lib/score-parser.ts`）

### Fixed
- PK戦特殊処理の互換性維持
- 後方互換性確保（レガシー形式読み取り対応）

---

## [0.6.0] - 2025-08-16

### Added
- 辞退管理システム（申請・承認・統計）
- リアルタイム機能（SSE・ライブ更新）
- 管理者ダッシュボード（統合監視・通知）

---

## [0.5.0] - 2025-08-01

### Added
- 順位表システム（事前計算・手動調整・決勝対応）
- 戦績表マトリックス表示

---

## [0.4.0] - 2025-07-15

### Added
- 結果入力システム（リアルタイム・QR認証）
- 公開画面（順位表・戦績表・トーナメント表）

---

## [0.3.0] - 2025-07-01

### Added
- 試合スケジュール（自動生成・手動調整）
- チーム・選手管理（複数参加・CSV一括登録）

---

## [0.2.0] - 2025-06-15

### Added
- 大会管理（CRUD・ステータス・公開設定）

---

## [0.1.0] - 2025-06-01

### Added
- プロジェクト初期化
- データベース構築（Turso/SQLite）
- 認証システム（NextAuth.js v5）

---

[Unreleased]: https://github.com/yourusername/ksm-app/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yourusername/ksm-app/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/yourusername/ksm-app/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/yourusername/ksm-app/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/yourusername/ksm-app/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/yourusername/ksm-app/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/yourusername/ksm-app/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/yourusername/ksm-app/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/yourusername/ksm-app/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/yourusername/ksm-app/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/yourusername/ksm-app/releases/tag/v0.1.0
