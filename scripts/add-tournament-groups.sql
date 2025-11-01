-- 大会グループ化機能のためのデータベース拡張
-- Date: 2025-10-30

-- 1. 大会グループマスターテーブルの作成
CREATE TABLE IF NOT EXISTS m_tournament_groups (
  group_id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL,              -- 例: "第11回とやまPK選手権大会"
  group_description TEXT,                -- グループの説明
  group_color TEXT DEFAULT '#3B82F6',    -- 管理画面での色分け用
  display_order INTEGER DEFAULT 0,       -- グループの表示順
  created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
);

-- 2. t_tournamentsテーブルにグループ関連フィールドを追加
ALTER TABLE t_tournaments ADD COLUMN group_id INTEGER;
ALTER TABLE t_tournaments ADD COLUMN group_order INTEGER DEFAULT 0;
ALTER TABLE t_tournaments ADD COLUMN category_name TEXT;

-- 3. 外部キー制約を追加（SQLiteでは後から追加できないため、インデックスのみ作成）
CREATE INDEX idx_tournaments_group_id ON t_tournaments(group_id);
CREATE INDEX idx_tournament_groups_display_order ON m_tournament_groups(display_order);

-- 4. サンプルデータの投入（コメントアウト - 必要に応じて実行）
-- INSERT INTO m_tournament_groups (group_name, group_description, group_color, display_order)
-- VALUES 
--   ('第11回とやまPK選手権大会', 'in 富山県総合運動公園', '#3B82F6', 1),
--   ('第10回とやまPK選手権大会', '過去大会アーカイブ', '#10B981', 2);

-- 5. 既存大会のグループ化（コメントアウト - 必要に応じて実行）
-- UPDATE t_tournaments 
-- SET 
--   group_id = 1,
--   group_order = CASE 
--     WHEN tournament_name LIKE '%U-10%' THEN 1
--     WHEN tournament_name LIKE '%U-12%' THEN 2
--     WHEN tournament_name LIKE '%U-15%' THEN 3
--     WHEN tournament_name LIKE '%一般%' THEN 4
--     WHEN tournament_name LIKE '%シニア%' THEN 5
--     ELSE 99
--   END,
--   category_name = CASE
--     WHEN tournament_name LIKE '%U-10%' THEN 'U-10の部'
--     WHEN tournament_name LIKE '%U-12%' THEN 'U-12の部'
--     WHEN tournament_name LIKE '%U-15%' THEN 'U-15の部'
--     WHEN tournament_name LIKE '%一般%' THEN '一般の部'
--     WHEN tournament_name LIKE '%シニア%' THEN 'シニアの部'
--     ELSE NULL
--   END
-- WHERE tournament_name LIKE '%第11回とやまPK選手権大会%';