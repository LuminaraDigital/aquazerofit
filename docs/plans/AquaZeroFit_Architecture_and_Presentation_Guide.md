---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Architecture and Presentation Guide
subtitle: What the system does, how it is built, and who presents which part
details:
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Author: Babatundji Williams-Fulwood (s8138393), Lead Software Architect
  Team members: Babatundji Williams-Fulwood, Eric La, Victor Hong
  Group: Victoria University, Melbourne
  System version: 1.0.0
  Automated tests at time of writing: 770 passing (614 API, 156 web)
  Document status: Issued for team rehearsal
  Source of truth: the repository at commit c172b1b on branch main
---

# 1. How To Use This Document

This guide has two halves and they serve different readers.

**Part A (sections 2 to 5)** is the architectural reference. It describes what AquaZeroFit actually is, how it is put together, and every feature the code really implements. Read it once so that you can answer questions about parts of the system you are not presenting.

**Part B (sections 6 to 10)** is the presentation script. Each speaker has a set of numbered segments. Every segment is written to be spoken in approximately one minute at a measured pace, roughly 150 to 170 words. They are written to be read aloud, not summarised, so the timing holds.

**A note on accuracy.** Every claim in this document was checked against the source code, not against earlier drafts or design documents. Where an earlier draft of our slides claimed something the code does not do, that claim has been removed. Section 11 lists the figures that are safe to quote from memory, and section 12 lists the three claims most likely to be repeated by mistake.

# 2. What AquaZeroFit Is

AquaZeroFit is an AI-powered wellness platform published under the AquaZero brand. A user builds a wellness profile, logs meals by hand or by photograph, follows a generated home or gym training plan, and talks to a conversational assistant called Aqua Coach that answers inside strict safety boundaries.

The product deliberately does one unglamorous thing very well: it separates what a language model is allowed to do from what only code is allowed to do. Models identify, interpret and explain. Code calculates, filters and enforces. Every calorie figure, every macro split, every allergen decision and every training dose in the product is arithmetic executed by deterministic TypeScript, never a number a model produced. That single rule is the reason the app can put an AI assistant in front of health-adjacent data without the assistant being able to hurt anyone with it.

The product is licensed AGPL-3.0-or-later, runs on Node 20 or later, and ships as a single React codebase that serves two delivery surfaces.

# 3. Architecture At A Glance

## 3.1 Repository layout

| Path | Contents |
| :--- | :--- |
| `apps/web` | React 18, TypeScript, Vite, Tailwind. Serves both delivery targets. |
| `apps/api` | Node.js and TypeScript service implementing the frozen `/api/v1` contract. |
| `packages/shared` | Shared types, zod validation schemas, error taxonomy, safety constants. |
| `prompts/` | Versioned prompt files P-01 to P-12. |
| `evals/` | Safety evaluation sets and runner, gated in the pipeline. |
| `content/` | Licensing attribution and workout media governance records. |
| `docs/specs/` | The AQF-01 to AQF-27 document set. |
| `design/` | Figma screen references and the Modern Aquatic Wellness design system. |
| `tools/` | Build tooling, including the Markdown to DOCX renderer that produced this file. |

## 3.2 The request path

Every request that can reach a language model passes through the same admission sequence, in this order:

1. Authenticate (bearer JWT).
2. Rate limit (per subject and per IP, in lanes).
3. Tier check and credit reservation.
4. Input guardrail.
5. AI Gateway call on a logical model lane.
6. Output guardrail and numeric rules.
7. Respond, persist, settle credits, write telemetry.

No model-calling endpoint is exempt. Chat, meal photo analysis, meal suggestion, plan generation and the weekly insight all run the same sequence.

## 3.3 Two delivery surfaces from one codebase

The client detects at bootstrap whether it is running inside Telegram. In an ordinary browser it renders the AquaZero design system directly. Inside Telegram it additionally binds the host client's theme onto the app's design tokens, enables native haptics, and reads the `startapp` deep link payload.

Two decisions here are easy to undo by accident and worth stating:

- The signed-out root URL serves the marketing page in place rather than redirecting to `/landing`, so cold traffic and crawlers land on the canonical URL with no hop in between.
- The Telegram SDK is not in `index.html`. It is fetched with a timeout only when the URL fragment or session storage shows a genuine Mini App launch. A blocking third-party script in the page head stalled the marketing site for exactly the corporate-network users the browser path exists to serve.

## 3.4 Storage

