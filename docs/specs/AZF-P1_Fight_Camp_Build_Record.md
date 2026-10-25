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
| S3 | 2026-10-25 | Cut Man grace behind `FC_GRACE_ENABLED`: one day earned per 7 active days in a season, bank folded over the append-only ledger with the cap applied at each earn (the PRD's `min(2, earned - applied)` would let surplus accumulate invisibly), carried across seasons; `computeConsistency(activity, today, { bridgedDates })` with a byte-identical default (digest of 400 seeded histories recorded against 6a80efd); `planCutManBridges` spends only on a gap inside the last 7 days that reaches another active day; achievements keep the un-bridged run; `GET /grace`, `fightCamp.grace`, bridged `/progress/summary`; calm "Cut Man stepped in on Tue" note, "Keep it simple today: log one glass of water" quick-add, "Cut Man: N in your corner" chip; static import-graph test proves no billing or payments module can reach the ledger writer |
| S3 review | 2026-10-25 | Planner bridges the newest misses and leaves the built-in grace day for the one behind them (fewest bridges for the longest run); a bridge is written only after something is logged after the gap ("standing by" until then, nothing spent while away); every grace sync runs under a per-user advisory lock and the bank folds in database write order (`seq`); engage faults degrade `/progress/summary`, `/fight-record` and the coach card to the plain run instead of failing them; one-tap water log replaces a deep link nothing read |
| S4 | 2026-10-25 | Squads behind `FC_SQUADS_ENABLED`, adults only: `GET /squads/peek/:code` (public, names nobody, 30/min/IP), `GET /squads/current`, `POST /squads` (5 a day), `POST /squads/join`, `POST /squads/:id/leave`, `PATCH /squads/:id/me`; consent required server-side (`consent: true`, audited with `squad-consent-v1`); belts read without writing (`seasonBeltTier`); weekly board counts active days 0 to 7, ties share a rank, nobody is last, "Warming up" and "Numbers hidden" groups; `/squad` page and public `/s/:code` invite landing; IDOR test per member-scoped route; cross-user reads audited |
| S5 | 2026-10-25 | Squad Corner: `POST /squads/corner` (peek, create, join) verifies the signed initData itself, requires it to belong to the caller's linked Telegram account and a group or supergroup, and stores the group only as `HMAC-SHA256(ENGAGE_HMAC_SECRET, chat_instance)` (unset or short secret: 404); one live corner per group per season; `POST /squads/:id/invite-message` prepares a fixed-copy message with `savePreparedInlineMessage` for `WebApp.shareMessage`, or answers null for the share-link fallback; `startapp=sq_<code>` opens `/s/<code>` at launch; corner sheet asked once per session, only on a group launch; `squad_corner_opened` growth event; `TELEGRAM_BOT_USERNAME` / `TELEGRAM_MINI_APP_SHORT_NAME` build the invite link server-side |

## Conflicts with the PRD, resolved in favour of the code (PRD §0.6)

| PRD says | Code does | Why |
|---|---|---|
| `FIGHT_RECORD_ROLLOUT_PERCENT` defaults to 0 | Unset means 100; unparseable means 0 | Built and tested in R1a: the master switch alone decides, and a typo fails toward fewer people |
| Errors such as `409 squad_full`, `403 squad_adult_only` | The shared taxonomy code (`CONFLICT`, `FORBIDDEN`, `NOT_FOUND`) with the PRD's name in `details.reason` | `ErrorCode` is a closed set shared with Android; a new code would be a breaking contract change for a client that is out of scope |
| `GET /fight-record` returns 404 when off | R1a answers `{ fightRecord: null }` (unchanged); the new Fight Camp routes answer 404 | R1a behaviour is built and tested; clients already treat null as "hide" |
| `squads.created_by NOT NULL` | Nullable | Erasure must drop the creator's id while the squad lives on for its other members |
| Flags in `platform/config.ts` | `platform/fightCampConfig.ts` | `config.ts` is at the 1,000-line ceiling |
| Grace bank is `min(2, earned_total - applied_total)` | Folded over the ledger in write order, cap applied at each earn | The PRD formula never spends a banked surplus: earn 10, spend 2, it still reads 2 |
| Join and create bodies are `{ code }` and `{ name }` | Both also require `consent: true` | The consent screen (PRD §8.4) is enforced by the server and audited, not only shown by the client |
| `POST /squads/:id/invite-message` answers `501 unsupported` for the fallback | `200 { preparedMessageId: null }` | 501 is outside the shared error taxonomy, and "use the share link" is an expected outcome, not an error |
| `POST /squads/corner` validates initData | Also requires the initData user to be the caller's linked Telegram account | Otherwise a signed launch from someone else's group (shared or replayed within the freshness window) could bind or join that group's corner |
