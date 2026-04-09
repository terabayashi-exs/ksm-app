# PK選手権大会 ER図（Mermaid）

以下は、PK選手権大会システムのER図をMermaid記法で表現したものです。

**最終更新**: 2026年4月9日
**データベース**: Turso（リモートSQLite）
**実装状況**: 本番運用中（41テーブル構成）
**主要機能**: ログインユーザー管理 / 大会運営 / アーカイブ / サブスクリプション / 懲罰管理

```mermaid
erDiagram
    %% ========================================
    %% マスターテーブル（13テーブル）
    %% ========================================

    m_prefectures {
        integer prefecture_id PK "都道府県ID"
        text prefecture_name "都道府県名"
        text prefecture_code "都道府県コード"
        text region_name "地方名"
        integer display_order "表示順序"
        integer is_active "有効フラグ（デフォルト1）"
        numeric created_at "作成日時（JST）"
    }

    m_venues {
        integer venue_id PK "会場ID（自動採番）"
        text venue_name "会場名"
        text address "住所"
        integer available_courts "利用可能コート数（デフォルト4）"
        integer is_active "有効フラグ（1=有効, 0=無効）"
        integer prefecture_id FK "都道府県ID"
        real latitude "緯度"
        real longitude "経度"
        text google_maps_url "GoogleマップURL"
        integer created_by_login_user_id FK "作成者ログインユーザーID"
        integer is_shared "共有フラグ（デフォルト0）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_teams {
        text team_id PK "チームID"
        text team_name "チーム名"
        text team_omission "チーム略称"
        text contact_phone "連絡先電話番号"
        integer representative_player_id FK "代表者選手ID"
        integer is_active "有効フラグ（1=有効, 0=無効）"
        text registration_type "登録種別（self_registered/admin_proxy）"
        integer prefecture_id FK "都道府県ID"
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
        integer administrator_id PK "管理者ID（自動採番）"
        text admin_login_id "管理者ログインID"
        text password_hash "ログインパスワード（bcryptハッシュ）"
        text email "メールアドレス"
        text logo_blob_url "ロゴ画像URL（Vercel Blob）"
        text logo_filename "ロゴファイル名"
        text organization_name "組織名"
        integer current_plan_id FK "現在のプランID"
        text subscription_status "サブスクリプション状態（free/trial/active/suspended/cancelled）"
        text trial_start_date "トライアル開始日"
        text trial_end_date "トライアル終了日"
        text square_customer_id "Square顧客ID"
        text free_trial_end_date "無料トライアル終了日"
        text plan_changed_at "プラン変更日時"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_login_users {
        integer login_user_id PK "ログインユーザーID（自動採番）"
        text email "メールアドレス"
        text password_hash "パスワード（bcryptハッシュ）"
        text display_name "表示名"
        integer is_superadmin "スーパー管理者フラグ（デフォルト0）"
        integer is_active "有効フラグ（デフォルト1）"
        integer current_plan_id FK "現在のプランID"
        integer created_by_login_user_id FK "作成者ログインユーザーID"
        text logo_blob_url "ロゴ画像URL"
        text logo_filename "ロゴファイル名"
        text organization_name "組織名"
        numeric created_at "作成日時（JST）"
        numeric updated_at "更新日時（JST）"
    }

    m_login_user_roles {
        integer id PK "ID（自動採番）"
        integer login_user_id FK "ログインユーザーID"
        text role "ロール（admin/operator/team）"
        numeric created_at "作成日時（JST）"
    }

    m_login_user_authority {
        integer id PK "ID（自動採番）"
        integer login_user_id FK "ログインユーザーID"
        integer tournament_id FK "大会ID"
        text permissions "権限（JSON）"
        numeric created_at "作成日時（JST）"
        numeric updated_at "更新日時（JST）"
    }

    m_team_members {
        integer id PK "ID（自動採番）"
        text team_id FK "チームID"
        integer login_user_id FK "ログインユーザーID"
        text member_role "メンバーロール（デフォルトprimary）"
        integer is_active "有効フラグ（デフォルト1）"
        numeric created_at "作成日時（JST）"
        numeric updated_at "更新日時（JST）"
    }

    m_tournament_formats {
        integer format_id PK "フォーマットID（自動採番）"
        text format_name "フォーマット名"
        integer target_team_count "対象チーム数"
        text format_description "フォーマット詳細説明"
        integer sport_type_id FK "スポーツ種別ID（デフォルト1）"
        text phases "フェーズ定義（JSON）"
        integer default_match_duration "デフォルト試合時間（分）"
        integer default_break_duration "デフォルト休憩時間（分）"
        text visibility "公開設定（public/private、デフォルトpublic）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_match_templates {
        integer template_id PK "テンプレートID（自動採番）"
        integer format_id FK "フォーマットID"
        integer match_number "試合番号"
        text match_code "試合コード（A1, B2, T8など）"
        text match_type "試合種別"
        text phase "フェーズ（preliminary/final）"
        text round_name "ラウンド名"
        text block_name "ブロック名（A, B, C, D, 決勝トーナメント）"
        text team1_source "チーム1取得方法"
        text team2_source "チーム2取得方法"
        text team1_display_name "チーム1表示名"
        text team2_display_name "チーム2表示名"
        integer day_number "開催日番号"
        integer execution_priority "実行優先度"
        integer court_number "コート番号"
        text suggested_start_time "推奨開始時刻"
        text start_time "開始時刻"
        integer loser_position_start "敗者順位開始"
        integer loser_position_end "敗者順位終了"
        text position_note "順位備考"
        integer winner_position "勝者順位"
        integer is_bye_match "不戦勝フラグ（デフォルト0）"
        integer matchday "マッチデー"
        integer cycle "サイクル（デフォルト1）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_sport_types {
        integer sport_type_id PK "スポーツ種別ID（自動採番）"
        text sport_name "スポーツ名"
        text sport_code "スポーツコード"
        integer max_period_count "最大ピリオド数"
        integer regular_period_count "通常ピリオド数"
        text score_type "スコアタイプ（デフォルトnumeric）"
        integer default_match_duration "デフォルト試合時間（分）"
        text score_unit "スコア単位（デフォルトゴール）"
        text period_definitions "ピリオド定義（JSON）"
        text result_format "結果表示形式（デフォルトscore）"
        integer supports_point_system "勝ち点対応（デフォルト1）"
        integer supports_draws "引分対応（デフォルト1）"
        text ranking_method "順位決定方法（デフォルトpoints）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    m_subscription_plans {
        integer plan_id PK "プランID（自動採番）"
        text plan_name "プラン名"
        text plan_code "プランコード"
        text plan_description "プラン説明"
        integer monthly_price "月額料金（円）"
        integer yearly_price "年額料金（円）"
        text currency "通貨（デフォルトJPY）"
        integer max_tournaments "大会数上限"
        integer max_divisions_per_tournament "1大会あたりの部門数上限"
        integer total_max_divisions "全大会通算の部門数上限"
        integer max_teams_per_tournament "1大会あたりのチーム数上限"
        integer allow_csv_import "CSV一括登録機能（0=不可, 1=可）"
        integer allow_advanced_stats "高度な統計機能（0=不可, 1=可）"
        integer allow_custom_branding "カスタムブランディング（0=不可, 1=可）"
        integer display_order "表示順序"
        integer is_active "有効フラグ"
        integer is_visible "表示フラグ"
        text created_at "作成日時（JST）"
        text updated_at "更新日時（JST）"
    }

    %% ========================================
    %% トランザクションテーブル（28テーブル）
    %% ========================================

    t_tournaments {
        integer tournament_id PK "大会ID（自動採番）"
        text tournament_name "大会名"
        integer format_id FK "フォーマットID"
        integer team_count "参加チーム数"
        integer court_count "使用コート数"
        text tournament_dates "大会開催日（JSON形式）"
        integer match_duration_minutes "1試合予定時間（分）"
        integer break_duration_minutes "試合間空き時間（分）"
        text display_match_duration "表示用試合時間"
        text status "状況（planning/ongoing/completed）"
        text visibility "公開フラグ（draft/preparing/public）"
        text public_start_date "公開開始日"
        text recruitment_start_date "募集開始日"
        text recruitment_end_date "募集終了日"
        integer sport_type_id FK "スポーツ種別ID"
        text created_by "作成者"
        text archive_ui_version "アーカイブUI版数"
        integer is_archived "アーカイブ済みフラグ（デフォルト0）"
        datetime archived_at "アーカイブ実行日時（JST）"
        text archived_by "アーカイブ実行者"
        integer files_count "ファイル数（デフォルト0）"
        integer group_order "グループ内表示順序"
        text category_name "カテゴリ名"
        integer group_id FK "大会グループID"
        integer show_players_public "選手公開フラグ（デフォルト0）"
        text phases "フェーズ定義（JSON）"
        text format_name "フォーマット名（キャッシュ）"
        text venue_id "会場ID（TEXT型）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_tournament_groups {
        integer group_id PK "大会グループID（自動採番）"
        text group_name "グループ名"
        text organizer "主催者"
        integer venue_id FK "会場ID"
        text event_start_date "開催開始日"
        text event_end_date "開催終了日"
        text recruitment_start_date "募集開始日"
        text recruitment_end_date "募集終了日"
        text visibility "公開設定（open/closed）"
        text event_description "イベント説明"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
        text admin_login_id "管理者ログインID"
        integer login_user_id FK "ログインユーザーID"
    }

    t_tournament_teams {
        integer tournament_team_id PK "大会参加チームID（自動採番）"
        integer tournament_id FK "大会ID"
        text team_id FK "マスターチームID"
        text team_name "大会エントリー時チーム名"
        text team_omission "大会エントリー時チーム略称"
        text assigned_block "割り当てブロック（A, B, C, D）"
        integer block_position "ブロック内位置"
        text withdrawal_status "辞退ステータス（active/withdrawal_requested/approved/rejected）"
        text withdrawal_reason "辞退理由"
        datetime withdrawal_requested_at "辞退申請日時（JST）"
        datetime withdrawal_processed_at "辞退処理完了日時（JST）"
        text withdrawal_processed_by "辞退処理者"
        text withdrawal_admin_comment "管理者コメント"
        text registration_method "登録方法"
        text participation_status "参加ステータス（デフォルトconfirmed）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_tournament_players {
        integer tournament_player_id PK "大会参加選手ID（自動採番）"
        integer tournament_id FK "大会ID"
        text team_id FK "チームID"
        integer player_id FK "選手ID"
        text player_name "大会固有の選手名"
        integer jersey_number "大会での背番号"
        text player_status "選手状態（active/withdrawn）"
        datetime registration_date "登録日時"
        datetime withdrawal_date "辞退日時"
        text remarks "備考"
        text player_omission "大会固有の選手略称"
        integer tournament_team_id FK "大会参加チームID"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_match_blocks {
        integer match_block_id PK "試合ブロックID（自動採番）"
        integer tournament_id FK "大会ID"
        text phase "フェーズ（preliminary/final）"
        text display_round_name "表示用ラウンド名"
        text block_name "ブロック名"
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
        text match_code "試合コード"
        text team1_display_name "チーム1表示名"
        text team2_display_name "チーム2表示名"
        integer court_number "コート番号"
        text start_time "試合開始時刻"
        text team1_scores "チーム1得点（JSON形式）"
        text team2_scores "チーム2得点（JSON形式）"
        integer period_count "ピリオド数（デフォルト1）"
        integer is_draw "引分フラグ（デフォルト0）"
        integer is_walkover "不戦勝フラグ（デフォルト0）"
        text match_status "試合状態（scheduled/ongoing/completed/cancelled）"
        text result_status "結果状態（none/pending/confirmed）"
        text remarks "備考"
        text match_comment "試合コメント"
        text confirmed_by "確定者"
        text cancellation_type "中止種別"
        integer team1_tournament_team_id FK "チーム1大会参加チームID"
        integer team2_tournament_team_id FK "チーム2大会参加チームID"
        integer winner_tournament_team_id FK "勝者大会参加チームID"
        text phase "フェーズ"
        text match_type "試合種別"
        text round_name "ラウンド名"
        text block_name "ブロック名"
        text team1_source "チーム1取得方法"
        text team2_source "チーム2取得方法"
        integer day_number "開催日番号"
        integer execution_priority "実行優先度"
        text suggested_start_time "推奨開始時刻"
        integer loser_position_start "敗者順位開始"
        integer loser_position_end "敗者順位終了"
        text position_note "順位備考"
        integer winner_position "勝者順位"
        integer is_bye_match "不戦勝フラグ（デフォルト0）"
        integer matchday "マッチデー"
        integer cycle "サイクル（デフォルト1）"
        text venue_name "会場名"
        integer venue_id "会場ID"
        text court_name "コート名"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_matches_final {
        integer match_id PK "試合ID（t_matches_liveと同一）"
        integer match_block_id FK "試合ブロックID"
        text tournament_date "大会開催日"
        integer match_number "試合番号"
        text match_code "試合コード"
        text team1_display_name "チーム1表示名"
        text team2_display_name "チーム2表示名"
        integer court_number "コート番号"
        text start_time "試合開始時刻"
        text team1_scores "チーム1得点（JSON形式）"
        text team2_scores "チーム2得点（JSON形式）"
        integer period_count "ピリオド数（デフォルト1）"
        integer is_draw "引分フラグ（デフォルト0）"
        integer is_walkover "不戦勝フラグ（デフォルト0）"
        text match_status "試合状態（completed）"
        text result_status "結果状態（confirmed）"
        text remarks "備考"
        text match_comment "試合コメント"
        text cancellation_type "中止種別"
        integer team1_tournament_team_id FK "チーム1大会参加チームID"
        integer team2_tournament_team_id FK "チーム2大会参加チームID"
        integer winner_tournament_team_id FK "勝者大会参加チームID"
        text phase "フェーズ"
        text match_type "試合種別"
        text round_name "ラウンド名"
        text block_name "ブロック名"
        text team1_source "チーム1取得方法"
        text team2_source "チーム2取得方法"
        integer day_number "開催日番号"
        integer execution_priority "実行優先度"
        text suggested_start_time "推奨開始時刻"
        integer loser_position_start "敗者順位開始"
        integer loser_position_end "敗者順位終了"
        text position_note "順位備考"
        integer winner_position "勝者順位"
        integer is_bye_match "不戦勝フラグ（デフォルト0）"
        integer matchday "マッチデー"
        integer cycle "サイクル（デフォルト1）"
        text venue_name "会場名"
        integer venue_id "会場ID"
        text court_name "コート名"
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

    t_tournament_rules {
        integer tournament_rule_id PK "ルールID（自動採番）"
        integer tournament_id FK "大会ID"
        text phase "フェーズ（preliminary/final）"
        integer use_extra_time "延長戦使用（デフォルト0）"
        integer use_penalty "PK戦使用（デフォルト0）"
        text active_periods "有効ピリオド（JSON、デフォルト[1]）"
        text notes "備考"
        text point_system "勝ち点システム（JSON）"
        text walkover_settings "不戦勝設定（JSON）"
        text tie_breaking_rules "タイブレーク規則（JSON）"
        integer tie_breaking_enabled "タイブレーク有効（デフォルト1）"
        text created_at "作成日時（JST）"
        text updated_at "更新日時（JST）"
    }

    t_tournament_files {
        integer file_id PK "ファイルID（自動採番）"
        integer tournament_id FK "大会ID"
        text file_title "ファイルタイトル"
        text file_description "ファイル説明"
        text original_filename "元ファイル名"
        text blob_url "Blob URL（Vercel Blob）"
        integer file_size "ファイルサイズ（バイト）"
        text mime_type "MIMEタイプ（デフォルトapplication/pdf）"
        integer upload_order "アップロード順（デフォルト0）"
        boolean is_public "公開フラグ（デフォルト1）"
        text uploaded_by "アップロード者"
        text external_url "外部URL"
        text link_type "リンク種別（デフォルトupload）"
        text display_date "表示日付"
        datetime uploaded_at "アップロード日時（JST）"
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

    t_tournament_notices {
        integer tournament_notice_id PK "お知らせID（自動採番）"
        integer tournament_id FK "大会ID"
        text content "お知らせ内容"
        integer display_order "表示順序（デフォルト0）"
        integer is_active "有効フラグ（デフォルト1）"
        numeric created_at "作成日時（JST）"
        numeric updated_at "更新日時（JST）"
    }

    t_tournament_match_overrides {
        integer override_id PK "オーバーライドID（自動採番）"
        integer tournament_id FK "大会ID"
        text match_code "試合コード"
        text team1_source_override "チーム1取得方法オーバーライド"
        text team2_source_override "チーム2取得方法オーバーライド"
        text override_reason "変更理由"
        text overridden_by "変更実施者"
        text overridden_at "変更日時（JST）"
        text created_at "作成日時（JST）"
        text updated_at "更新日時（JST）"
    }

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

    t_announcements {
        integer announcement_id PK "お知らせID（自動採番）"
        text title "タイトル"
        text content "本文"
        text status "公開状態（draft/published）"
        integer display_order "表示順序（DESC）"
        text created_by FK "作成者（管理者ログインID）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_sponsor_banners {
        integer banner_id PK "バナーID（自動採番）"
        integer tournament_id FK "大会ID"
        text banner_name "バナー名"
        text banner_url "リンク先URL"
        text image_blob_url "画像URL（Vercel Blob）"
        text image_filename "画像ファイル名"
        integer file_size "ファイルサイズ（バイト）"
        text display_position "表示位置"
        text target_tab "対象タブ（デフォルトall）"
        integer display_order "表示順序（デフォルト0）"
        integer is_active "有効フラグ（デフォルト1）"
        date start_date "掲載開始日"
        date end_date "掲載終了日"
        integer click_count "クリック数（デフォルト0）"
        text banner_size "バナーサイズ（デフォルトlarge）"
        datetime created_at "作成日時（JST）"
        datetime updated_at "更新日時（JST）"
    }

    t_email_send_history {
        integer history_id PK "履歴ID（自動採番）"
        integer tournament_id FK "大会ID"
        integer tournament_team_id FK "大会参加チームID"
        datetime sent_at "送信日時（JST）"
        text sent_by "送信者"
        text template_id "テンプレートID"
        text subject "件名"
        datetime created_at "作成日時（JST）"
    }

    t_email_verification_tokens {
        integer token_id PK "トークンID（自動採番）"
        text email "メールアドレス"
        text token "認証トークン"
        text purpose "用途"
        text expires_at "有効期限"
        integer used "使用済みフラグ（デフォルト0）"
        text created_at "作成日時（JST）"
        text used_at "使用日時"
    }

    t_password_reset_tokens {
        integer token_id PK "トークンID（自動採番）"
        integer login_user_id FK "ログインユーザーID"
        text reset_token "リセットトークン"
        numeric expires_at "有効期限"
        numeric used_at "使用日時"
        numeric created_at "作成日時（JST）"
    }

    t_team_invitations {
        integer id PK "ID（自動採番）"
        text team_id FK "チームID"
        integer invited_by_login_user_id FK "招待者ログインユーザーID"
        text invited_email "招待先メールアドレス"
        text token "招待トークン"
        text status "ステータス（デフォルトpending）"
        numeric expires_at "有効期限"
        numeric accepted_at "承認日時"
        numeric created_at "作成日時（JST）"
    }

    t_operator_invitations {
        integer id PK "ID（自動採番）"
        text email "招待先メールアドレス"
        integer invited_by_login_user_id FK "招待者ログインユーザーID"
        text tournament_access "大会アクセス権限（JSON）"
        text token "招待トークン"
        text expires_at "有効期限"
        text status "ステータス（デフォルトpending）"
        integer accepted_by_login_user_id FK "承認者ログインユーザーID"
        text accepted_at "承認日時"
        text created_at "作成日時（JST）"
    }

    t_operator_tournament_access {
        integer access_id PK "アクセスID（自動採番）"
        integer operator_id FK "オペレーターID（ログインユーザーID）"
        integer tournament_id FK "大会ID"
        text permissions "権限（JSON）"
        integer assigned_by_login_user_id FK "割当者ログインユーザーID"
        text created_at "作成日時（JST）"
        text updated_at "更新日時（JST）"
    }

    t_format_access_grants {
        integer grant_id PK "付与ID（自動採番）"
        integer format_id FK "フォーマットID"
        integer login_user_id FK "ログインユーザーID"
        integer granted_by_login_user_id FK "付与者ログインユーザーID"
        numeric granted_at "付与日時（JST）"
        numeric expires_at "有効期限"
        text notes "備考"
    }

    t_administrator_subscriptions {
        integer subscription_id PK "サブスクリプションID（自動採番）"
        text admin_login_id FK "管理者ログインID"
        integer plan_id FK "プランID"
        text subscription_status "サブスクリプション状態（active/suspended/cancelled/expired）"
        text start_date "開始日"
        text end_date "終了日"
        text trial_end_date "トライアル終了日"
        integer changed_from_plan_id FK "変更前プランID"
        text change_reason "変更理由"
        text created_at "作成日時（JST）"
    }

    t_subscription_usage {
        integer usage_id PK "使用状況ID（自動採番）"
        text admin_login_id FK "管理者ログインID"
        integer current_tournament_groups_count "現在の大会グループ数（デフォルト0）"
        integer current_tournaments_count "現在の大会数（デフォルト0）"
        text last_calculated_at "最終計算日時（JST）"
        text created_at "作成日時（JST）"
        text updated_at "更新日時（JST）"
    }

    t_payment_history {
        integer payment_id PK "支払いID（自動採番）"
        integer subscription_id FK "サブスクリプションID"
        text admin_login_id FK "管理者ログインID"
        integer plan_id FK "プランID"
        integer amount "支払い金額（円）"
        text payment_status "支払い状態（pending/completed/failed）"
        text square_payment_id "Square支払いID"
        text paid_at "支払い完了日時（JST）"
        text created_at "作成日時（JST）"
    }

    t_disciplinary_settings {
        integer setting_id PK "設定ID（自動採番）"
        integer group_id FK "大会グループID"
        integer yellow_threshold "イエローカード累積閾値（デフォルト2）"
        integer is_enabled "有効フラグ（デフォルト1）"
        numeric created_at "作成日時（JST）"
        numeric updated_at "更新日時（JST）"
    }

    t_disciplinary_actions {
        integer action_id PK "アクションID（自動採番）"
        integer group_id FK "大会グループID"
        integer tournament_id FK "大会ID"
        integer match_id FK "試合ID"
        integer tournament_team_id FK "大会参加チームID"
        text player_name "選手名"
        text card_type "カード種別（yellow/red）"
        integer reason_code "理由コード"
        text reason_text "理由テキスト"
        integer suspension_matches "出場停止試合数（デフォルト0）"
        integer is_void "無効フラグ（デフォルト0）"
        text recorded_by "記録者"
        numeric created_at "作成日時（JST）"
        numeric updated_at "更新日時（JST）"
    }

    %% ========================================
    %% リレーションシップ
    %% ========================================

    %% 都道府県
    m_prefectures ||--o{ m_venues : "所在地"
    m_prefectures ||--o{ m_teams : "所在地"

    %% チーム・選手
    m_teams ||--o{ m_players : "所属"
    m_players ||--o| m_teams : "代表者"

    %% ログインユーザー・権限
    m_login_users ||--o{ m_login_user_roles : "ロール"
    m_login_users ||--o{ m_login_user_authority : "大会権限"
    m_login_users ||--o{ m_team_members : "チーム所属"
    m_teams ||--o{ m_team_members : "メンバー"
    m_login_users ||--o{ m_venues : "会場作成"

    %% フォーマット・テンプレート
    m_tournament_formats ||--o{ m_match_templates : "フォーマット定義"
    m_tournament_formats ||--o{ t_tournaments : "使用"
    m_sport_types ||--o{ m_tournament_formats : "競技種別"
    m_sport_types ||--o{ t_tournaments : "競技種別"

    %% 大会グループ
    t_tournament_groups ||--o{ t_tournaments : "グループ化"
    t_tournament_groups ||--o{ t_disciplinary_settings : "懲罰設定"
    t_tournament_groups ||--o{ t_disciplinary_actions : "懲罰記録"

    %% 大会
    t_tournaments ||--o{ t_tournament_teams : "参加"
    t_tournaments ||--o{ t_tournament_players : "選手参加"
    t_tournaments ||--o{ t_match_blocks : "ブロック構成"
    t_tournaments ||--o{ t_tournament_rules : "ルール設定"
    t_tournaments ||--o{ t_tournament_files : "関連ファイル"
    t_tournaments ||--o{ t_tournament_notifications : "通知"
    t_tournaments ||--o{ t_tournament_notices : "お知らせ"
    t_tournaments ||--o{ t_tournament_match_overrides : "進出条件オーバーライド"
    t_tournaments ||--o{ t_sponsor_banners : "スポンサーバナー"
    t_tournaments ||--o{ t_email_send_history : "メール送信履歴"
    t_tournaments ||--o| t_archived_tournament_json : "アーカイブ化"

    %% チーム参加
    m_teams ||--o{ t_tournament_teams : "チーム参加"
    m_teams ||--o{ t_tournament_players : "チーム選手参加"
    m_players ||--o{ t_tournament_players : "選手参加"
    t_tournament_teams ||--o{ t_tournament_players : "参加チーム選手"

    %% 試合（tournament_team_idベース）
    t_match_blocks ||--o{ t_matches_live : "試合実施"
    t_match_blocks ||--o{ t_matches_final : "試合確定"
    t_match_blocks ||--o{ t_match_status : "試合状態管理"
    t_matches_live ||--|| t_match_status : "状態管理"

    t_tournament_teams ||--o{ t_matches_live : "チーム1/2/勝者"
    t_tournament_teams ||--o{ t_matches_final : "チーム1/2/勝者"
    t_tournament_teams ||--o{ t_disciplinary_actions : "懲罰対象"

    %% 招待
    m_login_users ||--o{ t_team_invitations : "チーム招待"
    m_teams ||--o{ t_team_invitations : "招待対象チーム"
    m_login_users ||--o{ t_operator_invitations : "オペレーター招待"
    m_login_users ||--o{ t_operator_tournament_access : "オペレーターアクセス"
    t_tournaments ||--o{ t_operator_tournament_access : "大会アクセス"

    %% フォーマットアクセス
    m_tournament_formats ||--o{ t_format_access_grants : "アクセス付与"
    m_login_users ||--o{ t_format_access_grants : "アクセス権限"

    %% パスワードリセット
    m_login_users ||--o{ t_password_reset_tokens : "パスワードリセット"

    %% サブスクリプション
    m_subscription_plans ||--o{ m_administrators : "プラン適用"
    m_subscription_plans ||--o{ m_login_users : "プラン適用"
    m_subscription_plans ||--o{ t_administrator_subscriptions : "プラン詳細"
    m_subscription_plans ||--o{ t_payment_history : "プラン別支払い"

    %% お知らせ
    m_administrators ||--o{ t_announcements : "お知らせ作成"
```