Documents live in ten logical containers modelled on Cosmos container semantics: `users`, `profiles`, `logs`, `plans`, `content`, `foodsOff`, `foodsFdc`, `ai`, `ledger` and `audit`. The nutrition containers are segregated deliberately: Open Food Facts records under ODbL never commingle with the curated corpus, and CC0 FoodData Central records get their own namespace again.

Behind that sits one abstraction with two backings. The working set is held in memory and every read is served synchronously from it; writes apply to memory immediately and flush asynchronously through a serialised queue. Locally and under test the backing is one JSON file per container, written through a temporary file and a rename so a crash cannot truncate a container. In production, setting `DATABASE_URL` switches the backing to Postgres, a single `documents(container, id, doc jsonb)` table with per-id write granularity. Because each instance hydrates its own working set, the Postgres backing is durable for single-instance deployments; scaling out requires moving reads off the local copy, and that limitation is documented rather than hidden.

# 4. The Safety Invariants

These six rules are enforced in code and covered by tests. They are the spine of the product.

1. **Models identify, interpret and explain. Code calculates, filters and enforces.** Calorie maths is deterministic lookup and multiply.
2. **Calorie targets are clamped to a configured floor** with a visible advisory when the clamp fires.
3. **Allergen exclusion is a deterministic filter with zero tolerance for false negatives.** Over-blocking is acceptable; under-blocking is not.
4. **Meal photo recognition never commits a log without explicit user confirmation.**
5. **The assistant refuses medical, crisis and extreme-diet content** with a supportive signpost to real help.
6. **The credit ledger is append-only.** Balances are derived by folding transactions, never by mutating a counter. Experience points follow the same contract.

# 5. Feature Inventory

## 5.1 Nutrition

| Feature | Implementation |
| :--- | :--- |
| Calorie and macro targets | Mifflin-St Jeor BMR, activity-factored TDEE, goal-adjusted intake, safety floor clamp, macro split, hydration target. Formula version `mifflin-stjeor-v1`. |
| Food corpus search | 139 seeded composition records with source and licence retained, read-through cached, prefix-first ranking. |
| Per-meal timeline | Breakfast, lunch, dinner and snacks, with day navigation through an interactive month calendar. |
| Copy yesterday | `POST /logs/copy-previous` duplicates the previous local date's meals into today in one request. |
| Barcode scanning | EAN-8 and EAN-13 with GS1 check digit, local mirror first, Open Food Facts fallback with caching. |
| Energy cross-check | Recomputes kcal from macros using EU 1169/2011 factors, flags a stated value outside a 30 percent plus 5 kcal tolerance. |
| AI meal photo capture | Upload, background analysis, draft predictions grounded to corpus records, mandatory user confirmation. |
| Allergen exclusion | Nine allergen classes, two independent nets, applied before any model sees a candidate. |
| Meal suggestions | Remaining budget computed in code, candidates filtered in code, model ranks, code re-validates the pick. |
| Recipe library | 17 seeded recipes with per-serving macros, method, ingredients, dietary suitability and licence. |
| Micronutrients | Fibre, sugar, sodium, potassium, calcium and iron, folded from logged items into an expandable panel. |
| Diary export | `GET /export/diary` in JSON or CSV, covering meals, macros, micronutrients and hydration. |

## 5.2 Training

| Feature | Implementation |
| :--- | :--- |
| Exercise corpus | 51 seeded movements plus wger imports, categorised strength, cardio, mobility and core, with primary and secondary muscles, equipment and difficulty. |
| Licence attribution | Licence, author, licence URL and attribution text are carried on every record and every media asset and are never stripped. |
| Variation groups | Interchangeable variants sharing a group id, used by the library and by the in-session swap. |
| Plan generator | Deterministic pool filtering, calendar day patterns for two to six sessions a week, goal-specific focus rotations, experience-based prescriptions. |
| AI plan lane | Optional model draft over the same pre-filtered pool, structurally and semantically validated, falling back to the deterministic engine on any failure. |
| Progression as data | Rules keyed by iteration with operations, step types, repetition and autoregulation gates, resolved by a pure engine with hard caps. |
| Adaptive readiness | A weighted score over the trailing week mapping to Protect, Maintain or Progress, applied as a working-volume multiplier. |
| Session logger | Pre-resolved sets, guided stepper, rest countdown, per-set actuals for weight, reps and reps in reserve, exercise swap. |
| Completion metrics | Deterministic energy estimate scaled by session intensity and by the proportion of prescribed work actually performed. |
| Workout analytics | Weekly volume and set counts by exercise and by muscle, with Brzycki estimated one-rep max, formula pinned as `brzycki-v1`. |
| Achievements | 11 seeded definitions evaluated deterministically, including streak achievements that are never revoked once earned. |

