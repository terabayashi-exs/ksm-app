# PK選手権大会 ER図（Mermaid）

以下は、PK選手権大会システムのER図をMermaid記法で表現したものです。

**最終更新**: 2025年8月16日  
**データベース**: Turso（リモートSQLite）  
**アーカイブシステム**: v1.0 JSON形式完全実装  

```mermaid
erDiagram
    %% マスターテーブル
    m_venues {
        integer venue_id PK "会場ID（自動採番）"
        text venue_name "会場名"
        text address "住所"
        integer available_courts "利用可能コート数（デフォルト4）"
        integer is_active "有効フラグ（1=有効, 0=無効）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_teams {
        text team_id PK "チームID（ログインID兼用）"
        text team_name "チーム名"
        text team_omission "チーム略称"
        text contact_person "連絡担当者名"
        text contact_email "連絡先メール"
        text contact_phone "連絡先電話番号"
        integer representative_player_id FK "代表者選手ID"
        text password_hash "ログインパスワード（bcryptハッシュ）"
        text registration_type "登録種別（self_registered/admin_proxy）"
        integer is_active "有効フラグ（1=有効, 0=無効）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_players {
        integer player_id PK "選手ID（自動採番）"
        text player_name "選手名"
        integer jersey_number "背番号"
        text current_team_id FK "現在の所属チームID"
        integer is_active "有効フラグ（1=有効, 0=無効）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_administrators {
        text admin_login_id PK "管理者ログインID"
        text password_hash "ログインパスワード（bcryptハッシュ）"
        text email "メールアドレス"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_tournament_formats {
        integer format_id PK "フォーマットID（自動採番）"
        text format_name "フォーマット名"
        integer target_team_count "対象チーム数"
        text format_description "フォーマット詳細説明"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_match_templates {
        integer template_id PK "テンプレートID（自動採番）"
        integer format_id FK "フォーマットID"
        integer match_number "試合番号"
        text match_code "試合コード（A1, B2, T8など）"
        text match_type "試合種別（通常, エキシビジョンなど）"
        text phase "フェーズ（preliminary/final）"
        text round_name "ラウンド名"
        text block_name "ブロック名（A, B, C, D, 決勝トーナメント）"
        text team1_source "チーム1取得方法"
        text team2_source "チーム2取得方法"
        text team1_display_name "チーム1表示名"
        text team2_display_name "チーム2表示名"
        integer day_number "開催日番号（デフォルト1）"
        integer execution_priority "実行優先度（0〜）"
        integer court_number "コート番号"
        text suggested_start_time "推奨開始時刻"
        text start_time "開始時刻"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    %% トランザクションテーブル
    t_tournaments {
        integer tournament_id PK "大会ID（自動採番）"
        text tournament_name "大会名"
        integer format_id FK "フォーマットID"
        integer venue_id FK "会場ID"
        integer team_count "参加チーム数（デフォルト0）"
        integer court_count "使用コート数（デフォルト4）"
        text tournament_dates "大会開催日（JSON形式）"
        integer match_duration_minutes "1試合予定時間（デフォルト15分）"
        integer break_duration_minutes "試合間空き時間（デフォルト5分）"
        integer win_points "勝利時勝ち点（デフォルト3）"
        integer draw_points "引分時勝ち点（デフォルト1）"
        integer loss_points "敗北時勝ち点（デフォルト0）"
        integer walkover_winner_goals "不戦勝時勝者得点（デフォルト3）"
        integer walkover_loser_goals "不戦勝時敗者得点（デフォルト0）"
        integer cancelled_match_points "中止試合勝ち点（デフォルト1）"
        integer cancelled_team1_goals "中止試合チーム1得点（デフォルト0）"
        integer cancelled_team2_goals "中止試合チーム2得点（デフォルト0）"
        text status "状況（planning/ongoing/completed）"
        text visibility "公開フラグ（preparing/public）"
        date public_start_date "公開開始日"
        date recruitment_start_date "募集開始日"
        date recruitment_end_date "募集終了日"
        text created_by "作成者（デフォルトadmin）"
        integer is_archived "アーカイブ済みフラグ（0=通常, 1=アーカイブ済み）"
        text archive_ui_version "アーカイブUI版数"
        datetime archived_at "アーカイブ実行日時（JST）"
        text archived_by "アーカイブ実行者"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_tournament_teams {
        integer tournament_team_id PK "大会参加チームID（自動採番）"
        integer tournament_id FK "大会ID"
        text team_id FK "マスターチームID"
        text team_name "大会エントリー時チーム名"
        text team_omission "大会エントリー時チーム略称"
        text assigned_block "割り当てブロック（A, B, C, D）"
        integer block_position "ブロック内位置（1〜）"
        text withdrawal_status "辞退ステータス（active/withdrawal_requested/withdrawal_approved/withdrawal_rejected）"
        text withdrawal_reason "辞退理由"
        datetime withdrawal_requested_at "辞退申請日時（JST）"
        datetime withdrawal_processed_at "辞退処理完了日時（JST）"
        text withdrawal_processed_by "辞退処理者（管理者ID）"
        text withdrawal_admin_comment "管理者コメント"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_tournament_players {
        integer tournament_player_id PK "大会参加選手ID（自動採番）"
        integer tournament_id FK "大会ID"
        text team_id FK "チームID"
        integer player_id FK "選手ID"
        integer jersey_number "大会での背番号"
        text player_status "選手状態（active/withdrawn）"
        datetime registration_date "登録日時（CURRENT_TIMESTAMP）"
        datetime withdrawal_date "辞退日時"
        text remarks "備考"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_match_blocks {
        integer match_block_id PK "試合ブロックID（自動採番）"
        integer tournament_id FK "大会ID"
        text phase "フェーズ（preliminary/final）"
        text display_round_name "表示用ラウンド名"
        text block_name "ブロック名（A, B, C, D, 決勝トーナメント）"
        text match_type "試合種別"
        integer block_order "ブロック内順序（デフォルト0）"
        text team_rankings "チーム順位情報（JSON形式）"
        text remarks "備考"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_matches_live {
        integer match_id PK "試合ID（自動採番）"
        integer match_block_id FK "試合ブロックID"
        text tournament_date "大会開催日"
        integer match_number "試合番号"
        text match_code "試合コード（A1, B2, T8など）"
        text team1_id FK "チーム1ID"
        text team2_id FK "チーム2ID"
        text team1_display_name "チーム1表示名"
        text team2_display_name "チーム2表示名"
        integer court_number "コート番号"
        text start_time "試合開始時刻"
        text team1_scores "チーム1得点（JSON形式）"
        text team2_scores "チーム2得点（JSON形式）"
        integer period_count "ピリオド数（デフォルト1）"
        text winner_team_id FK "勝利チームID"
        integer is_draw "引分フラグ（0=勝敗決定, 1=引分）"
        integer is_walkover "不戦勝フラグ（0=通常, 1=不戦勝）"
        text match_status "試合状態（scheduled/ongoing/completed/cancelled）"
        text result_status "結果状態（none/pending/confirmed）"
        text cancellation_type "中止種別"
        text remarks "備考"
        text confirmed_by "確定者"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_matches_final {
        integer match_id PK "試合ID（t_matches_liveと同一）"
        integer match_block_id FK "試合ブロックID"
        text tournament_date "大会開催日"
        integer match_number "試合番号"
        text match_code "試合コード"
        text team1_id FK "チーム1ID"
        text team2_id FK "チーム2ID"
        text team1_display_name "チーム1表示名"
        text team2_display_name "チーム2表示名"
        integer court_number "コート番号"
        text start_time "試合開始時刻"
        text team1_scores "チーム1得点（JSON形式）"
        text team2_scores "チーム2得点（JSON形式）"
        integer period_count "ピリオド数（デフォルト1）"
        text winner_team_id FK "勝利チームID"
        integer is_draw "引分フラグ（0=勝敗決定, 1=引分）"
        integer is_walkover "不戦勝フラグ（0=通常, 1=不戦勝）"
        text match_status "試合状態（completed）"
        text result_status "結果状態（confirmed）"
        text cancellation_type "中止種別"
        text remarks "備考"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_match_status {
        integer match_id PK "試合ID（t_matches_liveと同一）"
        integer match_block_id FK "試合ブロックID"
        text match_status "試合状態（scheduled/ongoing/completed/cancelled）"
        datetime actual_start_time "実際の開始時刻（JST）"
        datetime actual_end_time "実際の終了時刻（JST）"
        integer current_period "現在のピリオド（デフォルト1）"
        text updated_by "更新者"
        datetime updated_at "更新日時（JST）"
    }

    t_tournament_notifications {
        integer notification_id PK "通知ID（自動採番）"
        integer tournament_id FK "大会ID"
        text notification_type "通知種別"
        text title "通知タイトル"
        text message "通知メッセージ"
        text severity "重要度（info/warning/error）"
        integer is_resolved "解決フラグ（0=未解決, 1=解決済み）"
        text metadata "メタデータ（JSON形式）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    %% アーカイブシステム
    t_archived_tournament_json {
        integer tournament_id PK "アーカイブ大会ID"
        text tournament_name "大会名"
        text tournament_data "大会基本情報（JSON）"
        text teams_data "参加チーム情報（JSON）"
        text matches_data "試合データ（JSON）"
        text standings_data "順位表データ（JSON）"
        text results_data "戦績表データ（JSON）"
        text pdf_info_data "PDF情報（JSON）"
        text archive_version "アーカイブ版数（v1_json）"
        datetime archived_at "アーカイブ実行日時（JST）"
        text archived_by "アーカイブ実行者"
        datetime last_accessed "最終アクセス日時（JST）"
        text metadata "メタデータ（JSON）"
    }

    %% リレーションシップ
    m_teams ||--o{ m_players : "所属"
    m_players ||--o| m_teams : "代表者"

    m_tournament_formats ||--o{ m_match_templates : "フォーマット定義"
    m_tournament_formats ||--o{ t_tournaments : "使用"
    m_venues ||--o{ t_tournaments : "開催"

    t_tournaments ||--o{ t_tournament_teams : "参加"
    t_tournaments ||--o{ t_tournament_players : "選手参加"
    t_tournaments ||--o{ t_match_blocks : "ブロック構成"
    t_tournaments ||--o{ t_tournament_notifications : "通知"
    t_tournaments ||--o| t_archived_tournament_json : "アーカイブ化"

    m_teams ||--o{ t_tournament_teams : "チーム参加"
    m_teams ||--o{ t_tournament_players : "チーム選手参加"
    m_players ||--o{ t_tournament_players : "選手参加"

    t_match_blocks ||--o{ t_matches_live : "試合実施"
    t_match_blocks ||--o{ t_matches_final : "試合確定"
    t_match_blocks ||--o{ t_match_status : "試合状態管理"

    m_teams ||--o{ t_matches_live : "チーム1"
    m_teams ||--o{ t_matches_live : "チーム2"
    m_teams ||--o{ t_matches_live : "勝者"

    m_teams ||--o{ t_matches_final : "チーム1"
    m_teams ||--o{ t_matches_final : "チーム2"
    m_teams ||--o{ t_matches_final : "勝者"

    t_matches_live ||--|| t_match_status : "状態管理"
```

