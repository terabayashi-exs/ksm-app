-- PK選手権大会システム DDL
-- Generated from ksm-dev database
-- Date: 2025-08-25

-- m_administrators
CREATE TABLE "m_administrators" (
  admin_login_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
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
        day_number INTEGER NOT NULL DEFAULT 1,
        execution_priority INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (format_id) REFERENCES m_tournament_formats(format_id)
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
);

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
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
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
        team_count INTEGER NOT NULL DEFAULT 0,
        court_count INTEGER NOT NULL DEFAULT 4,
        tournament_dates TEXT,
        match_duration_minutes INTEGER NOT NULL DEFAULT 15,
        break_duration_minutes INTEGER NOT NULL DEFAULT 5,
        win_points INTEGER NOT NULL DEFAULT 3,
        draw_points INTEGER NOT NULL DEFAULT 1,
        loss_points INTEGER NOT NULL DEFAULT 0,
        walkover_winner_goals INTEGER NOT NULL DEFAULT 3,
        walkover_loser_goals INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'planning',
        visibility TEXT NOT NULL DEFAULT 'preparing',
        public_start_date DATE,
        recruitment_start_date DATE,
        recruitment_end_date DATE,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        cancelled_match_points INTEGER NOT NULL DEFAULT 1,
        cancelled_team1_goals INTEGER NOT NULL DEFAULT 0,
        cancelled_team2_goals INTEGER NOT NULL DEFAULT 0
      );

-- Indexes
CREATE INDEX idx_tournaments_status ON t_tournaments(status);