## 5.3 Platform, AI and everything else

| Feature | Implementation |
| :--- | :--- |
| AI Gateway | Five logical model lanes, a provider chain, retries with jittered backoff, per-provider circuit breakers, an overall deadline and a deterministic offline engine. |
| Aqua Coach | Consent-gated grounding tools, server-sent event streaming, conversational history, selectable coach personas. |
| Chat-native meal logging | Model extracts food name, quantity and unit only; grounding, gram conversion and macro maths happen in code; ambiguity is preserved. |
| Guardrails | Input classifier over five categories with jailbreak detection, an optional model second stage, and an output filter with numeric rules. |
| Authentication | Fifteen-minute JWT access tokens, single-use rotating refresh tokens with family revocation, Telegram launch-data HMAC verification. |
| Rate limiting | Sliding-window lanes: 300 a minute default, 20 for model surfaces, 10 for the credential surface per IP, 30 for anonymous writes. |
| Privacy and data rights | Four opt-in consents defaulting off, full data export, two-step deletion with a grace period and sweep, anonymised audit retention. |
| Per-user AI memory | Confirmed and suggested facts with a rolling summary, model-proposed and user-approved, consent-gated on every read and write. |
| Progress insight | Deterministic statistics with an optional model narration, cached weekly, degrading to a genuine deterministic insight on every failure path. |
| Consistency model | A 28-day window with a grace day and a never-decreasing best figure, replacing the punishing reset-to-zero streak. |
| Gamification | Experience awarded for behaviour and never for outcomes, capped per lane and per day, derived by folding activity. |
| Coach roster | Nine tournament fighters as selectable personas, unlocked by level, with an optional Telegram Stars shortcut. |
| Credit ledger | Append-only reserve, commit and release, with balances folded from transactions. |
| Buddy challenges | Private accountability huddles with CSPRNG invite codes and progress recomputed from the log ledger on read. |
| Growth surface | Attribution capture, deep-link routing, canvas-rendered share cards, growth telemetry with a retention sweep. |
| Search visibility | Build-time prerendering of one real HTML file per marketing route with per-route metadata, JSON-LD, robots and sitemap. |
| Operations | Liveness and readiness probes registered ahead of the limiter, structured request and AI-call logging, scheduled sweeps, production secret guards. |

# 6. Speaking Allocation

| Speaker | Module | Segments | Time |
| :--- | :--- | :--- | :--- |
| Victor Hong | Nutrition and dietary system | 5 | 5 minutes |
| Eric La | Training and workout system | 5 | 5 minutes |
| Babatundji Williams-Fulwood | Platform, AI, safety, security, privacy, analytics, gamification and operations | 10 core, 2 optional | 10 to 12 minutes |

Total running time is 20 minutes with the core set, 22 minutes with both optional segments. If the slot is shorter, cut Tundji's segments T11 and T12 first, in that order. They are written to be removable without breaking the narrative.

Each segment below is one minute of speech. Do not compress two segments into one; the timing is the point.

# 7. Victor Hong: Nutrition And Dietary System

## V1. Deterministic calorie and macro mathematics

> "Good morning. I am Victor, and I will present the nutrition system. The foundation is an architectural rule we hold everywhere in this product: machine learning models identify and interpret, but deterministic code calculates. Our target calculator takes the user's weight, height, age, sex and activity level, computes basal metabolic rate with the Mifflin-St Jeor equation, multiplies it by an activity factor between 1.2 and 1.9 to get total daily energy expenditure, then applies a goal adjustment sized inside a safe band of half to one percent of bodyweight per week. Protein is set per kilogram of bodyweight by goal, fat supplies at least twenty percent of energy, carbohydrate takes the remainder, and hydration is thirty-three millilitres per kilogram inside a sensible band. Crucially, the result is clamped to a calorie floor, twelve hundred or fifteen hundred depending on sex, and when that clamp fires the user is told why. The formula version is stored on every set of targets, so we always know which maths produced a number."

## V2. Food corpus, the meal timeline and one-tap logging

> "Next, how a user actually logs a day. The nutrition screen presents a four-slot timeline for breakfast, lunch, dinner and snacks, wrapped around a calorie ring that shows target, consumed, burned and remaining. Remaining is computed exactly: target minus consumed, plus whatever a completed workout burned. Users search a seeded composition corpus of 139 records, each carrying its source and licence, and pick a serving. The macros come from a lookup and a multiply, never an estimate. Three things remove friction. A month calendar lets the user step back through history and see which days were logged. A copy-yesterday endpoint duplicates the previous day's meals into today in a single request. And a barcode scanner validates EAN-8 and EAN-13 including the GS1 check digit, checks our local mirror first, then falls back to the Open Food Facts product API and caches what it finds. Every creation route honours an idempotency key, so a retry on a bad connection never double-logs a meal."

