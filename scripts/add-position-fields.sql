-- m_match_templatesテーブルに順位決定フィールドを追加
-- 敗者順位設定用フィールド
ALTER TABLE m_match_templates ADD COLUMN loser_position_start INTEGER;
ALTER TABLE m_match_templates ADD COLUMN loser_position_end INTEGER;

-- 勝者次戦進出設定用フィールド  
ALTER TABLE m_match_templates ADD COLUMN winner_advances_to_match_code TEXT;

-- 試合段階識別用フィールド
ALTER TABLE m_match_templates ADD COLUMN match_stage TEXT;

-- 順位説明用フィールド
ALTER TABLE m_match_templates ADD COLUMN position_note TEXT;

-- 勝者順位設定用フィールド（決勝戦などで使用）
ALTER TABLE m_match_templates ADD COLUMN winner_position INTEGER;