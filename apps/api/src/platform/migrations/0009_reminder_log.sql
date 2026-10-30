-- Telegram reminders (Settings > Notifications): one row per person, local
-- day and slot, inserted before the bot call. The primary key is the claim,
-- so neither a restart mid-window nor two API revisions overlapping during a
-- rollout can send the same reminder twice. The document store cannot give
-- that guarantee: each instance holds its own in-memory copy.

CREATE TABLE engage.reminder_log (
  user_id     TEXT NOT NULL,
  local_date  DATE NOT NULL,
  slot        TEXT NOT NULL,
  claimed_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, local_date, slot)
);

CREATE INDEX reminder_log_local_date ON engage.reminder_log (local_date);