## V3. AI meal photo recognition, with a confirmation gate

> "The most visible AI feature in nutrition is meal photo capture. The user photographs their plate. The upload is size-capped at ten megabytes, restricted to JPEG, PNG or HEIC, and then re-encoded from decoded pixels before anything is stored. That re-encode is a privacy measure, not a convenience: a phone photo carries GPS at home-address precision, a capture timestamp and a camera serial number, and rebuilding the file from pixels discards all of it. It is also the real type check, because the multipart header the client sends proves nothing. The job runs in the background against our vision model lane, which returns identified items and estimated portions. Here is the important part: the model's numbers are thrown away. We look each identified item up in our own corpus and recompute the calories and macros ourselves, and any item we cannot ground is dropped. Nothing is written to the log until the user explicitly confirms, and on confirmation the photograph is deleted."

## V4. Allergen exclusion and context-aware meal suggestions

> "Safety in nutrition is mostly about what we refuse to recommend. Our allergen filter covers the nine major classes: peanuts, tree nuts, milk, eggs, fish, shellfish, soy, wheat and sesame. It runs in code, after candidate selection and before any model involvement, and it uses two independent nets. The first is the record's declared allergen field. The second is a keyword map over the name and ingredient list that catches records with missing tagging, so satay is caught as peanuts and tahini as sesame. False positives are acceptable. False negatives are not, and a model never gets a vote on allergen safety. Meal suggestions sit on top of that. We compute the remaining calorie and macro budget in code, apply the user's restrictive dietary preferences, apply the allergen filter, and only then hand the surviving candidates to a model to rank. Whatever the model picks is checked back against the safe set before it is shown. The model proposes; the code disposes."

## V5. Micronutrients, recipes and data portability

> "Finally, depth and portability. Beyond the four macros we track six micronutrients across logged items: dietary fibre, sugars, sodium, potassium, calcium and iron, presented in an expandable panel on the nutrition dashboard so the main view stays calm. We also ship a recipe library of seventeen curated recipes with preparation and cook times, method steps, per-serving macros, ingredient lists, dietary suitability flags and licence attribution, and a recipe can be logged straight into the timeline. For portability we expose a diary export endpoint that returns the user's meal logs, macro totals, micronutrient totals and hydration in either structured JSON or CSV, filterable by a single date or a range. That matters for two reasons: a user should be able to take their health data to a dietitian or another app, and being able to export is part of taking data rights seriously rather than talking about them. That is the nutrition module. I will hand over to Eric for training."

# 8. Eric La: Training And Workout System

## E1. The exercise corpus and licence governance

> "Thank you, Victor. I am Eric, and I will cover the training system. It starts with the exercise corpus: a seeded library of fifty-one movements, extended by an importer that pulls from the wger open exercise database. Every record carries a category of strength, cardio, mobility or core, primary and secondary muscle groups, required equipment, a difficulty rating from beginner to advanced, a description and demonstration media. What makes this more than a table is the licensing discipline. The upstream corpus is Creative Commons share-alike, so every record and every media asset carries its licence identifier, its author, its licence deed URL and its attribution text, and those fields are never stripped anywhere in the pipeline. The exercise detail sheet in the app renders that attribution rather than hiding it. Records also carry a variation group identifier, which is what makes interchangeable alternatives possible later without breaking a user's historical progression, because the swap is constrained rather than arbitrary."

## E2. The training plan generator and progression as data

> "Plan generation is deterministic first and AI second. We build a candidate pool by filtering the corpus down to exercises whose equipment the user actually has and whose difficulty does not exceed their experience. We then lay out the week using calendar patterns chosen so that rest days fall sensibly for two through six sessions a week, and assign a focus rotation driven by the user's goal: weight loss leans on cardio and core, strength on upper, lower and full body. Beginners are never given two consecutive high-intensity days. Sets, repetitions and rest intervals come from a prescription table keyed by experience and exercise category. The part I want to highlight is progressive overload. It is not branching code; it is data. Each slot entry gets rules keyed by iteration: repetitions rise in week two, volume in week three, rest density tightens in week four. An optional AI lane may propose an entire week instead, but its draft is structurally and semantically validated against the same pool before it is ever used."

