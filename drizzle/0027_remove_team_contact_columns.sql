-- 0027: m_teams から contact_person, contact_email カラムを削除
-- これらのフィールドはスキーマから既に削除済みだが、マイグレーションファイルが欠落していた

ALTER TABLE m_teams DROP COLUMN contact_person;
ALTER TABLE m_teams DROP COLUMN contact_email;
