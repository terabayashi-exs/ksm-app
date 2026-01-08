-- スクリプト名: create-announcements-table.sql
-- 目的: お知らせ機能用のテーブルを作成
-- 実行日: 2026-01-08

-- お知らせテーブル作成
CREATE TABLE IF NOT EXISTS t_announcements (
    announcement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
    FOREIGN KEY (created_by) REFERENCES m_administrators(admin_login_id)
);

-- 表示順序と公開状態で効率的にソートするためのインデックス
CREATE INDEX IF NOT EXISTS idx_announcements_display
ON t_announcements(status, display_order, created_at DESC);

-- 確認用クエリ
-- SELECT * FROM t_announcements ORDER BY display_order ASC, created_at DESC;