## E3. Adaptive readiness: Protect, Maintain, Progress

> "A generated plan is only useful if it survives a real week, so before a plan is built we score how the last seven days actually went. Four signals feed a weighted score. Session completion carries forty-five percent, because it is the only signal that measures the thing we are modulating. Broad check-in activity carries twenty-five. Recency carries twenty, weighted separately so that four quiet days in a row reads worse than four quiet days scattered through the week. Intake stability carries ten, deliberately the smallest, because it is the noisiest signal and the easiest to turn into food moralising. Signals we cannot measure are dropped and the rest are renormalised, so nobody is scored down for data we never had. The score maps to three bands. Protect eases working volume to sixty percent. Maintain leaves it alone. Progress nudges it up ten percent. A new account gets none of this until there are at least three days of history."

## E4. The interactive session logger

> "When a user starts a workout, the app resolves today's session from the active plan by counting days since the plan started, applies every progression rule that has come due, rounds working weights to loadable plates, and hands the client a fully resolved document. That means the Mini App renders a session with almost no client-side logic. The logger is a guided stepper. It shows the current exercise with its demonstration media and instructions, the target repetitions, load and reps in reserve, and it records what the user actually did, set by set, so target and actual are both preserved. Between sets a countdown ring runs the prescribed rest, and it can be skipped. If an exercise does not suit, an in-session swap offers a replacement from the same variation group first, then from the same primary muscle, always inside the user's equipment pool. On completion we compute total duration and an energy estimate scaled by session intensity and by how much of the prescribed work was actually performed."

## E5. Workout analytics and achievements

> "Everything logged feeds a deterministic analytics layer with no AI in it at all, which is what makes it trustworthy enough for the insight engine to quote. We bucket completed sessions into ISO weeks and compute set counts and training volume, that is load multiplied by repetitions, both per exercise and per muscle group. We also compute an estimated one-rep max using the Brzycki formula, and we pin the formula version in the response so a future change cannot silently move a user's historical numbers. On the progress screen that becomes a volume trend the user can read over weeks, alongside a muscle group breakdown. Completed sessions also feed the achievement engine, which evaluates eleven seeded definitions: first workout, sessions completed, logging milestones and more. One design decision worth naming: streak achievements are evaluated against the user's best ever run, not their current one, because revoking a badge someone already earned is a harsher signal than the reset counter we removed. Over to Tundji."

# 9. Babatundji Williams-Fulwood: Platform, AI, Safety And Operations

## T1. Two delivery surfaces from one codebase

> "Thank you, Eric. I am Tundji, lead software architect. I will cover the platform underneath what you have just seen. Our first architectural decision was to serve two distinct surfaces from one React and TypeScript codebase: a responsive marketing and application website, and a Telegram Mini App. The client detects at bootstrap which one it is in. Inside Telegram we bind the host client's theme onto our design tokens, but only the neutrals, and only after checking that the resulting background keeps every fixed brand colour above the WCAG AA contrast ratio. A light Telegram theme fails that gate and we render our own palette instead. That is a measured decision, not an assumption. We also do not ship the Telegram SDK in the page head. We fetch it, with a five-second timeout, only when the URL fragment shows a real Mini App launch, because a blocking third-party script was stalling the marketing page for the corporate-network users who need the browser path most."

## T2. The API platform and the storage abstraction

> "The backend is a stateless TypeScript service exposing a frozen versioned API contract. Data is modelled as documents in ten logical containers: users, profiles, logs, plans, content, two segregated nutrition containers, AI, ledger and audit. The nutrition containers are separate on purpose: Open Food Facts records carry a share-alike database licence, and commingling them with our curated corpus would contaminate it. Behind those containers is one abstraction with two backings. The working set lives in memory and every read is served synchronously; writes hit memory immediately and flush asynchronously through a serialised queue that coalesces bursts. Locally we persist one JSON file per container, written through a temporary file and a rename so a crash cannot truncate it. Setting a database URL switches the backing to Postgres, a single documents table with JSONB payloads and per-id write granularity. Because each instance hydrates its own working set, that backing is durable for single-instance deployments, and we document that limit rather than hide it."

## T3. The AI Gateway and resilience

