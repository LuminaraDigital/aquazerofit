-- AZF-P1 S5/S6 review: when an owner takes a member out of a squad. A
-- removed member cannot rejoin that squad this season, by any route.

ALTER TABLE engage.squad_members ADD COLUMN removed_at TIMESTAMPTZ NULL;
