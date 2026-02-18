ALTER TABLE m_login_users ADD COLUMN current_plan_id INTEGER REFERENCES m_subscription_plans(plan_id);
