# Track A — wger Architecture & API Surface (research brief)

## Key Findings
- wger is a mature, actively maintained Django/DRF monolith (Python ≥3.12). Master is at `2.7.0-alpha1`; latest stable release **2.6**; release cadence roughly every 2–4 months (2.3 → 2.4 → 2.5 → 2.6), commits several times per week (active as of Jul 2026).
- REST API v2 exposes ~55 endpoints across routines, exercises, nutrition, weight, measurements, gallery, trophies. OpenAPI schema auto-generated via drf-spectacular at `/api/v2/schema` (+ Swagger UI at `/api/v2/schema/ui`).
- v2.5 and v2.6 shipped **breaking changes**: removed legacy search/token endpoints; many model IDs changed int→UUID (client-generated, for offline sync). Pin assumptions to 2.6+.
- Public wger.de throttles only *scoped* hot endpoints (ingredients, exercise creation, login); reference data reads are otherwise unthrottled at the app layer. For heavy use, self-hosting or the bulk ingredient dump is the intended path.
- License split: code AGPL-3.0-or-later; exercise/ingredient data CC per-entry (`license` endpoint, per-object `license`/`license_author` fields); docs CC-BY-SA-4.0.

## Tech Stack (from `pyproject.toml` on master)
- Django `~=6.0.6`, djangorestframework `~=3.17.1`, django-filter `~=26.1`, drf-spectacular `~=0.30.0` (OpenAPI).
- Auth: djangorestframework-simplejwt `~=5.5.1` (**RS256**, access 5 min, refresh 120 days default, rotation + blacklist since 2.6), django-allauth `~=65.18.0` (`allauth.headless` app API, MFA: TOTP/recovery/webauthn passkeys, optional social providers).
- Data/async: PostgreSQL via `psycopg[binary]~=3.3.2` (+`django.contrib.postgres`; SQLite for dev), Redis (`django-redis~=7.0.0`), Celery `~=5.6.0[redis]` + Flower, PowerSync service (Postgres publication) for Flutter offline sync (new in 2.6).
- Other: `openfoodfacts~=5.3.0` (OFF import), easy-thumbnails (small 200px/medium 400px), django-storages+boto3 (S3 media), reportlab (PDF), django-axes (brute-force: 10 fails → 30 min lockout), django-simple-history, django-activity-stream, django-prometheus, django-cors-headers (`CORS_ORIGIN_ALLOW_ALL=True` on `/api/*`). Build: hatchling + `uv.lock`; deploy: docker compose + gunicorn.

## Codebase Organization (`wger/` package)
Django apps: `config`, `core` (users/profile/languages/licenses/units), `exercises`, `manager` (workouts/routines/logs — despite the name), `nutrition`, `weight`, `measurements`, `gallery`, `gym` (multi-gym mgmt), `mailer`, `software`, `trophies`, `utils` (permissions, pagination, middleware), plus `celery_configuration.py`, `tasks.py`, `urls.py`, `version.py`. Settings moved to top-level `settings/` package (2.4+): `settings/settings_global.py` + `main.py`/`local_dev.py`/`ci.py`. Each app's API lives in `wger/<app>/api/views.py` + `serializers.py`; all routers registered centrally in `wger/urls.py`.

## API v2 Surface (verified against https://wger.de/api/v2/ and `wger/urls.py`)
**Routines/workouts** (`manager` app, all user-owned): `routine`, `templates` (user templates), `public-templates`, `workoutsession`, `day`, `slot`, `slot-entry`, `weight-config`, `max-weight-config`, `repetitions-config`, `max-repetitions-config`, `sets-config`, `max-sets-config`, `rest-config`, `max-rest-config`, `rir-config`, `max-rir-config`, `workoutlog`. Progression = per-slot-entry config objects with iteration-based rules (value + max variant); set types incl. "warmup" (2.5); repetition units expose `unit_type`/`multiplier` (timers).
**Exercises** (mostly public read): `exercise` (base data, UUID, muscles/equipment/variation), `exerciseinfo` (unified search+detail incl. translations/images/videos; replaced removed `/exercise/search/`), `exercise-translation` (names/descriptions per language), `exercisecategory`, `equipment`, `muscle`, `video`, `exerciseimage` (with `thumbnails.small/medium`), `exercisecomment`, `exercisealias`, `deletion-log` (for sync), custom `POST /api/v2/exercise-submission/` (crowdsourced submissions, `exercise_create` throttle 20/hour POST-only).
**Nutrition**: `ingredient` (macros, `nutriscore` w/ range lookups, `is_vegan`/`is_vegetarian`, OFF barcode, serving sizes), `ingredientinfo` (search incl. brand/common name, remote OFF lookup on barcode miss), `ingredient-sync` (efficient upstream sync; bulk dump at `https://wger.de/media/ingredients/ingredients.jsonl.gz`), `ingredientweightunit` (serving units), `nutritionplan`, `nutritionplaninfo` (plan + nested meals), `nutritiondiary` (actual logged intake), `meal`, `mealitem`, `ingredient-image`.
**Body tracking**: `weightentry` (multiple/day since 2.5), `measurement`, `measurement-category`, `gallery` (progress photos, EXIF date auto-read).
**Core/misc**: `language`, `license`, `userprofile`, `setting-repetitionunit`, `setting-weightunit`; gamification: `trophy`, `user-trophy`, `user-statistics`.
**Utility (custom paths)**: `/api/v2/version/`, `/check-permission/`, `/min-app-version/`, `/min-server-version/`, `/token/refresh`, `/token/verify`, `/issue-refresh-token`, `/check-language/`, `/powersync-token|keys|upload-powersync-data`.

