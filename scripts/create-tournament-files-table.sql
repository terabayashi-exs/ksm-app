-- 大会ファイル管理テーブル作成SQL
-- Phase 1: ファイルアップロード機能の基盤構築

-- t_tournament_files テーブル作成
CREATE TABLE IF NOT EXISTS t_tournament_files (
  file_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  file_title TEXT NOT NULL,                    -- ユーザー指定タイトル（例：「駐車場案内」）
  file_description TEXT,                       -- ファイル説明（オプション）
  original_filename TEXT NOT NULL,             -- 元のファイル名
  blob_url TEXT NOT NULL,                      -- Vercel Blob Storage URL
  file_size INTEGER NOT NULL,                  -- ファイルサイズ（バイト）
  mime_type TEXT NOT NULL DEFAULT 'application/pdf', -- MIME型
  upload_order INTEGER DEFAULT 0,              -- 表示順序
  is_public BOOLEAN DEFAULT 1,                 -- 公開フラグ
  uploaded_by TEXT NOT NULL,                   -- アップロード者（管理者ID）
  uploaded_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  
  FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_tournament_files_tournament_id ON t_tournament_files(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_files_public ON t_tournament_files(tournament_id, is_public);
CREATE INDEX IF NOT EXISTS idx_tournament_files_order ON t_tournament_files(tournament_id, upload_order);

-- 既存テーブル拡張（統計情報追加）
ALTER TABLE t_tournaments ADD COLUMN files_count INTEGER DEFAULT 0;