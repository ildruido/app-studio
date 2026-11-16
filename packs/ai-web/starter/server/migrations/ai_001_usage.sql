-- The AI module's tables. Written to be safe on a database that already has them: an app that had
-- the AI before it became a module has `ai_usage` and `users.monthly_allowance` (from the web
-- pack's old 002 and 003 migrations), and this file then changes nothing.
-- AI tokens used per user per UTC month. No foreign key: the dev test user has no account.
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id  text   NOT NULL,
  month    date   NOT NULL,
  tokens   bigint NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  PRIMARY KEY (user_id, month)
);

-- AI tokens per month for one person; NULL means the server default.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_allowance bigint
  CHECK (monthly_allowance IS NULL OR monthly_allowance >= 0);