## 機能実装ポイント

### システム構成（2026年4月時点）
- **総テーブル数**: 41テーブル（マスター13 + トランザクション28）
- **認証基盤**: `m_login_users` + `m_login_user_roles` + `m_login_user_authority` による統合ログインシステム
- **チーム管理**: `m_team_members` + `t_team_invitations` によるチームメンバー招待・管理
- **オペレーター管理**: `t_operator_invitations` + `t_operator_tournament_access` によるオペレーター招待・権限管理
- **懲罰管理**: `t_disciplinary_settings` + `t_disciplinary_actions` によるカード管理
- **フォーマットアクセス制御**: `t_format_access_grants` による非公開フォーマットへのアクセス管理

### アーカイブシステム（v1.0完全実装済み）
- **目的**: 完了した大会の完全なデータ保存とアクセス
- **データ形式**: JSON形式による完全なデータ構造保存
- **バージョン管理**: `archive_ui_version`による将来のUI更新対応

### 辞退管理システム（完全実装済み）
- **申請フロー**: チーム辞退申請 → 管理者承認・却下
- **ステータス管理**: `active` → `withdrawal_requested` → `withdrawal_approved/withdrawal_rejected`

### 複数チーム参加機能（完全実装済み）
- **複数エントリー**: 同一マスターチームから複数の大会参加（`tournament_team_id`ベース）
- **試合参照**: `team1_tournament_team_id` / `team2_tournament_team_id` / `winner_tournament_team_id`

### JST時刻基準
- **全タイムスタンプ**: `datetime('now', '+9 hours')`でJST統一

### データ分離ポリシー
- **マスターデータ（永続）**: チーム・選手・会場・フォーマットの基本情報は保持
- **トランザクションデータ（大会別）**: 大会参加情報は大会ごとに分離
- **アーカイブデータ（完全保存）**: 大会の全データをJSON形式で完全保存
