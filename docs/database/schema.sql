-- PK選手権大会システム DDL
-- Generated from KSM.md ER diagram

-- マスターテーブル

-- 会場マスター
CREATE TABLE IF NOT EXISTS m_venues (
    venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_name TEXT NOT NULL,
    address TEXT,
    available_courts INTEGER NOT NULL DEFAULT 4,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 大会フォーマットマスター
CREATE TABLE IF NOT EXISTS m_tournament_formats (
    format_id INTEGER PRIMARY KEY AUTOINCREMENT,
    format_name TEXT NOT NULL,
    target_team_count INTEGER NOT NULL,
    format_description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- チームマスター
CREATE TABLE IF NOT EXISTS m_teams (
    team_id TEXT PRIMARY KEY,
    team_name TEXT NOT NULL,
    team_omission TEXT,
    contact_person TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    representative_player_id INTEGER,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 選手マスター
CREATE TABLE IF NOT EXISTS m_players (
    player_id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    jersey_number INTEGER,
    current_team_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_team_id) REFERENCES m_teams(team_id)
);

-- 管理者マスター
CREATE TABLE IF NOT EXISTS m_administrators (
    admin_login_id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 試合テンプレートマスター
CREATE TABLE IF NOT EXISTS m_match_templates (
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (format_id) REFERENCES m_tournament_formats(format_id)
);

-- トランザクションテーブル

-- 大会テーブル
CREATE TABLE IF NOT EXISTS t_tournaments (
    tournament_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_name TEXT NOT NULL,
    format_id INTEGER NOT NULL,
    venue_id INTEGER NOT NULL,
    team_count INTEGER NOT NULL,
    court_count INTEGER NOT NULL DEFAULT 4,
    tournament_dates TEXT, -- JSON形式: {"1": "2024-02-01", "2": "2024-02-03"}
    match_duration_minutes INTEGER NOT NULL DEFAULT 15,
    break_duration_minutes INTEGER NOT NULL DEFAULT 5,
    win_points INTEGER NOT NULL DEFAULT 3,
    draw_points INTEGER NOT NULL DEFAULT 1,
    loss_points INTEGER NOT NULL DEFAULT 0,
    walkover_winner_goals INTEGER NOT NULL DEFAULT 3,
    walkover_loser_goals INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'ongoing', 'completed')),
    is_public INTEGER NOT NULL DEFAULT 0,
    event_start_date TEXT NOT NULL, -- 最初の開催日（表示用）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (format_id) REFERENCES m_tournament_formats(format_id),
    FOREIGN KEY (venue_id) REFERENCES m_venues(venue_id)
);

-- 大会参加チームテーブル
CREATE TABLE IF NOT EXISTS t_tournament_teams (
    tournament_team_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    assigned_block TEXT,
    block_position INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
    FOREIGN KEY (team_id) REFERENCES m_teams(team_id),
    UNIQUE(tournament_id, team_id)
);

-- 大会参加選手テーブル
CREATE TABLE IF NOT EXISTS t_tournament_players (
    tournament_player_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    jersey_number INTEGER,
    player_status TEXT NOT NULL DEFAULT 'active',
    registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    withdrawal_date DATETIME,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
    FOREIGN KEY (team_id) REFERENCES m_teams(team_id),
    FOREIGN KEY (player_id) REFERENCES m_players(player_id),
    UNIQUE(tournament_id, team_id, player_id)
);

-- 試合ブロックテーブル
CREATE TABLE IF NOT EXISTS t_match_blocks (
    match_block_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    phase TEXT NOT NULL,
    display_round_name TEXT,
    block_name TEXT NOT NULL,
    match_type TEXT NOT NULL,
    block_order INTEGER NOT NULL DEFAULT 0,
    team_rankings TEXT, -- JSON形式
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id)
);

-- 試合ライブテーブル（進行中・結果入力中）
CREATE TABLE IF NOT EXISTS t_matches_live (
    match_id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_block_id INTEGER NOT NULL,
    tournament_date TEXT NOT NULL, -- JSON形式
    match_number INTEGER NOT NULL,
    match_code TEXT NOT NULL,
    team1_id TEXT,
    team2_id TEXT,
    team1_display_name TEXT NOT NULL,
    team2_display_name TEXT NOT NULL,
    court_number INTEGER,
    start_time TEXT,
    team1_goals INTEGER NOT NULL DEFAULT 0,
    team2_goals INTEGER NOT NULL DEFAULT 0,
    winner_team_id TEXT,
    is_draw INTEGER NOT NULL DEFAULT 0,
    is_walkover INTEGER NOT NULL DEFAULT 0,
    match_status TEXT NOT NULL DEFAULT 'scheduled' CHECK (match_status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
    result_status TEXT NOT NULL DEFAULT 'none' CHECK (result_status IN ('none', 'pending', 'confirmed')),
    remarks TEXT,
    entered_by TEXT,
    entered_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id),
    FOREIGN KEY (team1_id) REFERENCES m_teams(team_id),
    FOREIGN KEY (team2_id) REFERENCES m_teams(team_id),
    FOREIGN KEY (winner_team_id) REFERENCES m_teams(team_id)
);

-- 試合確定テーブル（確定済み結果）
CREATE TABLE IF NOT EXISTS t_matches_final (
    match_id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_block_id INTEGER NOT NULL,
    tournament_date TEXT NOT NULL, -- JSON形式
    match_number INTEGER NOT NULL,
    match_code TEXT NOT NULL,
    team1_id TEXT,
    team2_id TEXT,
    team1_display_name TEXT NOT NULL,
    team2_display_name TEXT NOT NULL,
    court_number INTEGER,
    start_time TEXT,
    team1_goals INTEGER NOT NULL DEFAULT 0,
    team2_goals INTEGER NOT NULL DEFAULT 0,
    winner_team_id TEXT,
    is_draw INTEGER NOT NULL DEFAULT 0,
    is_walkover INTEGER NOT NULL DEFAULT 0,
    remarks TEXT,
    confirmed_by TEXT,
    confirmed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id),
    FOREIGN KEY (team1_id) REFERENCES m_teams(team_id),
    FOREIGN KEY (team2_id) REFERENCES m_teams(team_id),
    FOREIGN KEY (winner_team_id) REFERENCES m_teams(team_id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON t_tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_public ON t_tournaments(is_public);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament ON t_tournament_teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_team ON t_tournament_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament_team ON t_tournament_players(tournament_id, team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON t_tournament_players(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_status ON t_tournament_players(player_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_players_jersey_unique ON t_tournament_players(tournament_id, team_id, jersey_number) WHERE jersey_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_match_blocks_tournament ON t_match_blocks(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_live_block ON t_matches_live(match_block_id);
CREATE INDEX IF NOT EXISTS idx_matches_live_status ON t_matches_live(match_status);
CREATE INDEX IF NOT EXISTS idx_matches_live_result_status ON t_matches_live(result_status);
CREATE INDEX IF NOT EXISTS idx_matches_final_block ON t_matches_final(match_block_id);

-- 外部キー制約は各テーブル作成時に定義済み