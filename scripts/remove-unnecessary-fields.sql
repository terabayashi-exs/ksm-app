-- 不要なフィールドを削除（既存の次戦進出システムと重複するため）
-- 順位設定には loser_position_start, loser_position_end, winner_position のみで十分

-- winner_advances_to_match_code フィールドを削除
-- （既存の team1_source/team2_source システムで十分）
ALTER TABLE m_match_templates DROP COLUMN winner_advances_to_match_code;

-- match_stage フィールドを削除  
-- （順位設定には不要、position_noteで十分）
ALTER TABLE m_match_templates DROP COLUMN match_stage;