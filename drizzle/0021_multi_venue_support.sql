-- Step 1: Add map fields to m_venues
ALTER TABLE m_venues ADD COLUMN google_maps_url text;
ALTER TABLE m_venues ADD COLUMN latitude real;
ALTER TABLE m_venues ADD COLUMN longitude real;

-- Step 2: Add court_name and venue_id to t_matches_final
ALTER TABLE t_matches_final ADD COLUMN court_name text;
ALTER TABLE t_matches_final ADD COLUMN venue_id integer;

-- Step 3: Add court_name and venue_id to t_matches_live
ALTER TABLE t_matches_live ADD COLUMN court_name text;
ALTER TABLE t_matches_live ADD COLUMN venue_id integer;

-- Step 4: Add venue_id to t_tournament_courts
ALTER TABLE t_tournament_courts ADD COLUMN venue_id integer;

-- Step 5: Convert t_tournaments.venue_id from INTEGER to TEXT (JSON array)
-- Cannot ALTER COLUMN or DROP FK in SQLite, so rename + add new column
ALTER TABLE t_tournaments RENAME COLUMN venue_id TO venue_id_legacy;
ALTER TABLE t_tournaments ADD COLUMN venue_id text;
UPDATE t_tournaments SET venue_id = '[' || venue_id_legacy || ']' WHERE venue_id_legacy IS NOT NULL;