## Auth, Permissions, Pagination, Throttling (from `settings/settings_global.py`)
- Auth classes: Session, **Token** (permanent key from web "API key" settings page), allauth HeadlessJWT (RS256), SimpleJWT. **Removed in 2.6**: `/api/v2/login/`, `/api/v2/register/`, `/api/v2/token`. Login now via `/allauth/app/v1/auth/login` (MFA-aware) or long-lived refresh token from the API-key page.
- Permissions: single `wger.utils.permissions.WgerPermission` — public read-only access to reference data (exercises, ingredients, muscles, licenses…); full CRUD only on the authenticated user's own objects (routines, plans, weight, gallery…).
- Pagination: `WgerLimitOffsetPagination`, default `PAGE_SIZE=20`, `?limit=&offset=`; `?ordering=field1,-field2`; JSON + browsable HTML.
- Throttle (ScopedRateThrottle, per-IP anon / per-user auth): `login: 10/min`, `ingredient_list: 120/min`, `ingredient_detail: 300/min`, `ingredient_sync: 600/min`, `exercise_create: 20/hour`. No global default rate → other endpoints unthrottled at app layer (wger.de edge/proxy limits unknown). Login brute-force via django-axes.

## Integration Implications for AquaZeroFit
1. **Reference-data plane (best fit)**: pull `exerciseinfo`/`exercise`/`muscle`/`equipment`/`exercisecategory`/`exerciseimage`/`video` into AquaZeroFit's Node API as a cached document collection (fits JSON/Cosmos store); generate zod schemas from `/api/v2/schema`. Multi-language translations exist (`exercise-translation`, incl. zh-hans availability to verify).
2. **Ingredient plane**: use bulk JSONL dump or `ingredient-sync` for a local ingredient mirror; `nutriscore`/vegan/vegetarian flags enrich P-02 meal plans; allergen fields on ingredients must be verified before relying on them for AquaZeroFit's deterministic allergen filtering.
3. **Routine model mapping**: wger's slot/slot-entry + `*-config` progression rules are a proven schema for P-04 training plans / P-05 workout adjustment; UUID IDs (2.6) align with client-generated Cosmos doc IDs. Keep progression math in AquaZeroFit code (safety invariant), not in wger.
4. **Do not adopt wger user-data endpoints**: AquaZeroFit keeps its own auth/store; treat wger strictly as data source or self-hosted sidecar.
5. **Compliance**: consuming wger.de's API from a separate app does not trigger AGPL; self-hosting a *modified* wger would. Exercise/ingredient records carry per-entry CC licenses — must persist `license`/`license_author` and show attribution in UI.
6. **Version pinning**: target 2.6+ API (UUID IDs, removed endpoints); if self-hosting, require the commit fixing CVE-2026-27835 (queryset user-filtering info disclosure).

## Risks / Open Questions
- No published global quota for wger.de beyond scoped throttles; sustained bulk scraping → self-host or use the dump. Confirm 429/Retry-After behavior empirically.
- Ingredient allergen coverage/structure (OFF-sourced) unverified — check `ingredientinfo` serializer fields before wiring into safety filters.
- zh-hans coverage of exercise translations is partial/community-driven — audit before promising CN UX.
- Data licensing per entry varies (CC variants); bulk OFF data may carry ODbL obligations — needs a dedicated license audit (coordinate with licensing track).
- `routine` calculations happen server-side ("needs backend logic" per 2.6 release notes) — if AquaZeroFit reimplements routines, port or bypass that logic deliberately.

## Sources (fetched this session)
- Repo root README: github.com/wger-project/wger · `pyproject.toml`, `wger/version.py`, `wger/urls.py`, `settings/settings_global.py` (raw.githubusercontent.com/wger-project/wger/master)
- Releases page: github.com/wger-project/wger/releases (2.6, 2.5, 2.4 notes)
- Live API root: https://wger.de/api/v2/
- API docs: github.com/wger-project/docs/blob/master/docs/api/api.rst
- CVE-2026-27835 advisory summary (sentinelone.com)
