-- 大会参加選手テーブルの作成
CREATE TABLE IF NOT EXISTS t_tournament_players (
    tournament_player_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    jersey_number INTEGER NOT NULL,
    player_status TEXT NOT NULL DEFAULT 'active',
    registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    withdrawal_date DATETIME,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
    FOREIGN KEY (team_id) REFERENCES m_teams(team_id),
    FOREIGN KEY (player_id) REFERENCES m_players(player_id),
    
    -- 同一大会・チーム内で背番号重複防止
    UNIQUE(tournament_id, team_id, jersey_number),
    -- 同一選手の重複参加防止
    UNIQUE(tournament_id, team_id, player_id)
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament_team 
ON t_tournament_players(tournament_id, team_id);

CREATE INDEX IF NOT EXISTS idx_tournament_players_player 
ON t_tournament_players(player_id);

CREATE INDEX IF NOT EXISTS idx_tournament_players_status 
ON t_tournament_players(player_status);