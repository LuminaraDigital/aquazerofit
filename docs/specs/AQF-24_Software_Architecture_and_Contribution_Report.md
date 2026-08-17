---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Software Architecture and Contribution Report
subtitle: What the system does, how it is built, why it is built that way, and who owns each part
details:
  Document ID: AQF-24
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Document owner: Babatundji Williams-Fulwood (s8138393), Technical Lead and Software Architect
  Contributors: Eric La, Victor Hong
  Group: Group 15, Victoria University, Melbourne
  System version: 1.0.0
  Baseline: repository branch main at commit c172b1b
  Automated tests at baseline: 770 passing (614 API, 156 web)
  Code listings: 122, verified byte-exact against the baseline
  Status: Issued for supervisor and lecturer review
  Supersedes: AquaZeroFit Architecture and Presentation Guide (docs/plans)
  Related documents: AQF-05 Architecture Decision Records, AQF-07 API Contract, AQF-09 Low Level Design, AQF-11 Safety Privacy and Ethical Design
---

# 1. How To Read This Report

## 1.1 What this report is

This is the single reference document for AquaZeroFit. It explains what the product does, how the system is built, why each significant choice was made, and which team member owns each part. It replaces the separate presentation guide the team was previously working from.

It is written to be read by three different people without needing three different versions:

- a **lecturer or supervisor**, who needs to understand the product and judge the engineering without reading source code;
- a **team member**, who needs to explain their own part confidently and follow their team mates' parts;
- a **developer or senior reviewer**, who needs to check that the claims match the repository.

## 1.2 Three reading paths

| If you are | Read | You can skip |
| :--- | :--- | :--- |
| A lecturer or supervisor | Sections 2 to 6, then the *In plain English* and *Why it is built this way* paragraphs in sections 9 to 11, then sections 12 to 14 | Every code listing, and sections 7 and 8 |
| A team member preparing to present | Section 2 to find your part, section 3 for the product summary, then your own subsection of 9, 10 or 11 in full, then section 15 | The other members' feature detail, on a first pass |
| A developer or reviewer | Everything, in order | Nothing |

A lecturer who reads only sections 2 to 6 and the plain-English paragraphs will have a complete and accurate picture of the product and its engineering. That path is roughly forty minutes of reading.

## 1.3 How to find your own part

Every feature in sections 9 to 11 is labelled with its owner in the heading, so you can find your material by scanning. The three owner sections are:

- **Section 9 belongs to Victor Hong** (nutrition and dietary system).
- **Section 10 belongs to Eric La** (training and workout system).
- **Section 11 belongs to Babatundji Williams-Fulwood** (platform, AI, safety, security, privacy, analytics and operations).

Section 2 maps every module in the codebase to its owner, so nothing is unclaimed.

## 1.4 How each feature is documented

Every feature in sections 9 to 11 uses the same six-part template, so any two features can be compared fairly and so each owner knows exactly what they are expected to be able to say.

| Heading | Purpose | Written for |
| :--- | :--- | :--- |
| In plain English | What the feature does, stated without jargon | Lecturer |
| Why it is built this way | The reasoning, the rejected alternative, and the risk being managed | Lecturer and reviewer |
| Where it lives | The files that implement it | Reviewer |
| The code | A verbatim excerpt from the repository | Reviewer |
| Talking points | Short prompts the owner speaks from, in their own words | Team member |
| If asked | The question most likely to be put to the owner, with the answer | Team member |
| One-line summary | The whole feature compressed to a single sentence | Everyone |

The talking points are deliberately **not** a script. They are the facts, and the order to say them in. Speaking from prompts sounds like understanding; reading sentences aloud sounds like recitation, and a lecturer can tell the difference immediately.

## 1.5 How code is quoted, and how you can check it

Every code listing is copied verbatim from the repository at the baseline commit. Nothing has been reformatted, tidied or paraphrased. Comments are included on purpose: in this codebase the comments carry the reasoning, and stripping them would remove the evidence that the reasoning existed before the review did.

This was checked mechanically rather than by eye. A script extracts every line of every listing in this document and asserts that the identical line exists in the repository source. At the time of issue, all 122 listings pass with zero mismatches.

The document renderer was amended for this report so that fenced code blocks are exempt from the document set's dash style rule, because a report that quotes source verbatim must not silently rewrite it. Prose is still checked.

## 1.6 Where this report sits, and two discrepancies to resolve

This report is the architecture and contribution reference. It does not replace the API reference (AQF-07), the user manual (AQF-18), or the project-level decision register (AQF-05). Section 12 explains precisely how this report relates to AQF-05, including which of its records the shipped system has superseded.

Two inconsistencies were found in the existing document set while preparing this report. They are recorded here rather than quietly resolved, because only the team can say which is correct.

1. **Unit and project number.** AQF-05 states "NIT3003 IT Capstone Project, Project 5". AQF-16, the development diary, states "NIT3004 IT Capstone Project 2". This report follows AQF-16 as the more recent document. One of the two needs correcting before submission.
2. **Group identifier.** AQF-05 states "Group 15". AQF-16 does not state a group number. This report follows AQF-05.

# 2. Contribution And Ownership Statement

## 2.1 Why this section exists

A group capstone is assessed on individual contribution as well as on the product. This section states, without ambiguity, who owns what. It is placed before the technical content deliberately, so that a reader knows whose work they are reading before they start reading it.

## 2.2 Basis of this statement

This is a **declaration by the team**, confirmed by all three members. That is stated plainly rather than implied, because the alternative would be to present an inference as a fact.

The repository's commit history was produced through a single shared account, so a commit log attributes every change to one identity and therefore cannot evidence individual authorship. Rather than infer authorship from a source that cannot support it, the team declares ownership directly. Each member is accountable for explaining, defending and maintaining every module listed against their name in section 2.4.

Discipline roles were recorded earlier in the project, in AQF-05, and are reproduced here so that the two documents agree rather than appearing to contradict each other.

## 2.3 Roles and module ownership are two different things

The team has both, they are complementary, and confusing them is the most likely way for a reader to think the documents disagree.

| Member | Discipline role (recorded in AQF-05) | Module ownership (this report) |
| :--- | :--- | :--- |
| Babatundji Williams-Fulwood | Technical Lead and Software Architect | Platform, AI gateway, safety, authentication, privacy, memory, progress analytics, gamification, payments, growth, operations |
| Eric La | Frontend | Training and workout system, end to end |
| Victor Hong | Data and Quality | Nutrition and dietary system, end to end |

The **discipline role** describes the kind of work a member led across the project. The **module ownership** describes the vertical slices of the product each member is accountable for in this report and in the presentation. A member's module ownership includes the client screens, the API endpoints, the domain logic and the tests for that slice, regardless of discipline.

## 2.4 Ownership map

Every source module in the repository appears exactly once in this table. Nothing is unowned.

| Module or path | Owner | Covered in |
| :--- | :--- | :--- |
| `modules/me/targets.ts` (calorie and macro engine) | Victor Hong | 9.1 |
| `modules/foods` (corpus search, barcode, energy cross-check) | Victor Hong | 9.2 |
| `modules/logs` (meal, water, weight logging, idempotency, copy previous) | Victor Hong | 9.2 |
| `modules/vision` (meal photo pipeline) | Victor Hong | 9.3 |
| `modules/recommendations` (allergen filter, meal suggestion) | Victor Hong | 9.4 |
| `modules/recipes`, `modules/export` | Victor Hong | 9.5 |
| `pages/nutrition/*` (nutrition screens) | Victor Hong | 9.1 to 9.5 |
| `data/seeds/foods.ts`, `data/seeds/recipes.ts` | Victor Hong | 9.2, 9.5 |
| `data/seeds/exercises.ts`, `data/wger` (importer, mappings, media) | Eric La | 10.1 |
| `modules/plans` (generator, progression, readiness) | Eric La | 10.2, 10.3 |
| `modules/workouts` (sessions, swap, stats) | Eric La | 10.4, 10.5 |
| `pages/training/*` (library, session logger) | Eric La | 10.1, 10.4 |
| `modules/ai/gateway.ts`, `providers/mock.ts` | Babatundji Williams-Fulwood | 11.3 |
| `modules/ai/guardrails.ts`, `prompts/`, `evals/` | Babatundji Williams-Fulwood | 11.5 |
| `modules/ai/creditLedger.ts`, `tierPolicy.ts` | Babatundji Williams-Fulwood | 11.10 |
| `modules/ai/persona.ts`, `modules/chat`, `modules/coaches` | Babatundji Williams-Fulwood | 11.4, 11.10 |
| `modules/memory` | Babatundji Williams-Fulwood | 11.8 |
| `modules/auth`, `platform/auth.ts`, `platform/rateLimiter.ts` | Babatundji Williams-Fulwood | 11.6 |
| `modules/me/service.ts` (consent, export, deletion, purge) | Babatundji Williams-Fulwood | 11.7 |
| `modules/progress`, `modules/analytics` | Babatundji Williams-Fulwood | 11.9 |
| `modules/payments`, `modules/challenges` | Babatundji Williams-Fulwood | 11.10, 11.11 |
| `platform/store.ts`, `platform/pgStore.ts` | Babatundji Williams-Fulwood | 11.2 |
| `platform/config.ts`, `errors.ts`, `telemetry.ts`, `mailer.ts`, `app.ts` | Babatundji Williams-Fulwood | 11.12 |
| `lib/telegram.ts`, `lib/deeplink.ts`, `lib/attribution.ts` | Babatundji Williams-Fulwood | 11.1, 11.11 |
| `vite-plugins/seo.ts` | Babatundji Williams-Fulwood | 11.11 |
| `packages/shared` (types, schemas, constants, gamification, coaches) | Babatundji Williams-Fulwood | 11.10, and used throughout |
| `modules/admin`, deployment configuration | Babatundji Williams-Fulwood | 11.12 |

## 2.5 What each member is expected to be able to answer

This is the standard each member holds themselves to, and it is stated here so that a lecturer knows what to test.

For every module listed against your name you should be able to answer, without notes:

1. What does it do, in one sentence a non-developer would understand?
2. What was the alternative, and why was it rejected?
3. Where does it live in the codebase?
4. What breaks if it is wrong, and what stops that happening?
5. What is its known limitation?

Sections 9 to 11 give you all five answers for every feature you own. Section 13 gives you the honest limitations. Appendix C is a question bank grouped by owner.

## 2.6 Shared material

Three things belong to the whole team, and any member may be asked about them:

- **The architectural invariant** in section 3.2, which every module obeys.
- **The admission sequence** in section 6.3, which every AI feature runs.
- **The figures in Appendix A**, which any member may be asked to quote.

# 3. What AquaZeroFit Is

## 3.1 In one paragraph

AquaZeroFit is an AI-assisted wellness application. A user enters some basic details, and the app calculates a daily calorie, macronutrient and hydration target for them. They log what they eat, either by hand, by photographing the plate, by scanning a barcode, or by typing a sentence in chat. They follow a training plan the app generates for the equipment they actually own. They can ask a conversational coach questions, and the coach answers using their real numbers. It runs both as an ordinary website and as an app inside Telegram, from one codebase.

## 3.2 The single idea the product is built around

Most of the engineering in this project follows from one decision, and it is worth stating before anything else.

> **Language models identify, interpret and explain. Code calculates, filters and enforces.**

An AI model is genuinely good at looking at a photograph and saying "that is rice and grilled chicken, and that looks like about a hundred and fifty grams". It is not reliable at saying "that is four hundred and twelve calories". It will produce a fluent, confident and wrong number, and it will do so in a way the user has no way to detect.

Applied to somebody's food intake every day for months, a confidently wrong number is not a software defect. It is a health outcome.

So AquaZeroFit uses the model for the first job and never for the second. The model names the food; the application looks that food up in its own database and does the arithmetic itself. The same split appears everywhere. The model may rank meal suggestions, but only from a list the code has already filtered for allergies. The model may phrase a progress summary, but only from statistics the code has already computed. The model may propose a training week, but the plan is validated against the same rules the deterministic generator obeys.

Concretely, in this system a language model **may**:

- name a food it can see in a photograph or read in a sentence;
- estimate a portion size, which code then clamps to a sane range;
- rank a list of candidates that code has already declared safe;
- phrase a sentence about statistics that code has already computed;
- propose a fact about the user, which the user must then approve.

A language model **may not**:

- produce a calorie or macronutrient figure that reaches a log;
- decide whether a food is safe for somebody with an allergy;
- decide how much training a user is prescribed;
- produce a number that appears on the progress card;
- grant an entitlement, move a credit, or unlock a coach.

Everything else in this report is downstream of that decision.

## 3.3 A day in the life

For a reader who wants to understand the product before the architecture, this is what using it actually looks like.

**Morning.** The user opens AquaZeroFit inside Telegram. The app has already worked out their targets from their profile: a calorie figure, a protein, carbohydrate and fat split, and a water goal. The home screen shows a ring: how much of today's budget is left.

They photograph their breakfast. The app uploads the picture, strips the location and camera data out of it, and sends it for analysis. A few seconds later a draft comes back: two items, with portions, and the calories worked out by the app itself rather than by the model. The user corrects the portion of one item and taps confirm. Only now is anything written to their diary, and the photograph is deleted.

**Midday.** They scan the barcode on a packaged lunch. The app checks the barcode is valid before it looks anything up, finds the product, and cross-checks the stated calories against the declared macronutrients to make sure the label is not nonsense.

**Afternoon.** They open today's workout. The app worked out which day of their plan today is, applied the progression rules that have come due this week, and rounded the working weights to plates that actually exist. They work through it set by set, with a rest countdown between sets. One exercise does not suit today, so they swap it, and the app offers a genuinely interchangeable alternative that uses only the equipment they own.

Behind the scenes, the app noticed that last week was a hard week and quietly reduced the volume of this week's plan, rather than holding them to a week they did not get.

**Evening.** They type "I had two eggs on toast and a flat white" into the coach. The model turns that sentence into food names and quantities; the app matches them to its own database, converts to grams, and works out the calories. Where "a coffee" could mean several things, it asks rather than guessing. They confirm.

They ask the coach how the week is going. The coach can see their real numbers, because they consented to that, and answers with them.

**Sunday.** The progress screen tells them what changed and why: weight over the period, workouts completed, average intake against target, hydration. Not just a chart, a sentence. Their consistency figure has gone up, and it did not reset when they missed Wednesday.

## 3.4 What it deliberately is not

Stating this prevents a whole category of misunderstanding.

- **Not a medical device.** No diagnosis, no treatment, no clinical nutrition. This is enforced in code, not written in a disclaimer.
- **Not a social network.** Challenges are private groups between people who already know each other. No public feed, no followers, no discoverability.
- **Not horizontally scalable today.** The storage design is durable for a single running instance. Section 13 explains why that was an acceptable trade and what would change.
- **Not a weight-loss competition.** Nothing in the product awards points for a deficit or a kilogram lost. Section 11.10 explains why that is a safety decision rather than a design preference.

## 3.5 Goals

| # | Goal | How it is evidenced |
| :--- | :--- | :--- |
| G1 | Remove logging friction with AI assistance | Photo capture, chat logging, barcode, copy previous day, all shipped |
| G2 | Never let a model produce a number a user acts on | Every calorie and macro figure traced to deterministic code |
| G3 | Refuse medical, crisis and extreme-diet content safely | Guardrails on input and output, plus safety evaluation sets in the pipeline |
| G4 | Work when the AI does not | Deterministic offline engine behind every model lane |
| G5 | Give the user real control over their data | Opt-in consent, full export, two-step deletion, purge with anonymisation |
| G6 | Ship on two surfaces from one codebase | Responsive web plus Telegram Mini App |
| G7 | Be defensible under review | 770 automated tests, versioned prompts, recorded decisions |

## 3.6 Stakeholders

| Stakeholder | Interest |
| :--- | :--- |
| End user | Logs food and training, receives targets and coaching, owns their data |
| Lecturer and supervisor | Needs to see engineering judgement, not only working software |
| Future maintainer | Needs to change the system without reintroducing a hazard already removed |
| Upstream data providers | wger, Open Food Facts and FoodData Central impose licence and attribution obligations |
| Telegram | Hosts the Mini App and processes payments, and imposes its own contract |

# 4. Glossary

Written for a reader who does not work in software. Terms are ordered by when they first matter rather than alphabetically.

| Term | What it means here |
| :--- | :--- |
| Deterministic | Given the same inputs, always produces the same output. Arithmetic is deterministic. A language model is not. |
| Model, or language model | The AI component. In this product it is used to recognise and describe, never to calculate. |
| Lane | A named category of AI work, for example "chat" or "vision". Our code names a lane, never a specific AI vendor. |
| Guardrail | An automatic check on text going into or coming out of the AI, which blocks unsafe content. |
| Grounding | Giving the AI the user's real data as reference material, so its answer is about them rather than generic. |
| Degraded | The AI answered from a built-in offline fallback because the real providers failed. The user is never charged for it. |
| API | The server's published set of operations the app is allowed to ask for. |
| Endpoint | One specific operation in that set, for example "log a meal". |
| Token (security) | A short-lived digital pass that proves who you are on each request. |
| JWT | A specific standard for such a pass, signed by the server so it cannot be forged. |
| Container (data) | A named collection of records. Roughly equivalent to a table. |
| Idempotent | Doing the same operation twice has the same effect as doing it once. Prevents duplicate meals when a phone retries. |
| Append-only ledger | A record where entries are added but never edited or deleted. Balances are calculated by adding the entries up. |
| Mini App | An application that runs inside Telegram rather than in a browser tab. |
| Prompt | The written instructions given to a language model. Ours are version-controlled files, not text buried in code. |
| Seeded | Data shipped with the application so it works on first run, rather than starting empty. |
| Corpus | A body of reference data. We have a food corpus and an exercise corpus. |

# 5. Requirements

## 5.1 Functional requirements

| Ref | Requirement | Implemented in |
| :--- | :--- | :--- |
| FR-01 | Calculate personalised calorie, macronutrient and hydration targets from a wellness profile | `apps/api/src/modules/me/targets.ts` |
| FR-02 | Never propose an intake below a safety floor, and tell the user when the floor applied | `me/targets.ts`, `guardrails.ts` |
| FR-03 | Search a food composition corpus and log items into four meal slots | `modules/foods`, `modules/logs` |
| FR-04 | Log a meal from a photograph, with mandatory user confirmation | `modules/vision/router.ts` |
| FR-05 | Log a meal from a sentence typed in chat, with mandatory user confirmation | `modules/chat/mealDraft.ts` |
| FR-06 | Exclude foods containing a declared allergen, with no false negatives | `modules/recommendations/allergenFilter.ts` |
| FR-07 | Look up packaged food by barcode | `modules/foods/service.ts` |
| FR-08 | Export the user's diary in a portable format | `modules/export/export.ts` |
| FR-09 | Generate a periodised training plan matched to equipment and experience | `modules/plans/service.ts` |
| FR-10 | Apply progressive overload without hard-coded branching | `modules/plans/progression.ts` |
| FR-11 | Adapt training volume to how the previous week actually went | `modules/plans/readiness.ts` |
| FR-12 | Run a guided workout session with rest timing and per-set logging | `pages/training/WorkoutDetail.tsx`, `modules/workouts` |
| FR-13 | Report training volume and strength trends over time | `modules/workouts/stats.ts` |
| FR-14 | Answer wellness questions grounded in the user's own data | `modules/chat`, `modules/ai` |
| FR-15 | Refuse medical, crisis, extreme-diet and out-of-scope requests with a supportive signpost | `modules/ai/guardrails.ts` |
| FR-16 | Summarise weekly progress in words as well as charts | `modules/progress/insight.ts` |
| FR-17 | Authenticate by email and password, and passwordlessly inside Telegram | `modules/auth` |
| FR-18 | Let the user export and delete all of their data | `modules/me/service.ts` |
| FR-19 | Reward consistent behaviour without rewarding weight outcomes | `packages/shared/src/gamification.ts` |
| FR-20 | Offer selectable coach personas, unlockable by use and optionally by purchase | `modules/coaches`, `modules/payments` |

## 5.2 Non-functional requirements

| Ref | Requirement | How it is met |
| :--- | :--- | :--- |
| NFR-01 Safety | No model output may become a number the user acts on | Architectural invariant, section 3.2, enforced per feature and covered by tests |
| NFR-02 Availability | Core journeys must work when AI providers are down | Provider chain, circuit breakers, deterministic offline engine |
| NFR-03 Latency | A model-backed request must not hang the client | Single overall deadline of 12 seconds across the whole provider chain |
| NFR-04 Security | Session theft must be containable | Short-lived access tokens, single-use refresh rotation, family revocation |
| NFR-05 Privacy | Personal data must not enter model context without explicit consent | Consent checked at every grounding read, defence in depth at the memory layer |
| NFR-06 Data rights | Users must be able to leave with their data | Export endpoint plus two-step deletion with purge and anonymisation |
| NFR-07 Abuse resistance | Credential and model surfaces must resist automated abuse | Four rate-limit lanes, per-email lockout, per-subnet account caps |
| NFR-08 Licensing | Upstream data licences must be honoured | Attribution carried on every record, segregated containers per licence family |
| NFR-09 Portability | Must run locally with zero configuration and in production on a managed host | File-backed store by default, Postgres when configured |
| NFR-10 Accessibility | The guided workout must be usable without sight of the timer | Live-region announcements on every phase change |
| NFR-11 Verifiability | A reviewer must be able to confirm behaviour without reading everything | 770 automated tests plus safety evaluation sets |

## 5.3 Constraints

- **Node 20 or later**, TypeScript throughout, single npm workspace.
- **Licensed AGPL-3.0-or-later.** Any publicly deployed fork must publish its source.
- **One frozen API contract** at `/api/v1`. Clients depend on it; breaking it requires a version.
- **No secrets in the web bundle.** Vite inlines build-time variables, so anything prefixed `VITE_` is public by definition.
- **Telegram Mini Apps cannot use cookie-based sessions reliably**, which constrains the token storage decision recorded in ADR-027.

# 6. High Level Design

## 6.1 System context