> "Every model call in this product goes through one module. Application code never names a provider or a model. It names a logical lane: vision primary, chat fast, plan structured, safety cheap or insight batch. The gateway maps a lane onto a chain of providers, currently Groq, OpenAI, Gemini, NVIDIA and a local option, based purely on which API keys exist in the environment. Around that chain sits real resilience. Transient failures retry with jittered backoff. A provider that fails three calls in a row trips a circuit breaker and is skipped for a cooldown, so a provider that is down stops costing every later request its timeout. There is one overall deadline for the whole call, because a per-provider timeout multiplied by the chain length is not a latency any user survives. And if everything fails, or if no keys are configured at all, we fall back to a deterministic offline engine so every core journey still works. The result carries a degraded flag, and we never bill a user for degraded output."

## T4. Aqua Coach: grounding, streaming and chat-native logging

> "Aqua Coach is the conversational surface, and its defining property is that it is grounded. Before a turn runs, we execute a set of tools that read the user's real data: today's calories, macros and hydration against target, today's workout, the active plan, their progress summary, their profile essentials and their approved memory. Those results are injected as untrusted context, never as instructions. The reply streams to the client over server-sent events, token by token, and the whole conversation history is replayed so the coach has continuity. The feature I am proudest of is chat-native meal logging. A user types what they ate in plain language. The model's entire contribution is turning that sentence into food name, quantity and unit. Everything else, matching the corpus, converting to grams, multiplying per-hundred-gram values and checking declared allergies, happens in code. If a phrase matches several records we keep the ambiguity and make the user choose, rather than silently picking the first."

## T5. Safety architecture and the admission sequence

> "Safety in this product is architecture, not a disclaimer. Every model-calling endpoint runs the same seven-step admission sequence: authenticate, rate limit, check tier and reserve credits, run the input guardrail, call the gateway, run the output guardrail and numeric rules, then respond and log. The input guardrail classifies a message into one of five categories, and the priority order is deliberate: crisis outranks medical, which outranks extreme diet, which outranks out of scope. A user in distress must never receive diet content in that turn. We also detect jailbreak framing, and a sub-floor calorie request such as asking to eat six hundred calories a day. Blocked turns never reach a model, credits are returned, and the user gets a warm refusal with a real helpline rather than a wall. On the way out, numeric rules re-check the text for advised intake below the floor and for impossible macro claims. There are versioned prompt files and safety evaluation sets that run in our pipeline."

## T6. Authentication and session security

> "Authentication is stateless and hardened. Access tokens are JSON Web Tokens signed with a pinned algorithm and valid for fifteen minutes. Refresh tokens are opaque random values, stored only as SHA-256 hashes, valid for thirty days and single use. When a client refreshes, the old token is consumed through an atomic compare-and-swap and a new one is issued in the same family. If a token that has already been used is presented again, we treat that as theft and revoke the entire family, which kills the attacker's session and the victim's together. Telegram users sign in without a password: we recompute the HMAC-SHA256 signature over the launch data using a key derived from our bot token and compare it in constant time, and we reject anything older than ten minutes. Passwords are bcrypt hashed, repeated failures lock an email for fifteen minutes, new Telegram accounts are capped per IP, per subnet and globally, and rate limiting runs in four separate lanes."

## T7. Privacy, consent and data rights

> "Privacy is opt-in by default. Every consent starts off. There are four: wellness data processing, AI personalisation, anonymised analytics and reminders. The AI personalisation consent is load-bearing rather than cosmetic. With it off, no profile data, no log data, not even the user's display name enters model context, and every grounding tool reports that personalisation is off instead of returning data. The coach still works; it just answers generically, and the meal suggestion path falls back to a deterministic pick with no model call at all. Users can export everything we hold in one request. Deletion is two-step: the first call flags the account and starts a thirty-day grace period, a second call during grace purges immediately, and a scheduled sweep purges anything whose grace has elapsed. A purge deletes profiles, logs, plans and AI data outright, unwinds the user from any shared challenge, and anonymises the ledger and audit trails, hashing any identifier left in them."

## T8. Per-user AI memory

> "The coach remembers, and how it remembers is a design decision. Each user has one memory document holding a rolling summary and a set of facts, each with a category and a status. After a successful turn, a cheap model lane reads the exchange and proposes facts, and those land as suggested, never as confirmed. The user reviews them in settings and approves, edits or rejects. Only confirmed facts are ever injected into a prompt. Rejected facts are retained for thirty days so the extractor does not immediately re-suggest them, then swept. There are hard caps on both confirmed and suggested facts, with oldest-first eviction. Two safeguards matter. Every write strips control characters, because memory text flows into a system-role context block and an escape sequence there is a prompt injection vector. And every fact is re-run through the input guardrail immediately before it enters a prompt, so an unsafe statement that somehow got stored can still never be spoken back."

## T9. Progress insight and the consistency model

