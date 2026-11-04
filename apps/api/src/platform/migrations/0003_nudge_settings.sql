-- AZF-P1 S6: bot message kinds a person switched off. Absent means on; the
-- master switch is the existing `reminders` consent, which no row here
-- overrides.

CREATE TABLE engage.nudge_settings (
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('cheer')),
  enabled     BOOLEAN NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