## 🔥 **重要な機能実装ポイント**

### **🏆 アーカイブシステム（v1.0完全実装済み）**
- **目的**: 完了した大会の完全なデータ保存とアクセス
- **データ形式**: JSON形式による完全なデータ構造保存
- **アクセス**: 専用UIによる高速表示（`ArchivedLayout_v1.tsx`）
- **データ削除**: アーカイブ後の関連データ安全削除

### **🚫 辞退管理システム（完全実装済み）**
- **申請フロー**: チーム辞退申請 → 管理者承認・却下
- **影響度評価**: 自動計算による影響度分析
- **ステータス管理**: `active` → `withdrawal_requested` → `withdrawal_approved/withdrawal_rejected`

### **📋 複数チーム参加機能（完全実装済み）**
- **複数エントリー**: 同一マスターチームから複数の大会参加
- **個別管理**: エントリー毎の独立したチーム名・選手割り当て
- **登録種別**: `self_registered`（代表者登録）・`admin_proxy`（管理者代行）

### **⏰ JST時刻基準**
- **全タイムスタンプ**: `datetime('now', '+9 hours')`でJST統一
- **一貫性**: フロントエンド表示とデータベース時刻の完全同期

### **🎯 順位表システム（事前計算型）**
- **高速表示**: `team_rankings`フィールドのJSON形式キャッシュ
- **手動調整**: 管理者による柔軟な順位修正機能
- **決勝対応**: 予選・決勝トーナメント両対応

### **🔐 セキュリティ対応**
- **パスワード**: bcryptハッシュ化
- **認証**: NextAuth.js v5ベース
- **JWT**: 審判アクセス用セキュアトークン

## 📊 **データ分離ポリシー**

### **マスターデータ（永続）**
- チーム・選手の基本情報は保持
- 大会終了後もマスターデータは維持

### **トランザクションデータ（大会別）**
- 大会参加情報は大会ごとに分離
- アーカイブ後は関連データ削除可能

### **アーカイブデータ（完全保存）**
- 大会の全データをJSON形式で完全保存
- 高速アクセス可能な専用UI提供