> "The progress screen answers a harder question than a chart does: what changed, and why. We compute the statistics ourselves over a trailing window, weight change across weigh-ins, workouts completed, average intake against target, hydration adherence, and compare them to the immediately preceding window of the same length. Two details are deliberate. Averages are taken over days the user actually logged, because an unlogged day is missing data, not a zero, and averaging blanks in would report a fiction. And count comparisons are suppressed when the user was not present in both windows, so somebody returning after a break does not get a wall of downward arrows. A premium user with personalisation on gets those finished numbers narrated by a model on a batch lane, cached once a week. Everyone else gets a genuine deterministic narrative built from exactly the same figures. On the same principle we replaced the reset-to-zero streak with a consistency model that absorbs a missed day and never counts down."

## T10. Gamification, the coach roster and the credit ledger

> "Progression in this app follows one rule, and it is a safety rule rather than a design preference: experience is awarded for behaviour, never for outcomes. Nothing can score a calorie deficit or a kilogram lost. Logging, training, hydrating, weighing in and resting after work all earn. Every lane is capped per day, the total is capped again, so a frantic day cannot out-earn two ordinary ones, which removes the incentive to over-log and with it the incentive to over-eat to have something to log. Experience is derived by folding activity, never stored, so a level cannot drift or be granted by a client. Levels unlock coach personas, the nine fighters of our tournament, each a voice layer over the same engine, with the persona block placed ahead of the rules so the rules always win. Every locked coach is reachable without paying; the Telegram Stars price is only a shortcut. AI usage runs on an append-only credit ledger where the balance is a fold, never a counter."

## T11. Optional: growth surface, deep links and search visibility

> "Two smaller systems worth a minute. First, growth. Users can form private accountability huddles with a randomly generated invite code drawn from a cryptographic source, because an invite code is a bearer capability and a predictable one is a guessable one. Progress inside a huddle is recomputed from the log ledger on read, so it can never drift from the truth. Users can share a moment as a branded card rendered to a canvas image entirely on the device. Attribution, referral codes and campaign parameters, is captured on first touch and carried across the hop into Telegram through the deep-link payload, because local storage does not cross that boundary. A deep-link router turns those payloads into destinations: log a meal, scan a barcode, open a huddle, pick a coach. Second, search. At build time we generate one real HTML file per marketing route with its own title, description, canonical, social tags, structured data and a no-script summary."

## T12. Optional: quality engineering and production readiness

> "I will close on how we know any of this is true. The repository currently carries 770 automated tests, 614 against the API across fifty files and 156 against the web client across twenty-four, and they all pass. They are not decorative: there are tests that fail if anyone merges the coach persona block into the rules prompt, tests that fail if a refresh token stops revoking its family on reuse, tests that fail if the calorie floor starts firing on a remaining-budget readout, and safety evaluation sets that gate the pipeline. On the operations side, liveness and readiness probes are registered ahead of the rate limiter, because a rate-limited probe returns 429 under load and the platform restarts a healthy container. Structured logs are emitted for every request and every model call. Scheduled sweeps clear expired photos, deletions and telemetry. And the service refuses to start in production without real secrets, HTTPS-only origins and a working mail transport, rather than looking healthy while account recovery is silently broken. Thank you. We are happy to take questions."

# 10. Handover Lines

Keep these short and do not improvise them, because a fumbled handover is the most visible thirty seconds of any team presentation.

| From | To | Line |
| :--- | :--- | :--- |
| Opening | Victor | "We will start where the user starts, with food. Victor." |
| Victor | Eric | "That is the nutrition module. I will hand over to Eric for training." |
| Eric | Tundji | "That is the training system. Over to Tundji for the platform underneath it." |
| Tundji | Close | "Thank you. We are happy to take questions." |

# 11. Figures That Are Safe To Quote

Every number below was read out of the code or produced by running the test suite. If you are asked for a figure that is not on this list, say you will check rather than estimating.

