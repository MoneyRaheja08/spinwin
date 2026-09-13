-- Run ONCE against your existing Render database before deploying the
-- "per day limit" update. Safe to run more than once.
ALTER TABLE prize_rules ADD COLUMN IF NOT EXISTS daily_limit integer;
