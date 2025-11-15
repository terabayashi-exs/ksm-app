-- PK選手権大会システム DDL
-- Generated from ksm-dev database
-- Date: 2025-09-24

-- m_administrators
CREATE TABLE "m_administrators" (
        administrator_id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_login_id TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        logo_blob_url TEXT,
        logo_filename TEXT,
        organization_name TEXT
      );

-- m_match_templates
CREATE TABLE "m_match_templates" (
        template_id INTEGER PRIMARY KEY AUTOINCREMENT,
        format_id INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        match_type TEXT NOT NULL,
        phase TEXT NOT NULL,
        round_name TEXT,
        block_name TEXT,
        team1_source TEXT,
        team2_source TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        day_number INTEGER NOT NULL,
        execution_priority INTEGER NOT NULL,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        court_number INTEGER,
        suggested_start_time TEXT,
        start_time TEXT,
        loser_position_start INTEGER,
        loser_position_end INTEGER,
        position_note TEXT,
        winner_position INTEGER,
        FOREIGN KEY (format_id) REFERENCES m_tournament_formats (format_id)
      );

-- m_players
CREATE TABLE "m_players" (
    player_id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    jersey_number INTEGER,
    current_team_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    FOREIGN KEY (current_team_id) REFERENCES m_teams(team_id)
);

-- m_sport_types
CREATE TABLE m_sport_types (
        sport_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sport_name TEXT NOT NULL,
        sport_code TEXT UNIQUE NOT NULL,
        max_period_count INTEGER NOT NULL,
        regular_period_count INTEGER NOT NULL,
        score_type TEXT NOT NULL DEFAULT 'numeric',
        default_match_duration INTEGER,
        score_unit TEXT DEFAULT 'ゴール',
        period_definitions TEXT NOT NULL,
        result_format TEXT DEFAULT 'score',
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
      , supports_point_system INTEGER DEFAULT 1, supports_draws INTEGER DEFAULT 1, ranking_method TEXT DEFAULT 'points');

-- m_teams
CREATE TABLE "m_teams" (
        team_id TEXT PRIMARY KEY,
        team_name TEXT NOT NULL,
        team_omission TEXT,
        contact_person TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        contact_phone TEXT,
        representative_player_id INTEGER,
        password_hash TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        registration_type TEXT DEFAULT 'self_registered'
      );

-- m_tournament_formats
CREATE TABLE "m_tournament_formats" (
    format_id INTEGER PRIMARY KEY AUTOINCREMENT,
    format_name TEXT NOT NULL,
    target_team_count INTEGER NOT NULL,
    format_description TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
, sport_type_id INTEGER DEFAULT 1);

-- m_venues
CREATE TABLE "m_venues" (
        venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
        venue_name TEXT NOT NULL,
        address TEXT,
        available_courts INTEGER NOT NULL DEFAULT 4,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
      );

-- sample_data
CREATE TABLE sample_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  value TEXT
);

-- t_archived_tournament_json
CREATE TABLE t_archived_tournament_json (
        tournament_id INTEGER PRIMARY KEY,
        tournament_name TEXT NOT NULL,
        tournament_data TEXT NOT NULL,
        teams_data TEXT NOT NULL,
        matches_data TEXT NOT NULL,
        standings_data TEXT NOT NULL,
        results_data TEXT,
        pdf_info_data TEXT,
        archive_version TEXT DEFAULT 'v1_json',
        archived_at DATETIME NOT NULL,
        archived_by TEXT NOT NULL,
        last_accessed DATETIME,
        metadata TEXT
      );

-- t_match_blocks
CREATE TABLE "t_match_blocks" (
    match_block_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    phase TEXT NOT NULL,
    display_round_name TEXT,
    block_name TEXT NOT NULL,
    match_type TEXT NOT NULL,
    block_order INTEGER NOT NULL DEFAULT 0,
    team_rankings TEXT, -- JSON形式
    remarks TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id)
);

-- t_match_status
CREATE TABLE "t_match_status" (
        match_id INTEGER PRIMARY KEY,
        match_block_id INTEGER NOT NULL,
        match_status TEXT NOT NULL DEFAULT 'scheduled' 
          CHECK (match_status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
        actual_start_time DATETIME,
        actual_end_time DATETIME,
        current_period INTEGER DEFAULT 1,
        updated_by TEXT,
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id)
      );

