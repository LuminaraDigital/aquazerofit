# AZF-P1 Fight Camp: build record

Build log for AquaZeroFit Phase 1 "Fight Record Engagement (Off-Chain)",
PRD AZF-P1-FR v1.0 (25 Oct 2026), built on top of AZF-W3-05 R1a. One line per
slice as it lands; each slice is one commit (and one pull request into
`staging` when the founder asks for them).

Everything here ships dark. Every route answers 404 and every surface renders
nothing unless `FIGHT_RECORD_ENABLED`, the slice's own `FC_*` sub-flag and the
rollout bucket all pass. Production enablement is a separate step that needs
the founder's explicit yes, the Stars P0 check (PRD §8.1) and counsel sign-off
on the items in PRD §8.

## Changelog

| Slice | Date | What landed |
|---|---|---|
| S1 | 2026-10-25 | `engage` Postgres schema (`0001_engage_init.sql`), forward-only migration runner under a transaction-scoped advisory lock, run at boot after the store; `platform/sql.ts` over the existing pool (no second pool); `EngageRepo` with Postgres and in-memory adapters and one contract suite run on both (PGlite in-process on every run, a real server in CI); export and erasure cover every engage table, enforced by a table-enumeration test; `FC_*` sub-flags in `platform/fightCampConfig.ts` and the composed `fcEnabled` gate; env vars documented, commented out, in all three env examples |
| S2 | 2026-10-25 | `POST /fight-camp/enrolments` (201 first, 200 idempotent repeat) behind `FC_ENROL_ENABLED`; additive `fightCamp` block on `GET /fight-record` (absent while every sub-flag is off, so R1a and Android see no change); one accent and one coach line per season keyed by `season % 6`; SeasonCard "Join Fight Camp: Season N" as the primary action in the first 14 days, a quiet text action after; `fc_enrolled` server event; banned-copy scans over API strings and rendered cards |

## Conflicts with the PRD, resolved in favour of the code (PRD §0.6)

| PRD says | Code does | Why |
|---|---|---|
| `FIGHT_RECORD_ROLLOUT_PERCENT` defaults to 0 | Unset means 100; unparseable means 0 | Built and tested in R1a: the master switch alone decides, and a typo fails toward fewer people |
| Errors such as `409 squad_full`, `403 squad_adult_only` | The shared taxonomy code (`CONFLICT`, `FORBIDDEN`, `NOT_FOUND`) with the PRD's name in `details.reason` | `ErrorCode` is a closed set shared with Android; a new code would be a breaking contract change for a client that is out of scope |
| `GET /fight-record` returns 404 when off | R1a answers `{ fightRecord: null }` (unchanged); the new Fight Camp routes answer 404 | R1a behaviour is built and tested; clients already treat null as "hide" |
| `squads.created_by NOT NULL` | Nullable | Erasure must drop the creator's id while the squad lives on for its other members |
| Flags in `platform/config.ts` | `platform/fightCampConfig.ts` | `config.ts` is at the 1,000-line ceiling |
