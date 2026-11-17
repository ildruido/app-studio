-- The AI module's site-wide usage: AI tokens used by everyone together in one UTC day or month,
-- for the optional site-wide cap (AI_SITE_CAP_TOKENS). Safe to run again.
CREATE TABLE IF NOT EXISTS ai_site_usage (
  period  text   NOT NULL CHECK (period IN ('day', 'month')),
  starts  date   NOT NULL,
  tokens  bigint NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  PRIMARY KEY (period, starts)
);