```
                    +---------------------------+
                    |          User             |
                    +-------------+-------------+
                                  |
                 +----------------+----------------+
                 |                                 |
        (a) ordinary browser              (b) inside Telegram
                 |                                 |
                 v                                 v
        +--------------------------------------------------+
        |   apps/web    React 18 + TypeScript + Vite        |
        |   one codebase, two delivery surfaces             |
        +--------------------------+-----------------------+
                                   |  HTTPS, JSON, Bearer JWT
                                   v
        +--------------------------------------------------+
        |   apps/api    Node + TypeScript, /api/v1          |
        |                                                   |
        |   auth | me | foods | logs | plans | workouts      |
        |   progress | chat | vision | recommendations      |
        |   coaches | challenges | payments | export | admin |
        +------+----------------+---------------+-----------+
               |                |               |
               v                v               v
     +-----------------+  +------------+  +------------------+
     | Document store  |  | AI Gateway |  | External systems |
     | 10 containers   |  | 5 lanes    |  | Telegram Bot API |
     | JSON or Postgres|  | 5 providers|  | Open Food Facts  |
     |                 |  | + offline  |  | wger corpus      |
     +-----------------+  +------------+  | Resend mail      |
                                          +------------------+
```

## 6.2 Component view

The API is a set of feature modules over a thin platform layer. Modules never reach into each other's storage; they call each other's service functions, and the few deliberate cross-module imports carry a comment explaining why.

```
  apps/api/src
  |
  +-- platform/            cross-cutting, owned by no feature
  |     config.ts          environment resolution + production secret guards
  |     store.ts           document store, memory working set + backing
  |     pgStore.ts         Postgres backing (single documents table, JSONB)
  |     auth.ts            token issue/verify/rotate + requireAuth middleware
  |     rateLimiter.ts     sliding window, four lanes
  |     errors.ts          AppError + single error envelope
  |     telemetry.ts       structured HTTP, AI-call and domain event logs
  |     dates.ts           local-date arithmetic (timezone aware)
  |     mailer.ts          transport selection (resend / console / memory)
  |
  +-- modules/
  |     ai/                gateway, guardrails, credit ledger, tier policy,
  |                        persona, prompts, plan engine, offline mock
  |     me/                profile, derived targets, consents, export, deletion
  |     foods/  logs/      corpus search, barcode, meal/water/weight logging
  |     recommendations/   allergen filter, context-aware meal suggestion
  |     vision/            meal photo pipeline
  |     plans/  workouts/  plan generation, progression, readiness, sessions, stats
  |     progress/          summary, consistency, experience, weekly insight
  |     chat/              sessions, SSE turn, grounding tools, meal draft
  |     memory/            per-user AI memory + extraction
  |     coaches/           roster entitlement, selection, bond
  |     challenges/        private accountability huddles
  |     payments/          Telegram Stars invoices and webhook
  |     analytics/         daily and trend aggregation, growth telemetry
  |     export/  admin/    diary export, operator surfaces
  |
  +-- data/                seed corpus, wger importer, curated media registry
```

## 6.3 The admission sequence

This is the single most important diagram in the document. Every endpoint that can reach a language model runs these steps in this order. There are no exceptions and no fast paths.

```
  client                API                        gateway         providers
    |                    |                             |                |
    |--- request ------->|                             |                |
    |                    | 1. authenticate (JWT)       |                |
    |                    | 2. rate limit (lane)        |                |
    |                    | 3. tier check + reserve     |                |
    |                    |    credits (hold)           |                |
    |                    | 4. INPUT GUARDRAIL          |                |
    |                    |    blocked? release hold,   |                |
    |<-- signpost -------|    audit, supportive reply  |                |
    |                    | 5. gather grounding context |                |
    |                    |    (only with consent)      |                |
    |                    |------ complete(lane) ------>|                |
    |                    |                             |-- provider 1 ->|
    |                    |                             |   retry/breaker|
    |                    |                             |-- provider n ->|
    |                    |                             |-- offline mock |
    |                    |<----- result + degraded ----|                |
    |                    | 6. OUTPUT GUARDRAIL         |                |
    |                    |    + numeric rules          |                |
    |                    | 7. respond, persist,        |                |
    |                    |    settle credits, log      |                |
    |<-- response -------|    (degraded => release)    |                |
```

Two properties follow from the ordering and both matter.

Credits are reserved before the guardrail and released if the guardrail blocks, so a refused turn is free. And the output guardrail sits after the gateway rather than inside it, so it applies identically to real model output and to offline fallback text.

## 6.4 Technology stack

| Layer | Choice | Why this one |
| :--- | :--- | :--- |
| Language | TypeScript, both ends | One type vocabulary shared through `packages/shared`, so an API shape change breaks the client at compile time |
| Web framework | React 18 with Vite | Fast builds, and a build step we could extend with our own prerendering plugin |
| Styling | Tailwind over CSS custom properties | The token layer is what makes Telegram theme binding possible without touching components |
| Data fetching | TanStack Query | Cache invalidation on mutation is the whole nutrition screen's refresh story |
| API framework | Express | Small, well understood, and the middleware chain maps cleanly onto the admission sequence |
| Validation | zod, in `packages/shared` | The same schema validates the request on the server and types the client |
| Auth | jsonwebtoken plus opaque random refresh tokens | Standard access tokens, and refresh tokens that carry no claims worth forging |
| Passwords | bcryptjs | Portability, at a documented cost. See section 13 |
| Images | sharp | Re-encoding is both the privacy measure and the real file type check |
| Testing | Vitest | One runner across three workspaces, fast enough to run on every change |
| Documents | Custom Markdown to DOCX renderer | Documentation lives in the repository as Markdown and is rendered for submission |

## 6.5 Two delivery targets from one codebase

The client decides at bootstrap which surface it is. This detection has to happen without loading Telegram's SDK, because loading that SDK on the marketing page was measurably harmful.

**Where it lives:** `apps/web/src/lib/telegram.ts`

```ts
/**
 * Does this page load look like a Telegram Mini App launch? Answered without
 * the SDK, so it can decide whether to fetch it at all.
 */
export function looksLikeTelegramLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  if (getWebApp()?.initData) return true;
  const surface = `${window.location.hash}${window.location.search}`;
  if (/[#&?]tgWebApp(Data|Version|Platform)=/.test(surface)) return true;
  try {
    return Boolean(window.sessionStorage.getItem(TG_SESSION_KEY));
  } catch {
    // Storage denied (private mode, third-party context) — not a launch signal.
    return false;
  }
}
```

The comment in the source explains the cost that drove this:

```
// The SDK used to be a blocking <script> in index.html, fetched from
// telegram.org on every page load - including the landing page, whose entire
// job is to convert visitors who are *not* in Telegram yet. That put a
// third-party, render-blocking request in front of the marketing site for
// everyone, and made the page hang for precisely the audience least able to
// afford it: the corporate networks that block telegram.org outright, whose
// users are the ones who need the browser fallback the page offers.
```

## 6.6 The architectural invariant

The rule every module in this system obeys is stated in full in section 5.2, together with the explicit list of what a model may and may not do. It is not repeated here. Sections 9 to 11 show, feature by feature, where that line is drawn in code.

# 7. Codebase Overview

## 7.1 Repository map

| Path | Contents |
| :--- | :--- |
| `apps/web` | React 18, TypeScript, Vite, Tailwind. Both delivery targets. |
| `apps/web/vite-plugins/seo.ts` | Build-time prerendering of marketing routes. |
| `apps/api` | Node and TypeScript service implementing `/api/v1`. |
| `packages/shared` | Types, zod schemas, error taxonomy, safety constants, coach roster, progression model. |
| `prompts/` | Versioned prompt files P-01 to P-12. |
| `evals/` | Safety evaluation sets and runner, gated in the pipeline. |
| `content/` | Attribution register and workout media governance. |
| `docs/specs/` | The AQF document set, including this document. |
| `design/` | Screen references and the design system. |
| `tools/docgen` | Markdown to DOCX renderer. Deliberately outside the workspaces so its dependencies never enter the deployed tree. |

Two layout constraints are load-bearing and are recorded here because they look arbitrary. `prompts/` and `evals/` must stay at the repository root: prompt loading walks up the directory tree to find them, and the eval runner loads fixtures as siblings. Moving either silently breaks prompt loading rather than failing loudly.

## 7.2 Module ownership

| Module group | Owner for this document | Presentation section |
| :--- | :--- | :--- |
| Nutrition: targets, foods, logs, vision, recommendations, recipes, export | Victor Hong | Section 7 |
| Training: exercises, plans, progression, readiness, workouts, stats | Eric La | Section 8 |
| Platform, AI gateway, safety, auth, privacy, memory, progress insight, gamification, coaches, payments, growth, operations | Babatundji Williams-Fulwood | Section 9 |

## 7.3 End-to-end trace: logging a meal by photograph

Follow one request through the whole system. This trace is the clearest single demonstration of the invariant in section 3.2.

1. The client uploads a photograph to `POST /api/v1/meal-photos`.
2. `requireAuth` verifies the access token and loads the current user record, so role and tier come from the database rather than from stale token claims.
3. The rate limiter applies the strict lane, twenty requests a minute, because the path contains `meal-photos`.
4. `assertLaneAllowed` checks the user's tier may use the `visionPrimary` lane.
5. `toStorableJpeg` decodes the upload and re-encodes it. This strips all EXIF metadata and simultaneously proves the payload is genuinely an image.
6. Only now are credits reserved. The order matters: a reservation taken before the decode would have no release path if the decode threw.
7. The file is written under a `crypto.randomUUID` filename, which is also the job id, so it cannot be enumerated. The uploads directory is never mounted statically.
8. A background job calls the gateway on the `visionPrimary` lane with a capped list of corpus candidates.
9. The model returns identified items with estimated grams. **Every number it returns is discarded.** Each item is looked up by `foodId` in the corpus and its nutrition is recomputed by code. Items that cannot be grounded are dropped.
10. The output guardrail runs over the raw model text before predictions are accepted.
11. The client polls `GET /meal-photos/:jobId` and renders a draft. Nothing is in the diary yet.
12. The user adjusts and confirms. `POST /meal-photos/:jobId/confirm` re-derives the nutrition from the corpus a second time, because client-supplied macros are never trusted.
13. The meal log is written, the photograph is deleted, and the credit reservation is committed. If the gateway had been degraded, the reservation is released instead and the user is not charged.

## 7.4 End-to-end trace: one coach turn

1. `POST /api/v1/chat/sessions/:id/messages` arrives. Session ownership is checked.
2. Tier is checked and a credit is reserved.
3. The user message is persisted **before** the guardrail runs, so a blocked message still leaves an audit trail.
4. The input guardrail classifies the message. If it blocks, the credit is released, a supportive refusal is persisted as an assistant message, and an SSE error frame is sent. No model is called.
5. If the message passes, consent is checked. Only with `aiPersonalisation` consent do the grounding tools run; without it every tool reports "not available, personalisation off" and the coach answers generically.
6. Prior turns are replayed as conversation history, with guardrail-blocked messages filtered out.
7. The selected coach persona contributes a system message, placed **before** the rules prompt, for the reason given in section 11.4.
8. The gateway streams tokens back over SSE.
9. The output guardrail and numeric rules run on the completed text.
10. The turn is persisted, the credit is committed or released depending on the degraded flag, and memory extraction is fired without being awaited so it can never delay the response.

# 8. Interfaces And Contracts

## 8.1 API surface

The contract is frozen at `/api/v1` and specified in full in AQF-07. The table below is a map, not a reference.

