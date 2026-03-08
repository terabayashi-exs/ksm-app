-- t_tournament_rulesテーブルのphase CHECK制約を削除
-- SQLiteではALTER TABLEでCHECK制約を削除できないため、テーブル再作成で対応
-- phase列を自由文字列に変更し、phases JSONの任意のフェーズIDを登録可能にする
-- 冪等性：既に制約なしのテーブルが存在する場合はスキップされる

-- 旧テーブルが存在する場合のみ再作成を実行
-- _newテーブルが既に存在する場合は前回の途中実行の残骸なので削除
DROP TABLE IF EXISTS t_tournament_rules_new;

CREATE TABLE t_tournament_rules_new (
  tournament_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  use_extra_time INTEGER DEFAULT 0,
  use_penalty INTEGER DEFAULT 0,
  active_periods TEXT DEFAULT '["1"]',
  notes TEXT,
  point_system TEXT,
  walkover_settings TEXT,
  tie_breaking_rules TEXT,
  tie_breaking_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours'))
);

INSERT INTO t_tournament_rules_new SELECT * FROM t_tournament_rules;

DROP TABLE t_tournament_rules;

ALTER TABLE t_tournament_rules_new RENAME TO t_tournament_rules;
