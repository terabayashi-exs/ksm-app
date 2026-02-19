PRAGMA foreign_keys = OFF;
CREATE TABLE "m_teams_new" (
  team_id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  team_omission TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  representative_player_id INTEGER,
  password_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  registration_type TEXT DEFAULT 'self_registered'
);
INSERT INTO "m_teams_new" SELECT team_id, team_name, team_omission, contact_person, contact_email, contact_phone, representative_player_id, password_hash, is_active, created_at, updated_at, registration_type FROM "m_teams";
DROP TABLE "m_teams";
ALTER TABLE "m_teams_new" RENAME TO "m_teams";
PRAGMA foreign_keys = ON;
