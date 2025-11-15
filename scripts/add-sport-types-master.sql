-- ==========================================
-- 競技種別マスタと大会ルール設定のテーブル作成
-- ==========================================

-- 🏟️ 競技種別マスタテーブル
CREATE TABLE IF NOT EXISTS m_sport_types (
  sport_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport_name TEXT NOT NULL,                    -- 競技名（表示用）
  sport_code TEXT UNIQUE NOT NULL,             -- 競技コード（システム用）
  max_period_count INTEGER NOT NULL,           -- 最大ピリオド数
  regular_period_count INTEGER NOT NULL,       -- 通常ピリオド数
  score_type TEXT NOT NULL DEFAULT 'numeric',  -- スコアタイプ: 'numeric', 'time', 'rank'
  default_match_duration INTEGER,              -- デフォルト試合時間（分）
  score_unit TEXT DEFAULT 'ゴール',            -- スコア単位表示
  period_definitions TEXT NOT NULL,            -- ピリオド定義（JSON形式）
  result_format TEXT DEFAULT 'score',          -- 結果フォーマット: 'score', 'time', 'ranking'
  created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
);

-- 🏆 大会ルール設定テーブル
CREATE TABLE IF NOT EXISTS t_tournament_rules (
  tournament_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  phase TEXT NOT NULL,                         -- フェーズ: 'preliminary' or 'final'
  use_extra_time BOOLEAN DEFAULT 0,            -- 延長使用フラグ
  use_penalty BOOLEAN DEFAULT 0,               -- PK戦使用フラグ
  active_periods TEXT NOT NULL,                -- 使用するピリオドID（JSON配列）
  win_condition TEXT DEFAULT 'score',          -- 勝利条件: 'score', 'penalty', 'draw_allowed'
  notes TEXT,                                  -- 備考
  created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (tournament_id) REFERENCES t_tournaments (tournament_id),
  UNIQUE (tournament_id, phase)                -- 大会・フェーズの組み合わせは一意
);

-- 既存のm_tournament_formatsテーブルに競技種別を追加
ALTER TABLE m_tournament_formats ADD COLUMN sport_type_id INTEGER DEFAULT 1;

-- 既存のt_tournamentsテーブルに競技種別を追加（フォーマットから継承）
ALTER TABLE t_tournaments ADD COLUMN sport_type_id INTEGER DEFAULT 1;