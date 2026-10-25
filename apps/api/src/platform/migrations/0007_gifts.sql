-- AZF-P1 Epic G: a week of Premium gifted to a squad mate, paid in Telegram
-- Stars (PRD §4.2, US-G1). Optional and separately flagged.
--
-- This row is a financial record: erasure nulls the people in it and keeps
-- the row, for tax and refund handling. No Telegram id is kept here; a
-- refund reaches the payer through their linked account.

CREATE TABLE engage.gifts (
  id                          TEXT PRIMARY KEY,
  gifter_user_id              TEXT NULL,
  recipient_user_id           TEXT NULL,
  squad_id                    TEXT NULL REFERENCES engage.squads(id) ON DELETE SET NULL,
  product                     TEXT NOT NULL CHECK (product = 'premium_7d'),
  rail                        TEXT NOT NULL CHECK (rail = 'stars'),
  stars_amount                INTEGER NOT NULL CHECK (stars_amount > 0),
  invoice_payload             TEXT NOT NULL UNIQUE,
  telegram_payment_charge_id  TEXT NULL UNIQUE,
  status                      TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'granted', 'refunded', 'failed')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_at                  TIMESTAMPTZ NULL,
  refunded_at                 TIMESTAMPTZ NULL
);
CREATE INDEX gifts_by_gifter ON engage.gifts (gifter_user_id);
CREATE INDEX gifts_by_recipient ON engage.gifts (recipient_user_id, granted_at);
