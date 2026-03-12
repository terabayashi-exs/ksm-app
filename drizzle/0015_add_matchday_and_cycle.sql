-- リーグ戦対応: 節(matchday)と巡目(cycle)フィールド追加
-- m_match_templatesテーブルにmatchdayとcycleカラムを追加

ALTER TABLE `m_match_templates`
ADD COLUMN `matchday` integer;

ALTER TABLE `m_match_templates`
ADD COLUMN `cycle` integer DEFAULT 1;