| Group | Representative endpoints | Notes |
| :--- | :--- | :--- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/telegram`, `/auth/password-reset` | The only lane rate-limited per IP alone |
| Profile | `GET /me`, `PATCH /me`, `PUT /me/profile`, `GET /me/targets`, `PUT /me/consents`, `GET /me/export`, `DELETE /me` | Deletion is two-step |
| Foods | `GET /foods`, `GET /foods/:id`, `GET /foods/barcode/:code` | Barcode falls back to Open Food Facts |
| Logging | `POST/GET/PUT/DELETE /meal-logs`, `POST /water-logs`, `POST /weight-logs`, `POST /logs/copy-previous` | Creation routes honour `Idempotency-Key` |
| Analytics | `GET /analytics/nutrition/daily`, `/trends`, `POST /analytics/events` | The events route is the only unauthenticated write |
| Plans | `POST /plans/generate`, `GET /plans/current` | AI lane with deterministic fallback |
| Workouts | `GET /workouts/today`, `POST /workouts/:id/complete`, `POST /workouts/:id/swap-exercise`, `GET /workouts/stats` | `stats` is registered before `/:id` so it is never read as a session id |
| Exercises | `GET /exercises`, `GET /exercises/:id`, `GET /exercises/:id/variations` | Attribution carried on every record |
| Progress | `GET /progress/summary`, `GET /progress/insight` | Insight never returns an error state |
| AI | `POST /chat/sessions`, `POST /chat/sessions/:id/messages` (SSE), `POST /meal-photos`, `POST /recommendations/meals` | All run the admission sequence |
| Coaches | `GET /coaches`, `POST /coaches/select`, `POST /coaches/:id/purchase` | Entitlement decided server-side |
| Social | `POST /challenges`, `POST /challenges/join`, `GET /challenges/peek/:code` | Peek is unauthenticated and deliberately does no recomputation |
| Payments | `POST /telegram/webhook` | Authenticated by shared secret, not by bearer token |
| Export | `GET /export/diary?format=json\|csv` | Portability |
| Ops | `GET /health`, `GET /ready` | Registered before the rate limiter |

## 8.2 Error taxonomy

Every non-success response uses one envelope, `{ code, message, details? }`, with the code drawn from a shared table. Two codes exist purely so that clients can behave differently, and both are documented at the point of definition.

**Where it lives:** `packages/shared/src/errors.ts`

```ts
export const ERROR_CODES = {
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  AUTH_TG_INVALID: 401,
  AUTH_TG_STALE: 401,
  FORBIDDEN: 403,
  // Distinct from FORBIDDEN so clients can deep-link to the consent screen:
  // the resource exists but access requires an explicit opt-in (AQF-07 §3.4).
  CONSENT_REQUIRED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CREDITS_INSUFFICIENT: 402,
  SAFETY_INPUT: 422,
  SAFETY_OUTPUT: 422,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  // Distinct from AI_UNAVAILABLE so a client can tell "the coach can't answer
  // right now" from "this deployment cannot take payments at all" — the first
  // is worth retrying, the second is worth hiding the buy button for.
  PAYMENT_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;
```

The handler that enforces the envelope also guarantees that internal failures never leak.

**Where it lives:** `apps/api/src/platform/errors.ts`

```ts
  // Unknown failure: never leak internals to the client.
  // eslint-disable-next-line no-console
  console.error('[internal-error]', err);
  res
    .status(ERROR_CODES.INTERNAL)
    .json({ code: 'INTERNAL', message: 'Internal server error' } satisfies ApiErrorBody);
```

## 8.3 Data model

Ten containers, modelled on Cosmos container semantics.

| Container | Holds | Notes |
| :--- | :--- | :--- |
| `users` | User records, credentials, refresh tokens, consents, password reset tokens | Credentials and tokens are separate documents, never fields on the user |
| `profiles` | Wellness profile, derived targets, coach state | Targets are denormalised so the dashboard needs no join |
| `logs` | Meal, water and weight logs, idempotency records, buddy challenges | Weight has one canonical document per user per local date |
| `plans` | Training plans and workout sessions | Session id is deterministic from user and date |
| `content` | Foods, exercises, recipes, achievement definitions | Curated corpus, changes only at publication |
| `foodsOff` | Open Food Facts derived records | Segregated for ODbL reasons, see ADR-024 |
| `foodsFdc` | FoodData Central derived records | Segregated for the same reason, CC0 |
| `ai` | Chat sessions and messages, vision jobs, recommendations, insights, user memory, meal drafts | One user sweep covers all of it on purge |
| `ledger` | Credit transactions, pending Stars invoices, completed purchases | Append-only |
| `audit` | Auth events, data access events, guardrail triggers, growth events | Retained anonymised after purge |

The segregation of `foodsOff` and `foodsFdc` from `content` is not tidiness. It is a licence boundary, recorded in the source:

```ts
export const CONTAINERS = [
  'users',
  'profiles',
  'logs',
  'plans',
  'content',
  // Segregated nutrition containers (ODbL collective-database posture,
  // wger-integration-plan.md §2.3): OFF-derived records NEVER commingle with
  // the curated `content` container; FDC (CC0) gets its own namespace too.
  'foodsOff',
  'foodsFdc',
  'ai',
  'ledger',
  'audit',
] as const;
```

## 8.4 The validation boundary

Every request body is parsed by a zod schema defined in `packages/shared/src/schemas.ts`, and the same schemas type the client. Model output is treated as untrusted input and gets the same treatment: the AI plan draft, the memory extraction result and the vision predictions are all parsed before use. This is why an invalid model response degrades to a deterministic path instead of corrupting a plan.

## 8.5 External integrations

| System | Used for | Licence or contract obligation |
| :--- | :--- | :--- |
| wger | Exercise corpus and demonstration media | CC-BY-SA. Licence, author, deed URL and attribution text carried on every record and asset, never stripped |
| Open Food Facts | Barcode product lookup | ODbL. Records held in a segregated container |
| FoodData Central | Composition data | CC0, still namespaced separately |
| Telegram Bot API | Mini App launch validation, Stars payments, receipts | HMAC verification on launch data, shared secret on the webhook |
| Groq, OpenAI, Gemini, NVIDIA, Ollama | Model inference | Selected by which API keys are present; the application names no vendor |
| Resend | Transactional mail for password reset | Production refuses to boot without a real transport |

# 9. Feature Designs: Nutrition

**Module owner: Victor Hong.**

## 9.1 Deterministic calorie and macronutrient targets

### In plain English

Before anything can be tracked, the app has to know what the user is aiming for. From height, weight, age, sex, activity level and goal, it calculates a daily calorie target, a split across protein, carbohydrate and fat, and a hydration target. This is ordinary nutritional arithmetic, done by the app itself.

### Why it is built this way

Two decisions matter here.

First, no language model is involved at any point. A calorie target is the number every other number in the product is measured against, so it has to be reproducible and explainable. Given the same profile, this function returns the same answer forever, and the formula version is stored on the result so we always know which maths produced a number.

Second, the target is clamped to a floor and the user is told when the clamp fired. A very light user with an aggressive goal can produce an arithmetically correct target that is not safe to eat. Silently clamping would be dishonest; refusing to answer would be unhelpful. So the code raises the target to the floor and returns a plain-English reason alongside it.

### Where it lives

`apps/api/src/modules/me/targets.ts`, with the constants in `packages/shared/src/constants.ts`.

### The code

```ts
export function computeTargets(profile: WellnessProfile, now: Date = new Date()): DerivedTargets {
  const bmr = computeBmr(profile);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel];
  const rawTarget = tdee + dailyAdjustment(profile.goal, profile.weightKg);

  // Safety clamp: the engine never proposes intake below the floor (FR-031).
  const floor = KCAL_FLOOR[profile.sex];
  const clamped = rawTarget < floor;
  const kcalTarget = clamped ? floor : rawTarget;
  const clampReason = clamped
    ? `Calculated target (${Math.round(rawTarget)} kcal) is below the safe minimum of ${floor} kcal, so the target was raised to the floor. Consider a gentler rate of change.`
    : null;

  // Macros: protein by goal, fat supplies at least 20% of kcal, carbs remainder.
  const proteinG = PROTEIN_G_PER_KG[profile.goal] * profile.weightKg;
  const fatKcal = kcalTarget * FAT_KCAL_FRACTION_MIN;
  const fatG = fatKcal / KCAL_PER_G.fat;
  const carbsKcal = kcalTarget - proteinG * KCAL_PER_G.protein - fatKcal;
  const carbsG = carbsKcal > 0 ? carbsKcal / KCAL_PER_G.carbs : 0;
```

The constants are held in the shared package with a comment stating their status:

```ts
/**
 * Normative constants per AQF-09 §2.2 TargetCalculator and AQF-06 validation rules.
 * These values are safety-relevant; changes require an ADR (see AQF-05).
 */

export const FORMULA_VERSION = 'mifflin-stjeor-v1';

/** kcal floors: recommendation engine never proposes intake below these (FR-031). */
export const KCAL_FLOOR = {
  female: 1200,
  male: 1500,
  unspecified: 1200,
} as const;
```

### Talking points

- The app has to know what the user is aiming for before it can track anything. Six inputs: weight, height, age, sex, activity level, goal.
- Basal metabolic rate from the Mifflin-St Jeor equation. Multiply by an activity factor, 1.2 sedentary up to 1.9 very active, to get daily expenditure.
- Goal adjustment sized inside a safe band, half to one percent of bodyweight per week. Not an arbitrary deficit.
- Macros follow: protein per kilogram by goal, fat at least twenty percent of energy, carbohydrate takes the remainder. Water is thirty-three millilitres per kilogram, clamped.
- **The two points that matter.** No model touches any of this. And the result is clamped to a floor, 1200 or 1500 kcal depending on sex, with the reason shown to the user rather than hidden.
- The formula version is stored on every set of targets, so we can always say which maths produced a number.

### If asked

*"Why not let the AI work out the target, since it knows nutrition?"*
Because a target is the number every other number in the product is measured against. It has to be reproducible and explainable, and a model is neither. Given the same profile this function returns the same answer forever, which also means we can test it.

### One-line summary

Mifflin-St Jeor basal rate, activity-factored, goal-adjusted inside a safe weekly band, clamped to a floor with a visible reason, all in deterministic code with a versioned formula.

## 9.2 The food corpus, the meal timeline and one-tap logging

### In plain English

The nutrition screen is a day view with four meal slots and a calorie ring. Users search a food database, pick a serving, and the app works out the macros. Three shortcuts remove most of the daily effort: a calendar to move between days, a one-tap copy of yesterday's meals, and a barcode scanner for packaged food.

### Why it is built this way

The "remaining calories" figure is the number users actually look at, so it is defined once, on the server, and every surface reads the same definition. It is target minus net intake, where net intake is what was eaten minus what a completed workout burned. Defining it in two places is how a dashboard and a coach end up disagreeing with each other.

Copy-yesterday is a server-side endpoint rather than a client loop, because a client loop is several requests that can partially fail and leave half a day logged. Barcode lookup checks our own mirror before reaching out to Open Food Facts, and caches whatever it fetches, so the same product is a network call once and a local read forever after. The barcode itself is validated including its GS1 check digit before any lookup, because a mistyped digit should fail locally in a millisecond rather than as a remote miss.

### Where it lives

`apps/api/src/modules/analytics/router.ts`, `modules/logs/service.ts`, `modules/foods/service.ts`, `apps/web/src/pages/nutrition/Nutrition.tsx`.

### The code

The single definition of the day's figures:

```ts
export function dailyNutrition(userId: string, date: string): DailyNutrition {
  const targets = getTargets(userId);
  const logs = mealLogsForDate(userId, date);
  const kcalConsumed = round1(logs.reduce((s, l) => s + l.totalKcal, 0));
  const kcalBurned = round1(kcalBurnedForDate(userId, date));
  const kcalNet = round1(kcalConsumed - kcalBurned);
  return {
    date,
    kcalTarget: targets.kcalTarget,
    kcalConsumed,
    kcalBurned,
    kcalNet,
    kcalRemaining: round1(targets.kcalTarget - kcalNet),
```

Copy-yesterday, as one server-side operation:

```ts
export function copyPreviousDayMealLogs(
  userId: string,
  targetDate: string,
): { copiedCount: number; date: string; sourceDate: string; logs: MealLog[] } {
  const sourceDate = addDays(targetDate, -1);
  const previousLogs = mealLogsForDate(userId, sourceDate);
  const copiedLogs: MealLog[] = [];

  for (const log of previousLogs) {
    const newLog = createMealLog(
      userId,
      {
        mealType: log.mealType,
        items: log.items.map((i) => ({ ...i })),
        localDate: targetDate,
      },
      'manual',
    );
    copiedLogs.push(newLog);
  }
```

Barcode validation, including the GS1 check digit:

```ts
/**
 * EAN-8 / EAN-13 validation including the GS1 check digit.
 * Accepts only all-digit strings of length 8 or 13.
 */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  // From the rightmost data digit, weights alternate 3,1,3,1...
  const sum = digits.reduce((acc, d, i) => {
    const fromRight = digits.length - 1 - i;
    return acc + d * (fromRight % 2 === 0 ? 3 : 1);
  }, 0);
  return (10 - (sum % 10)) % 10 === check;
}
```

And an independent sanity check on any product's stated energy, using the European regulation's conversion factors:

```ts
/**
 * Recompute kcal per 100 g from macros with the EU factors (protein 4,
 * carbohydrates 4, fat 9, fibre 2 kcal/g) and compare against the stated
 * value. Deterministic — code judges, AI only proposes (AQF invariant).
 */
export function crossCheckEnergy(per100g: EnergyCrossCheckInput): EnergyCrossCheckResult {
  const computed =
    per100g.proteinG * 4 + per100g.carbsG * 4 + per100g.fatG * 9 + (per100g.fiberG ?? 0) * 2;
  const delta = Math.abs(per100g.kcal - computed);
  return {
    statedKcal: per100g.kcal,
    computedKcal: round1(computed),
    deltaKcal: round1(delta),
    withinTolerance: delta <= computed * 0.3 + 5,
  };
}
```

Retries are made safe by an idempotency mechanism on every creation route, so a flaky connection cannot double-log a meal:

```ts
/**
 * Wraps a creation handler: when the client supplies an Idempotency-Key that
 * was already used for this route, the original response is replayed.
 */
```

### Talking points

- Four meal slots, breakfast through snacks, around a calorie ring showing target, consumed, burned and remaining.
- Remaining is defined once, on the server: target minus net intake, where net is eaten minus burned. Defining it twice is how a dashboard and a coach start disagreeing.
- Search runs over 139 seeded composition records, each carrying its source and licence. Macros are a lookup and a multiply.
- Three friction removers: a month calendar to move between days, copy-yesterday as a single server request, and barcode scanning.
- Barcode is validated locally first, including the GS1 check digit, so a mistyped digit fails in a millisecond instead of as a remote miss. Then our own mirror, then Open Food Facts, and we cache what we fetch.
- We also recompute the calories from the declared macros using the European regulation factors and flag a label that is outside tolerance.
- Every creation route honours an idempotency key, so a retry on a bad connection cannot double-log a meal.

### If asked

*"Why is copy-yesterday a server endpoint rather than the app just adding the meals again?"*
A client loop is several requests that can partly fail and leave half a day logged. One request either copies the day or does not.

### One-line summary

One server-side definition of the day's numbers, a one-request copy of yesterday, and locally validated barcodes with a cached upstream fallback and an independent energy cross-check.

## 9.3 Meal photo capture, with a mandatory confirmation gate

### In plain English

The user photographs their plate. The app sends the image to a vision model, which names the foods and estimates portions. The app then looks each food up in its own database, calculates the calories itself, and shows the user a draft. Nothing enters the diary until the user confirms it. Once confirmed, the photograph is deleted.

### Why it is built this way

This is the feature where the invariant in section 3.2 earns its keep. The model is genuinely good at "that is rice, that is grilled chicken, that looks like about 150 grams". It is not reliable at "that is 412 calories". So the pipeline keeps the first capability and throws away the second: predictions that cannot be matched to a corpus record are dropped entirely rather than passed through as free text, because an ungrounded identification has no nutrition data behind it.

The confirmation gate is a product requirement, not a nicety. An automatic commit means a wrong estimate silently becomes a user's history.

Two smaller decisions in this pipeline are worth defending. The upload is decoded and re-encoded before it is stored, which strips every metadata block. A phone photograph carries GPS at home-address precision, a capture timestamp and a camera serial number, and none of that belongs bolted onto health-adjacent records. That same re-encode is also the real file type check, because the type the browser declares in the multipart header is attacker-controlled and proves nothing. And it happens before credits are reserved, because a reservation taken earlier would have no release path if the decode threw.

### Where it lives

`apps/api/src/modules/vision/router.ts`.

### The code

The privacy and type check, with its reasoning:

```ts
/**
 * Decode the upload and write a fresh JPEG from the pixels.
 *
 * Privacy: a phone photo carries EXIF GPS at home-address precision, the
 * capture timestamp and the camera serial number. Persisting that verbatim
 * would bolt a location trail onto health-adjacent records that only need the
 * picture of the food. Re-encoding rebuilds the file from decoded pixels, so
 * every metadata block (EXIF, XMP, IPTC, ICC) is discarded — sharp only copies
 * metadata forward when explicitly asked with .withMetadata().
 *
 * Security: this is also the real upload type check. `file.mimetype` is an
 * attacker-controlled multipart header, so it proves nothing — only bytes
 * libvips can actually decode as an image get past this call.
 */
async function toStorableJpeg(buffer: Buffer, declaredMime?: string): Promise<Buffer> {
```

The point where the model's numbers are discarded:

```ts
    const raw = (result.json ?? {}) as { predictions?: { foodId?: string; name?: string; estimatedGrams?: number; confidence?: number }[] };
    const predictions: VisionPrediction[] = [];
    for (const p of raw.predictions ?? []) {
      // Deterministic nutrition: the model identifies, CODE calculates.
      const food = p.foodId ? foods.find((f) => f.id === p.foodId) : undefined;
      if (!food) continue; // never trust free-text identifications we cannot ground
      const grams = Math.min(2000, Math.max(10, Math.round(p.estimatedGrams ?? 100)));
      const grounded = nutritionFromFood(food, grams);
```

And the confirmation step, which re-derives everything a second time rather than trusting the client:

```ts
    // Re-derive nutrition from the food catalog — never trust client macros.
    const foods = await whereDocs<Food>('content', (d: any) => d?.type === 'food');
    const foodById = new Map(foods.map((f) => [f.id, f]));
    const confirmedItems = items.map((item) => {
      if (!item.foodId) {
        throw new AppError('VALIDATION_FAILED', 'Each confirmed item must include a known foodId.', {
          name: item.name,
        });
      }
```

The arithmetic itself is four lines and no model has ever seen them:

```ts
/** Deterministic per-100g lookup x grams — same rule as processJob (brief rule 1). */
function nutritionFromFood(food: Food, grams: number, nameOverride?: string) {
  const factor = grams / 100;
  return {
    foodId: food.id,
    name: nameOverride ?? food.name,
    grams,
    kcal: round1(food.per100g.kcal * factor),
```

### Talking points

- User photographs the plate. Upload is capped at ten megabytes and restricted to JPEG, PNG or HEIC.
- Before anything is stored we decode the image and re-encode it from the pixels. That does two jobs at once.
- Privacy: a phone photo carries GPS at home-address precision, a timestamp and a camera serial number. Rebuilding from pixels discards all of it.
- Security: it is also the real file type check, because the type the browser declares is attacker-controlled and proves nothing.
- The model then names the foods and estimates portions. **Its numbers are thrown away.** We look each item up in our own corpus and compute the calories ourselves. Anything we cannot ground is dropped rather than passed through.
- Nothing reaches the diary until the user confirms. On confirm we re-derive the nutrition a second time, because client-supplied macros are not trusted either, and the photograph is deleted.

### If asked

*"Why drop an item the model identified but you cannot match?"*
Because an ungrounded identification has no nutrition data behind it, so the only way to show it would be to invent the numbers. A missing item the user adds by hand is a much smaller harm than a fabricated one they never notice.

### One-line summary

The model names the food, the code computes the calories, the user confirms before anything is written, and the photograph is deleted afterwards.

## 9.4 Allergen exclusion and context-aware meal suggestions

### In plain English

If a user declares an allergy, the app must never suggest a food containing it. That check is done by the app itself, using two independent methods, before the AI is shown any options at all. Meal suggestions then work on the safe list only: the app calculates the remaining budget, filters the candidates, lets a model rank what survives, and checks the model's answer against the safe list before showing it.

### Why it is built this way

Allergen safety is asymmetric. Blocking a food that was actually fine costs the user a mild inconvenience. Failing to block a food that was not fine can be a hospital visit. The filter is therefore deliberately over-inclusive, and this is stated at the top of the file so nobody later "improves" it into precision.

Two nets are used because either alone fails. Declared allergen fields are authoritative when present but are frequently missing or incomplete in real datasets. A keyword net over the name and ingredient list catches the rest, so satay is caught as peanuts and tahini as sesame even when nothing is tagged.

Critically, the filter runs in code, before candidate selection reaches any model. A model is never asked whether a food is safe, because a model that is right ninety-nine times in a hundred is unacceptable for this decision.

The same shape governs recommendations. Remaining budget is arithmetic. Dietary restriction is a filter. Ranking, which is a matter of taste and has no safety consequence, is the only part delegated to a model, and even then the model's pick is validated back against the safe set before it is used.

### Where it lives

`apps/api/src/modules/recommendations/allergenFilter.ts` and `modules/recommendations/router.ts`.

### The code

The stated contract of the filter:

```ts
/**
 * Deterministic allergen exclusion (AQF-11 §2: zero tolerance for false
 * negatives). This filter runs in CODE, after candidate selection and before
 * any model involvement — a model NEVER decides allergen safety.
 *
 * Two independent nets:
 *  1. The record's declared `allergens` field (authoritative).
 *  2. A name/ingredient keyword fallback map that catches records with missing
 *     or incomplete allergen tagging (e.g. "satay" → peanuts).
 * False positives (over-blocking) are acceptable; false negatives are not.
 */
```

The two nets, and the single choke point:

```ts
/** True when the item may contain the allergen (declared OR keyword hit). */
export function itemContainsAllergen(item: AllergenCheckable, allergen: Allergen): boolean {
  if ((item.allergens ?? []).includes(allergen)) return true;
  const keywords = ALLERGEN_NAME_KEYWORDS[allergen] ?? [];
  const texts = textsOf(item);
  return texts.some((text) => keywords.some((kw) => text.includes(kw)));
}

/**
 * Hard exclusion: returns only candidates that trip NO net for ANY declared
 * allergy. This is the single choke point every recommendation flows through.
 */
export function excludeAllergens<T extends AllergenCheckable>(
  candidates: readonly T[],
  allergies: readonly Allergen[],
): T[] {
  if (allergies.length === 0) return [...candidates];
  return candidates.filter((c) => !allergies.some((a) => itemContainsAllergen(c, a)));
}
```

The recommendation flow, where the model ranks and the code verifies:

```ts
      // --- HARD deterministic allergen exclusion. Never delegated to a model.
      const allergies = profile?.allergies ?? [];
      const safeCandidates = excludeAllergens(candidates, allergies);
```

```ts
      const ranked = (result.json ?? {}) as { rankedIds?: string[]; rationale?: string };
      const safeIds = new Set(safeCandidates.map((c) => c.id));
      const chosenId = (ranked.rankedIds ?? []).find((id) => safeIds.has(id)) ?? safeCandidates[0]!.id;
      const chosen = safeCandidates.find((c) => c.id === chosenId)!;
```

Even the model's explanatory sentence is checked before a user reads it:

```ts
      // Model-authored rationale passes the output guardrail before it can
      // reach the user; on any block the deterministic rationale substitutes.
      const deterministicRationale = `Fits your remaining ~${Math.round(remaining.kcal)} kcal for ${mealType} and supports your protein goal.`;
      let rationale = ranked.rationale ?? deterministicRationale;
      if (ranked.rationale && postGuardrail(ranked.rationale, { userId: user.id }).blocked) {
        rationale = deterministicRationale;
      }
```

Note also that the macro figures on a recommendation come from the content record, never from the model:

```ts
      // Macro figures come from the content record, never from model output.
```

### Talking points

- Nine allergen classes: peanuts, tree nuts, milk, eggs, fish, shellfish, soy, wheat, sesame.
- The filter runs in code, after candidates are selected and **before any model sees them**. A model never gets a vote on allergen safety.
- Two independent nets, because either alone fails. The declared allergen field is authoritative but frequently missing in real data. A keyword net over the name and ingredients catches the rest, so satay is caught as peanuts and tahini as sesame.
- The asymmetry is the whole design: over-blocking costs the user a mild inconvenience, under-blocking can be a hospital visit. So false positives are acceptable and false negatives are not, and that is written at the top of the file so nobody later optimises it into precision.
- Meal suggestions sit on top. Budget is arithmetic, dietary restriction is a filter, and only the ranking, which has no safety consequence, goes to a model.
- Even then the model's pick is checked back against the safe set, and its explanatory sentence passes the output guardrail before a user reads it.

### If asked

*"Could the model overrule the filter if it was confident?"*
No, and it is not asked. A model that is right ninety-nine times in a hundred is unacceptable for this decision, so it is never in the path.

### One-line summary

Two independent allergen nets applied in code before any model sees a candidate, and a suggestion pipeline where the model only ever ranks options the code has already declared safe.

## 9.5 Micronutrients, recipes and data portability

### In plain English

Beyond the four headline numbers, the app tracks six micronutrients across everything logged: fibre, sugars, sodium, potassium, calcium and iron. It ships a recipe library that can be logged in one action. And it can export the user's entire diary as a file, in JSON for another application or CSV for a spreadsheet.

### Why it is built this way

Micronutrients are collapsed behind an expandable panel rather than shown on the main view. A nutrition screen that presents ten numbers with equal weight teaches the user to read none of them. The totals are folded from the logged items themselves rather than stored, so they cannot drift from the log.

Export exists for two reasons and the second is the important one. The obvious reason is interoperability: a user should be able to take their data to a dietitian or another app. The real reason is that data rights are only meaningful if they are exercisable. An app that says you own your data but offers no way to remove it from the app does not mean it.

### Where it lives

`apps/api/src/modules/export/export.ts`, `apps/web/src/pages/nutrition/Nutrition.tsx`, `apps/api/src/data/seeds/recipes.ts`.

### The code

Export totals, folded across the requested range:

```ts
  const totals = {
    totalKcal: round1(allItems.reduce((s, i) => s + (i.kcal || 0), 0)),
    totalProteinG: round1(allItems.reduce((s, i) => s + (i.proteinG || 0), 0)),
    totalCarbsG: round1(allItems.reduce((s, i) => s + (i.carbsG || 0), 0)),
    totalFatG: round1(allItems.reduce((s, i) => s + (i.fatG || 0), 0)),
    totalFiberG: round1(allItems.reduce((s, i) => s + (i.fiberG || 0), 0)),
    totalSugarG: round1(allItems.reduce((s, i) => s + (i.sugarG || 0), 0)),
    totalSodiumMg: round1(allItems.reduce((s, i) => s + (i.sodiumMg || 0), 0)),
    totalPotassiumMg: round1(allItems.reduce((s, i) => s + (i.potassiumMg || 0), 0)),
    totalCalciumMg: round1(allItems.reduce((s, i) => s + (i.calciumMg || 0), 0)),
    totalIronMg: round1(allItems.reduce((s, i) => s + (i.ironMg || 0), 0)),
    totalWaterMl: waterLogs.reduce((s, w) => s + w.amountMl, 0),
  };
```

The client-side micronutrient fold, computed from the day's logged items rather than stored:

```tsx
  const micronutrients = useMemo(() => {
    if (!daily) return { fiberG: 0, sugarG: 0, sodiumMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0 };
    let fiberG = 0;
    let sugarG = 0;
    let sodiumMg = 0;
    let potassiumMg = 0;
    let calciumMg = 0;
    let ironMg = 0;

    for (const mt of MEAL_TYPES) {
      const logs = daily.meals[mt] ?? [];
      for (const log of logs) {
        for (const item of log.items) {
          if (item.fiberG) fiberG += item.fiberG;
          if (item.sugarG) sugarG += item.sugarG;
```

Every seeded record carries its source and licence, which is what makes the corpus defensible:

```ts
    per100g: { kcal, proteinG, carbsG, fatG },
    commonServings,
    allergens,
    source: 'AUSNUT-2011-13',
    licence: 'CC-BY-3.0-AU',
  };
```

### Talking points

- Six micronutrients tracked across everything logged: fibre, sugars, sodium, potassium, calcium, iron.
- Deliberately behind an expandable panel. A screen that shows ten numbers with equal weight teaches the user to read none of them.
- The totals are folded from the logged items rather than stored, so they cannot drift away from the log.
- Seventeen curated recipes with method, timings, per-serving macros, dietary suitability and licence attribution. A recipe can be logged into the timeline in one action.
- Export returns meals, macro totals, micronutrient totals and hydration, as JSON or CSV, filtered by a date or a range.
- Export is there for two reasons. The obvious one is taking your data to a dietitian or another app. The real one is that data rights are only meaningful if you can actually exercise them.

### If asked

*"Why bother with export in a student project?"*
Because the alternative is claiming the user owns their data while giving them no way to take it anywhere, and that claim is the one a marker should test.

### One-line summary

Six micronutrients folded from the log rather than stored, a licensed recipe corpus, and a real export in JSON or CSV so data rights are exercisable rather than asserted.

# 10. Feature Designs: Training

**Module owner: Eric La.**

## 10.1 The exercise corpus and licence governance

### In plain English

The training system is built on a library of exercises, each with its muscle groups, required equipment, difficulty, instructions and demonstration media. Most of that library comes from wger, an open-source exercise database. Because it is other people's work under a share-alike licence, every record carries who made it and under what terms, and the app displays that.

### Why it is built this way

Attribution is a legal obligation, and it is the kind of obligation that is easy to satisfy at import and then lose three refactors later when someone maps records to a smaller shape. So the licence fields are not decoration on the import script; they are fields on the domain type, they survive every mapping, and there is an integration test that fails if they stop appearing in an API response.

Records also carry a variation group identifier. This is what makes the in-session swap in section 10.4 possible without breaking anything: two exercises in the same group are genuinely interchangeable, which means a substitution does not invalidate the user's historical progression for that slot.

### Where it lives

`packages/shared/src/types.ts`, `apps/api/src/data/seeds/exercises.ts`, `apps/api/src/data/wger/importer.ts`, and the review record in `content/`.

### The code

Attribution modelled on the type itself, not bolted on:

```ts
export interface ExerciseMedia {
  kind: 'image' | 'video';
  url: string;
  caption?: string;
  /** Pixel-level provenance. Optional so existing wger/API consumers remain compatible. */
  source?: 'wger' | 'aquazerofit';
  licence?: string;
  licenceAuthor?: string;
  licenceUrl?: string;
  attributionText?: string;
  isAiGenerated?: boolean;
}
```

The seed corpus, with the obligation stated at the top of the file:

```ts
/**
 * Exercise corpus seed (~40 movements, bodyweight / dumbbell / band).
 * Licence and licenceAuthor fields are NEVER stripped — attribution is an
 * AQF-12 obligation carried on every record (AQF-06 §3.3).
 */
```

And the importer carrying it through, including the variation group:

```ts
    media: existingMedia ?? PLACEHOLDER_MEDIA,
    // Attribution — never stripped (AQF-12).
    licence: licence.shortName,
    licenceAuthor: translation.license_author || info.license_author || FALLBACK_AUTHOR,
    sourceId: `wger-${info.uuid}`,
    wgerUuid: info.uuid,
    variationGroup: info.variation_group,
    licenceUrl: licence.url || undefined,
    isAiGeneratedMedia: info.images.some((img) => img.is_ai_generated === true) || undefined,
```

### Talking points

- Fifty-one seeded movements, extended by an importer pulling from wger, the open exercise database.
- Each record carries category, primary and secondary muscles, equipment, difficulty, instructions and demonstration media.
- What makes it more than a table is the licensing discipline. The upstream corpus is Creative Commons share-alike.
- Licence, author, deed URL and attribution text are fields on the domain type, not metadata on the import script. They survive every mapping, and the app displays them rather than hiding them.
- That matters because attribution is easy to satisfy at import and then lose three refactors later when somebody maps records to a smaller shape. There is an integration test that fails if the licence fields stop appearing in an API response.
- Records also carry a variation group identifier. That is what makes the in-session swap possible later, because two exercises in the same group are genuinely interchangeable.

### If asked

*"What actually obliges you to show attribution?"*
The share-alike licence on the upstream corpus. We take the data under its content licence with full attribution, and we take no source code from the project, which is a separate and stricter obligation recorded in AQF-05.

### One-line summary

A share-alike exercise corpus where licence, author and deed URL are fields on the domain type rather than import metadata, so attribution survives every refactor and is displayed to the user.

## 10.2 The training plan generator and progression as data

### In plain English

The app builds a weekly training plan for the user. It looks at what equipment they have and how experienced they are, picks suitable exercises, lays the week out so rest days fall sensibly, and prescribes sets, repetitions and rest for each movement. It also decides in advance how the plan should get harder over the coming weeks.

### Why it is built this way

The generator is deterministic first and AI second, and the ordering is deliberate. Prescribing training load is a calculation with real consequences, so the guaranteed path is code. A model may propose an entire week instead, but its draft is validated structurally with a schema and semantically against the same filtered pool, and any failure at all falls back to the deterministic engine without the user noticing.

The design decision worth the most explanation is that **progressive overload is data, not code**. Instead of writing branching logic that says "in week three, add a set", the generator emits rules keyed by iteration. A rule names the slot, the quantity, the week it applies from and the value. A separate pure engine resolves them.

That has three consequences. The plan is inspectable, so a user or a reviewer can see exactly what week five will ask for. The rules are serialisable, so a model-generated plan can express progression in the same vocabulary as the deterministic one. And the resolution logic is a pure function with no store and no AI, so it can be unit-tested against a reference example.

The engine also supports autoregulation: a rule can require that the previous week's targets were actually met before it applies. That gate fails closed. If the logs cannot confirm the targets were met, the progression simply does not happen.

### Where it lives

`apps/api/src/modules/plans/service.ts` and `modules/plans/progression.ts`.

### The code

Building the candidate pool, with deterministic ordering:

```ts
export function buildExercisePool(exercises: Exercise[], profile: WellnessProfile): Exercise[] {
  return exercises
    .filter(
      (ex) =>
        EXPERIENCE_RANK[ex.difficulty] <= EXPERIENCE_RANK[profile.exerciseExperience] &&
        equipmentAllows(ex, profile.equipment),
    )
    .sort((a, b) => a.id.localeCompare(b.id)); // deterministic ordering
}
```

Calendar placement and the beginner protection:

```ts
/** Calendar placement of workout days (1..7) chosen to respect rest-day rules. */
const DAY_PATTERNS: Record<number, number[]> = {
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 3, 5, 7],
  5: [1, 2, 4, 5, 7],
  6: [1, 2, 3, 5, 6, 7],
};
```

```ts
  // Beginners: no consecutive high-intensity calendar days (AQF-09 §2.4).
  if (profile.exerciseExperience === 'beginner') {
```

Progression emitted as data, not written as branches:

```ts
      // Progressive overload as inspectable data, keyed by iteration:
      // reps first, then volume, then rest density (AQF-09 §2.4 overload order).
      // The volume rule builds on the prescribed sets, so an eased week
      // progresses from where it actually started rather than snapping back.
      progressionRules.push(
        { slotEntryId: entryId, kind: 'reps', iteration: 2, value: rx.reps + 2 },
        { slotEntryId: entryId, kind: 'sets', iteration: 3, value: clampSets(sets + 1) },
        { slotEntryId: entryId, kind: 'rest', iteration: 4, value: Math.max(30, rx.restSeconds - 15) },
      );
```

The pure engine that resolves them, including the fail-closed autoregulation gate:

```ts
  let current: number | null = base;
  for (const rule of applicable) {
    if (!rule.op) {
      // Legacy absolute rule: value is the target from this iteration on.
      current = rule.value;
      continue;
    }
    const applications = rule.repeat ? iteration - rule.iteration + 1 : 1;
    for (let k = 0; k < applications; k += 1) {
      const atIteration = rule.iteration + k;
      if (rule.requires && rule.requires.length > 0) {
        // Autoregulation fails closed: without a gate, or a gate that cannot
        // confirm the previous iteration's logs, the application is skipped.
        if (!gate || !gate(atIteration, rule)) continue;
      }
```

And hard caps mirroring the shared validation schemas, so no rule can ever produce an absurd load:

```ts
const CAPS: Record<RuleKind, { min: number; max: number }> = {
  sets: { min: 1, max: 20 },
  reps: { min: 1, max: 100 },
  rest: { min: 0, max: 900 },
  weight: { min: 0, max: 1000 },
  rir: { min: 0, max: 9.5 },
};
```

The AI lane is admitted only after passing the same contract:

```ts
      if (result && result.draft && result.ai && aiDraftIsValid(result.draft, pool, input.daysPerWeek)) {
```

### Talking points

- Deterministic first, AI second, and the ordering is the point: prescribing training load has real consequences, so the guaranteed path is code.
- Build a candidate pool: equipment the user actually has, difficulty not above their experience, sorted deterministically.
- Lay out the week from calendar patterns chosen so rest days fall sensibly, for two through six sessions a week. Focus rotation follows the goal. Beginners never get two consecutive high-intensity days.
- Sets, reps and rest come from a prescription table keyed by experience and exercise category.
- **The part worth highlighting: progressive overload is data, not code.** Rules keyed by iteration, naming the slot, the quantity and the week it applies from. Reps rise in week two, volume in week three, rest tightens in week four.
- Three consequences: the plan is inspectable so you can see week five today; the rules are serialisable so a model-generated plan speaks the same vocabulary; and the resolver is a pure function that can be unit tested against a reference example.
- The resolver also supports autoregulation, where a rule only applies if last week's targets were actually met. That gate fails closed: if the logs cannot confirm it, the progression does not happen.

### If asked

*"Why not just write the progression as if-statements?"*
Because branching logic is invisible to the user, cannot be tested in isolation, and a model-generated plan has no way to express it. As data it is all three.

### One-line summary

A deterministic generator with an optional validated AI lane, where progressive overload is expressed as inspectable data resolved by a pure, capped engine whose autoregulation gate fails closed.

## 10.3 Adaptive readiness: Protect, Maintain, Progress

### In plain English

Before building or refreshing a plan, the app looks at how the previous week actually went and adjusts how much work it asks for. A hard week produces a lighter plan. A consistent week produces a slightly harder one. Most weeks change nothing.

### Why it is built this way

The single largest cause of abandonment in fitness apps is a plan that does not bend. When life gets in the way, an unyielding programme turns into a daily reminder of failure, and users delete it. Readiness exists so the plan absorbs a hard week on the user's behalf.

The weighting is stated explicitly in the source, and each weight has a written justification, because an unexplained formula that changes how hard somebody trains is worse than a plain one. Session completion dominates at forty-five percent because it is the only signal that measures the thing being modulated. Recency is scored separately from overall activity precisely so that four quiet days in a row reads worse than four quiet days scattered through a week: the first is a run that has stopped, the second is an ordinary week. Intake is deliberately the smallest weight, because it is the noisiest signal and the one most easily turned into food moralising.

Two protections are built in. Signals that cannot be measured are dropped and the remainder renormalised, so nobody is scored down for data the app never had. And a brand-new account is not scored at all, because greeting somebody with "protect" before they have done anything is the opposite of the intent.

The multiplier is applied to sets, and to the day's set total rather than exercise by exercise. Reps could not be scaled safely because a cardio slot's repetition count is a work count while a plank's is a hold, and weight is governed by its own caps and progression gates.

### Where it lives

`apps/api/src/modules/plans/readiness.ts` and `modules/plans/service.ts`.

### The code

The weighting, with its justification, exactly as it appears in the source:

```ts
/**
 * Weighting, stated explicitly because an unexplained formula that changes how
 * hard someone trains is worse than a plain one. The four weights sum to 100
 * when every signal is measurable; when one is not (no plan, no intake target)
 * it is dropped and the remainder is renormalised, so a user is never scored
 * down for data the app never had.
 *
 *  completion 45 — did the prescribed training actually happen? The only
 *                  signal that measures the thing readiness modulates, so it
 *                  carries the most weight.
 *  logging     25 — did the user show up in the app at all? A broad, low-effort
 *                  proxy for the week going to plan; deliberately weaker than
 *                  completion because opening the app is not training.
 *  recency     20 — is the run still going? Weighted separately from `logging`
 *                  precisely so that four quiet days in a row read worse than
 *                  four quiet days scattered through the week: the first is a
 *                  run that has stopped, the second is a normal week.
 *  intake      10 — is fuelling stable? Smallest weight on purpose. It is the
 *                  noisiest signal and the one most easily turned into food
 *                  moralising, so it may nudge the band but never decide it.
 */
const WEIGHTS = {
  completion: 45,
  logging: 25,
  recency: 20,
  intake: 10,
} as const;
```

The cold-start protection:

```ts
/**
 * Below this many days of observed history we do not score at all. Greeting a
 * brand-new user with `protect` would tell them they are struggling before
 * they have done anything, which is the exact opposite of the intent.
 */
const MIN_HISTORY_DAYS = 3;
```

The intake signal, symmetrical by design:

```ts
/**
 * Intake deviation, as a fraction of target, at which the intake component
 * reaches zero. Applied to the absolute deviation: eating well under target
 * costs exactly as much as eating well over it. Under-eating is never scored
 * as virtue — that is the disordered-eating pattern this product must not
 * reward.
 */
const INTAKE_ZERO_AT_DEVIATION = 0.3;
```

Scoring and band selection:

```ts
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const overall = components.reduce((sum, c) => sum + c.weight * c.fraction, 0) / totalWeight;
  const score = clamp(Math.round(overall * 100), 0, 100);
  const mode = modeForScore(score);
```

And the bands themselves, in the shared constants:

```ts
export const READINESS_PROTECT_MAX_SCORE = 39;
export const READINESS_MAINTAIN_MAX_SCORE = 74;
export const READINESS_VOLUME_MULTIPLIER = {
  protect: 0.6,
  maintain: 1,
  progress: 1.1,
} as const;
```

The user-facing copy is written to match the intent, and this is enforced by comment at the top of the module: nothing here may frame a quiet week as a shortfall.

```ts
const HEADLINES: Record<ReadinessMode, string> = {
  protect:
    'Lighter week ahead — we have eased the volume so you can get back into rhythm.',
  maintain: 'Steady week — your plan carries on exactly as it is.',
  progress: 'Strong rhythm — we have nudged this week up a notch.',
};
```

### Talking points

- Before a plan is built we score how the last seven days actually went, and adjust the volume.
- Four signals. Completion at forty-five percent, because it is the only one that measures the thing we are modulating. Broad check-in activity at twenty-five. Recency at twenty. Intake at ten.
- Recency is scored separately from activity on purpose, so four quiet days in a row reads worse than four quiet days scattered through the week. The first is a run that has stopped, the second is an ordinary week.
- Intake is deliberately smallest. It is the noisiest signal and the easiest to turn into food moralising, so it can nudge the band but never decide it. The deviation is absolute, so eating well under target costs exactly as much as eating well over it.
- Signals we cannot measure are dropped and the rest renormalised, so nobody is scored down for data we never had. A new account is not scored at all for the first three days.
- Three bands: Protect eases volume to sixty percent, Maintain leaves it alone, Progress adds ten percent.
- The multiplier applies to sets, and to the day's set total rather than exercise by exercise, because per-exercise rounding destroys the intent in both directions.

### If asked

*"Is Protect not just telling the user they failed?"*
It is written specifically not to. A hard week is the ordinary case, not a failure state, and holding somebody to a plan built for a week they did not get is how plans get abandoned. Every string in that module is written to read that way, and that constraint is stated in the file header.

### One-line summary

A four-signal weighted score over the trailing week, with every weight justified in the source, mapping to a working-volume multiplier applied to set totals, and never framing a quiet week as a failure.

## 10.4 The guided session logger

### In plain English

When a user starts a workout, the app becomes a step-by-step guide. It shows the current exercise, the target sets, repetitions and load, records what was actually done set by set, runs a rest countdown between sets, and lets the user swap an exercise that does not suit. At the end it computes the session's duration and an energy estimate.

### Why it is built this way

Today's session is derived from the plan rather than stored in advance, which means a plan edit does not have to migrate a queue of future sessions. But once a session is resolved, its targets are frozen onto the session document, so the user's history survives a later plan edit. That is the reason the session records both target and actual for weight, repetitions and reps in reserve: analytics needs to know what was asked for as well as what happened.

The server hands the client a fully resolved read model with the folded sets, plate-rounded weights and rest timers already computed. The Telegram Mini App therefore renders a session with almost no client-side logic, which keeps the two delivery surfaces consistent.

The swap is deliberately constrained rather than free. It tries the same variation group first, because those are genuinely interchangeable; then, optionally, a model ranking; and then the same primary muscle. The model's suggestion is re-validated against the deterministic constraints, and a model failure never blocks the swap.

The energy estimate is scaled by the proportion of prescribed work actually performed, with a floor, so skipping most of a session does not award a full session's burn.

### Where it lives

`apps/api/src/modules/workouts/service.ts` and `apps/web/src/pages/training/WorkoutDetail.tsx`.

### The code

Freezing targets at resolution time:

```ts
        exercises.push({
          exerciseId: entry.exerciseId,
          name: exercise?.name ?? entry.exerciseId,
          setsPlanned: rx.sets,
          setsCompleted: 0,
          reps: rx.reps,
          restSeconds: rx.restSeconds,
          skipped: false,
          // Targets frozen at resolution time — history survives plan edits.
          targetWeightKg: rx.weightKg,
          targetReps: rx.reps,
          targetRir: rx.rir,
        });
```

The effort-scaled energy estimate:

```ts
  // Effort-scaled estimate: full rate for performed work only.
  const performedRatio =
    exercises.length === 0
      ? 0
      : exercises.filter((e) => !e.skipped).length / exercises.length;
  const kcalBurned = Math.round(
    input.durationMinutes * kcalPerMinuteFor(session.focus) * Math.max(0.5, performedRatio),
  );
```

The swap ordering, with the model's role bounded:

```ts
  // Deterministic order: same variationGroup first (wger interchangeable
  // variants — the gold-standard swap), always within the equipment-filtered
  // pool. AI ranking below never overrides a group sibling.
```

```ts
  // Optional AI ranking (P-06) for the muscle-match tier: the model proposes,
  // code disposes — any AI pick must pass the deterministic equipment/muscle
  // constraints (same primary muscle, pool membership, not already in session).
```

The rest countdown on the client, which also drives an accessibility announcement so the session is usable without watching the timer:

```tsx
  // rest countdown (beep-free)
  useEffect(() => {
    if (phase !== 'rest' || restLeft <= 0) return;
    const t = window.setTimeout(() => {
      if (restLeft - 1 <= 0) {
        setPhase('work');
        setAnnounce('Rest complete. Next set.');
      }
      setRestLeft((s) => s - 1);
    }, 1000);
    return () => window.clearTimeout(t);
  }, [phase, restLeft]);
```

### Talking points

- Today's session is derived from the plan by counting days since it started, not stored in advance, so a plan edit does not have to migrate a queue of future sessions.
- But once resolved, the targets are frozen onto the session document, so a later plan edit does not rewrite the user's history. The session records target and actual for weight, reps and reps in reserve.
- The server hands the client a fully resolved read model: folded sets, plate-rounded weights, rest timers already computed. The Mini App renders a session with almost no client-side logic, which keeps both surfaces consistent.
- The logger is a guided stepper with a rest countdown between sets, and it announces every phase change to a screen reader so it is usable without watching the timer.
- The swap is constrained, not free: same variation group first, then optionally a model ranking, then same primary muscle. The model's suggestion is re-validated against the deterministic constraints, and a model failure never blocks the swap.
- The energy estimate is scaled by how much of the prescribed work was actually performed, with a floor, so skipping most of a session does not award a full session's burn.

### If asked

*"Why freeze the targets instead of recomputing them?"*
Because analytics needs to know what was asked for as well as what happened. If the plan changes in March, the January sessions must still say what January prescribed.

### One-line summary

A server-resolved session with frozen targets and per-set actuals, a constrained swap where a model may rank but never decide, and an energy estimate scaled by work actually performed.

## 10.5 Training analytics and achievements

### In plain English

Everything logged during a session feeds a statistics layer that reports training volume and strength trends per week, per exercise and per muscle group, and unlocks achievement badges at milestones.

### Why it is built this way

This layer contains no AI at all, and that is precisely what makes it useful: the weekly insight feature in section 11.9 quotes these numbers, so they have to be trustworthy on their own.

The estimated one-repetition maximum uses the Brzycki formula, and the formula version is returned in the response. That matters because strength estimates are compared over months. If the formula were ever changed without a version marker, every historical number a user had seen would silently move, and there would be no way to tell an improvement from a formula change.

Weeks with no logged work are omitted rather than emitted as zero, because a zero on a chart reads as a bad week rather than an absent one.

One achievement decision is worth stating. Streak achievements are evaluated against the user's best-ever run rather than their current one. Evaluating against the current run meant a badge already earned disappeared the moment somebody missed a day, which is a harsher signal than the resetting counter the consistency model in section 11.9 was built to remove.

### Where it lives

`apps/api/src/modules/workouts/stats.ts` and `modules/progress/service.ts`.

### The code

The pinned formula:

```ts
export const E1RM_FORMULA_VERSION = 'brzycki-v1';

/** Brzycki e1RM in kg; undefined outside 1–36 reps or without a load. */
export function brzyckiE1rm(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps >= 37) return null;
  return Math.round(((weightKg * 36) / (37 - reps)) * 100) / 100;
}
```

Volume and best estimate per exercise per week:

```ts
      const volumeKg = sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * s.reps, 0);
      const bestE1rm = sets.reduce<number | null>((best, s) => {
        if (s.weightKg === null) return best;
        const e1rm = brzyckiE1rm(s.weightKg, s.reps);
        return e1rm !== null && (best === null || e1rm > best) ? e1rm : best;
      }, null);
```

Empty weeks omitted:

```ts
  // Weeks with no logged work (e.g. all-skipped sessions) are not emitted.
  return [...buckets.values()]
    .filter((week) => week.sets > 0)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
```

And the achievement decision, with its reasoning preserved in the source:

```ts
    case 'streak': {
      // Evaluated against the never-decreasing high-water mark, not the current
      // run. Against the current run this returned null again the moment a user
      // missed a day, which *revokes an already-earned badge* — a harsher
      // signal than the reset counter this feature exists to remove. Earned
      // once, kept.
```

### Talking points

- This layer has no AI in it at all, and that is exactly what makes it useful: the weekly insight feature quotes these numbers, so they have to be trustworthy on their own.
- Completed sessions are bucketed into ISO weeks. We compute set counts and volume, load multiplied by reps, per exercise and per muscle group.
- Estimated one-rep max uses the Brzycki formula, and the formula version is returned in the response.
- That version matters because strength is compared over months. Change the formula without a marker and every historical number a user has seen moves silently, and there is no way to tell an improvement from a formula change.
- Weeks with no logged work are omitted rather than shown as zero, because a zero on a chart reads as a bad week rather than an absent one.
- Achievements evaluate eleven seeded definitions. Streak achievements are evaluated against the user's best ever run, not their current one, because revoking a badge somebody already earned is harsher than the resetting counter we removed.

### If asked

*"Is an estimated one-rep max not just a guess?"*
It is an estimate from a published formula, and we present it as one. The value is in the trend rather than the absolute number, which is why pinning the formula version matters more than picking the perfect formula.

### One-line summary

An AI-free statistics layer with a version-pinned strength formula, absent weeks omitted rather than zeroed, and achievements that are never revoked once earned.

# 11. Feature Designs: Platform, AI, Safety And Operations

**Module owner: Babatundji Williams-Fulwood.**

## 11.1 Two delivery surfaces and the theme binding

### In plain English

One codebase serves both an ordinary website and an app running inside Telegram. Inside Telegram, the app adopts the colours the user has chosen in their chat client, so it feels native rather than pasted in. But it only does that when the resulting colours would still be readable.

### Why it is built this way

Adopting a host theme naively is how an app becomes unreadable. Our brand foregrounds are fixed, light colours designed for a dark surface, and roughly two hundred usages across the app assume that ramp. Repainting them from a chat client would make the product unrecognisable and would break paired colour tokens outright.

So the binding is partial and measured. Only the neutrals are bound: page background, the container ramp, primary and secondary text, hairlines. The brand colours are never rebound. And before binding anything, the code computes the WCAG contrast ratio of every fixed brand foreground against the candidate background and refuses the whole binding if any of them would fall below the AA threshold. A light Telegram theme fails that gate and the shipped dark palette renders instead.

This is a measurement, not an assumption that the host is dark. Telegram's own hint colour is frequently below AA against its own background, so rather than accepting it or discarding it, the code walks it towards the text colour until it passes. The host's intent survives and the contrast floor holds.

### Where it lives

`apps/web/src/lib/telegram.ts`, with tests in `telegramTheme.test.ts`.

### The code

The contrast gate:

```ts
/**
 * True when a candidate page background keeps every fixed brand foreground at
 * AA. This is the whole light/dark question, answered by measurement rather
 * than by reading colorScheme.
 */
export function keepsBrandLegible(background: Rgb): boolean {
  return FIXED_BRAND_FOREGROUNDS.every(
    (fg) => contrastRatio(fg, background) >= AA_TEXT_CONTRAST,
  );
}
```

The refusal path:

```ts
export function resolveTelegramNeutrals(
  theme: Record<string, string> | undefined,
): Record<string, string> {
  const background = parseHexColor(theme?.['bg_color']);
  if (!background || !keepsBrandLegible(background)) return {};
```

And the hint colour walk:

```ts
  // Telegram's hint colour is routinely below AA against its own background
  // (#708499 on #17212b is 4.2:1). Rather than drop it or accept it, walk it
  // towards the text colour until it passes — the host's intent survives, the
  // contrast floor holds.
  const hint = parseHexColor(theme?.['hint_color']);
  if (hint) {
    for (let step = 0; step <= 10; step += 1) {
      const candidate = mix(hint, anchor, step / 10);
      if (contrastRatio(candidate, background) >= AA_TEXT_CONTRAST) {
        bound['--azf-on-surface-variant'] = channels(candidate);
        break;
      }
    }
  }
```

### Talking points

- One React and TypeScript codebase serves two surfaces: a responsive website and a Telegram Mini App. The client detects at bootstrap which one it is in.
- Inside Telegram we adopt the host's theme, but only the neutrals: background, container ramp, text, hairlines. Brand colours are never rebound, because roughly two hundred usages across the app assume that exact ramp and paired tokens would break outright.
- Before binding anything we compute the WCAG contrast ratio of every fixed brand foreground against the candidate background, and refuse the whole binding if any falls below AA. A light Telegram theme fails that gate and our own palette renders instead.
- That is a measurement, not an assumption that the host is dark. Telegram's own hint colour is routinely below AA against its own background, so rather than accept or discard it we walk it towards the text colour until it passes.
- We also do not ship the Telegram SDK in the page head. It is fetched, with a five-second timeout, only when the URL fragment shows a real Mini App launch.
- That last one was a measured cost: a blocking third-party script was stalling the marketing page for exactly the corporate-network users the browser path exists to serve.

### If asked

*"Why not just read whether Telegram says light or dark?"*
Because that flag tells you the host's intent, not whether our fixed brand colours will still be readable on it. We check the thing we actually care about.

### One-line summary

Host theme adoption gated on a computed WCAG AA contrast check, binding only neutrals and never the brand ramp, so a light host theme degrades to the shipped palette rather than to unreadable text.

## 11.2 The storage abstraction

### In plain English

All data is stored as documents in ten named collections. The whole working set is kept in memory so reads are instant, and writes are saved to permanent storage in the background. In development that permanent storage is a set of files; in production it is a Postgres database. The application code does not know or care which.

### Why it is built this way

The synchronous read interface is called from roughly seventy-seven places. Converting all of them to asynchronous calls to gain a database round trip per read would have been a large change with no user-visible benefit, so the abstraction keeps reads synchronous from the memory copy and moves only persistence.

Writes are coalesced. A burst of writes marks documents dirty and schedules one flush per macrotask, and flushes are serialised through a queue so two cannot interleave and corrupt the backing copy. The dirty tracking is per document identifier rather than per collection, because the Postgres backing must not rewrite all of the content records every time one meal log changes.

Two failure behaviours are deliberate. A failed flush re-marks its batch dirty so the next flush retries it, merged underneath any newer changes so recent writes still win. And a corrupt JSON file is copied aside and the container starts empty rather than crashing the API, because a corrupt cache of public content should not take the service down.

The honest limitation is stated in section 13: because each instance hydrates its own working set, the Postgres backing is durable for a single instance only.

### Where it lives

`apps/api/src/platform/store.ts` and `platform/pgStore.ts`.

### The code

The dirty-tracking invariant, which prevents a write and a delete racing in one batch:

```ts
    // The two sets must stay disjoint: an id written then deleted inside one
    // batch is a delete, and a deleted id written again is a write. Otherwise
    // the flush would issue both statements for the same row in one batch and
    // the outcome would depend on statement order.
    if (op === 'write') {
      delta.deleted.delete(id);
      delta.changed.add(id);
    } else {
      delta.changed.delete(id);
      delta.deleted.add(id);
    }
```

Retry on flush failure, merged so newer writes win:

```ts
        // Re-mark the failed batch dirty so the next flush retries it —
        // otherwise these ids are only re-persisted if they happen to change
        // again, which under per-id backing (Postgres) loses them on restart.
        // Merge UNDER any newer dirt: changes recorded since the failure are
        // strictly newer and must win.
```

Crash-safe file writes:

```ts
  async persist(batch: ReadonlyMap<ContainerName, ContainerDelta>): Promise<void> {
    for (const name of batch.keys()) {
      const file = containerFilePath(this.dataDir, name);
      const tmp = `${file}.tmp`;
      const payload = JSON.stringify([...this.container(name).values()], null, config.isTest ? 0 : 1);
      await fs.promises.writeFile(tmp, payload, 'utf8');
      await fs.promises.rename(tmp, file);
    }
  }
```

And a refusal to serve an unhydrated Postgres store, because an empty store would look like a brand-new database and re-seed over live data:

```ts
export function getStore(): MemoryBackedStore {
  if (postgresEnabled()) {
    if (!singleton) {
      throw new Error(
        'Store not initialised: DATABASE_URL is set, so initStore() must be awaited before getStore().',
      );
    }
```

### Talking points

- Ten logical containers, modelled on Cosmos container semantics: users, profiles, logs, plans, content, two segregated nutrition containers, AI, ledger, audit.
- The nutrition containers are separate for a licence reason, not for tidiness. Open Food Facts carries a share-alike database licence, and commingling it with our curated corpus would attach that obligation to the mixed collection.
- One abstraction, two backings. The working set is in memory and every read is served synchronously from it. Writes hit memory immediately and flush asynchronously through a serialised queue.
- Why synchronous reads: the read interface is called from around seventy-seven places. Converting all of them to async to gain a database round trip per read is a large change with no user-visible benefit at this scale.
- Locally, one JSON file per container, written through a temporary file and a rename so a crash cannot truncate it. With a database URL set, Postgres, one documents table with JSONB and per-document write granularity.
- Dirty tracking is per document, not per container, so a single meal log does not rewrite all thousand content records.
- Two failure behaviours worth naming: a failed flush re-marks its batch dirty and retries, merged underneath newer changes; and a corrupt file is copied aside so the container starts empty rather than the API crashing.
- **The honest limit:** each instance hydrates its own working set, so this is durable for a single instance. Scaling out needs reads moved off the local copy. That is recorded, not hidden.

### If asked

*"Is that not just a database you wrote yourself?"*
It is a persistence layer over a document model, deliberately thin. The container model came from the Cosmos design in AQF-05; what changed is the vendor underneath it, and the reasoning for that change is ADR-028.

### One-line summary

One document abstraction with synchronous in-memory reads, coalesced and serialised per-document writes, crash-safe file persistence, and a Postgres backing that refuses to serve before hydration rather than re-seeding over live data.

## 11.3 The AI Gateway

### In plain English

Every AI request in the product goes through one place. The application never names a vendor or a model; it names a category of work. The gateway picks a provider based on which credentials exist, retries sensible failures, stops using a provider that keeps failing, and, if everything fails, falls back to a built-in offline engine so the app still works.

### Why it is built this way

Naming a vendor in feature code means changing feature code to change vendor, and it means every feature has its own opinion about timeouts and retries. Naming a lane means the routing policy lives in one file.

The resilience layer was added because the naive chain has an arithmetic problem: five providers at a twenty-second timeout each is a hundred seconds, which is not a latency any request-bound caller can absorb, particularly chat streaming over an already-open socket. So there is one overall deadline for the entire call, and callers may tighten it but never extend it.

A circuit breaker matters for the same reason: a provider that is down should stop costing every subsequent request its full timeout. The breaker counts failed calls rather than failed attempts, so a single flaky request cannot blackhole a provider.

The most important detail is the `degraded` flag. There are two ways to reach the offline engine and they are not the same event. If no keys are configured, the offline engine **is** the product working as designed, and billing is normal. If real providers were tried and failed, the user is holding template text instead of a model answer, and charging them for that is wrong. So the gateway distinguishes the two, and every billing lane branches on it.

### Where it lives

`apps/api/src/modules/ai/gateway.ts`, with the offline engine in `ai/providers/mock.ts`.

### The code

Lanes, not vendors. Application code only ever passes one of these:

```ts
/** Logical model groups (AQF-09 §2.3): app code never names real providers. */
export const MODEL_GROUPS = {
  visionPrimary: 'visionPrimary',
  chatFast: 'chatFast',
  planStructured: 'planStructured',
  safetyCheap: 'safetyCheap',
  insightBatch: 'insightBatch',
} as const;
```

The budget arithmetic that motivated the overall deadline:

```ts
/**
 * Ceiling for the entire complete() call, every fallback hop included. The
 * per-provider timeout alone allowed ~100s across the five-provider chain,
 * which no request-bound caller can absorb.
 */
const OVERALL_DEADLINE_MS = 12_000;
/** Attempts after the first, per provider, for transient failures only. */
const MAX_RETRIES_PER_PROVIDER = 2;
const BACKOFF_BASE_MS = 200;
/** A provider that fails this many calls in a row is skipped for a cooldown. */
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 60_000;
```

The distinction that decides billing:

```ts
  // Callers may tighten the budget but never extend it past the ceiling.
  const deadlineAt = Date.now() + Math.min(opts.deadlineMs ?? OVERALL_DEADLINE_MS, OVERALL_DEADLINE_MS);
  const remainingMs = (): number => deadlineAt - Date.now();
  // A credentialed provider that was tried (or skipped because its breaker is
  // open) is what separates "everything real failed" from "no keys are
  // configured, the offline engine is the intended answer".
  let realProviderInPlay = false;
  let deadlineExceeded = false;
```

Backoff that does not outlive the deadline:

```ts
        if (!failure.retryable || attempt === maxAttempts) break;
        const wait = failure.retryAfterMs ?? backoffDelayMs(attempt);
        // Sleeping past the deadline only delays the fallback the caller is
        // going to get anyway — move on instead.
        if (wait >= remainingMs()) break;
        await sleep(wait);
```

Breaker semantics:

```ts
    // One failure per provider per call: the breaker measures bad calls, not
    // bad attempts, so a single flaky request cannot blackhole a provider.
    recordProviderFailure(provider.name);
```

And the fallback, with the flag that protects the user's credits:

```ts
  // Deterministic offline engine — the product must work with zero keys. It is
  // never retried and never timed out: the eval runner and test suite depend on
  // its output being byte-identical.
  const started = Date.now();
  const degraded = realProviderInPlay;
  const degradedReason: DegradedReason | undefined = degraded
    ? deadlineExceeded
      ? 'deadline_exceeded'
      : 'provider_failure'
    : undefined;
```

Every consuming lane honours it. From the recommendation router:

```ts
      // Real providers failed and the gateway fell back to offline templates —
      // do not charge. Keyless mock (no providers configured) keeps degraded
      // false and bills normally per product rules. Same stance as the chat lane.
      if (result.meta.degraded) {
        await creditLedger.release(reservationId);
      } else {
        await creditLedger.commit(reservationId);
      }
```

### Talking points

- Every AI call goes through one module. Application code never names a vendor or a model, it names a lane: vision primary, chat fast, plan structured, safety cheap, insight batch.
- Why: naming a vendor in feature code means changing feature code to change vendor, and it means every feature invents its own timeout and retry policy.
- The gateway maps a lane onto a chain of providers, currently Groq, OpenAI, Gemini, NVIDIA and a local option, selected purely by which API keys exist in the environment.
- Resilience was added for an arithmetic reason: five providers at a twenty-second timeout each is a hundred seconds, which no request-bound caller survives, least of all chat streaming over an open socket. So there is one overall deadline of twelve seconds for the entire call, and callers may tighten it but never extend it.
- A provider failing three calls in a row trips a circuit breaker for a cooldown, so a provider that is down stops costing every later request its timeout. The breaker counts failed calls, not failed attempts, so one flaky request cannot blackhole a provider.
- If everything fails, or if no keys are configured at all, we fall back to a deterministic offline engine, so every core journey still works.
- **The detail that matters most is the degraded flag.** Reaching the offline engine because no keys are configured is the product working as designed, and billing is normal. Reaching it because real providers failed means the user is holding template text, and charging for that is wrong. Every billing lane branches on it.

### If asked

*"How do you know the fallback actually works?"*
The offline engine's output is byte-identical for a given input, and the entire test suite and the safety evaluation runner depend on that. If it broke, 614 API tests would fail.

### One-line summary

One routing point where features name a lane rather than a vendor, wrapped in retries, per-provider circuit breakers and a single overall deadline, falling back to a deterministic offline engine that is never billed when it was reached by failure.

## 11.4 Aqua Coach: grounding, streaming and personas

### In plain English

Aqua Coach is the chat assistant. Before it answers, the app gathers the user's real numbers, today's calories, workout, plan and progress, and gives them to the model as reference material. The answer streams back word by word. Users can pick which of nine coach characters they talk to, and the character changes the tone only.

### Why it is built this way

An assistant that cannot see the user's data gives generic advice, which is worse than no assistant. So grounding tools run before every turn. But grounded context is personal data, so all of it is behind an explicit consent. With that consent off, no profile data, no logs, not even the display name enter model context, and each tool reports that personalisation is off. The coach still works, it just answers generically.

The persona design is where a real safety decision hides. The character contributes one system message, and it is placed **before** the rules prompt rather than after it. Instruction-following degrades toward the end of a prompt in every model family we route to, so putting the rules last places the refusals, the calorie floor and the crisis path in the strongest position and the voice in the weaker one. If the two ever conflict, the arrangement resolves it safely before the persona's own subordination clause is even consulted. They are returned as two separate messages rather than one concatenated string so that the boundary between "who you sound like" and "what you must do" stays visible in the provider payload. There is a test that fails if anybody merges or reorders them.

Chat-native meal logging follows the same shape as photo capture: the model's entire contribution is turning a sentence into food name, quantity and unit, and everything numeric happens in code. Where a phrase matches several corpus records, the ambiguity is preserved and the user must choose, because silently picking the first match would be indistinguishable, from the log's point of view, from the user having chosen it.

### Where it lives

`apps/api/src/modules/chat/`, `modules/ai/persona.ts`, `packages/shared/src/coaches.ts`.

### The code

The persona ordering and its justification:

```ts
/**
 * Persona layer over P-07 (Character Bible, Appendix C).
 *
 * The selected coach contributes ONE system message, and it goes **before**
 * P-07 rather than after it. That ordering is the whole safety argument:
 *
 *   [persona voice] [P-07 rules] [grounding context] …history… [user]
 *
 * The Bible specifies the persona is prepended, and it is — but the reason it
 * has to be first rather than last is that instruction-following degrades
 * toward the end of a prompt in every model family we route to. Putting the
 * *rules* last means the refusals, the calorie floor and the crisis path sit
 * in the strongest position, and the voice sits in the weaker one. If the two
 * ever conflict, the arrangement itself resolves it the safe way, before the
 * persona block's own subordination clause is even consulted.
```

Two messages, never one:

```ts
/**
 * Build the leading system messages for a coach turn.
 *
 * Returns two messages rather than one concatenated string so the boundary
 * between "who you sound like" and "what you must do" stays visible in the
 * provider payload — a merged block is one edit away from a persona sentence
 * being read as a rule.
 */
export function systemMessagesFor(coach: CoachPersona | undefined): GatewayMessage[] {
```

The consent gate on grounding:

```ts
      const consented = hasConsent(user.id, 'aiPersonalisation');
      // Display name is identity, not wellness data — but greeting by name is
      // still personalisation, so it flows only with the same consent.
      const account = consented ? await byIdDoc<User>('users', user.id) : null;
      const { context, toolCalls } = consented
        ? await gatherChatContext(user.id, localDate, account?.displayName)
        : gatherChatContextDenied();
```

The consent-off variant, which degrades honestly rather than silently:

```ts
/**
 * Consent-off variant (aiPersonalisation === false): no profile or log data is
 * read or injected into model context. Chat still works generically — each
 * grounding tool reports that personalisation is off instead of returning data.
 */
export function gatherChatContextDenied(userName?: string): GatheredContext {
  const denied = 'not available — personalisation off';
```

The chat meal-logging contract:

```ts
/**
 * Chat-native meal logging — the deterministic half (AQF-09 §3, FR-013).
 *
 * This file is separate from the router because everything in it is pure, and
 * because it is precisely the half of the feature that must never be delegated
 * to a model. P-12's entire contribution is turning a sentence into
 * `{ foodName, quantity, unit }` triples. Grounding those triples in the food
 * corpus, converting quantities to grams, multiplying per-100g values and
 * checking declared allergies all happen here, in code. A model-authored kcal
 * figure reaching a user's log is the one failure this product cannot absorb,
 * so the model is never given a field to put one in (see parseExtraction).
 */
```

And a deliberate cross-module import, documented as such, so that chat logging produces exactly the same record as the food tab:

```ts
// Deliberate team-boundary exception, and the point of the feature: chat-native
// logging must produce the SAME meal-log row as the food tab, written by the
// same function. A second write path here would be a second place for totals,
// idempotency and the source field to drift.
import { createMealLog } from '../logs/service';
```

### Talking points

- Aqua Coach is grounded: before a turn runs we execute tools that read today's calories, macros and hydration against target, today's workout, the active plan, the progress summary, profile essentials and approved memory.
- All of that is personal data, so it is behind an explicit consent. With personalisation off, no profile data, no logs, not even the display name enters model context, and each tool reports that personalisation is off. The coach still works, it just answers generically.
- Results are injected as untrusted context, never as instructions. The reply streams over server-sent events, and prior turns are replayed so there is continuity.
- **The persona design carries a real safety decision.** The chosen coach contributes one system message, placed before the rules prompt, not after.
- Reason: instruction-following degrades toward the end of a prompt in every model family we route to. Putting the rules last puts the refusals, the calorie floor and the crisis path in the strongest position and the voice in the weaker one.
- They are two separate messages, never concatenated, so the boundary between who you sound like and what you must do stays visible in the payload. A test fails if anyone merges or reorders them.
- Chat-native logging follows the photo rule: the model turns a sentence into food name, quantity and unit, and nothing else. Where a phrase matches several records the ambiguity is kept and the user chooses, because silently picking the first is indistinguishable, in the log, from the user having chosen it.

### If asked

*"Does the chat logging write meals differently from the food tab?"*
No, deliberately. It calls the same function. A second write path would be a second place for totals, idempotency and the source field to drift apart.

### One-line summary

A consent-gated grounded assistant, streamed over SSE, where the persona is a separate system message placed ahead of the rules so the rules always occupy the strongest prompt position.

## 11.5 The safety architecture

### In plain English

Every message going into the AI is classified first, and every answer coming out is checked before the user sees it. If a message is about medication, a medical test, an extreme diet, or somebody in distress, no AI is called at all. The user gets a supportive message pointing them at real help, and they are not charged.

### Why it is built this way

Safety here is architecture rather than a disclaimer, and it has three layers.

The first is classification with an explicit priority order. Crisis outranks medical, which outranks extreme diet, which outranks out of scope. That ordering is not arbitrary: a message can plausibly match several categories at once, and a person in distress must never receive diet content in that turn, whatever else their message mentioned.

The second layer is jailbreak detection. A pure instruction-override attempt with no unsafe payload is still refused, because the assistant does not renegotiate its scope on request.

The third is numeric rules on the way out, which exist because there are rules a language model cannot be trusted to respect. These are the most interesting code in the module, because a naive implementation of the calorie floor caused a real regression. Reporting a remaining budget, "you have around 1135 kcal left", is a completely normal sentence any evening a user has eaten more than target minus floor, that is, most evenings. Treating it as advice replaced an ordinary answer with the eating-disorder signpost. So the trigger is split by force: directive phrasing is unconditionally advice, while a hedged figure counts only when its sentence is not reporting what remains.

An optional second-stage model classifier can run on longer or health-adjacent messages, and it fails open to the regular expression result so that chat keeps working offline. Crisis content is still caught by the synchronous pass either way.

### Where it lives

`apps/api/src/modules/ai/guardrails.ts`, with prompts in `prompts/P-09-safety-classifier.md` and evaluation sets in `evals/`.

### The code

The stated priority order:

```ts
/**
 * Priority order on conflicts: crisis > medical > extremeDiet > outOfScope.
 * A crisis signal always wins — a user in distress must never receive diet
 * content in that turn (AQF-11 §4).
 */
```

The classifier's refusal of a bare instruction override:

```ts
  // A pure instruction-override attempt with no unsafe payload is still
  // refused: the assistant never renegotiates its scope.
  if (jailbreak) {
    return { category: 'outOfScope', jailbreak, matched };
  }
```

The regression that shaped the numeric rules, preserved in the source:

```ts
// The kcal floor must catch a model *prescribing* a sub-floor intake without
// firing on the app's own arithmetic. Reporting a remaining budget ("you have
// around 1135 kcal left") is normal any time a user has eaten more than
// target - floor, i.e. most evenings; treating it as advice replaced a routine
// answer with the eating-disorder signpost (see the regression cases in
// guardrails.test.ts). So the triggers are split by force.

/** Directive phrasing: unconditionally advice, whatever the surrounding text. */
const KCAL_DIRECTIVE =
  /\b(?:aim\s+for|target|eat|stick\s+to|limit\s+(?:yourself\s+)?to|reduce\s+(?:intake\s+)?to|drop\s+to|only\s+eat|cap\s+(?:it\s+)?at)\b[^.\n]{0,40}?\b(\d{3,4})\s*(?:k?cal(?:orie)?s?|calory)\b/gi;
```

The blocked-turn path in chat, showing that a refusal costs the user nothing:

```ts
    if (decision.blocked) {
      // Supportive refusal: no model call, credits returned, audit already logged.
      await creditLedger.release(reservationId);
```

And the second stage's fail-open posture:

```ts
/**
 * Async input guardrail: runs sync pre() first, then optionally calls the P-09
 * safetyCheap lane when config.enableLlmSafety is on and the message is long or
 * health-adjacent. Classifier errors fail open to the regex result so chat keeps
 * working offline; crisis-like content is still caught by sync pre().
 */
```

### Talking points

- Safety here is architecture, not a disclaimer. Every model-calling endpoint runs the same seven-step admission sequence, with no exemptions and no fast paths.
- The input classifier has an explicit priority order: crisis outranks medical, outranks extreme diet, outranks out of scope. A message can match several at once, and somebody in distress must never receive diet content in that turn whatever else they mentioned.
- Jailbreak framing is detected, and a pure instruction-override attempt with no unsafe payload is still refused, because the assistant does not renegotiate its scope on request.
- A blocked turn never reaches a model, the credit is released, the event is audited, and the user gets a warm refusal with a real helpline rather than a wall.
- On the way out, numeric rules re-check for advised intake below the floor and for impossible macro claims.
- **The most interesting code here came from a real regression.** A naive calorie-floor check fired on our own arithmetic: "you have around 1135 kcal left" is a normal sentence most evenings, and it was being replaced with the eating-disorder signpost. So the trigger is split by force: directive phrasing is always advice, a hedged figure only counts when its sentence is not reporting what remains.
- There is an optional model-based second stage on longer or health-adjacent messages, and it fails open to the regex result so chat keeps working offline.

### If asked

*"What if the classifier misses something?"*
Then the output guardrail is still in front of the user, and the numeric rules still apply. That is why there are two stages rather than one. The regression cases live in the test suite so a fix cannot silently reintroduce the old behaviour.

### One-line summary

A prioritised input classifier where crisis always wins, jailbreak framing is refused outright, output is filtered against numeric rules tuned by a real regression, and a blocked turn costs the user nothing.

## 11.6 Authentication and session security

### In plain English

Users get a short-lived pass that proves who they are, plus a longer-lived one used to get a new short-lived pass. The longer-lived one can only be used once. If somebody tries to use one twice, the app treats that as theft and logs out that entire chain of sessions. Telegram users sign in without a password, using a cryptographic signature Telegram provides.

### Why it is built this way

Refresh token rotation with family revocation is the standard answer to a real problem: a stolen refresh token is otherwise a permanent session. Rotation alone is not enough, because the attacker and the victim both hold a token and whoever refreshes second gets an error they will ignore. Revoking the whole family on reuse means the theft is detected and both sessions die, which is the correct outcome: the legitimate user signs in again, and the attacker gets nothing.

The rotation is an atomic compare-and-swap rather than a read-then-write, so two concurrent refreshes cannot both succeed. Refresh tokens are opaque random values stored only as SHA-256 hashes, so a leaked database cannot be replayed as live sessions, and they carry no claims worth forging.

Telegram sign-in verifies the launch data's HMAC against a key derived from the bot token, compares in constant time, and rejects anything older than ten minutes. The raw launch data is accepted only by the auth endpoints, only in transit, and is never persisted.

Failed logins are handled uniformly so the response never reveals whether an email exists, and repeated failures lock the email rather than the IP, which is the axis an attacker cannot rotate.

### Where it lives

`apps/api/src/platform/auth.ts`, `modules/auth/service.ts`, `modules/auth/telegram.ts`, `platform/rateLimiter.ts`.

### The code

Storage posture for refresh tokens:

```ts
  /**
   * sha256 hex of the opaque token. Only the hash is stored at rest; the raw
   * value is returned to the client exactly once at issue time, so a leaked
   * store cannot be replayed as live sessions.
   */
  tokenHash: string;
```

Rotation, reuse detection and family revocation:

```ts
  if (!existing) throw new AppError('AUTH_INVALID', 'Refresh token not recognised');
  if (existing.usedAt !== null || existing.revokedAt !== null) {
    revokeFamily(existing.familyId);
    throw new AppError('AUTH_INVALID', 'Refresh token reuse detected; session revoked');
  }
```

```ts
  // Atomic CAS: mark token as used only if still unused.
  // Returns the marked record on success, undefined if another request won the race.
  const marked = await store.compareAndSwapRefreshToken(
    existing.id,
    tokenHash,
    new Date().toISOString()
  );
  if (!marked) {
    // Another concurrent refresh already consumed this token.
    revokeFamily(existing.familyId);
```

Algorithm pinning on the access token, preventing a classic confusion attack:

```ts
    // Pin the algorithm: without an allowlist a future config change that
    // introduces an asymmetric key opens the classic alg-confusion swap.
    const payload = jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'] });
```

Role and tier read from the record rather than from the token:

```ts
    // Role/tier reflect the current user record, not stale token claims.
    req.user = { id: user.id, role: user.role, tier: user.tier };
```

The Telegram verification, specified as an algorithm in the source header:

```ts
/**
 * TelegramAuthValidator — normative algorithm AQF-09 §2.1.
 *
 *   params        = parse launch data as URL query pairs; extract and remove 'hash'
 *   dataCheckStr  = join sorted 'key=value' pairs with newline
 *   secretKey     = HMAC_SHA256(key = 'WebAppData', message = BOT_TOKEN)
 *   calculated    = hex(HMAC_SHA256(key = secretKey, message = dataCheckStr))
 *   require timingSafeEqual(calculated, hash)      else AUTH_TG_INVALID
 *   require now - auth_date <= 600 seconds         else AUTH_TG_STALE
 */
```

Uniform failure so the endpoint is not an account oracle:

```ts
  // Uniform failure path: never reveal whether the email exists.
  if (!user || !cred || !(await bcryptCompareAsync(input.password, cred.passwordHash))) {
```

And the rate-limit lanes, with the reason each exists:

```ts
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 300;
const STRICT_LIMIT = 20;
/** /auth lane: credential guessing surface — strictest lane, keyed per IP. */
const AUTH_LIMIT = 10;
/** Unauthenticated telemetry writes and invite peeks. */
const ANON_LIMIT = 30;
```

### Talking points

- Access tokens are JWTs with a pinned algorithm, valid fifteen minutes. Pinning matters: without an algorithm allowlist, a future config change introducing an asymmetric key opens the classic confusion attack.
- Role and tier are read from the current user record on every request, not from the token claims, so a downgrade takes effect immediately.
- Refresh tokens are opaque random values, stored only as SHA-256 hashes, valid thirty days, single use. A leaked database cannot be replayed as live sessions, and they carry no claims worth forging.
- Rotation is an atomic compare-and-swap, not a read then write, so two concurrent refreshes cannot both succeed.
- **Reuse is treated as theft.** Presenting an already-used token revokes the whole token family. Rotation alone is not enough, because attacker and victim both hold a token and whoever refreshes second just sees an error they ignore. Killing the family means the legitimate user signs in again and the attacker gets nothing.
- Telegram sign-in verifies the launch data's HMAC against a key derived from the bot token, compares in constant time, and rejects anything older than ten minutes. The raw launch data is never persisted.
- Failed logins are uniform so the endpoint is not an account oracle, and repeated failures lock the email rather than the IP, which is the axis an attacker cannot rotate.
- Four rate-limit lanes: 300 a minute default, 20 for model surfaces, 30 for anonymous writes, 10 for the credential surface per IP.

### If asked

*"Why store tokens in local storage if that is the weaker option?"*
Because the primary surface is a Telegram Mini App where cookie sessions are impractical. It is an accepted trade with a stated mitigation, recorded as ADR-027, and the mitigation is what makes theft detectable and containable rather than permanent.

### One-line summary

Short-lived signed access tokens with single-use, hash-at-rest refresh tokens rotated by atomic compare-and-swap, family revocation on reuse, constant-time Telegram launch verification and four distinct rate-limit lanes.

## 11.7 Privacy, consent and data rights

### In plain English

Nothing is switched on by default. There are four separate permissions, and each starts off. Users can download everything the app holds about them, and they can delete their account. Deletion is two steps with a grace period, and the purge removes their data while keeping financial and audit records in anonymised form.

### Why it is built this way

Opt-in by default is the only defensible posture for health-adjacent data, and it has to be real rather than cosmetic. The AI personalisation consent is load-bearing: with it off, the coach's grounding tools return nothing, the recommendation engine takes a deterministic path with no model call at all, and the memory layer refuses both reads and writes.

Deletion is two-step because irreversible destruction triggered by a single tap is a support problem, and a grace period lets a user change their mind. Signing in during the grace period cancels the pending deletion, which is the least surprising behaviour.

The purge is where most implementations quietly fail, and three cases are handled explicitly. Meal photograph files on disk are removed before the job records that point at them. Buddy challenges live in the logs container but carry no top-level user identifier, because membership is nested, so the generic sweep cannot see them and membership has to be unwound by hand. And growth telemetry keeps its identifiers outside the scrubbed field, so the referral code and challenge code have to be cleared explicitly or a purged account is still re-linkable to the person who invited it.

Ledger and audit records are retained, anonymised, for financial integrity and accountability. Any raw identifier left inside them is replaced with a truncated hash, re-identifiable only by somebody who already holds the original value.

Revoking AI personalisation deliberately does not delete stored memory. Consent is re-checked on every access, so revocation makes it immediately unreadable and unwritable, but keeping it means a user who re-enables the consent has not lost anything. Permanent removal stays the user's explicit choice.

### Where it lives

`apps/api/src/modules/me/service.ts`.

### The code

The default posture:

```ts
/**
 * Privacy default: every consent is OFF until the user explicitly PUTs their
 * choices (opt-in, AQF-07 §3.4). The seeded demo account opts in during
 * seeding so demo screens stay populated.
 */
const DEFAULT_CONSENTS: Omit<ConsentState, 'updatedAt'> = {
  wellnessDataProcessing: false,
  aiPersonalisation: false,
  anonymisedAnalytics: false,
  reminders: false,
};
```

Two-step deletion:

```ts
/**
 * Two-step deletion (AQF-06 §6): the first call flags the account and starts
 * the grace period; a second call while flagged purges immediately.
 */
```

The purge, and the case the generic sweep cannot see:

```ts
  // Buddy challenges live in `logs` but carry no top-level `userId`, so the
  // sweep above cannot see them — membership has to be unwound explicitly.
  removeUserFromChallenges(userId);
```

The growth-telemetry case, with the risk stated:

```ts
/**
 * Growth telemetry keeps its identifiers outside `detail`, so scrubDetail
 * cannot reach them: the challenge code sits in `props`, and the inviter
 * reference and challenge code in `attribution`. Left alone they re-link a
 * purged account to the huddles it joined and the person who invited it, which
 * is precisely what anonymising the subject id is meant to prevent. The event
 * itself survives — the aggregate is what the record is for.
 */
```

Anonymised retention:

```ts
  // Ledger is retained anonymised for financial integrity; audit is retained
  // anonymised per AQF-06 §6. Everything else user-scoped is erased — the
  // `ai` sweep includes the userMemory doc (DELETE /me therefore removes
  // memory implicitly via this purge).
```

And the deliberate decision not to delete memory on consent revocation:

```ts
/**
 * Consent revocation note (memory feature Phase 1): revoking aiPersonalisation
 * does NOT delete the user's AI memory doc. The memory endpoints (and
 * getMemoryForPrompt) check consent on every access, so revocation makes the
 * data immediately unreadable and unwritable — but it is retained so the user
 * can re-enable the consent without losing their memory. Permanent removal is
 * the user's explicit choice: DELETE /me/memory (wipe) or account deletion
 */
```

### Talking points

- Opt-in by default. Four consents, all starting off: wellness data processing, AI personalisation, anonymised analytics, reminders.
- The personalisation consent is load-bearing rather than cosmetic. With it off, the coach's grounding tools return nothing, the recommendation engine takes a deterministic path with no model call at all, and the memory layer refuses reads and writes.
- Export returns everything we hold in one request.
- Deletion is two-step with a thirty-day grace period, because irreversible destruction on a single tap is a support problem. Signing in during grace cancels it, which is the least surprising behaviour.
- **The purge is where most implementations quietly fail, and three cases are handled explicitly.** Photo files on disk are removed before the job records that point at them. Challenge membership is nested, so the generic user sweep cannot see it and it has to be unwound by hand. And growth telemetry keeps identifiers outside the scrubbed field, so the referral and challenge codes must be cleared explicitly or a purged account is still re-linkable to whoever invited it.
- Ledger and audit records are retained anonymised for financial integrity and accountability, with any raw identifier replaced by a truncated hash.
- Revoking personalisation deliberately does not delete stored memory. Consent is re-checked on every access so it becomes immediately unreadable, but keeping it means re-enabling the consent does not lose anything. Permanent removal stays the user's explicit choice.

### If asked

*"How do you know the purge is complete?"*
There is an integration test per case, including the two that the generic sweep cannot reach. The nested-membership case is exactly the kind of thing that is only found by writing the test.

### One-line summary

Four opt-in consents defaulting off with a genuinely load-bearing personalisation gate, a two-step deletion with grace, and a purge that handles photographs on disk, nested challenge membership and growth telemetry identifiers explicitly.

## 11.8 Per-user AI memory

### In plain English

The coach can remember things about a user, such as a dietary preference or a recurring injury. Those facts are proposed by the AI after a conversation but are never used until the user approves them. Users can view, edit, reject and wipe them at any time.

### Why it is built this way

Memory is what makes a coach feel like a coach rather than a search box. It is also the feature most likely to be experienced as creepy, so the control has to be genuine: proposals land as `suggested`, only `confirmed` facts ever reach a prompt, and rejected facts are kept briefly so the extractor does not immediately propose them again, then swept.

Two safeguards are less obvious and both matter.

Memory text flows into a system-role context block, which makes it a prompt-injection surface. So every write path, the REST route and the automated extractor alike, strips non-whitespace control characters. An escape sequence stored in a "fact" would otherwise be replayed into the model's context on every subsequent turn.

And every fact is re-run through the input guardrail immediately before it is injected, not merely when it was written. This is defence in depth: even if an unsafe statement were somehow stored, it still cannot be spoken back.

Extraction runs on the cheapest model lane and is fired without being awaited, so it can never delay or fail the user's reply.

### Where it lives

`apps/api/src/modules/memory/service.ts` and `modules/memory/extraction.ts`.

### The code

The injection-hygiene write path:

```ts
/**
 * Prompt-injection hygiene: memory text (user- or model-authored) flows into a
 * system-role USER CONTEXT message, so non-whitespace C0/C1 control characters
 * (NUL, BEL, ESC/ANSI sequences, C1 block) are stripped on EVERY write path —
 * REST routes and the extraction pipeline both come through here. Whitespace
 * controls (\t \n \r \f \v) are left for the whitespace collapse to handle.
 */
```

The rule that a re-suggestion cannot override a user's decision:

```ts
      // A re-SUGGESTION (the extractor) never overrides a fact the user has
      // already resolved: it must not demote a confirmed fact back to
      // suggested, and it must not revive a rejected one (the whole point of
      // the 30-day rejected retention). It also must not refresh updatedAt —
      // repeated re-suggestions would otherwise extend that retention window
      // forever. The user path (status 'confirmed') still updates anything.
      if (status === 'suggested' && existing.status !== 'suggested') return;
```

The guardrail applied at injection time, not just at write time:

```ts
  const confirmedFacts: string[] = [];
  for (const fact of memory.facts) {
    if (fact.status !== 'confirmed') continue;
    const check = pre(fact.text);
    if (check.blocked) {
      console.warn('[memory] dropping blocked fact from prompt context', {
        category: check.category,
        preview: fact.text.slice(0, 60),
      });
      continue;
    }
    confirmedFacts.push(fact.text);
  }
```

And the extractor's lane choice and consent posture:

```ts
 * Lane choice: safetyCheap. Extraction is a tiny classification/extraction
 * task with a strict-JSON contract — the 8B-class cheap models are ample, and
 * every chat turn triggers it, so it must cost as little as possible
 * (chatFast would spend a 70B-class call per turn for no quality gain).
 *
 * Consent: gated on aiPersonalisation at entry, and defence-in-depth inside
 * getMemoryForPrompt/addFact paths. Extracted facts are stored as `suggested`
 * — the user approves or rejects them in the UI; nothing here auto-confirms.
```

### Talking points

- Each user has one memory document: a rolling summary plus facts, each with a category and a status.
- After a successful turn, a cheap model lane reads the exchange and proposes facts. They land as suggested, never confirmed. The user approves, edits or rejects them in settings.
- Only confirmed facts ever reach a prompt. Rejected facts are kept for thirty days so the extractor does not immediately re-propose them, then swept.
- A re-suggestion can never override a decision the user already made: it cannot demote a confirmed fact or revive a rejected one, and it cannot refresh the timestamp, which would otherwise extend the retention window forever.
- **Two safeguards are less obvious and both matter.** Memory text flows into a system-role context block, which makes it a prompt-injection surface, so every write path strips control characters. An escape sequence stored as a "fact" would otherwise be replayed into context on every later turn.
- And every fact is re-run through the input guardrail immediately before injection, not merely when it was written. Defence in depth: even if something unsafe were stored, it still cannot be spoken back.
- Extraction runs on the cheapest lane and is fired without being awaited, so it can never delay or fail the user's reply.

### If asked

*"Why not just let the AI remember whatever it decides is important?"*
Because memory is the feature most likely to feel invasive, and the control has to be real rather than implied. Proposing is useful, deciding is the user's.

### One-line summary

Model-proposed, user-approved memory with control-character stripping on every write and a guardrail re-check at injection time, extracted on the cheapest lane and never allowed to delay a reply.

## 11.9 Progress insight and the consistency model

### In plain English

The progress screen tells the user what changed and why, in a sentence, not just in a chart. All the numbers are computed by the app. On the premium tier the sentence is written by the AI; everybody else gets the same numbers in an app-written sentence. It never shows an error.

### Why it is built this way

A chart does not tell a user that their results materialised. A sentence does. That makes this a retention surface, and the shape of the endpoint follows: it must never be the thing that errors on somebody's dashboard. A brand-new user, a free-tier user, a user with personalisation off and a user whose provider chain is down all receive a genuine, useful insight. Only the phrasing is premium.

Two statistical decisions matter more than they look.

Averages are taken over days the user actually logged, not over every day in the period. An unlogged day is missing data, not a zero. Averaging blanks in would report a fiction, "you ate forty percent of target", and would quietly moralise about days the user simply did not open the app.

Count comparisons are suppressed when the user was not present in both windows. Somebody returning after a break logs one day against last week's seven, so every count difference comes out negative: four fewer workouts, six fewer weigh-ins. Each of those measures attendance rather than effort. That is wrong before it is discouraging, and the returning user, the one this product most needs not to flinch, is exactly the one who would get the wall of downward arrows. The rule is symmetric, so it cannot become a way of only ever showing good news.

The same philosophy replaced the streak counter. A run that resets to zero on one missed day is a punishment display. The consistency model absorbs a missed day within a run, reports active days over a rolling window, and keeps a best figure that never decreases.

### Where it lives

`apps/api/src/modules/progress/insight.ts`, `modules/progress/router.ts`, `modules/progress/service.ts`.

### The code

The stated purpose of the module:

```ts
/**
 * Progress insight — the deterministic core behind GET /progress/insight (P-08).
 *
 * The project invariant applies here more literally than anywhere else in the
 * app: models identify, interpret and explain; CODE calculates, filters and
 * enforces. Every number a user reads on their progress card is folded out of
 * the store by this module. The model in the `insightBatch` lane receives those
 * finished statistics and is asked only to narrate them, so there is no path by
 * which an invented figure can reach a user — the worst a bad completion can do
 * is get replaced by `deterministicNarrative`.
 */
```

The missing-data rule:

```ts
/** Mean of a non-empty list; null for an empty one (missing data, not zero). */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
```

The suppressed-comparison rule, with its full reasoning:

```ts
  /**
   * A count comparison across two windows only means anything when the user was
   * present in both. Someone returning after a break logs one day against last
   * week's seven, so *every* count difference comes out negative — "4 fewer
   * workouts", "6 fewer weigh-ins" — and each one is measuring attendance
   * rather than effort. That is wrong before it is discouraging, and the two
   * compound: the returning user, the one this product most needs not to
   * flinch, is the one who gets the wall of downward arrows.
   */
```

The degradation ladder in the router, which is why the endpoint never errors:

```ts
    // --- 2. Below the data floor: encourage, never error. A new user meeting a
    // 404 or a 422 on their first dashboard is the churn cliff this feature
    // exists to close.
```

```ts
    // --- 3. Free tier / personalisation off. assertLaneAllowed would throw
    // FORBIDDEN here; a paywall is not an error on a screen the user already
    // has open, so the gate is checked rather than asserted. No model call, no
    // personal data in any model context, no billing — everyone gets the
    // retention value and only the model-authored phrasing is premium.
```

And a genuinely subtle caching decision:

```ts
    // Nothing below this point is persisted unless a model authored it. A
    // deterministic insight is free to recompute, and caching one would pin a
    // user to "keep logging" for the rest of the week after they started
    // logging, or to the free-tier copy for the rest of the week after they
    // upgraded.
```

The consistency model that replaced the streak:

```ts
/**
 * The consistency figure the UI renders (AQF-11 §6). Unlike `computeStreak`,
 * nothing here can be reset to zero by a single missed day: grace absorbs it,
 * the window metric only ever counts effort, and `bestDays` is a high-water
 * mark. Pure over `activity` so it is cheap to test and cannot drift from the
 * store.
 */
```

### Talking points

- The progress screen answers a harder question than a chart does: what changed, and why.
- All the statistics are computed by us over a trailing window and compared to the immediately preceding window: weight change across weigh-ins, workouts completed, average intake against target, hydration adherence.
- **Two statistical decisions matter more than they look.** Averages are taken over days the user actually logged. An unlogged day is missing data, not a zero, and averaging blanks in would report a fiction like "you ate forty percent of target" and quietly moralise about days they simply did not open the app.
- And count comparisons are suppressed when the user was not present in both windows. Somebody returning after a break logs one day against last week's seven, so every count comes out negative: four fewer workouts, six fewer weigh-ins. That measures attendance, not effort, and the returning user is exactly the one who should not get a wall of downward arrows. The rule is symmetric, so it cannot become a way of only showing good news.
- Premium plus consent gets those finished numbers narrated by a model, cached once per week. Everyone else gets a genuine deterministic narrative from exactly the same figures. Only the phrasing is premium.
- The endpoint never errors. A brand-new user, a free user, a user with consent off and a user whose providers are down all get a useful insight, because a 404 on somebody's first dashboard is the churn cliff this feature exists to close.
- Same philosophy replaced the streak: a run that resets to zero on one missed day is a punishment display. Consistency absorbs a missed day, reports active days over a rolling window, and keeps a best figure that never decreases.

### If asked

*"Why cache the model version but not the deterministic one?"*
Because caching a deterministic insight would pin a user to "keep logging" for the rest of the week after they started logging, or to the free-tier copy for the rest of the week after they upgraded. It costs nothing to recompute.

### One-line summary

Deterministic statistics with an optional premium narration, averaged only over logged days, with comparisons suppressed for absent windows, an endpoint that degrades rather than errors, and a consistency model that cannot count down.

## 11.10 Gamification, coach entitlements and the credit ledger

### In plain English

Users earn experience points for using the app, which raises their level and unlocks coach characters. Points are awarded for showing up, logging, training, hydrating and resting, never for losing weight. AI usage is metered by a credit system, and coaches can also be bought with Telegram Stars.

### Why it is built this way

One rule governs the entire progression model, and it is a safety rule rather than a design preference: **experience is awarded for behaviour, never for outcomes.** In a product that also holds a person's weight and intake, an economy that pays out for "less" is a machine for manufacturing disordered eating in exactly the users who engage most.

Two structural consequences follow and both are load-bearing. Every earning lane is capped per day and the total is capped again, so a frantic day cannot out-earn two ordinary ones, which removes the incentive to over-log and with it the incentive to over-eat in order to have something to log. And experience is derived by folding stored activity rather than stored as a number, so a level cannot drift from the behaviour that earned it, cannot be granted by a client, and replays identically after any migration.

Resting after work earns points, which is the one behaviour a naive points system punishes by omission. There is no state in which a user loses points, because a scoreboard that goes down is a punishment display.

The credit ledger follows the same contract: append-only, balance by fold, never a mutable counter. Reserve before work and settle after, so a crashed job returns its hold rather than silently charging.

For the coach roster, the level door is the real door and the Stars price is a shortcut past it. A roster whose best-written character sits behind a paywall is a slot machine, not a wellness product. Payment integrity rests on three invariants: the price is read from the roster and never from the request, grants are idempotent on Telegram's charge identifier because Telegram redelivers webhooks, and the invoice payload is a lookup key rather than a claim.

### Where it lives

`packages/shared/src/gamification.ts`, `packages/shared/src/coaches.ts`, `apps/api/src/modules/ai/creditLedger.ts`, `modules/coaches/service.ts`, `modules/payments/stars.ts`.

### The code

The governing rule, stated at the top of the file:

```ts
/**
 * ONE RULE GOVERNS THIS ENTIRE FILE, and it is a safety rule rather than a
 * design preference:
 *
 *   **XP is awarded for behaviour, never for outcomes.**
 *
 * Nothing here can score a calorie deficit, a rate of loss, or a kilogram
 * moved. In a product that also holds a person's weight and intake, an economy
 * that pays out for "less" is a machine for manufacturing disordered eating in
 * exactly the users who engage most. So the ledger pays for *showing up*:
 * logging, training, hydrating, weighing in — and for resting after work, which
 * is the one behaviour a naive points system punishes by omission.
 */
```

The earn table, with recovery as a first-class lane:

```ts
export const XP_RULES: readonly XpRule[] = [
  { kind: 'activeDay', points: 20, maxPerDay: 1, label: 'Showed up' },
  { kind: 'mealLog', points: 10, maxPerDay: 4, label: 'Meals logged' },
  { kind: 'waterLog', points: 5, maxPerDay: 1, label: 'Hydration logged' },
  { kind: 'weighIn', points: 15, maxPerDay: 1, label: 'Weigh-in' },
  { kind: 'workout', points: 30, maxPerDay: 2, label: 'Training' },
  { kind: 'recoveryDay', points: 15, maxPerDay: 1, label: 'Recovery honoured' },
] as const;
```

The daily ceiling, and why it exists:

```ts
/**
 * Hard ceiling on a single day's earnings, applied after the per-rule caps.
 * The per-rule caps already bound each lane; this bounds their sum, so no
 * future rule addition can quietly make a single heroic day worth a week of
 * ordinary ones. Overtraining must never out-earn consistency.
 */
export const XP_MAX_PER_DAY = 150;
```

The ledger contract:

```ts
/**
 * Append-only credit ledger (AQF-09 §2.3, brief rule 7).
 *
 * Every movement is a CreditTransaction document; balance is a plain fold
 * (sum of amounts) over the user's transactions:
 *   grant / purchase  → +amount
 *   reserve           → −cost   (hold deducted immediately)
 *   release           → +cost   (cancels an outstanding hold)
 *   commit            → settle: appends release(+cost) + commit(−cost) so the
 *                       plain fold stays correct AND every doc keeps the sign
 *                       convention from the shared type (positive for
 *                       grant/release/purchase, negative for commit).
 *
 * Nothing is ever mutated or deleted — settlement state is derived from the
 * presence of commit/release docs referencing the reservationId.
 */
```

```ts
    /** Balance = fold. No cached counters, ever. */
    async balance(userId: string): Promise<number> {
      const txs = await userTxs(userId);
      return txs.reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);
    },
```

The unlock policy:

```ts
 *  2. **Every locked coach is reachable without paying.** `unlock.level` is the
 *     real door and `unlock.stars` is a shortcut past it. A roster where the
 *     best-written character is behind a paywall turns a wellness product into
 *     a slot machine, and turns "earn an audience with the King" — the whole
 *     point of Ogun's arc — into a purchase.
```

The payment invariants:

```ts
 *  1. **The price comes from the roster, never from the request.** The client
 *     asks to buy a coach; it does not get to say what that costs. An amount
 *     accepted from the caller is an amount the caller sets to one.
 *  2. **Grants are idempotent on Telegram's charge id.** Telegram retries a
 *     webhook it believes failed, and a redelivered `successful_payment` must
 *     not create a second purchase record — the ledger is append-only, so a
 *     duplicate is permanent.
 *  3. **The payload is a lookup key, not a claim.** It is minted here, stored
 *     here, and matched here. Nothing inside the string is trusted on the way
 *     back: a forged payload finds no pending record and buys nothing.
```

And the refusal to sell somebody something they already earned:

```ts
 * Refuses when the user already has the coach — by purchase *or* by level.
 * Selling someone something they have already earned is the single worst thing
 * this surface could do, and the level door moves underneath a user who is
 * still deciding, so the check has to happen at purchase time rather than only
 * at render time.
```

### Talking points

- One rule governs progression and it is a safety rule, not a design preference: **experience is awarded for behaviour, never for outcomes.**
- Nothing can score a deficit, a rate of loss or a kilogram moved. In a product that also holds weight and intake, an economy paying out for "less" manufactures disordered eating in exactly the users who engage most.
- Two structural consequences. Every lane is capped per day and the total is capped again, so a frantic day cannot out-earn two ordinary ones. That removes the incentive to over-log, and with it the incentive to over-eat to have something to log.
- And experience is derived by folding stored activity, never stored as a number, so a level cannot drift from the behaviour that earned it and cannot be granted by a client.
- Resting after work earns points, which is the one behaviour a naive points system punishes by omission. There is no state in which a user loses points.
- The credit ledger follows the same contract: append-only, balance by fold, reserve before work and settle after, so a crashed job returns its hold rather than silently charging.
- On the roster, the level door is the real door and the Stars price is a shortcut past it. A roster whose best character sits behind a paywall is a slot machine, not a wellness product.
- Payments rest on three invariants: price read from the roster and never the request, grants idempotent on Telegram's charge id because Telegram redelivers webhooks, and the payload is a lookup key rather than a claim.

### If asked

*"Would points for hitting a weight goal not be more motivating?"*
Almost certainly, and that is the problem. The most engaged users are the ones a weight-linked economy would harm, so it is the one design we ruled out on principle rather than on evidence.

### One-line summary

Behaviour-only experience with per-lane and per-day caps, derived by folding rather than stored, an append-only credit ledger whose balance is a fold, and a coach roster where the level door is real and the purchase is only a shortcut.

## 11.11 Growth, deep links and search visibility

### In plain English

Users can invite friends into private accountability groups, share a progress card, and follow a link that opens the app straight at the right screen. The marketing pages are also pre-built as real web pages so search engines can read them.

### Why it is built this way

An invite code is a bearer capability: whoever holds it can join the group and see the other members' names and progress. That makes a predictable code a guessable one, so codes are drawn from a cryptographic random source rather than from `Math.random`.

The unauthenticated invite preview deliberately does not recompute progress. Recomputing walks every day of the challenge window for every member, and each day costs a full scan, which on an unauthenticated route is roughly a thousandfold amplifier per request. The preview needs a member count and a status, both of which come from the stored document.

Attribution has one hard constraint: local storage does not survive the hop from a web page into Telegram. The deep-link payload is therefore the only channel by which a referral code or campaign can cross that boundary, which is why the Telegram start parameter is treated as a first-class attribution input.

Search visibility is generated at build time because the app is client-rendered, so every marketing URL previously served identical markup and an empty container. Per-route titles set at runtime are only visible to a crawler that executes JavaScript and waits. The plugin emits one real HTML file per marketing route instead.

### Where it lives

`apps/api/src/modules/challenges/service.ts`, `apps/web/src/lib/attribution.ts`, `apps/web/src/lib/deeplink.ts`, `apps/web/vite-plugins/seo.ts`.

### The code

Invite codes as capabilities:

```ts
/**
 * An invite code is a bearer capability: whoever holds it can join the huddle
 * and see the other members' names and progress. It is therefore drawn from a
 * CSPRNG, not Math.random() — a predictable code is a guessable one.
 */
```

The amplification the public preview avoids:

```ts
/**
 * Public invite peek (no auth) for join UX.
 *
 * Deliberately does NOT recompute progress: that walks every day of the
 * challenge window for every member, and each day costs a full scan of the
 * logs container. On an unauthenticated route that is a ~1000x amplifier per
 * request. The teaser needs a member count and a status, both of which come
 * from the stored document. Progress is refreshed on the authenticated reads.
 */
```

The attribution rule that crosses the Telegram boundary:

```ts
/**
 * Merge attribution that did not arrive through the URL — in practice, the
 * payload decoded from a Telegram deep link's `start_param`.
 *
 * localStorage does not cross the web → Telegram boundary, so inside the Mini
 * App the store starts empty and this is the only thing that fills it. Same
 * first-touch rule as the URL path: a ref already recorded in *this* browser
 * wins, so a returning user is not re-credited to whoever last shared a link.
 */
```

And the honesty constraint on generated structured data:

```ts
/**
 * JSON-LD for a route.
 *
 * Everything asserted here is something the product actually is. There is
 * deliberately no `aggregateRating` and no `review`: the app has no ratings,
 * and structured data describing ratings that do not exist is fabricated
 * review content — a manual-action risk, quite apart from being untrue.
 */
```

### Talking points

- Invite codes are drawn from a cryptographic random source, not a general-purpose one, because a code is a bearer capability: whoever holds it can join the group and see other members' names and progress. A predictable code is a guessable one.
- Progress inside a group is recomputed from the log ledger on read, so it cannot drift from the truth.
- The unauthenticated invite preview deliberately does not recompute. Recomputing walks every day of the window for every member, and each day costs a full scan, so on a public route that is roughly a thousandfold amplifier per request. The preview needs a member count and a status, both already stored.
- Attribution has one hard constraint: local storage does not survive the hop from a web page into Telegram. The deep-link payload is the only channel by which a referral code or campaign can cross that boundary, which is why the Telegram start parameter is a first-class attribution input.
- Share cards are rendered to an image on the device, with no server round trip.
- Search visibility is generated at build time, one real HTML file per marketing route with its own title, description, canonical, social tags, structured data and a no-script summary. Necessary because the app is client-rendered, so every marketing URL previously served identical markup and an empty container.
- The structured data deliberately asserts no ratings or reviews, because we have none, and describing ratings that do not exist is fabricated review content.

### If asked

*"Why is the invite preview public at all?"*
So somebody receiving a link can see what they are joining before signing up. The design question was not whether to expose it but what it is allowed to cost, which is why it reads only stored fields.

### One-line summary

Cryptographically generated invite capabilities, an unauthenticated preview that refuses to do expensive work, deep links as the only channel attribution can survive into Telegram, and build-time prerendering that asserts nothing untrue.

## 11.12 Operations and production readiness

### In plain English

The service reports whether it is alive and whether it is ready for traffic, logs every request and AI call in a machine-readable form, cleans up old data on a schedule, and refuses to start in production if it has been configured in a way that would look healthy while being broken.

### Why it is built this way

Probes are registered before the rate limiter, and the reason is specific: a rate-limited liveness probe returns 429 under load, the platform concludes the container is unhealthy, and it restarts a container that was merely busy. That is a self-inflicted outage during exactly the traffic spike you least want one.

The content security policy has two postures rather than one. An API-only process never emits HTML and can lock everything down. A process also serving the built app must permit that app's own scripts, styles and fonts, and must allow Telegram to frame it. Frame options cannot express a multi-origin allowlist, so `frame-ancestors` is used and the header that would override it is disabled when serving the app.

The startup guards exist because the worst production failure is not a crash, it is a deployment that looks healthy while being broken. A service without a real mail transport answers the password-reset request with a success code and prints the token to a log nobody reads, so every locked-out user stays locked out while every dashboard is green. The service refuses to start instead.

### Where it lives

`apps/api/src/app.ts`, `platform/config.ts`, `platform/telemetry.ts`, `apps/api/src/index.ts`.

### The code

Probe ordering, with the failure it prevents:

```ts
  // Probes are registered BEFORE the limiter: a rate-limited liveness probe
  // 429s under load and the platform restarts a healthy container.
```

The two security postures:

```ts
  // Is a built SPA present and enabled? This changes the security posture:
  // an API-only process never emits HTML and can lock everything down, whereas
  // a process also serving the SPA must permit that SPA's own scripts, styles
  // and fonts, and must allow Telegram to frame it.
  const spaDir = config.serveWeb && fs.existsSync(config.webDistDir) ? config.webDistDir : null;
```

```ts
              // Telegram renders Mini Apps inside an iframe on web.telegram.org,
              // so 'none' here would break the Mini App entirely. X-Frame-Options
              // cannot express a multi-origin allowlist; frame-ancestors can.
              frameAncestors: ["'self'", 'https://web.telegram.org', 'https://*.telegram.org'],
```

Private photographs deliberately not statically mounted:

```ts
  // Committed placeholder media (exercise art etc.) lives in assets/ and is
  // safe to serve publicly. User meal photos in uploads/ are deliberately NOT
  // statically mounted — they are private and served only through the
  // authenticated, ownership-checked GET /api/v1/meal-photos/:jobId/image.
```

And the startup guard that turns a silent failure into a loud one:

```ts
  // Account recovery must actually be able to leave the building. The console
  // transport prints the token to a log sink nobody reads and the request
  // endpoint still answers 202, so a misconfigured deployment looks healthy
  // while every locked-out user stays locked out. Refuse to start instead.
```

```ts
  // A wildcard origin on a credentialed health API is never intentional.
  const origins = process.env.CORS_ORIGINS!.split(',').map((s) => s.trim());
  if (origins.includes('*')) {
    throw new Error('CORS_ORIGINS must not include "*" in production');
  }
```

### Talking points

- Liveness and readiness probes are registered **before** the rate limiter. A rate-limited probe returns 429 under load, the platform concludes the container is unhealthy, and it restarts a container that was merely busy. That is a self-inflicted outage during the traffic spike you least want one.
- The content security policy has two postures. An API-only process emits no HTML and locks everything down. A process also serving the built client must permit its own scripts, styles and fonts, and must allow Telegram to frame it.
- Frame options cannot express a multi-origin allowlist, so frame-ancestors is used and the header that would override it is switched off when serving the app.
- Meal photos are never statically mounted. They are served only through an authenticated, ownership-checked route.
- Structured logs for every request and every model call, plus scheduled sweeps for expired photos, elapsed deletions and old telemetry.
- **The startup guards exist because the worst production failure is not a crash, it is a deployment that looks healthy while being broken.** Without a real mail transport the password-reset endpoint still answers with success and prints the token to a log nobody reads, so every locked-out user stays locked out while every dashboard is green. The service refuses to start instead.
- Same posture on secrets, on a wildcard CORS origin, and on plain HTTP origins in production.

### If asked

*"Is refusing to boot not worse than degrading?"*
For account recovery, no. A service that cannot deliver mail cannot recover anyone, and the failure is invisible from the outside. Loud and early beats silent and permanent.

### One-line summary

Probes ahead of the limiter, two content security postures depending on what the process serves, private uploads never statically mounted, and startup guards that convert silent misconfiguration into a refusal to boot.

# 12. Architecture Decision Records

## 12.1 How this section relates to AQF-05

The project's decision register is AQF-05, which holds eighteen records, ADR-001 to ADR-018. This report does not restart that numbering and does not duplicate it. The twelve records below **continue the same series at ADR-019**, so the two documents can sit side by side without a reader ever meeting two different ADR-007s.

Each record here does one of three things, and each says which:

- **Refines** an AQF-05 record, by adding the implementation-level decision that the earlier, planning-stage record did not yet contain.
- **Records new ground**, where the decision arose during implementation and has no earlier counterpart.
- **Supersedes** an AQF-05 record, where the shipped system genuinely diverged from what was planned.

## 12.2 Relationship map

| This report | Decision | Relationship to AQF-05 |
| :--- | :--- | :--- |
| ADR-019 | Models identify, code calculates | Refines AQF-05 ADR-015 with the enforcement mechanism and the "no field to put a number in" rule |
| ADR-020 | An admission sequence rather than per-endpoint checks | New ground |
| ADR-021 | Logical model lanes instead of vendor names | Refines AQF-05 ADR-004 and ADR-005 |
| ADR-022 | A deterministic offline engine behind every lane | New ground |
| ADR-023 | Progression expressed as data, not code | New ground |
| ADR-024 | Segregated containers per data licence | Refines AQF-05 ADR-014 and ADR-016 |
| ADR-025 | Consistency instead of a streak counter | New ground |
| ADR-026 | Experience for behaviour, never for outcomes | New ground |
| ADR-027 | Tokens in local storage, mitigated by rotation | Refines AQF-05 ADR-007 |
| ADR-028 | Synchronous in-memory reads over a document abstraction | **Supersedes** AQF-05 ADR-003 |
| ADR-029 | Persona before rules in the prompt | New ground |
| ADR-030 | Never bill for degraded AI output | New ground |

## 12.3 Records in AQF-05 that the shipped system has superseded

This is stated openly because a reviewer holding both documents will otherwise find the discrepancy themselves, and finding it unannounced is worse than reading it here.

AQF-05 was written at the planning stage and records an Azure-hosted serverless architecture. The system that shipped does not use it. The repository contains no Azure Functions handlers, no Cosmos DB client, no Key Vault integration and no Bicep infrastructure directory; the API is an Express service on Node, and the store is a document abstraction over JSON files or Postgres.

| AQF-05 record | Planned | Shipped | Why it changed |
| :--- | :--- | :--- | :--- |
| ADR-002 Serverless Azure Functions | Functions on the Consumption plan | A single stateless Express service | The admission sequence needs ordered middleware and a streaming response on one long-lived connection. Per-function cold starts also made the chat surface unpredictable. |
| ADR-003 Cosmos DB free tier | Cosmos DB as the primary database | Document abstraction over JSON files, or Postgres when configured | The container model was kept; the vendor was not. See ADR-028 for the reasoning and the cost. |
| ADR-006 Key Vault with Managed Identity | Secrets in Key Vault | Environment variables, with a production startup guard that refuses to boot without them | Managed Identity presumes the Azure hosting that ADR-002 no longer describes. The guard in section 11.12 is the compensating control. |
| ADR-009 Azure Static Web Apps | Frontend hosted separately | The API serves the built client from the same origin | Single-origin hosting removes cross-origin configuration entirely and matches the deployment target actually used. |
| ADR-010 Bicep infrastructure as code | Stack declared in Bicep under `/infra` | Not implemented | Follows from the hosting change. This is recorded as outstanding technical debt in section 13. |
| ADR-012 Gateway as a separate container | Python gateway library in its own container | The gateway is a TypeScript module inside the API | Keeping it in-process removed a network hop and a second deployable from the critical path of every AI request, at the cost of implementing the retry, breaker and deadline logic ourselves. That implementation is section 11.3. |

The remaining AQF-05 records, in particular ADR-001, ADR-013, ADR-014, ADR-015, ADR-016 and ADR-017, hold as written and are implemented as described.

**How to answer this if it is raised.** The honest answer is that AQF-05 recorded the intended platform before implementation, and the implementation diverged for reasons that are themselves recorded. A decision register whose records are never superseded is a register nobody consulted. What matters is that each divergence has a stated reason and a compensating control, which is what section 12.3 provides.

## 12.4 Records

Each record follows the standard context, decision, options considered, consequences form, and each is traceable to code quoted earlier in this document.

## ADR-019 Models identify, code calculates

**Status:** Accepted, enforced everywhere, covered by tests.

**Context.** The product's most valuable AI features, photo capture and chat logging, are also the ones where a wrong number does the most harm. Language models produce fluent, confident, wrong numbers.

**Decision.** Models may identify, interpret, rank and phrase. All arithmetic, filtering and enforcement is deterministic code. Where a model returns a number, that number is discarded and recomputed.

**Options considered.** (a) Trust the model and show a confidence score. Rejected: a confidence score does not stop a user acting on the number. (b) Trust the model and validate the range. Rejected: a plausible wrong number is inside any sane range. (c) The chosen split.

**Consequences.** Predictions that cannot be grounded in the corpus are dropped rather than shown, which occasionally loses a real food that is not in the corpus. Accepted: a missing item the user adds by hand is a smaller harm than a fabricated one they do not notice.

## ADR-020 An admission sequence rather than per-endpoint checks

**Status:** Accepted.

**Context.** Model-calling endpoints each need authentication, rate limiting, tier checks, metering, input safety, output safety and telemetry. Implemented per endpoint, one of them will eventually be missing a step.

**Decision.** A single fixed sequence, in a fixed order, applied by every model-calling endpoint.

**Options considered.** (a) Middleware for all of it. Rejected: the credit settle step depends on the outcome, which middleware cannot see cleanly, and the guardrail needs to compose a domain-specific refusal. (b) Per-endpoint discipline with review. Rejected: unenforceable. (c) A documented sequence with shared helpers, which is what shipped.

**Consequences.** Some repetition across routers. Accepted in exchange for each route reading as an explicit checklist a reviewer can verify by eye.

## ADR-021 Logical model lanes instead of vendor names

**Status:** Accepted.

**Context.** Five providers, several models each, differing availability and price.

**Decision.** Application code names one of five lanes. The gateway owns provider selection, timeouts, retries and fallback.

**Options considered.** (a) Configure a model per feature. Rejected: spreads routing policy across the codebase. (b) One provider only. Rejected: makes the product an availability hostage.

**Consequences.** A feature cannot request a specific model without changing gateway policy. That is the intended constraint.

## ADR-022 A deterministic offline engine behind every lane

**Status:** Accepted.

**Context.** The product must be demonstrable, testable and usable without API keys, and must not collapse when a provider does.

**Decision.** Every lane falls back to a deterministic offline engine, and the result carries a `degraded` flag distinguishing "no keys configured" from "real providers failed".

**Options considered.** (a) Return an error. Rejected: breaks core journeys and demonstrations. (b) Serve template text silently. Rejected: charging for template text presented as a model answer is not defensible.

**Consequences.** Two code paths for every AI feature, both of which must be maintained and tested. The offline engine's output is deliberately byte-identical for a given input so the test suite and eval runner can depend on it.

## ADR-023 Progression expressed as data, not code

**Status:** Accepted.

**Context.** Progressive overload written as branching logic is invisible to the user, untestable in isolation, and impossible for a model-generated plan to express.

**Decision.** Progression is a list of rules keyed by iteration, resolved by a pure engine with hard caps and a fail-closed autoregulation gate.

**Options considered.** (a) Branching logic in the scheduler. Rejected for the reasons above. (b) Recomputing the plan weekly from fresh inputs. Rejected: makes a user's future plan unknowable and their past plan unreconstructable.

**Consequences.** More machinery than a simple implementation. In return, week five is inspectable today, and the AI lane speaks the same vocabulary as the deterministic one.

## ADR-024 Segregated containers per data licence

**Status:** Accepted.

**Context.** Open Food Facts is ODbL, a share-alike database licence. FoodData Central is CC0. Our curated corpus is ours.

**Decision.** Three separate containers. Records never commingle.

**Options considered.** (a) One container with a source field. Rejected: a share-alike obligation attaching to a mixed collection is exactly the outcome the licence is designed to produce, and a field is one careless query away from being ignored.

**Consequences.** Barcode lookups read a different container from corpus search, and the cache write goes to the mirror. A small amount of extra plumbing for a clean licence boundary.

## ADR-025 Consistency instead of a streak counter

**Status:** Accepted.

**Context.** A streak that resets to zero after one missed day is the standard pattern and is a punishment display. It is also the moment many users quit.

**Decision.** A rolling window with a grace day, a run that absorbs one miss, and a best figure that never decreases. Achievements evaluate against the best figure so a badge is never revoked.

**Options considered.** (a) Keep the streak. Rejected on the grounds above. (b) Remove the metric entirely. Rejected: consistency is genuinely the behaviour that predicts outcomes, and users want to see it.

**Consequences.** Two functions now exist, `computeStreak` for achievement thresholds calibrated against it and `computeConsistency` for the UI. The duplication is deliberate and documented, because changing the former would silently move earned thresholds for existing users.

## ADR-026 Experience for behaviour, never for outcomes

**Status:** Accepted. Treated as a safety rule.

**Context.** The product holds a user's weight and intake and also has a points economy. Paying out for "less" in that combination is a mechanism for producing disordered eating in the most engaged users.

**Decision.** Nothing may score a deficit, a rate of loss or a kilogram moved. Every lane is capped daily, the total is capped again, and experience is derived by folding activity rather than stored.

**Options considered.** (a) Reward goal progress, which is the conventional design. Rejected outright. (b) Reward behaviour without caps. Rejected: uncapped logging rewards over-logging, which rewards over-eating to have something to log.

**Consequences.** Progression feels slower than a conventional fitness game. Accepted.

## ADR-027 Tokens in local storage, mitigated by rotation

**Status:** Accepted with documented mitigation and a stated first hardening step.

**Context.** The primary delivery surface is a Telegram Mini App, where cookie-based sessions are impractical.

**Decision.** Tokens in local storage, with access tokens limited to fifteen minutes and refresh tokens single-use, rotated, hashed at rest and family-revoked on reuse.

**Options considered.** (a) HttpOnly cookies. Rejected: unreliable in the Mini App context. (b) Long-lived access tokens. Rejected: multiplies the value of any theft.

**Consequences.** A cross-site scripting flaw would expose a token. The mitigation limits the window and makes reuse detectable and containable. This is recorded as an accepted trade-off rather than an oversight.

## ADR-028 Synchronous in-memory reads over a document abstraction

**Status:** Accepted, with a known scaling limit.

**Context.** Reads are called from roughly seventy-seven sites. The deployment target's filesystem is wiped on publish, so files alone are not durable in production.

**Decision.** Keep the working set in memory with synchronous reads; move only persistence behind an abstraction with file and Postgres backings.

**Options considered.** (a) Convert every read to async against Postgres. Rejected: large change, a round trip per read, no user-visible benefit at this scale. (b) Files only. Rejected: not durable on the target host.

**Consequences.** Durable for a single instance only. A second instance would not see the first instance's writes until restart. Recorded in section 13 with the remediation.

## ADR-029 Persona before rules in the prompt

**Status:** Accepted. Protected by test.

**Context.** Nine coach personas share one safety engine. Prompt ordering affects which instructions dominate.

**Decision.** The persona is one system message placed before the rules prompt, kept as a separate message, and closed with an explicit subordination clause.

**Options considered.** (a) Persona last, for recency. Rejected: recency is precisely why the rules must be last. (b) One merged system message. Rejected: a merged block is one edit away from a persona sentence being read as a rule.

**Consequences.** Slightly more prompt overhead per turn. A test fails if anyone merges or reorders the two messages.

## ADR-030 Never bill for degraded AI output

**Status:** Accepted.

**Context.** The offline engine is reached in two very different situations.

**Decision.** Bill normally when the offline engine is the designed answer for a keyless deployment. Release the reservation whenever real providers were tried and failed.

**Options considered.** (a) Always bill. Rejected: the user paid for a model answer and received a template. (b) Never bill for offline output. Rejected: on a keyless deployment the offline engine is the product, and never billing would make metering meaningless.

**Consequences.** Every billing lane must branch on `degraded`, and there is a regression test per lane confirming the release happens.

# 13. Risks, Trade-Offs And Technical Debt

Recorded honestly, with the remediation, because a document that lists no weaknesses is not a review document.

| # | Item | Impact | Current mitigation | First hardening step |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Single-instance durability. Each instance hydrates its own working set, so horizontal scaling would serve stale reads. | Cannot scale out today. | Documented in ADR-028; deployment is single instance. | Move reads off the local copy for the containers that change per request. |
| R2 | Pure-JavaScript bcrypt at cost 12. Slower than a native binding and CPU-bound on the event loop. | Login latency under load. | Cost 12 in production, 4 under test; seeding uses a worker thread. | Native binding, and reassess the cost factor against measured hardware. |
| R3 | Tokens in local storage. | A cross-site scripting flaw would expose a session. | Fifteen-minute access tokens, single-use rotation, family revocation. | Move to a host where HttpOnly cookies work for both surfaces. |
| R4 | In-memory rate limiter and login lockout. State is per process. | Limits reset on restart and are not shared across instances. | Acceptable at one instance; buckets are pruned to bound memory. | Shared store for counters when a second instance appears. |
| R5 | Prerendered SEO depends on host behaviour. A host that rewrites everything to the app shell silently undoes it. | Marketing pages lose their metadata while appearing to work. | Documented in the README and in the plugin header. | A post-deploy check that fetches a marketing route and asserts its title. |
| R6 | Client-declared upload MIME. | An attacker controls the declared type. | Extension and served type derive from our own re-encode, never from the header; files are size-capped, unguessably named, never statically served. | None required; recorded so the reasoning is not lost. |
| R7 | Diagnostics strip contains illustrative values. Model latency and credit readouts are not fully wired to live data. | Could mislead in a demonstration. | Excluded from the presentation script. | Wire to the gateway metadata and the ledger balance, or remove the panel. |
| R8 | Growth events are the only unauthenticated write. | Storage growth and abuse surface. | Dedicated 30 per minute lane plus a scheduled retention sweep. | Signed client token if abuse is observed. |
| R10 | No infrastructure as code. AQF-05 ADR-010 planned a Bicep declaration under /infra; the hosting change left it unimplemented. | Environment rebuild is manual and unreproducible. | Deployment steps are documented in AQF-22; the production startup guards catch a misconfigured environment at boot. | Declare the deployed stack for the host actually in use, and have the pipeline apply it. |
| R9 | Allergen keyword net is English-only. | A non-English ingredient list may not trip the keyword net. | The declared allergen field still applies, and over-blocking is preferred. | Localised keyword sets alongside corpus localisation. |

# 14. Verification

## 14.1 The test suite

At the documented baseline the repository carries **770 passing automated tests**: 614 against the API across 50 files, and 156 against the web client across 24 files. This is a count of tests, not a line-coverage percentage, and the distinction is made deliberately.

The tests that matter most are the ones that encode a decision rather than an implementation. Examples that exist in the repository:

| Test file | What it protects |
| :--- | :--- |
| `persona.test.ts` | Fails if the persona and rules system messages are merged or reordered (ADR-029) |
| `auth.integration.test.ts` | Fails if refresh reuse stops revoking the family (section 11.6) |
| `guardrails.test.ts` | Contains the remaining-budget regression cases (section 11.5) |
| `allergenFilter.test.ts` | Fails if a keyword net stops catching an untagged record |
| `chatDegradedBilling.test.ts`, `recommendationDegradedBilling.test.ts`, `visionBilling.test.ts` | Fail if a lane starts billing for degraded output (ADR-030) |
| `creditLedger.test.ts` | Fails if a balance is ever read from anywhere but a fold |
| `wgerAttribution.integration.test.ts` | Fails if licence fields stop reaching an API response (section 10.1) |
| `uploadSecurity.test.ts`, `wgerMediaSecurity.test.ts` | Fail if uploads become enumerable or publicly served |
| `productionGuards.test.ts` | Fails if the service would boot in production without real secrets or mail |
| `isolation.integration.test.ts` | Fails if one user's data can be read through another user's token |

## 14.2 Safety evaluations

`evals/` holds adversarial evaluation sets for the assistant, the plan lane and the recommendation lane, run by `npm run eval` and gated in the pipeline. They exercise crisis phrasing, medical requests, extreme-diet requests and jailbreak framing against the classifier, independently of the unit tests.

## 14.3 The full verification command

```bash
npm run verify
```

This runs typecheck, then the test suites, then the safety evaluations. It is exactly what continuous integration runs, so a passing local run and a passing pipeline mean the same thing.

# 15. Presentation Plan

This section is a plan, not a script. It gives the running order, the time each part should take, and the one message each part must land. The material to speak from is the **Talking points** block inside each feature in sections 9 to 11. Speak from those prompts in your own words.

## 15.1 Why there is no script here

A read-aloud script fails in three ways in an assessed presentation. It sounds like recitation, and an experienced listener hears the difference immediately. It collapses the moment somebody is interrupted with a question, because there is no way back into the paragraph. And it hides whether the speaker actually understands the material, which is the thing being assessed.

Prompts do the opposite. If you can see the five bullets for your feature and talk around them, you understand it. If you cannot, that is worth discovering in rehearsal rather than on the day.

## 15.2 Running order and timing

| Order | Speaker | Covering | Sections | Time |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Babatundji | Opening frame: what the product is and the one idea it is built around | 3.1, 3.2 | 1 minute |
| 2 | Victor Hong | Nutrition and dietary system, five features | 9.1 to 9.5 | 5 minutes |
| 3 | Eric La | Training and workout system, five features | 10.1 to 10.5 | 5 minutes |
| 4 | Babatundji | Platform, AI, safety, security, privacy, analytics, operations | 11.1 to 11.10 | 10 minutes |
| 5 | Babatundji | Optional depth if the slot allows | 11.11, 11.12 | 2 minutes |
| 6 | All | Questions | Appendix C | Remainder |

Core running time is twenty-one minutes. With both optional features it is twenty-three. If the slot is shorter, drop 11.11 first, then 11.12. They are chosen for that because nothing else depends on them.

Allow roughly one minute per feature. That is a natural pace for five or six spoken bullets with a sentence of explanation each. Do not merge two features into one minute; the compression is what makes a presentation sound rushed.

## 15.3 The one message per part

If a listener remembers only one sentence from each speaker, it should be this one. Everything else is support.

| Speaker | The message that must land |
| :--- | :--- |
| Babatundji, opening | Models identify, code calculates. Every other decision in this system follows from that one. |
| Victor | Every calorie figure in this product is arithmetic we did ourselves, and the allergen filter never lets a model near a safety decision. |
| Eric | The training plan is deterministic, its progression is inspectable data rather than hidden logic, and it adapts to the week the user actually had. |
| Babatundji, platform | Safety, privacy and metering are architecture here, not features bolted on, and the system keeps working when the AI does not. |

## 15.4 Opening frame

Babatundji opens for about a minute, using section 3.2. The purpose is to give the audience the lens before they see any feature, so that every later decision reads as consistent rather than arbitrary.

Cover, in this order:

- What the product is, in one sentence.
- The problem with using a language model for calorie estimation: it produces a fluent, confident, wrong number, and the user cannot tell.
- Why that is a health outcome rather than a defect, when applied every day for months.
- The rule that follows: models identify, interpret and explain; code calculates, filters and enforces.
- One line of signposting: Victor will show that rule in nutrition, Eric in training, and I will show the platform that enforces it.

## 15.5 Handover cues

Agree these in rehearsal and do not improvise them. A fumbled handover is the most visible thirty seconds of any team presentation.

| From | To | Cue |
| :--- | :--- | :--- |
| Opening | Victor | "We will start where the user starts, with food. Victor." |
| Victor | Eric | "That is the nutrition module. Eric will take you through training." |
| Eric | Babatundji | "That is the training system. Over to Tundji for the platform underneath it." |
| Babatundji | Questions | "That is the system. We are happy to take questions." |

## 15.6 If a demonstration is included

Show the fewest screens that prove the most. This order tells the whole story in about three minutes.

| Step | Show | The point it proves |
| :--- | :--- | :--- |
| 1 | Dashboard with the calorie ring | Targets are personalised and the day's arithmetic is live |
| 2 | Photograph a meal, then **pause on the draft** | The confirmation gate. Say out loud that nothing is written yet and the calories on screen were computed by the app, not the model |
| 3 | Adjust a portion and confirm | The user is in control of what enters their record |
| 4 | Today's workout, complete one set, rest timer | The plan resolves per day, and the session records actuals |
| 5 | Ask the coach a question about today | Grounding: the answer contains the user's real numbers |
| 6 | Ask the coach something medical | The safety boundary, live, with the signpost |
| 7 | Progress screen | What changed and why, in a sentence rather than a chart |

Step 6 is the most persuasive thing in the demonstration and it is the one most often left out. It takes fifteen seconds.

## 15.7 Rehearsal checklist

- Each member can talk through their own features from the prompts alone, without the document open.
- Each member can answer the five questions in section 2.5 for every module listed against their name.
- Handover cues are agreed word for word.
- Every figure anyone plans to say aloud is in Appendix A. Anything not in Appendix A is not said from memory.
- Nobody quotes the on-screen diagnostics strip. See Appendix B.
- The demonstration has been run once end to end on the machine that will be used.

# Appendix A. Figures Safe To Quote

Every number below was read from the source or produced by running the test suite at the baseline commit. If you are asked for a figure that is not listed, say you will check rather than estimating. Estimating one number badly costs more credibility than not knowing it.

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
| AI providers in the chain | 5 |
| Allergen classes filtered | 9 |
| Micronutrients tracked | 6 |
| Calorie floor | 1200 kcal (female and unspecified), 1500 kcal (male) |
| Activity factors | 1.2 sedentary to 1.9 very active |
| Protein target | 2.0, 1.6 or 2.2 g per kg by goal |
| Fat floor | 20 percent of energy |
| Hydration target | 33 ml per kg, clamped to 1500 to 4000 ml |
| Energy cross-check tolerance | 30 percent of computed plus 5 kcal |
| Access token lifetime | 15 minutes |
| Refresh token lifetime | 30 days, single use |
| Telegram launch data freshness window | 600 seconds |
| Rate limit lanes | 300, 20, 30 and 10 requests per minute |
| Login lockout | 5 failures, 15 minutes |
| Meal photo limits | 10 MB, JPEG, PNG or HEIC |
| Photo retention | Deleted on confirm or failure, swept after 24 hours |
| Gateway overall deadline | 12 seconds |
| Circuit breaker | 3 consecutive failures, 60 second cooldown |
| Free tier daily AI credits | 50 |
| Credit costs | 1 chat turn, 3 meal photo, 2 meal suggestion, 5 plan, 1 insight |
| Progression caps | sets 1 to 20, reps 1 to 100, rest 0 to 900 s, weight 0 to 1000 kg, RiR 0 to 9.5 |
| Readiness weights | completion 45, logging 25, recency 20, intake 10 |
| Readiness volume multipliers | 0.6 protect, 1.0 maintain, 1.1 progress |
| Consistency window | 28 days with 1 grace day, steady at 7 |
| Daily experience cap | 150 points |
| Deletion grace period | 30 days |
| Code listings in this report | 122, all verified byte-exact |

# Appendix B. Claims Not Supported By The Code

An earlier draft of the team's slide deck contained three statements the code does not support. They are recorded here so that nobody restores them from memory under pressure.

1. **"BMR is computed with Mifflin-St Jeor and Katch-McArdle."** Only Mifflin-St Jeor is implemented, and the stored formula version says so. There is no body-fat input, so Katch-McArdle could not be computed even if it were wanted. Say Mifflin-St Jeor.

2. **"An AI meal plan generator produces multi-day meal plans."** What exists is a per-slot recommendation engine. The meal plan screen requests one suggestion for each of today's four meal slots. It is a day of suggestions, not a multi-day plan. Describe it as context-aware meal suggestions.

3. **"One hundred percent automated test coverage."** The repository has 770 passing tests, which is worth saying and is verifiable. It is not a coverage percentage, and line coverage has not been measured. Say "770 automated tests, all passing".

**One further caution.** Do not quote live model latency or remaining credit figures from the on-screen diagnostics strip during a demonstration. The API round-trip figure there is genuinely measured, but the other readouts are illustrative placeholders. This is recorded as risk R7 in section 13. If a marker asks where a number on screen comes from, the answer has to be one the team can stand behind.

# Appendix C. Question Bank By Owner

Grouped so each member can rehearse their own. Any member may answer a shared question.

## C.1 Shared, any member

**How do you stop the AI hallucinating a calorie figure?**
By never giving it a field to put one in. For photo capture and chat logging the model returns identifiers, quantities and units only. The application looks the item up in its own corpus and computes the calories itself. An item that cannot be grounded is discarded rather than guessed at. See section 3.2 and ADR-019.

**What happens when the AI provider is down, or you have no API keys?**
The gateway retries, trips a circuit breaker on a repeatedly failing provider, falls through the chain, and finally lands on a deterministic offline engine, so every core journey still works. The result carries a degraded flag, and any lane that would have charged a credit releases the reservation instead. See section 11.3 and ADR-030.

**What is the biggest thing you would change with more time?**
Moving reads off the per-instance working set so the service scales horizontally, and replacing the pure-JavaScript password hashing with a native binding at a reassessed cost factor. Both are recorded in section 13 with a stated first hardening step, rather than being gaps discovered late.

## C.2 Victor Hong, nutrition

**Why is the calorie target not simply what the user asks for?**
Because an arithmetically correct target can still be unsafe. A light user with an aggressive goal can produce a figure below the floor, so the engine raises it and shows the reason. Silently clamping would be dishonest and refusing to answer would be unhelpful.

**How do you know the food data is any good?**
Every seeded record carries its source and licence, so a figure can be traced. Packaged items looked up by barcode are additionally cross-checked: we recompute the calories from the declared macronutrients using the European regulation factors and flag anything outside tolerance.

**What if somebody's allergen is not in your keyword list?**
The declared allergen field on the record still applies, and it is the authoritative net. The keyword net is the fallback for records with missing tagging. It is English-only today, which is recorded as risk R9.

**Why does the photo feature not just log the meal automatically?**
Because an automatic commit means a wrong estimate silently becomes the user's history. Confirmation is a product requirement, not a nicety, and it is the point at which the user is in control.

## C.3 Eric La, training

**Why generate plans in code when an AI could do it?**
Because prescribing training load has real consequences, so the guaranteed path must be deterministic. The AI lane exists and gets first pass, but its draft is validated structurally and semantically against the same filtered pool, and any failure falls back to the deterministic engine without the user noticing.

**Why is progression data rather than code?**
Three reasons. The user can see what week five will ask for. A model-generated plan can express progression in the same vocabulary. And the resolver is a pure function that can be unit tested against a reference example.

**What stops a progression rule producing something dangerous?**
Hard caps in the resolver that mirror the shared validation schemas: sets, reps, rest, weight and reps in reserve all have bounds, and a percentage rule cannot exceed fifty percent. Autoregulated rules also fail closed, so if the logs cannot confirm last week's targets were met, the progression does not apply.

**Is the calorie burn estimate accurate?**
It is an estimate, scaled by session intensity and by the proportion of prescribed work actually performed. We present it as an estimate. The same honesty applies to the one-rep max, which is why the formula version is pinned in the response.

## C.4 Babatundji Williams-Fulwood, platform

**Why is the credit balance not just a number on the user record?**
Because a counter can drift and cannot be audited. The ledger is append-only: reserve deducts, release returns, commit settles, and the balance is a fold over the transactions. Reserving before work and settling after means a crashed job returns its hold rather than silently charging the user.

**How do you handle a user in crisis?**
The classifier gives crisis the highest priority, above medical and above extreme diet, so a distress signal always wins even if the message also mentions food. No model is called. The user receives a supportive message with real helpline contacts, the turn is audited, and the credit is returned.

**Is the Postgres store production ready?**
For a single instance, yes. Each instance hydrates its own in-memory working set, so a second instance would not see the first one's writes until it restarted. Scaling out requires moving reads off the local copy. See ADR-028 and risk R1.

**What stops someone unlocking a paid coach by editing a request?**
The server decides entitlement, not the client. Prices are read from the roster, never from the request body. Grants are idempotent on Telegram's payment charge identifier, and the webhook rejects everything unless a shared secret is configured.

**Why does a missed day not reset the streak?**
Because the documented harm in habit-forming apps is not the gap, it is the punishment displayed for it. Consistency absorbs a missed day, reports active days over a rolling window, and keeps a best figure that never decreases. Achievements evaluate against that best figure, so a badge already earned is never revoked.

**Why is the persona placed before the rules in the prompt?**
Because instruction-following degrades toward the end of a prompt in every model family the gateway routes to. Putting the rules last places the refusals, the calorie floor and the crisis path in the strongest position. The two are separate system messages so the boundary stays visible, and a test fails if anyone merges or reorders them.

**AQF-05 describes an Azure architecture. This is not that. Why?**
Because AQF-05 recorded the intended platform before implementation, and the implementation diverged. Section 12.3 lists every superseded record with the reason and the compensating control. A decision register whose records are never superseded is one nobody consulted.

# Appendix D. Where To Find Things In The Repository

For a reviewer who wants to check a claim quickly.

| To check | Look at |
| :--- | :--- |
| Calorie and macro arithmetic | `apps/api/src/modules/me/targets.ts` |
| Safety constants and the calorie floor | `packages/shared/src/constants.ts` |
| Allergen filtering | `apps/api/src/modules/recommendations/allergenFilter.ts` |
| Meal photo pipeline | `apps/api/src/modules/vision/router.ts` |
| Chat-native meal logging | `apps/api/src/modules/chat/mealDraft.ts` |
| Plan generation and progression | `apps/api/src/modules/plans/` |
| Adaptive readiness | `apps/api/src/modules/plans/readiness.ts` |
| Workout statistics | `apps/api/src/modules/workouts/stats.ts` |
| AI routing, retries, breaker, fallback | `apps/api/src/modules/ai/gateway.ts` |
| Input and output guardrails | `apps/api/src/modules/ai/guardrails.ts` |
| Credit ledger | `apps/api/src/modules/ai/creditLedger.ts` |
| Coach persona ordering | `apps/api/src/modules/ai/persona.ts` |
| Token issue, rotation, family revocation | `apps/api/src/platform/auth.ts` |
| Telegram launch data verification | `apps/api/src/modules/auth/telegram.ts` |
| Consent, export, deletion, purge | `apps/api/src/modules/me/service.ts` |
| Per-user AI memory | `apps/api/src/modules/memory/` |
| Progress insight and consistency | `apps/api/src/modules/progress/` |
| Experience and levels | `packages/shared/src/gamification.ts` |
| Storage abstraction | `apps/api/src/platform/store.ts` |
| Security headers and SPA serving | `apps/api/src/app.ts` |
| Production startup guards | `apps/api/src/platform/config.ts` |
| Telegram theme binding | `apps/web/src/lib/telegram.ts` |
| Build-time search visibility | `apps/web/vite-plugins/seo.ts` |
| Prompt files | `prompts/P-01` to `prompts/P-12` |
| Safety evaluation sets | `evals/` |
| Licence and attribution register | `content/ATTRIBUTION.md`, `THIRD_PARTY_NOTICES.md` |

To run everything the pipeline runs:

```bash
npm run verify
```