-- t_matches_final
CREATE TABLE "t_matches_final" (
        match_id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_block_id INTEGER NOT NULL,
        tournament_date TEXT NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        team1_id TEXT,
        team2_id TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        court_number INTEGER,
        start_time TEXT,
        team1_scores TEXT,
        team2_scores TEXT,
        period_count INTEGER NOT NULL DEFAULT 1,
        winner_team_id TEXT,
        is_draw INTEGER NOT NULL DEFAULT 0,
        is_walkover INTEGER NOT NULL DEFAULT 0,
        match_status TEXT NOT NULL DEFAULT 'completed',
        result_status TEXT NOT NULL DEFAULT 'confirmed',
        remarks TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')), cancellation_type TEXT,
        FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id),
        FOREIGN KEY (team1_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (team2_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (winner_team_id) REFERENCES m_teams(team_id)
      );

-- t_matches_live
CREATE TABLE "t_matches_live" (
        match_id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_block_id INTEGER NOT NULL,
        tournament_date TEXT NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        team1_id TEXT,
        team2_id TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        court_number INTEGER,
        start_time TEXT,
        team1_scores TEXT,
        team2_scores TEXT,
        period_count INTEGER NOT NULL DEFAULT 1,
        winner_team_id TEXT,
        is_draw INTEGER NOT NULL DEFAULT 0,
        is_walkover INTEGER NOT NULL DEFAULT 0,
        match_status TEXT NOT NULL DEFAULT 'scheduled',
        result_status TEXT NOT NULL DEFAULT 'none',
        remarks TEXT,
        confirmed_by TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
      , cancellation_type TEXT);

-- t_tournament_files
CREATE TABLE t_tournament_files (
  file_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  file_title TEXT NOT NULL,                    -- ユーザー指定タイトル（例：「駐車場案内」）
  file_description TEXT,                       -- ファイル説明（オプション）
  original_filename TEXT NOT NULL,             -- 元のファイル名
  blob_url TEXT NOT NULL,                      -- Vercel Blob Storage URL
  file_size INTEGER NOT NULL,                  -- ファイルサイズ（バイト）
  mime_type TEXT NOT NULL DEFAULT 'application/pdf', -- MIME型
  upload_order INTEGER DEFAULT 0,              -- 表示順序
  is_public BOOLEAN DEFAULT 1,                 -- 公開フラグ
  uploaded_by TEXT NOT NULL,                   -- アップロード者（管理者ID）
  uploaded_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  
  FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE
);

-- t_tournament_notifications
CREATE TABLE t_tournament_notifications (
        notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        notification_type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        is_resolved INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        created_at DATETIME NOT NULL DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME NOT NULL DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id)
      );

-- t_tournament_players
CREATE TABLE "t_tournament_players" (
        tournament_player_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        team_id TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        jersey_number INTEGER,
        player_status TEXT NOT NULL DEFAULT 'active',
        registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        withdrawal_date DATETIME,
        remarks TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
        FOREIGN KEY (team_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (player_id) REFERENCES m_players(player_id),
        UNIQUE(tournament_id, team_id, player_id)
      );

-- t_tournament_rules
CREATE TABLE t_tournament_rules (
        tournament_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        phase TEXT NOT NULL,
        use_extra_time BOOLEAN DEFAULT 0,
        use_penalty BOOLEAN DEFAULT 0,
        active_periods TEXT NOT NULL,
        win_condition TEXT DEFAULT 'score',
        notes TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')), tie_breaking_rules TEXT, tie_breaking_enabled INTEGER DEFAULT 1, point_system TEXT, walkover_settings TEXT,
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments (tournament_id),
        UNIQUE (tournament_id, phase)
      );

-- t_tournament_teams
CREATE TABLE "t_tournament_teams" (
    tournament_team_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    assigned_block TEXT,
    block_position INTEGER,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours')), team_name TEXT NOT NULL DEFAULT '', team_omission TEXT NOT NULL DEFAULT '', withdrawal_status TEXT DEFAULT 'active', withdrawal_reason TEXT, withdrawal_requested_at DATETIME, withdrawal_processed_at DATETIME, withdrawal_processed_by TEXT, withdrawal_admin_comment TEXT,
    FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
    FOREIGN KEY (team_id) REFERENCES m_teams(team_id),
    UNIQUE(tournament_id, team_id)
);

-- t_tournaments
CREATE TABLE "t_tournaments" (
        tournament_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_name TEXT NOT NULL,
        format_id INTEGER NOT NULL,
        venue_id INTEGER NOT NULL,
        team_count INTEGER NOT NULL,
        court_count INTEGER NOT NULL,
        tournament_dates TEXT,
        match_duration_minutes INTEGER NOT NULL,
        break_duration_minutes INTEGER NOT NULL,
        status TEXT DEFAULT 'planning',
        visibility TEXT DEFAULT 'preparing',
        public_start_date TEXT,
        recruitment_start_date TEXT,
        recruitment_end_date TEXT,
        sport_type_id INTEGER,
        created_by TEXT,
        archive_ui_version TEXT,
        is_archived INTEGER DEFAULT 0,
        archived_at DATETIME,
        archived_by TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
      , files_count INTEGER DEFAULT 0);

-- Indexes
CREATE INDEX idx_archived_json_date 
      ON t_archived_tournament_json(archived_at)
    ;
CREATE INDEX idx_archived_json_version 
      ON t_archived_tournament_json(archive_version)
    ;
CREATE INDEX idx_tournament_files_order ON t_tournament_files(tournament_id, upload_order);
CREATE INDEX idx_tournament_files_public ON t_tournament_files(tournament_id, is_public);
CREATE INDEX idx_tournament_files_tournament_id ON t_tournament_files(tournament_id);
CREATE INDEX idx_tournament_rules_point_system ON t_tournament_rules(tournament_id, point_system);
CREATE INDEX idx_tournament_rules_tournament_phase ON t_tournament_rules(tournament_id, phase);
