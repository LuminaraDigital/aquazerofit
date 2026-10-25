-- AZF-P1 Fight Camp: the engage schema (PRD §4.2), minus gifts (0002).
--
-- Forward-only. Never edit a migration that has shipped: add the next number.
-- The runner creates the schema and engage.schema_migrations itself, inside
-- the same transaction and advisory lock, so this file holds only tables.
--
-- Conventions:
--  * user ids are TEXT to match document-store ids; there are no foreign keys
--    into `documents`, which is a different persistence model.
--  * every timestamp is written by the service (so a pinned test clock and
--    the database agree); the DEFAULTs are only a backstop.
--  * no raw Telegram id, chat id, phone number or contact list is stored.

-- Fight Camp enrolment: a commitment marker that never gates belts.
CREATE TABLE engage.season_enrolments (
  user_id        TEXT NOT NULL,
  season_number  INTEGER NOT NULL CHECK (season_number >= 1),
  source         TEXT NOT NULL CHECK (source IN ('dashboard', 'recap', 'squad', 'deeplink')),
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_number)
);
CREATE INDEX season_enrolments_by_season ON engage.season_enrolments (season_number);

-- Squads. created_by is nullable so erasure can drop the creator's id while
-- the squad lives on for its other members.
CREATE TABLE engage.squads (
  id                     TEXT PRIMARY KEY,
  season_number          INTEGER NOT NULL CHECK (season_number >= 1),
  name                   TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 32),
  invite_code            TEXT NOT NULL UNIQUE,
  tg_chat_instance_hash  TEXT NULL,
  max_members            SMALLINT NOT NULL DEFAULT 5 CHECK (max_members BETWEEN 2 AND 5),
  created_by             TEXT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at            TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX squads_corner_per_season
  ON engage.squads (season_number, tg_chat_instance_hash)
  WHERE tg_chat_instance_hash IS NOT NULL AND archived_at IS NULL;
CREATE INDEX squads_by_creator ON engage.squads (created_by, created_at);

CREATE TABLE engage.squad_members (
  squad_id       TEXT NOT NULL REFERENCES engage.squads(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  member_ref     TEXT NOT NULL UNIQUE,
  season_number  INTEGER NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  show_stats     BOOLEAN NOT NULL DEFAULT false,
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at        TIMESTAMPTZ NULL,
  PRIMARY KEY (squad_id, user_id)
);
CREATE UNIQUE INDEX one_active_squad_per_season
  ON engage.squad_members (user_id, season_number) WHERE left_at IS NULL;
CREATE INDEX squad_members_active ON engage.squad_members (squad_id) WHERE left_at IS NULL;

-- Cheers: one of five fixed emoji, never free text.
CREATE TABLE engage.cheers (
  id            TEXT PRIMARY KEY,
  from_kind     TEXT NOT NULL CHECK (from_kind IN ('member', 'coach')),
  from_user_id  TEXT NULL,
  coach_id      TEXT NULL,
  to_user_id    TEXT NOT NULL,
  squad_id      TEXT NULL REFERENCES engage.squads(id) ON DELETE SET NULL,
  cheer         TEXT NOT NULL CHECK (cheer IN ('glove', 'fire', 'muscle', 'clap', 'water')),
  local_date    DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at       TIMESTAMPTZ NULL,
  CHECK (
    (from_kind = 'member' AND coach_id IS NULL)
    OR (from_kind = 'coach' AND from_user_id IS NULL AND coach_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX one_member_cheer_per_day
  ON engage.cheers (from_user_id, to_user_id, local_date) WHERE from_kind = 'member';
CREATE UNIQUE INDEX one_coach_cheer_per_day
  ON engage.cheers (to_user_id, local_date) WHERE from_kind = 'coach';
CREATE INDEX cheers_inbox ON engage.cheers (to_user_id, created_at DESC);
CREATE INDEX cheers_sent ON engage.cheers (from_user_id) WHERE from_user_id IS NOT NULL;

-- Cut Man grace: append-only. Earned only through activity; no billing path
-- writes here (enforced by a static test).
CREATE TABLE engage.grace_ledger (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  entry          TEXT NOT NULL CHECK (entry IN ('earned', 'applied')),
  season_number  INTEGER NOT NULL,
  local_date     DATE NOT NULL,
  milestone      SMALLINT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((entry = 'earned') = (milestone IS NOT NULL))
);
CREATE UNIQUE INDEX grace_earned_once
  ON engage.grace_ledger (user_id, season_number, milestone) WHERE entry = 'earned';
CREATE UNIQUE INDEX grace_applied_once
  ON engage.grace_ledger (user_id, local_date) WHERE entry = 'applied';

-- Outbound bot nudges: at most one per user per local day, across all kinds.
CREATE TABLE engage.nudge_log (
  user_id     TEXT NOT NULL,
  local_date  DATE NOT NULL,
  kind        TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, local_date)
);

-- Share Kit attribution. One reusable link per (user, kind, season).
CREATE TABLE engage.share_links (
  code           TEXT PRIMARY KEY CHECK (code ~ '^[A-Za-z0-9]{8}$'),
  user_id        TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('belt', 'season', 'recap', 'squad_invite', 'week')),
  season_number  INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX share_link_reuse ON engage.share_links (user_id, kind, season_number);

-- First touch wins: one row per invitee, ever.
CREATE TABLE engage.referral_attributions (
  invitee_user_id  TEXT PRIMARY KEY,
  share_code       TEXT NULL REFERENCES engage.share_links(code) ON DELETE SET NULL,
  squad_id         TEXT NULL REFERENCES engage.squads(id) ON DELETE SET NULL,
  surface          TEXT NOT NULL CHECK (surface IN ('web', 'tma')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX referral_attributions_by_code ON engage.referral_attributions (share_code);
