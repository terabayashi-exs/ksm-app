-- scripts/add-tournament-match-overrides.sql
-- 大会別試合進出条件オーバーライドテーブル

CREATE TABLE IF NOT EXISTS t_tournament_match_overrides (
  override_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  match_code TEXT NOT NULL,
  team1_source_override TEXT,
  team2_source_override TEXT,
  override_reason TEXT,
  overridden_by TEXT,
  overridden_at TEXT DEFAULT (datetime('now', '+9 hours')),
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours')),
  UNIQUE(tournament_id, match_code),
  FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tournament_match_overrides_tournament ON t_tournament_match_overrides(tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_match_overrides_match_code ON t_tournament_match_overrides(match_code);

-- コメント（SQLiteではCOMMENT構文はないため、ドキュメントとして記載）
-- t_tournament_match_overrides: 大会別の試合進出条件オーバーライド
-- - NULL値の場合は、m_match_templatesの元の条件を使用
-- - 値が設定されている場合は、その値で元の条件を上書き
-- - 使用例: チーム辞退により進出条件を変更する必要がある場合
