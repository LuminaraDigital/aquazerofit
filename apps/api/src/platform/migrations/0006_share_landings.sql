-- AZF-P1 S10: share link opens per day, kind and surface. A counter, with
-- no code and no person in it, so the share-to-install metric has a
-- denominator without keeping who opened what.

CREATE TABLE engage.share_landings (
  day      DATE NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('belt', 'season', 'recap', 'squad_invite', 'week')),
  surface  TEXT NOT NULL CHECK (surface IN ('web', 'tma')),
  opens    INTEGER NOT NULL DEFAULT 0 CHECK (opens >= 0),
  PRIMARY KEY (day, kind, surface)
);