| Figure | Value |
| :--- | :--- |
| Automated tests | 770 passing (614 API across 50 files, 156 web across 24 files) |
| Seeded food records | 139 |
| Seeded exercise records | 51 |
| Seeded recipes | 17 |
| Achievement definitions | 11 |
| Coach personas | 9 |
| Versioned prompt files | 12 (P-01 to P-12) |
| Storage containers | 10 |
| Logical model lanes | 5 |
| Allergen classes filtered | 9 |
| Micronutrients tracked | 6 |
| Calorie floor | 1200 kcal (female and unspecified), 1500 kcal (male) |
| Activity factors | 1.2 sedentary to 1.9 very active |
| Protein target | 2.0, 1.6 or 2.2 g per kg by goal |
| Hydration target | 33 ml per kg, clamped to 1500 to 4000 ml |
| Access token lifetime | 15 minutes |
| Refresh token lifetime | 30 days, single use |
| Telegram launch data freshness window | 600 seconds |
| Rate limit lanes | 300, 20, 30 and 10 requests per minute |
| Meal photo size limit | 10 MB, JPEG, PNG or HEIC |
| Photo retention | Deleted on confirm or failure, swept after 24 hours |
| Free tier daily AI credits | 50 |
| Credit costs | 1 chat turn, 3 meal photo, 2 meal suggestion, 5 plan, 1 insight |
| Readiness volume multipliers | 0.6 protect, 1.0 maintain, 1.1 progress |
| Consistency window | 28 days with 1 grace day, steady at 7 |
| Daily experience cap | 150 points |
| Deletion grace period | 30 days |

# 12. Three Claims We Must Not Repeat

An earlier draft of our slide deck contained three statements the code does not support. They are listed here so nobody restores them from memory.

1. **"BMR is computed with Mifflin-St Jeor and Katch-McArdle."** Only Mifflin-St Jeor is implemented. There is no body-fat input, so Katch-McArdle could not be computed. Say Mifflin-St Jeor.

2. **"An AI meal plan generator produces multi-day meal plans."** What exists is a per-slot recommendation engine. The meal plan screen requests one suggestion for each of today's four meal slots. It is a day of suggestions, not a multi-day plan. Describe it as context-aware meal suggestions.

3. **"One hundred percent automated test coverage."** We have 770 passing tests, which is a strong number and worth saying. It is not a coverage percentage, and we have not measured line coverage. Say "770 automated tests, all passing".

One further caution. Do not quote live model latency or remaining credit figures from the on-screen diagnostics strip during the demo. The API round-trip figure there is measured, but the other readouts are illustrative, and a marker who asks where a number comes from deserves an answer we can stand behind.

# 13. Technical Question Preparation

**How do you stop the AI hallucinating a calorie figure?**
By never giving it a field to put one in. For photo capture and chat logging, the model returns identifiers, quantities and units only. We look the item up in our own corpus and compute kcal as grams multiplied by the per-hundred-gram value divided by one hundred. An item we cannot ground is discarded rather than guessed at.

**What happens when the AI provider is down, or you have no API keys?**
The gateway retries, trips a circuit breaker on a repeatedly failing provider, falls through the chain, and finally lands on a deterministic offline engine, so every core journey still works. The result carries a degraded flag, and any lane that would have charged a credit releases the reservation instead, because template text is not a model answer anyone should pay for.

**Why is the credit balance not just a number on the user record?**
Because a counter can drift and cannot be audited. The ledger is append-only: reserve deducts, release returns, commit settles, and the balance is a fold over the transactions. Reserving before work and settling after means a crashed job returns its hold rather than silently charging the user. Experience points follow the same contract.

**How do you handle a user in crisis?**
The input classifier gives crisis the highest priority, above medical and above extreme diet, so a distress signal always wins even if the message also mentions food. No model is called. The user gets a supportive message with real helpline contacts, the turn is audited, and the credit is returned. The assistant never renegotiates that boundary, including under jailbreak framing.

**Is the Postgres store production ready?**
For a single instance, yes. Each instance hydrates its own in-memory working set and serves reads from it, so a second instance would not see the first one's writes until it restarted. Scaling out requires moving reads off the local copy. That is a documented architectural limit, recorded in our decision records rather than discovered in production.

**What stops someone unlocking a paid coach by editing a request?**
The server decides entitlement, not the client. The unlock check runs against the user's derived level and their recorded purchases. Purchase prices come from the roster, never from the request body. Grants are idempotent on Telegram's payment charge identifier, because Telegram redelivers webhooks, and the webhook itself rejects everything unless a shared secret is configured.

**Why does a missed day not reset the streak?**
Because the documented harm in habit apps is not the gap, it is the punishment displayed for it. Our consistency model absorbs one missed day within a run, reports active days inside a rolling twenty-eight-day window, and keeps a best figure that never decreases. Achievements are evaluated against that best figure, so a badge already earned is never revoked.

**What is the biggest thing you would change with more time?**
Moving reads off the per-instance working set so the service scales horizontally, and replacing the pure-JavaScript bcrypt with a native binding at a higher cost factor. Both are recorded as accepted trade-offs with a stated first hardening step, rather than gaps we discovered late.
