---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Final Report
subtitle: Scope, requirements, architecture, implementation, verification and contributions
details:
  Document ID: AQF-19
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Report owner: Babatundji Williams-Fulwood (s8138393), Technical Lead and Software Architect
  Team member: Eric La (s8147350), Training and Workout System
  Team member: Victor Hong (s4685483), Nutrition and Dietary System
  Supervisor: [Supervisor name]
  Group: Group 15, Victoria University, Melbourne
  Project window: 27 July 2026 to 17 August 2026
  System version: 1.0.0
  Baseline: repository branch main at commit e7d7738, 17 August 2026
  Verification at baseline: 806 automated tests passing, 0 type errors, safety evaluation gate passed
  Status: Final, issued for assessment
  Companion documents: AQF-16 Diary, AQF-18 User Manual, AQF-24 Architecture and Contribution Report, AQF-28 Team Code Walkthrough
---

# List Of Figures

| Figure | Caption | Section |
| :--- | :--- | :--- |
| Figure 1 | Scan this with a phone camera to open AquaZeroFit in Telegram | 2.1 |
| Figure 2 | The welcome screen, the first thing a new visitor sees | 7.1 |
| Figure 3 | Signing in with an existing email address and password | 7.1 |
| Figure 4 | Creating an account, with the password rules lighting up as they are met | 7.1 |
| Figure 5 | The first-run screen shown to a brand new account | 7.2 |
| Figure 6 | The wellness essentials form | 7.2 |
| Figure 7 | Goal, activity level and the consent choices | 7.2 |
| Figure 8 | The dashboard, showing calories remaining, macronutrients and hydration | 7.3 |
| Figure 9 | The signed-in home screen with the day's activity | 7.3 |
| Figure 10 | The nutrition screen, showing how the remaining calorie figure is arrived at | 7.4 |
| Figure 11 | The meal capture screen | 7.4 |
| Figure 12 | The generated meal suggestions, with the reason each was chosen | 7.4 |
| Figure 13 | The workouts screen, showing the training week and the exercise library | 7.5 |
| Figure 14 | The progress screen, showing the weight trend against the goal line | 7.5 |
| Figure 15 | Aqua Coach, showing the facts behind an answer | 7.6 |
| Figure 16 | The coach roster | 7.6 |
| Figure 17 | Buddy huddles, private accountability with no public feed | 7.7 |
| Figure 18 | Profile and settings, with the standing disclaimer | 7.7 |
| Figure 19 | The full settings screen, including consent, export and deletion | 7.7 |

# 1. Introduction

## 1.1 What was built

AquaZeroFit is an AI-powered wellness platform built for the NIT3004 capstone. A user creates a wellness profile, logs meals by typing, by scanning a barcode or by photographing the plate, and receives calorie targets, meal suggestions and home training plans that adapt as they progress. A conversational coach answers wellness questions inside safety limits that the software itself enforces.

The same application runs as an ordinary website and as a Telegram Mini App. It detects at start-up which of the two it is, and adapts its theme and its sign-in path accordingly, without a second codebase.

For a reader who does not write software: think of it as a food and fitness diary that can read a photograph of your dinner, work out roughly what you ate, and coach you sensibly without ever pretending to be a doctor.

At the baseline commit for this report the system consists of a Node and TypeScript API, a React client, a shared package of types and validation rules, a corpus of 139 foods and 51 exercises, 806 passing automated tests, and a safety evaluation gate that runs on every change.

## 1.2 The three decisions that shaped the project

1. **One codebase, two products.** The same application serves the browser and Telegram. Behaviour branches only at start-up, where the client checks whether Telegram supplied sign-in data. Building it twice would have doubled the work and halved the quality.
2. **The AI layer is infrastructure, not decoration.** Every AI request passes through a single controlled gateway with version-numbered instruction files, safety checks on the way in and on the way out, spending limits, and a working offline fallback. The alternative, scattering AI calls through feature code, makes safety impossible to audit.
3. **Safety is code, not a disclaimer.** Calorie floors, allergen exclusion and photo confirmation are enforced by arithmetic and control flow, not by asking a model to behave.

## 1.3 Scope review

The delivered scope matches the project charter. Every functional requirement recorded at kickoff is implemented and demonstrable, and section 3 states the outcome of each one against the module that implements it.

Four items were deliberately excluded at kickoff and recorded as future work: wearable device syncing, native iPhone and Android applications, a full payments platform beyond the Telegram Stars integration, and multiple languages. Excluding them was a decision made early to protect the core product, not a failure discovered late. Section 15 records what we would change if we started again.

## 1.4 How to read this report

| If you are | Read | You may skip |
| :--- | :--- | :--- |
| Assessing the product | Sections 1 to 8, then 13 to 17 | The code listings in sections 9 to 11 |
| Assessing individual technical contribution | Sections 9, 10 and 11 in full, then section 16 | Sections 7 and 8 |
| Reviewing the engineering | Everything, in order | Nothing |

Sections 9, 10 and 11 are the technical implementation chapters. Each is written by the member who owns that part of the system, and each explains the logic of the main functions in that subsystem, the methodology behind them, and the steps by which they were implemented.

Every code listing in this report is copied verbatim from the repository at the baseline commit. Nothing has been tidied, shortened or paraphrased, because a listing that has been cleaned up is no longer evidence. Comments are included deliberately: in this codebase the comments carry the reasoning, and stripping them would remove the evidence that the reasoning existed before the review did.

This was checked mechanically rather than by eye. A script extracts every line of every listing and asserts that the identical line exists in the repository source. At the time of issue, all 15 listings pass, across 124 lines, with zero mismatches.

# 2. Getting The App

## 2.1 Scan to open

AquaZeroFit runs inside Telegram as a Mini App. The quickest way to open it on a phone is the code below.

![Scan this with a phone camera to open AquaZeroFit in Telegram, or search for @AquaZeroFitBot inside Telegram.](docs/screenshots/telegram-qr.jpg){w=2.4}

> [!How to open it]
> **On a phone:** open the camera, point it at the code above, and tap the link that appears. Telegram opens and the app starts inside it.
> **If the camera does not read codes:** open Telegram, tap the search box, and type `@AquaZeroFitBot`.
> **On a laptop:** open the site in any browser and sign in with an email address and password. The code and the handle both point to the same place.

## 2.2 Two ways in, one account

There are two sign-in paths, and they resolve to the same account.

| Surface | How you sign in | What happens |
| :--- | :--- | :--- |
| Telegram Mini App | Automatically | Telegram passes signed launch data, the server verifies the signature and the timestamp, and the session begins with no form to fill in |
| Web browser | Email address and password | Standard credential sign-in, with a short-lived access pass and a single-use renewal pass |

A user who started in Telegram can set a web password from Settings and then use both. A user who started on the web can link their Telegram account from the same screen. The two surfaces are one account, not two.

## 2.3 Running it from source

For an assessor who wants to run the system locally, the whole application starts with no configuration at all. There is no database to install and no API key to obtain, because the storage layer defaults to a file-backed store and every AI feature has a deterministic offline engine behind it.

```
git clone <repository>
npm install
npm run seed        # loads the food, exercise and achievement corpora
npm run dev         # client
npm run api         # server, in a second terminal
```

The full verification suite is one command:

```
npm run verify      # typecheck, then all tests, then the safety evaluation gate
```

# 3. System Requirements Review

## 3.1 Functional requirements review

All twenty functional requirements are delivered. The right-hand column names the module that implements each one, so any claim in this table can be checked against the repository.

| Ref | Requirement | Outcome | Implemented in |
| :--- | :--- | :--- | :--- |
| FR-01 | Calculate personalised calorie, macronutrient and hydration targets from a wellness profile | Delivered | `modules/me/targets.ts` |
| FR-02 | Never propose an intake below a safety floor, and tell the user when the floor applied | Delivered | `me/targets.ts`, `ai/guardrails.ts` |
| FR-03 | Search a food composition corpus and log items into four meal slots | Delivered | `modules/foods`, `modules/logs` |
| FR-04 | Log a meal from a photograph, with mandatory user confirmation | Delivered | `modules/vision/router.ts` |
| FR-05 | Log a meal from a sentence typed in chat, with mandatory user confirmation | Delivered | `modules/chat/mealDraft.ts` |
| FR-06 | Exclude foods containing a declared allergen, with no false negatives | Delivered | `modules/recommendations/allergenFilter.ts` |
| FR-07 | Look up packaged food by barcode | Delivered | `modules/foods/service.ts` |
| FR-08 | Export the user's diary in a portable format | Delivered | `modules/export/export.ts` |
| FR-09 | Generate a periodised training plan matched to equipment and experience | Delivered | `modules/plans/service.ts` |
| FR-10 | Apply progressive overload without hard-coded branching | Delivered | `modules/plans/progression.ts` |
| FR-11 | Adapt training volume to how the previous week actually went | Delivered | `modules/plans/readiness.ts` |
| FR-12 | Run a guided workout session with rest timing and per-set logging | Delivered | `pages/training/WorkoutDetail.tsx`, `modules/workouts` |
| FR-13 | Report training volume and strength trends over time | Delivered | `modules/workouts/stats.ts` |
| FR-14 | Answer wellness questions grounded in the user's own data | Delivered | `modules/chat`, `modules/ai` |
| FR-15 | Refuse medical, crisis, extreme-diet and out-of-scope requests with a supportive signpost | Delivered | `modules/ai/guardrails.ts` |
| FR-16 | Summarise weekly progress in words as well as charts | Delivered | `modules/progress/insight.ts` |
| FR-17 | Authenticate by email and password, and passwordlessly inside Telegram | Delivered | `modules/auth` |
| FR-18 | Let the user export and delete all of their data | Delivered | `modules/me/service.ts` |
| FR-19 | Reward consistent behaviour without rewarding weight outcomes | Delivered | `packages/shared/src/gamification.ts` |
| FR-20 | Offer selectable coach personas, unlockable by use and optionally by purchase | Delivered | `modules/coaches`, `modules/payments` |

## 3.2 Non-functional requirements review

| Ref | Requirement | Outcome | How it is met |
| :--- | :--- | :--- | :--- |
| NFR-01 Safety | No model output may become a number the user acts on | Met | Architectural invariant enforced per feature, covered by tests and the evaluation gate |
| NFR-02 Availability | Core journeys must work when AI providers are down | Met | Provider chain, per-provider circuit breakers, deterministic offline engine |
| NFR-03 Latency | A model-backed request must not hang the client | Met | One overall deadline of 12 seconds across the whole provider chain |
| NFR-04 Security | Session theft must be containable | Met | Short-lived access tokens, single-use refresh rotation, family revocation |
| NFR-05 Privacy | Personal data must not enter model context without explicit consent | Met | Consent checked at every grounding read, and again at the memory layer |
| NFR-06 Data rights | Users must be able to leave with their data | Met | Export endpoint plus two-step deletion with purge and anonymisation |
| NFR-07 Abuse resistance | Credential and model surfaces must resist automated abuse | Met | Four rate-limit lanes, per-email lockout, per-subnet account caps |
| NFR-08 Licensing | Upstream data licences must be honoured | Met | Attribution carried on every record, segregated containers per licence family |
| NFR-09 Portability | Must run locally with zero configuration and in production on a managed host | Met | File-backed store by default, PostgreSQL when configured |
| NFR-10 Accessibility | The guided workout must be usable without sight of the timer | Met | Live-region announcements on every phase change |
| NFR-11 Verifiability | A reviewer must confirm behaviour without reading everything | Met | 806 automated tests plus three safety evaluation sets |

## 3.3 What was excluded, and why

| Excluded | Reason recorded at kickoff |
| :--- | :--- |
| Wearable device syncing | Each vendor is a separate integration with its own approval process, and none of them shortens the path to a working product |
| Native iOS and Android applications | The Telegram Mini App gives us a phone-shaped surface without two app store review cycles inside a three-week window |
| A general payments platform | Telegram Stars covers the one purchase the product actually has, which is a coach persona |
| Multiple languages | Translating safety copy correctly is a specialist task, and safety copy that is subtly wrong is worse than English-only |

# 4. Technologies Used

## 4.1 The stack, and why each piece was chosen

Every choice below was made for a stated reason. Where an obvious alternative was rejected, the reason is given rather than implied.

| Layer | Choice | Why this one, and what was rejected |
| :--- | :--- | :--- |
| Language | TypeScript on both ends | One type vocabulary shared through `packages/shared`, so a change to an API shape breaks the client at compile time rather than in front of a user. JavaScript was rejected because the shared contract is the main defence against the two ends drifting apart |
| Web framework | React 18 with Vite | Fast builds, and a build step we could extend with our own prerendering plugin for the marketing routes |
| Styling | Tailwind over CSS custom properties | The token layer is what makes Telegram theme binding possible without touching a single component |
| Data fetching | TanStack Query | Cache invalidation on mutation is the entire refresh story for the nutrition screen. Hand-rolled fetch state was rejected as a source of stale totals |
| API framework | Express | Small, well understood, and its middleware chain maps cleanly onto our admission sequence |
| Validation | zod, defined in `packages/shared` | The same schema validates the request on the server and types the client, so the two cannot disagree |
| Sessions | jsonwebtoken plus opaque random refresh tokens | Standard access tokens, and refresh tokens that carry no claims worth forging |
| Passwords | bcryptjs | Portability across the hosts we might deploy to, at a documented performance cost |
| Images | sharp | Re-encoding a photograph is both the privacy measure and the real file type check, in one operation |
| Database | PostgreSQL, with a file-backed store as the default | See section 6 and section 14.1. This changed mid-project for a reason worth reading |
| Testing | Vitest | One runner across three workspaces, fast enough to run on every change |
| Documents | A custom Markdown to DOCX renderer | Documentation lives in the repository as Markdown and is rendered for submission, so the documents version alongside the code |

## 4.2 Development environment and tooling

| Tool | Use |
| :--- | :--- |
| Node 20 or later, npm workspaces | Three workspaces, `apps/api`, `apps/web` and `packages/shared`, in one repository |
| Git and GitHub | Version control, pull requests, and the continuous integration pipeline |
| Visual Studio Code | Primary editor for all three members |
| Vitest | 806 automated tests across 78 files |
| TypeScript compiler in `--noEmit` mode | Type checking as a separate gate from tests |
| Docker Compose | Local PostgreSQL for testing the durable storage path |
| The evaluation runner in `evals/` | Three safety sets, run as a build gate, not as a report |

# 5. System Architecture

## 5.1 The shape of the system

The project is one repository containing three connected parts: the server, the client, and a shared package of types and rules used by both.

```
                 +---------------------------------------------+
                 |         Hosting (one server, one port)       |
  Web browser -->|  Server application                          |
                 |   |- delivers the client to browsers         |
  Telegram    -->|   |- answers data requests (/api/v1)         |
  Mini App       |   |- AI gateway -> providers, or offline     |
                 |   +- stores everything -> PostgreSQL database|
                 +---------------------------------------------+
       Domain registered at Hostinger, pointed at the host,
       HTTPS certificates issued automatically
```

## 5.2 Why it is arranged this way

- **One client codebase for both targets** avoids duplicating every screen. Behaviour branches only at bootstrap, where the client checks whether Telegram supplied launch data.
- **The server also delivers the client.** This gives one address, one certificate, and none of the cross-origin complexity that comes from splitting them. It also matches the hosting platform, which exposes a single external port per deployment.
- **Data lives in a database outside the application process.** This is the single most important structural decision in the project, and section 14.1 explains why it had to change mid-project.
- **All AI access is funnelled through one gateway.** Safety checks, spending limits and provider failover exist in exactly one place, so there is no path around them.
- **Validation rules are shared.** The screen and the server enforce identical limits because they import the same definitions from `packages/shared`.

## 5.3 The admission sequence

Rather than scattering checks across endpoints, every AI-backed request passes through the same ordered sequence before a provider is contacted. The order is the design, not an accident of implementation.

1. **Authenticate.** Establish who the user is.
2. **Rate limit.** Four separate lanes, so an expensive AI lane cannot be exhausted by cheap traffic.
3. **Classify for safety.** Crisis, then medical, then extreme diet, then out of scope. Section 11.3 explains why that order matters.
4. **Check consent.** If AI personalisation is off, no profile or log data is attached to the request at all.
5. **Reserve credits.** Hold the cost of the task before it starts.
6. **Call the gateway.** Provider chain, with a 12 second deadline over the whole attempt.
7. **Validate the output.** Anything that fails schema validation is discarded, not shown.
8. **Settle credits.** Commit on success, release on failure or fallback.

## 5.4 The architectural invariant

One rule governs every module in the system:

> **A model may identify, describe, phrase and suggest. It may never produce a number the user acts on.**

The model says "that looks like rice, about 150 grams". Our code looks rice up in our own corpus and multiplies. The model drafts a training week; our code checks every set, repetition and rest value against limits before the user sees it. Sections 9, 10 and 11 show, function by function, exactly where that line is drawn in code.

# 6. Database

## 6.1 Database review

The team began with a file-backed document store. Information is held as documents in named containers rather than as rows in fixed tables, which suited a three-week project in which the shape of a training plan was still moving in week two. A rigid relational schema would have meant a migration for every change of mind, and we had a great many changes of mind.

That decision was sound for development and wrong for production, for a reason that had nothing to do with data modelling and everything to do with the hosting platform. Section 14.1 tells that story in full. The outcome is that the same document model is now written through to PostgreSQL, in a single `documents` table, so the application code did not have to change while the durability problem was fixed.

## 6.2 Layout and functionality

Information is stored in named containers: users, profiles, logs, plans, content, two separate food containers, AI data, the credit ledger and the audit trail.

| Container | Holds | Notes |
| :--- | :--- | :--- |
| `users` | Accounts, credentials, refresh token records | Passwords are stored only as an irreversible bcrypt hash |
| `profiles` | Wellness profiles and derived targets | Targets are recalculated on the server, never sent up from the client |
| `logs` | Meal, water and weight entries | Every entry is owned by exactly one user |
| `plans` | Training plans, slots and progression rules | Progression is stored as data, not as branching code. See section 10.4 |
| `content` | Exercise corpus, achievements | Licence and author travel on every record |
| `foods` and `offFoods` | Two food corpora, kept apart | Separated because they carry different upstream licences |
| `ai` | Conversations, per-user memory, prompt telemetry | Memory writes are gated on consent |
| `ledger` | Credit transactions | Add-only. See below |
| `audit` | Security-relevant events | Written on authentication, deletion and admin actions |

The two food containers are separated deliberately. Mixing data that carries different licences into one collection makes it impossible to honour either licence cleanly later, and "later" in a licensing dispute is exactly the wrong time to discover this.

## 6.3 The credit ledger is add-only

A user's AI credit balance is never stored as a number that gets edited. It is calculated by adding up the history of transactions, in the same way a bank statement works rather than a figure written on a whiteboard. The implementation is in section 11.5. The consequence is that the record of what happened cannot be quietly rewritten, and a crashed job cannot leave a balance that is wrong in a way nobody can reconstruct.

# 7. User Interface Descriptions

This section describes each screen in the client. All screenshots are of the running application at the baseline commit.

## 7.1 Welcome, sign in and account creation

![The welcome screen, the first thing a new visitor sees.](docs/screenshots/01-welcome.png) ![Signing in with an existing email address and password.](docs/screenshots/02-sign-in.png) ![Creating an account. The password rules light up as they are met.](docs/screenshots/02b-create-account.png)

The welcome screen is the marketing surface, and it is prerendered at build time so that it loads without waiting for JavaScript. The sign-in and create-account screens share one form component with different copy and different validation. The password rules are shown as they are satisfied rather than as a wall of red text after submission, because a rule you can see yourself meeting is a rule you do not resent.

## 7.2 First run and profile setup

![The first-run screen shown to a brand new account.](docs/screenshots/15-first-run.png) ![The wellness essentials form. Six answers, one screen.](docs/screenshots/16-setup.png) ![Goal, activity level and the consent choices, with the button that reveals the targets.](docs/screenshots/17-setup-goal.png)

A new account lands in the application rather than in a compulsory form. The setup flow asks for six pieces of information, splits them across two short screens, and shows the consent choices on the same screen as the goal, so that a user grants permission in the context of the thing the permission is for. Every consent switch starts off. Section 11.6 shows that in code.

## 7.3 The dashboard

![The dashboard, showing calories remaining, macronutrient bars and hydration.](docs/screenshots/03-dashboard.png) ![The signed-in home screen with the day's activity.](docs/screenshots/11-signed-in.png)

The dashboard answers one question above all others: how much have I got left today. Calories remaining is the largest element on the screen. Macronutrient bars and hydration sit beneath it, and the training and progress entry points sit below those.

## 7.4 Nutrition and meal capture

![The nutrition screen, showing how the remaining calorie figure is arrived at.](docs/screenshots/04-nutrition.png) ![The meal capture screen. The whole plate is framed inside the brackets.](docs/screenshots/05-capture-meal.png) ![The generated meal suggestions, with the reason each one was chosen.](docs/screenshots/06-meal-plan.png)

The nutrition screen shows the arithmetic rather than only the answer, so a user can see which meals produced the number. The capture screen is the entry point to the photograph pipeline described in section 9.4. Nothing captured here is saved until the user confirms it. The meal suggestion screen states why each item was chosen, which is also how a user notices when a suggestion is wrong for them.

## 7.5 Training and progress

![The workouts screen, showing the training week, a rest day and the exercise library.](docs/screenshots/08-workouts.png) ![The progress screen, showing the weight trend against the goal line.](docs/screenshots/09-progress.png)

The training screen shows the current week including rest days, because a plan that hides its rest days encourages people to train through them. The progress screen plots weight against the goal line and pairs the chart with a written summary, since a trend line alone is easy to misread on a day when the number went the wrong way.

## 7.6 The coach and the coach roster

![Aqua Coach, showing the facts behind an answer.](docs/screenshots/07-coach.png) ![The coach roster. The advice is identical, only the voice changes.](docs/screenshots/14-coach-select.png)

The coach shows the user's own figures that were used to ground each answer, so an answer can be checked rather than merely believed. The roster changes the persona and the phrasing only. Every persona is subject to the same safety classifier and the same refusal copy, and no persona can be bought out of a safety rule.

## 7.7 Huddles and settings

![Buddy huddles. Private accountability, with no public feed.](docs/screenshots/13-challenges.png) ![Profile and settings, with the wellness profile and the standing disclaimer.](docs/screenshots/10-settings.png) ![The full settings screen, including consent, export and account deletion.](docs/screenshots/12-settings-full.png)

Huddles are small private groups rather than a public leaderboard, because a public feed of weight numbers is a bad idea in a health product. Settings holds the wellness profile, the four consent switches, data export, Telegram account linking, web password creation and account deletion. Everything a user needs in order to leave is on the same screen as everything they need in order to stay.

# 8. How To Use It

Five common tasks, end to end. Each one refers to the screens shown in section 7.

## 8.1 How to create an account and get your targets

1. Open the app from the QR code in section 2.1, or open the site in a browser.
2. Choose **Create account**, then enter an email address and a password. Inside Telegram, this step is skipped entirely.
3. On the wellness essentials screen, enter height, weight, age and sex.
4. On the next screen, choose a goal and an activity level, and decide which of the four consent switches to turn on.
5. Press **Show my targets**. The server calculates the daily calorie, macronutrient and hydration targets and returns them.

If the calculated figure falls below the safety floor, the application raises it to the floor and tells you that it did, along with the reason. It never shows the unsafe number as a target.

## 8.2 How to log a meal from a photograph

1. On the nutrition screen, press the camera button.
2. Frame the whole plate inside the brackets and take the picture.
3. Wait for the draft. The model identifies the items, and the application then looks each one up in its own food corpus and does the arithmetic itself.
4. Check the draft. Correct any portion that looks wrong, and remove anything that was not on the plate.
5. Press **Confirm** to save it to the diary.

Nothing is written to the diary before you press confirm, and the photograph is discarded after processing. Any item the application cannot find in its own corpus is dropped rather than guessed at.

## 8.3 How to run a guided workout

1. Open the training screen and choose today's session.
2. Press **Start**. The screen shows one exercise at a time with its target sets, repetitions and rest.
3. Log each set as you complete it. The rest timer starts on its own.
4. If an exercise is not possible today, use **Swap**. The replacement is drawn from the same filtered pool, so it will match your equipment and experience.
5. Finish the session. Volume and estimated strength are recalculated immediately.

Every timer phase change is announced to screen readers as well as displayed, so the session can be followed without watching the timer.

## 8.4 How to ask the coach a question

1. Open the coach screen and type the question.
2. The answer streams back, with the figures from your own diary that were used to ground it shown alongside.
3. If the question is medical, or concerns extreme dieting, or indicates personal crisis, the coach declines and signposts a real service instead. No AI provider is contacted at all in that case, and no credits are charged.

## 8.5 How to export or delete your data

1. Open Settings.
2. Choose **Export my data** to download everything held about the account in a portable format.
3. Choose **Delete my account** to begin deletion. This happens in two stages with a grace period, so an accidental deletion can be reversed.
4. Individual consent switches can be turned off at any time without deleting anything. Turning off AI personalisation stops profile and log data being attached to model requests immediately.

# 9. Implementation: Nutrition And Dietary System

**Owner: Victor Hong (s4685483)**

## 9.1 What this subsystem is

This subsystem owns everything to do with food: calculating the user's daily calorie and nutrition targets, the food corpus and its search, logging meals, the barcode scanner, the meal photograph pipeline, the allergen filter and data export.

The methodology throughout is the same, and it is a deliberate one. Anything that produces a number the user acts on is written as ordinary deterministic code with a published formula behind it. The AI is used only where it is genuinely better than code, which is recognising what is on a plate. Every function below is an application of that division.

## 9.2 Calculating a safe daily calorie target

**What it does.** Takes a wellness profile and returns a daily calorie target, a macronutrient split and a hydration target.

**The methodology, and why.** The calculation uses Mifflin-St Jeor, a published equation for resting energy expenditure, multiplied by a standard activity factor and then adjusted for the goal. We chose a published formula over anything of our own because a health figure a user acts on daily must be traceable to peer-reviewed work, not to three students' judgement. We rejected asking a model for this figure outright: a model returns a confident number with no derivation, and a wrong calorie target repeated daily for months is a health problem rather than a software bug.

**Implementation steps.**

1. Compute basal metabolic rate from weight, height, age and a sex offset.
2. Multiply by the activity factor for the declared activity level to get total daily energy expenditure.
3. Apply the goal adjustment. Loss uses the midpoint of the permitted 0.5 to 1.0 percent per week band; gain uses the bottom of the band, deliberately conservatively; maintenance applies nothing.
4. Clamp the result to the safety floor, and record why if the clamp fired.
5. Derive the macronutrient split from the clamped figure, never from the raw one.
6. Derive the hydration target and clamp it to a sensible band.
7. Round only at the end, so no intermediate rounding error compounds.

**The code**, from `apps/api/src/modules/me/targets.ts`:

```ts
export function computeBmr(profile: Pick<WellnessProfile, 'weightKg' | 'heightCm' | 'age' | 'sex'>): number {
  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexOffset(profile.sex);
}

export function computeTargets(profile: WellnessProfile, now: Date = new Date()): DerivedTargets {
  const bmr = computeBmr(profile);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel];
  const rawTarget = tdee + dailyAdjustment(profile.goal, profile.weightKg);

  // Safety clamp: the engine never proposes intake below the floor (FR-031).
  const floor = KCAL_FLOOR[profile.sex];
  const clamped = rawTarget < floor;
  const kcalTarget = clamped ? floor : rawTarget;
```

**Reading the code.**

- `computeBmr` is the published equation written out directly, with the sex offset in its own function so the value used is visible rather than buried in the expression.
- `tdee` scales that by activity. `rawTarget` then applies the goal adjustment, and is the honest but not yet safe answer.
- `floor` is the lowest figure the system will ever propose, which is 1200 or 1500 kilocalories depending on sex.
- `clamped` is a plain true or false: was the honest answer below that floor?
- The final line reads "if it was too low, use the floor instead, otherwise use the calculated figure".
- The clamp is applied before the macronutrients are derived, so an unsafe figure cannot leak into the protein, carbohydrate or fat targets by a side door.

**Why it matters.** The application is never the thing that told somebody to eat too little. When the clamp fires, the user is shown a message explaining what happened and suggesting a gentler rate of change, rather than the number being silently moved.

## 9.3 The food corpus and one-tap logging

**What it does.** Searches a corpus of 139 foods, and writes a chosen item into one of four meal slots for a given day.

**The methodology, and why.** Search results are cached with a short expiry and a bounded number of keys, because the corpus only changes at publication time and repeating identical searches against the store on every keystroke is wasted work. The cache is bounded rather than unbounded because an unbounded cache keyed on user input is a memory leak with extra steps.

**Implementation steps.**

1. Validate the query with the shared zod schema, which caps the length and the page size.
2. Check the read-through cache, evicting oldest-first once it holds 200 keys.
3. Match against name and category, returning a deterministically ordered page.
4. On a log write, apply an idempotency key so a double tap on a slow connection cannot create two entries.
5. Recalculate the day's totals from the underlying records rather than incrementing a stored total.

The last step matters more than it looks. Totals that are recalculated from source records cannot drift; totals that are incremented can, and the drift is invisible until a user notices their remaining calories are wrong. Twelve integration tests assert that the dashboard figures reconcile exactly to the log entries beneath them.

## 9.4 Turning a photograph of a meal into calories

**What it does.** Takes a photograph, returns a draft list of items and portions, and waits for the user to confirm before anything is saved.

**The methodology, and why.** This is the clearest example of the architectural invariant in the whole product. The model is asked what is on the plate. It is never asked how many calories are on the plate. We rejected the simpler design, in which the model returns a calorie figure directly, because that figure would be confidently wrong some of the time and no user could tell which times.

**Implementation steps.**

1. Re-encode the uploaded image with sharp. This strips GPS and camera metadata, and simultaneously proves the file really is an image rather than something renamed.
2. Send the re-encoded image to the vision lane of the AI gateway.
3. For each item the model names, look it up in our own food corpus by identifier.
4. Discard anything that cannot be found.
5. Clamp the portion estimate into a plausible range.
6. Compute the nutrition from our own corpus record and the clamped weight.
7. Return the result as a draft. Save nothing.
8. On user confirmation, write the entries and discard the photograph.

**The code**, from `apps/api/src/modules/vision/router.ts`:

```ts
      // Deterministic nutrition: the model identifies, CODE calculates.
      const food = p.foodId ? foods.find((f) => f.id === p.foodId) : undefined;
      if (!food) continue; // never trust free-text identifications we cannot ground
      const grams = Math.min(2000, Math.max(10, Math.round(p.estimatedGrams ?? 100)));
      const grounded = nutritionFromFood(food, grams);
```

**Reading the code.**

- `foods.find(...)` looks the named item up in our own corpus. The model's own words are not used as a source of nutrition.
- `if (!food) continue` skips anything that cannot be grounded. We would rather show the user one item fewer than invent numbers for something we cannot verify.
- The `grams` line forces the portion estimate between 10 and 2000 grams, so a wild guess cannot pass through into the arithmetic.
- `nutritionFromFood` does the actual multiplication from our corpus record.

**Why it matters.** Every calorie figure in the diary can be traced back to a specific corpus record and a specific weight. None of them originated in a model.

## 9.5 The allergen filter

**What it does.** Answers one question about one food and one allergen: might this contain that.

**The methodology, and why.** The filter runs in our code before the AI is shown any candidate options at all, rather than after. Filtering afterwards would mean the model had already been given unsafe items and we were relying on ourselves to catch them again. Filtering first means the unsafe items were never candidates.

The function is deliberately built to over-block. It answers "may contain", not "contains". Blocking a food that was actually safe is a small annoyance. Missing one is a hospital visit, and the two errors are not worth trading against each other.

**Implementation steps.**

1. Check the food's own declared allergen labels first, since that is the reliable source when it exists.
2. Fall back to keyword matching over the food's name and ingredient text, because real food data very often has the label missing.
3. Return true if either check hits.
4. Exclude every candidate for which any of the user's declared allergies returns true.

**The code**, from `apps/api/src/modules/recommendations/allergenFilter.ts`:

```ts
/** True when the item may contain the allergen (declared OR keyword hit). */
export function itemContainsAllergen(item: AllergenCheckable, allergen: Allergen): boolean {
  if ((item.allergens ?? []).includes(allergen)) return true;
  const keywords = ALLERGEN_NAME_KEYWORDS[allergen] ?? [];
  const texts = textsOf(item);
  return texts.some((text) => keywords.some((kw) => text.includes(kw)));
}
```

**Reading the code.**

- The first line is the declared-label check, and it returns immediately when it hits.
- The keyword list is the backup. It is what catches "satay" as peanuts and "tahini" as sesame, where the structured label is absent.
- `texts.some(... keywords.some(...))` is read as "does any text field contain any warning word".
- Note the wording of the comment. It says **may** contain. If either check is uncertain, the item is blocked.

**Verification.** Twelve allergen evaluation cases run as part of the build gate, across nine allergen types, and the gate fails the build on a single violation. At the baseline commit the result is 12 of 12 clean, with zero violations.

## 9.6 Validating a barcode before looking it up

**What it does.** Checks that a scanned barcode is arithmetically genuine before any lookup is attempted.

**The methodology, and why.** Barcodes carry a check digit calculated from the other digits, so a mistyped or misread code can be detected locally with no network call at all. We do this on the client's behalf at the boundary rather than letting a bad code travel to an external food database and come back empty, because the local failure is instant and the remote one is slow, costly and indistinguishable from "product not found".

**Implementation steps.**

1. Reject anything that is not exactly 8 or 13 digits.
2. Remove the final digit and keep it as the expected check value.
3. Sum the remaining digits, weighting alternate digits by three, counted from the rightmost data digit.
4. Compute the check digit from that sum and compare.

**The code**, from `apps/api/src/modules/foods/service.ts`:

```ts
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

**Reading the code.**

- The regular expression enforces the only two valid lengths, EAN-8 and EAN-13.
- `digits.pop()` removes the check digit and keeps it.
- The `reduce` walks the remaining digits, computing each digit's position from the right so the alternating weights of three and one land on the correct digits regardless of the total length.
- The final line performs the standard modulo-10 comparison.

# 10. Implementation: Training And Workout System

**Owner: Eric La (s8147350)**

## 10.1 What this subsystem is

This subsystem owns everything to do with exercise: the exercise corpus and its licensing, generating a weekly training plan, making that plan progress over time, easing it after a hard week, the guided session logger, and the training statistics.

The methodology across all of it is that training prescription is data and arithmetic, not model output. A model may draft a week, but nothing it drafts reaches the user without passing the same checks a code-generated week passes.

## 10.2 Filtering the corpus to what the user can actually do

**What it does.** Reduces the exercise corpus to the movements a specific user can perform with the equipment they own and at their experience level.

**The methodology, and why.** This filter runs before plan generation rather than as a validation afterwards. Prescribing a barbell squat to somebody training in a bedroom and then removing it later produces a plan with holes in it. Filtering the pool first means the generator can only ever pick from valid movements, so there is no repair step to get wrong.

**Implementation steps.**

1. Build the candidate pool from the corpus.
2. Exclude any exercise whose required equipment the user does not own.
3. Exclude any exercise above the user's experience level.
4. Sort the survivors deterministically by identifier, so the same profile always produces the same plan.

**The code**, from `apps/api/src/modules/plans/service.ts`:

```ts
export function equipmentAllows(exercise: Exercise, userEquipment: Equipment[]): boolean {
  return exercise.equipment.every((e) => e === 'none' || userEquipment.includes(e));
}
```

**Reading the code.**

- `every` means all of these must hold. The exercise is allowed only if every piece of equipment it requires is either nothing at all, or something the user has.
- One missing item excludes the exercise. There is no partial match, because a partial match is a movement the user cannot perform.
- The deterministic sort in the caller is not cosmetic. It is what makes plan generation reproducible, and therefore testable.

## 10.3 Licence attribution carried on every record

**What it does.** Stores the licence and the author on each imported exercise record, and displays them in the application.

**The methodology, and why.** Most of the corpus originates from wger, an open-source exercise database whose licence requires attribution. An obligation satisfied once in a repository file is an obligation that gets lost the first time data is copied, filtered or re-exported. Making attribution a field on the record itself means it travels with the data everywhere it goes, and cannot be dropped by accident.

**Implementation steps.**

1. Read the licence and author from the upstream record at import time.
2. Fall back to a documented default author only when the upstream fields are both empty.
3. Write both as ordinary fields on the exercise record, exactly like the name.
4. Render them on the exercise detail screen.
5. Keep differently licensed corpora in separate containers.
6. Assert all of the above in tests, so removing attribution fails the build.

**The code**, from `apps/api/src/data/wger/importer.ts`:

```ts
    // Attribution — never stripped (AQF-12).
    licence: licence.shortName,
    licenceAuthor: translation.license_author || info.license_author || FALLBACK_AUTHOR,
```

**Reading the code.**

- The comment states the obligation at the point where it is discharged, so anyone editing this code sees why the fields exist.
- The fallback chain prefers the translation's author, then the base record's author, and only then the documented default.
- Because these are ordinary fields rather than a separate register, every downstream consumer gets them for free.

## 10.4 Generating a plan, and progression as data

**What it does.** Builds a training week from the filtered pool, and records how that week should change in each subsequent iteration.

**The methodology, and why.** The obvious implementation of progressive overload is conditional code: in week three, add a set. We rejected it. Progression written as branching logic cannot be shown to the user, cannot be tested in isolation, and has to be re-read by a human to answer the simple question "what will week five ask of me". Progression written as data can be displayed, tested and reasoned about directly.

**Implementation steps.**

1. Choose exercises for each slot from the filtered pool.
2. Compute the prescribed sets, repetitions and rest for iteration one.
3. Emit three progression rules per slot, keyed by iteration: repetitions first, then volume, then rest density.
4. Clamp every rule value through the shared safety limits at the point of creation.
5. Base the volume rule on the prescribed sets, so a week that was eased progresses from where it actually started rather than snapping back.

**The code**, from `apps/api/src/modules/plans/service.ts`:

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

**Reading the code.**

- Three rules are created for every exercise in the plan.
- The first reads: for this exercise, change the repetitions, starting at iteration 2, to the original repetitions plus two.
- The second adds a set at iteration 3. The third shortens the rest by fifteen seconds at iteration 4.
- `clampSets` and `Math.max(30, ...)` are the safety limits. No rule can produce forty sets or zero rest, whether the rule was generated by our code or drafted by a model.
- The ordering, repetitions then volume then rest, is a deliberate overload progression rather than an arbitrary sequence.

## 10.5 Easing off after a hard week

**What it does.** Scores the previous seven days and scales the coming week's volume accordingly.

**The methodology, and why.** Holding somebody to a plan built for a good week, during a bad week, is how they stop using the product. The thresholds and multipliers are constants in the shared package rather than numbers inline in the generator, so that the policy can be read, tested and changed in one place.

**Implementation steps.**

1. Score the last seven days out of 100, weighted mainly on planned sessions actually completed.
2. Map the score into one of three bands.
3. Multiply the coming week's volume by the band's multiplier.
4. Phrase the outcome as the application reducing the workload, never as the user having failed.

**The code**, from `packages/shared/src/constants.ts`:

```ts
export const READINESS_PROTECT_MAX_SCORE = 39;
export const READINESS_MAINTAIN_MAX_SCORE = 74;
export const READINESS_VOLUME_MULTIPLIER = {
  protect: 0.6,
  maintain: 1,
  progress: 1.1,
} as const;
```

**Reading the code.**

- A score of 39 or below is "protect", 40 to 74 is "maintain", and above 74 is "progress".
- The multipliers state exactly what happens to the workload: protect drops it to sixty percent, maintain leaves it alone, progress adds ten percent.
- Because these are exported constants, the client can display the band and the tests can assert the boundaries without duplicating the numbers.

Twenty-nine automated tests cover the readiness calculation and its boundaries.

## 10.6 Estimating strength over time

**What it does.** Estimates the maximum weight a user could lift once, from sets they actually completed.

**The methodology, and why.** The Brzycki formula is published and widely used, and it is valid only over a limited repetition range. Rather than returning a plausible-looking figure outside that range, the function refuses to answer. A null that the caller must handle is safer than a number that is quietly wrong.

**Implementation steps.**

1. Reject non-positive loads and repetition counts outside the valid range.
2. Apply the published formula.
3. Round to two decimal places.
4. Record which version of the formula produced each stored figure.

**The code**, from `apps/api/src/modules/workouts/stats.ts`:

```ts
/** Brzycki e1RM in kg; undefined outside 1–36 reps or without a load. */
export function brzyckiE1rm(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps >= 37) return null;
  return Math.round(((weightKg * 36) / (37 - reps)) * 100) / 100;
}
```

**Reading the code.**

- The guard clause is the whole safety design of this function. Outside the formula's valid domain it returns `null`, which means "no answer", not "zero".
- The arithmetic is the published formula written directly, with rounding applied only at the end.
- Storing the formula version alongside each result means that if we ever changed formula, historic figures would not silently shift underneath the user, which would make an improvement indistinguishable from a change of mathematics.

# 11. Implementation: Platform, AI, Safety And Operations

**Owner: Babatundji Williams-Fulwood (s8138393)**

## 11.1 What this subsystem is

This subsystem owns the parts every feature sits on: how the application talks to AI providers, the safety checks around them, authentication and sessions, privacy and data rights, per-user memory, progress analytics, the credit ledger, gamification, payments, and getting the whole system into production.

The methodology here is containment. Each of these concerns exists in exactly one place, with one entrance, so that there is no code path that bypasses it. A safety check that can be avoided by calling a different function is not a safety check.

## 11.2 The AI gateway and its failover chain

**What it does.** Routes every AI request in the product, chooses a provider, retries, gives up, and falls back to a deterministic offline engine.

**The methodology, and why.** Feature code never names an AI vendor. It asks for a logical lane, and one module decides who answers. This means changing provider is a change to one file, and it means the failure behaviour is uniform rather than reimplemented per feature. We rejected calling providers directly from features because it makes both the safety surface and the spending surface unbounded.

**The lanes**, from `packages/shared/src/constants.ts`:

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

These five names are the only vocabulary the rest of the application has for AI: look at this picture, hold a conversation, write a structured plan, run a cheap safety check, write a summary.

**Implementation steps in the failover loop.**

1. Compute a single deadline for the entire call. Callers may tighten it but never extend it past the ceiling of 12 seconds.
2. Walk the provider chain in order, skipping providers with no credentials and providers whose circuit breaker is open.
3. Give each credentialed provider a bounded number of attempts, and each attempt a budget that is the lesser of its own timeout and whatever remains of the overall deadline.
4. Record one failure per provider per call, not one per attempt.
5. On exhaustion, fall through to the deterministic offline engine.
6. Mark the result as degraded, and record whether the cause was provider failure or the deadline.
7. Do not charge the user for a degraded result.

**The code**, from `apps/api/src/modules/ai/gateway.ts`:

```ts
  // Callers may tighten the budget but never extend it past the ceiling.
  const deadlineAt = Date.now() + Math.min(opts.deadlineMs ?? OVERALL_DEADLINE_MS, OVERALL_DEADLINE_MS);
  const remainingMs = (): number => deadlineAt - Date.now();

  outer: for (const provider of PROVIDERS) {
    const credentialed = !!process.env[provider.keyEnv];
    if (!credentialed && !provider.keyOptional) continue;
    // Counted before the breaker check: a provider skipped because it is
    // already failing is still a real dependency the user did not get.
    realProviderInPlay = realProviderInPlay || credentialed;
    if (circuitIsOpen(provider.name)) continue;
```

**Reading the code.**

- `deadlineAt` is computed once, before the loop. Everything inside the loop reads from it, so the total wait is bounded no matter how many providers are configured. This is what turned a worst case of roughly 100 seconds into a hard 12.
- The `Math.min` is the important half of that line. A caller can ask for less time but cannot ask for more.
- `realProviderInPlay` is set before the circuit breaker check, deliberately. A provider skipped because it is already failing is still a dependency the user did not receive, and the result must be marked degraded rather than presented as a normal offline answer.
- `outer:` labels the loop so that a blown deadline can break out of both the attempt loop and the provider loop at once.

**Why it matters.** An AI outage degrades the product instead of stopping it. Every AI feature has a deterministic offline engine behind it, and the offline engine's output is byte-identical run to run, which is what allows the evaluation gate and the test suite to depend on it.

## 11.3 The safety classifier, and why its order is the design

**What it does.** Classifies every user message before it goes anywhere near a provider.

**The methodology, and why.** The checks are ordered by severity, and the function returns on the first match rather than gathering all matches and choosing between them afterwards. A message can plausibly mention both distress and food. If the classifier collected both and then picked, the picking rule would be the safety-critical code, and it would be easy to get wrong during a later refactor. Returning immediately makes the priority structural.

**Implementation steps.**

1. Detect instruction-override attempts and record the fact, but do not return yet.
2. Check for crisis indicators. Return immediately on any match.
3. Check for medical questions. Return on match.
4. Check for extreme dieting language, then for sub-floor calorie targets stated numerically. Return on match.
5. Check for out-of-scope requests. Return on match.
6. Refuse a pure instruction-override attempt even when it carries no unsafe payload.
7. Otherwise the message is safe.

**The code**, from `apps/api/src/modules/ai/guardrails.ts`:

```ts
export function classify(text: string): ClassificationResult {
  const matched: string[] = [];
  const jailbreakHit = findMatch(text, JAILBREAK_PATTERNS);
  const jailbreak = jailbreakHit !== null;
  if (jailbreakHit) matched.push(jailbreakHit);

  const crisis = findMatch(text, CRISIS_PATTERNS);
  if (crisis) {
    matched.push(crisis);
    return { category: 'crisis', jailbreak, matched };
  }
  const medical = findMatch(text, MEDICAL_PATTERNS);
  if (medical) {
    matched.push(medical);
    return { category: 'medical', jailbreak, matched };
  }
```

**Reading the code.**

- The crisis check is first, and it returns before anything else is even evaluated. Somebody in distress is never handed diet advice, because the code physically cannot reach the diet branch.
- The jailbreak result is computed first but deliberately does not return. It is carried alongside the category so that an override attempt wrapped around a medical question is still classified as medical, and the override is recorded rather than treated as the whole story.
- `matched` accumulates the patterns that fired, which is what makes a refusal auditable after the fact.
- When a category other than safe is returned, no provider is contacted at all, the user receives supportive copy with a real helpline, and no credits are charged.

**Verification.** Forty-three assistant safety cases run as a build gate. At the baseline commit the result is 43 of 43 exact, with zero critical misses.

## 11.4 Detecting a stolen session

**What it does.** Exchanges a renewal pass for a new one, and detects the case where a pass is presented twice.

**The methodology, and why.** Access tokens are short-lived and refresh tokens are single use. A second presentation of a single-use token means two parties hold it, which means it was copied. The response is to revoke the entire token family rather than only the token presented, because the attacker and the legitimate user are indistinguishable at that moment and only one of them can sign in again with a password.

**Implementation steps.**

1. Hash the presented token and find the stored record.
2. If it has already been used or revoked, revoke the whole family and fail.
3. If it has expired, fail without revoking, since expiry is normal.
4. Mark the token used through an atomic compare-and-swap.
5. If the swap fails, another request won the race, which is also reuse. Revoke the family and fail.
6. Otherwise issue the next token in the same family.

**The code**, from `apps/api/src/platform/auth.ts`:

```ts
  if (existing.usedAt !== null || existing.revokedAt !== null) {
    revokeFamily(existing.familyId);
    throw new AppError('AUTH_INVALID', 'Refresh token reuse detected; session revoked');
  }
  if (new Date(existing.expiresAt).getTime() < Date.now()) {
    throw new AppError('AUTH_INVALID', 'Refresh token expired');
  }

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
    throw new AppError('AUTH_INVALID', 'Refresh token reuse detected; session revoked');
  }
```

**Reading the code.**

- The first branch is the straightforward reuse case: the token was already used or already cancelled.
- `revokeFamily` cancels every pass in the chain, not just this one, so both parties are signed out at the same moment.
- Expiry is handled separately and does not revoke anything, because an expired token is ordinary rather than suspicious.
- The compare-and-swap is what makes this correct under concurrency. Without it, two simultaneous refreshes could both read "unused" and both succeed, which is precisely the condition the reuse check exists to catch.
- The second revocation, on a failed swap, is the same defence applied to the race that the first check cannot see.

**Why it matters.** A stolen session is contained automatically. The real user signs in again with their password; whoever copied the token gets nothing.

## 11.5 Counting AI usage without a counter

**What it does.** Reports a user's AI credit balance.

**The methodology, and why.** There is no stored balance. The balance is derived by folding the transaction history. A stored counter can disagree with its own history after a crash, a retry or a partial write, and once it does there is no way to tell which of the two is right. A fold cannot disagree with the history because it is the history.

**Implementation steps.**

1. Fetch the user's transactions.
2. Sum the amounts, ignoring anything non-numeric defensively.
3. Reserve credits before a task begins, and settle after it ends.
4. Release the reservation if the task fails or falls back to the offline engine.

**The code**, from `apps/api/src/modules/ai/creditLedger.ts`:

```ts
    /** Balance = fold. No cached counters, ever. */
    async balance(userId: string): Promise<number> {
      const txs = await userTxs(userId);
      return txs.reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);
    },
```

**Reading the code.**

- `reduce` walks the transactions and adds them. That total is the balance, by definition.
- The `typeof` guard means a single malformed record degrades the total rather than throwing and denying the user access to the whole feature.
- Because the ledger is add-only, a reservation and its release are two entries rather than an edit, so the sequence of events remains reconstructable afterwards.

## 11.6 Consent that starts switched off

**What it does.** Establishes the default privacy position for a new account.

**The methodology, and why.** The product holds health data, so every permission starts off and each is granted separately. Bundling consent into a single switch would make a user who wants reminders also accept AI personalisation, which is not consent in any meaningful sense.

**The code**, from `apps/api/src/modules/me/service.ts`:

```ts
const DEFAULT_CONSENTS: Omit<ConsentState, 'updatedAt'> = {
  wellnessDataProcessing: false,
  aiPersonalisation: false,
  anonymisedAnalytics: false,
  reminders: false,
};
```

**Reading the code.**

- Four separate permissions, every one initialised to false.
- Nothing is bundled, so any one can be granted while the others are refused.
- The second flag does real work rather than being advisory. With `aiPersonalisation` off, no profile data and no log data are attached to a model request at all, not even a first name. The coach still answers; it answers generically.

Consent is checked at every grounding read and again at the memory layer, so a single missed check in one feature does not silently open the door.

## 11.7 The storage layer, rebuilt mid-project

**What it does.** Provides durable storage without changing the shape of the code above it.

This is the largest single piece of engineering in the project and it exists because of a discovery made late. Section 14.1 tells the story. What follows is the design.

**The methodology, and why.** The application code was written against an in-memory document store. When durability became necessary, we had two options: convert every caller to asynchronous database access, which was roughly a week of work across 24 files and 77 call sites, or write the same in-memory working set through to PostgreSQL behind the existing interface. We chose the second, and we wrote down what it does not achieve rather than discovering that later.

**The code**, from `apps/api/src/platform/pgStore.ts`:

```
 * WHAT THIS DOES NOT ACHIEVE — read before scaling the deployment:
 *
 *   This gives durable persistence for a SINGLE instance. It does NOT make the
 *   app multi-instance / Autoscale safe. Every instance hydrates its own
 *   in-memory copy at boot and never re-reads; a write on instance A is
 *   invisible to instance B until B restarts, and last-writer-wins at the row
 *   level will silently drop the other instance's version of a document. Run
 *   this on a single Reserved VM (or max-instances=1), or finish the async
 *   getStore() refactor and read through to Postgres before scaling out.
```

**Why this comment is quoted in a report.** The limitation is written at the top of the file that has it, in the place a developer will be standing when the limitation would bite them. The deployment configuration is pinned to a single instance to match, and the constraint is repeated in the deployment guide. A trade-off recorded in the code is a trade-off that survives the team leaving.

# 12. Methodology

## 12.1 How the team worked

The team formed five days before the first assessment, which set the shape of everything after it. We chose bounded individual ownership over shared ownership of everything: each member owns a vertical slice of the product, including its screens, its endpoints, its domain logic and its tests. The alternative, dividing by layer so one person writes all the screens and another all the endpoints, would have meant nobody could demonstrate a working feature on their own.

Daily meetings were minuted and the development diary was written the same day rather than reconstructed later, which is the only reason the diary is usable as evidence at all.

## 12.2 How decisions were recorded

Significant decisions are recorded as Architecture Decision Records, each stating the context, the decision, the alternatives rejected and the consequences. The records that governed this implementation include the architectural invariant that models identify while code calculates, the use of an admission sequence rather than per-endpoint checks, logical model lanes instead of vendor names, a deterministic offline engine behind every lane, progression expressed as data rather than code, and segregated containers per data licence.

Recording the rejected alternative matters more than recording the decision. A decision without its alternative reads as the only option that was ever considered, which makes it impossible for a later reader to know whether it was reasoned or accidental.

## 12.3 How code reached the main branch

| Gate | What it does |
| :--- | :--- |
| Type check | `tsc --noEmit` across all three workspaces, treated as a separate gate from tests |
| Test suite | 806 tests across 78 files, run on every change |
| Safety evaluation | Three sets, run as a gate that fails the build rather than as a report nobody reads |
| Continuous integration | All of the above, automatically, on every push |

The safety evaluations existed for several days before anything ran them automatically, and section 15 records that as a mistake. A gate nobody runs is documentation.

# 13. Verification

## 13.1 Results at the baseline commit

Measured on branch `main` at commit `e7d7738`, 17 August 2026.

| Check | Result |
| :--- | :--- |
| Automated tests | 806 passing across 78 files (650 API across 54 files, 156 web across 24 files) |
| Type safety across the codebase | 0 errors |
| Assistant safety evaluation | 43 of 43 exact, 0 mismatches, 0 critical misses |
| Allergen exclusion evaluation | 12 of 12 clean, 0 violations |
| Plan engine safety evaluation | 15 of 15 pass, 0 failures |
| Overall evaluation gate | Passed |
| Code listings in this report | 15 listings, 124 lines, verified byte-exact against the baseline source, 0 mismatches |
| Continuous integration | Every change runs all of the above |

## 13.2 What the evaluation sets actually test

The three evaluation sets are not unit tests of our own functions. They are adversarial inputs.

- **Assistant safety** feeds messages that should be refused, including medical questions phrased as curiosity, crisis language, extreme dieting requests, and instruction-override attempts wrapped around all three. It asserts the exact category returned, and any critical miss fails the build outright.
- **Allergen exclusion** asserts that no candidate containing a declared allergen survives filtering, across nine allergen types.
- **Plan engine safety** injects deliberately malformed and unsafe model responses, including out-of-range effort values, invalid references and over-long text, and asserts that each one is rejected rather than shown to a user. The log lines from that run are visible evidence that the rejections happen: the engine states which rule the draft broke.

## 13.3 Corrections to earlier drafts

Three figures quoted in earlier documents were wrong or have moved, and are corrected here rather than left to be found.

| Earlier claim | Corrected figure |
| :--- | :--- |
| 431 automated tests | 806 at the baseline commit |
| An 828-exercise library | 51 exercises in the shipped corpus. The 828 figure was the size of the upstream wger catalogue, not of what we import and credit |
| Two calorie formulas | One, Mifflin-St Jeor. The second formula requires a body fat measurement we never collect |

# 14. Challenges And Problems

## 14.1 The most significant problem, and how it was solved

This section is included because the way a team handles a serious mid-project discovery says more than a list of features does.

**The discovery.** On the final day of a reporting week, the team confirmed from the hosting provider's own documentation that a published application's file storage is not persistent and resets on every publish.

**Why it mattered.** All application data was held in files. Publishing an update would have deleted every account, weight record, meal log and conversation. The failure would never have appeared in development, because nothing is published during development. It would have appeared the first time the live application was updated, in front of real users.

**The options considered.**

| Option | Assessment |
| :--- | :--- |
| Convert every part of the application to asynchronous database access | Correct in the long term, but roughly a week of work across 24 files and 77 call sites, with a high risk of breaking working features. Not available in the time remaining |
| Accept it and hope | Not acceptable for a product holding health data |
| Change only the storage layer, leaving the callers untouched | Chosen. Data is written through to PostgreSQL while the rest of the application keeps working exactly as before |

**The trade-off, recorded openly.** The chosen design is durable for a single server. Running several copies at once would require the fuller conversion, so the hosting is configured for a single instance, and the limitation is written at the top of the file that has it as well as in the deployment guide. It was not left to be discovered.

**What this demonstrates.** The problem was found by reading the platform documentation rather than by assuming; the options were compared on time and risk rather than on preference; the chosen fix was implemented and verified within a day; and its limitation was written down instead of being glossed over.

## 14.2 Other challenges

| Challenge | Response | Outcome |
| :--- | :--- | :--- |
| Meal photographs carry GPS coordinates at home-address precision | Re-encode every uploaded image from its pixels, discarding hidden metadata | Location data never reaches health records, and the re-encode doubles as the real file type check. Verified by tests |
| Telegram Mini Apps run inside a frame, which standard security headers block | Used the modern framing policy, which can name Telegram as an exception, and deliberately omitted the older header that would override it | The Mini App works, and protection against every other site is retained |
| AI providers fail, rate-limit or hang | Retry with increasing waits, stop contacting a repeatedly failing provider, cap the whole chain at 12 seconds, fall back to the offline engine | Worst case wait cut from roughly 100 seconds to 12. Fallbacks are flagged rather than silent, and are not charged for |
| The Telegram SDK was a blocking script on every page load, including the marketing page | Detect a Telegram launch without the SDK, and fetch it only when the detection succeeds | A third-party render-blocking request was removed from the marketing page, which was hurting precisely the users on networks that block telegram.org |
| The file upload library was unmaintained and had a known flaw | Upgraded to the current major version | Any signed-in user could previously crash the server with a malformed upload |
| Open data licences require per-item attribution | Licence and author stored on every record, credit shown next to each item, separate containers for differently licensed data | Obligations met at the record level rather than only in a repository file |
| A three-person team formed five days before the first assessment | Bounded individual ownership, daily minuted meetings, same-day diary | Each member can demonstrate and explain their own work |
| Test suite crashed intermittently on one Windows machine | Isolated the runner to a single fork on that machine | Reproducible full-suite runs, with the workaround recorded rather than the failure ignored |

# 15. What We Would Do Differently

- **Check the hosting platform's storage behaviour in the first hour, not on the final day of a reporting week.** The fix was manageable only because it was found before launch. Finding it earlier would have avoided rebuilding a working layer under time pressure.
- **Connect the email service in week one.** Password reset generates a correct code and has nowhere to send it, which leaves an otherwise finished feature unusable.
- **Set up the automated build pipeline on day one.** The safety evaluations existed for days before anything ran them automatically.
- **Draft the privacy policy alongside the consent controls.** The engineering for consent was finished well before the legal wording it depends on.
- **Test unusual photograph formats on a real phone early.** Whether a given image format works depends on what is installed on the server, not on whether the file is valid.
- **Reconcile the document set's figures weekly.** Three numbers in section 13.3 were stale across documents, and catching that at submission is later than it should have been.

# 16. Student Contributions

## 16.1 Basis of this statement

This is a declaration by the team, confirmed by all three members. That is stated plainly rather than implied.

The repository's commit history was produced through a single shared account, so the commit log attributes every change to one identity and cannot evidence individual authorship. Rather than present an inference as a fact, the team declares ownership directly. Each member is accountable for explaining, defending and maintaining every module listed against their name, and each has written their own implementation chapter in this report.

The percentages below reflect the module ownership map in AQF-24 together with documentation and coordination duties.

## 16.2 Summary

| Student ID | Name | Role | Contribution |
| :--- | :--- | :--- | :--- |
| s8138393 | Babatundji Williams-Fulwood | Technical Lead and Software Architect | 50% |
| s8147350 | Eric La | Training and Workout System | 25% |
| s4685483 | Victor Hong | Nutrition and Dietary System | 25% |

## 16.3 Babatundji Williams-Fulwood, s8138393, 50%

**Architecture and technical leadership.** I designed the system structure, the module boundaries and the conventions the other two members built against, and I wrote the architectural invariant that governs every AI-backed feature in the product: a model may identify, but only code may calculate. I facilitated the daily meetings and ran the integrated demonstration.

**The AI platform.** I built the AI gateway, which is the single entrance for every model request in the system. That includes the logical model lanes so no feature names a vendor, the provider failover chain, per-provider circuit breakers, the single 12 second deadline across the whole chain, and the deterministic offline engine that keeps every AI feature working with no provider credentials at all. I also built the credit ledger, which derives balances by folding an add-only transaction history rather than storing a counter, and the reservation and settlement flow that makes a crashed job refund itself.

**Safety.** I built the guardrail classifier and, more importantly, decided its ordering, so that a message containing both distress and diet content can only ever be treated as the former. I wrote the versioned prompt files and the three safety evaluation sets, and wired them into the build as a gate rather than a report.

**Security and privacy.** I built authentication for both surfaces: email and password on the web, and Telegram launch data verified with a constant-time signature comparison and a freshness check. I built the session model, including single-use refresh rotation, family revocation on reuse and the atomic compare-and-swap that makes it correct under concurrency. I built the consent model with every permission defaulting off, the export endpoint, the two-stage deletion with a grace period, and the consent gate on per-user AI memory.

**Platform and operations.** I built the storage abstraction and then, after the persistence discovery described in section 14.1, the PostgreSQL write-through layer that fixed it inside a day without touching 77 call sites. I built the start-up guard that refuses to boot in production with development defaults, the framing policy that permits Telegram and no one else, the telemetry, the rate limit lanes, the progress insight summaries, gamification, Telegram Stars payments and the deployment configuration.

**Documentation.** I wrote the architecture and contribution report, the deployment guide, the decision records, and this final report, including sections 1 to 8 and 11 to 17.

## 16.4 Eric La, s8147350, 25%

**Ownership.** I own the training and workout system end to end: the exercise corpus, the plan generator, progression, readiness adaptation, the guided session logger and the training statistics, including the screens, the endpoints and the tests for all of it.

**The exercise corpus and licensing.** I researched the licence position of every candidate exercise source before writing any import code, which is the right order and is why we did not have to unpick anything later. I built the wger importer and made attribution a field on every record rather than an entry in a file, so the licence and the author travel with the data everywhere it goes. Differently licensed corpora are stored in separate containers for the same reason.

**Plan generation and progression.** I built the filter that reduces the corpus to what a user can actually perform with the equipment they own, and the generator that builds a week from what survives. I chose to express progressive overload as data rather than as conditional code, so that the plan can show a user what week five will ask of them, and so that the rules can be tested in isolation. Every rule value passes through shared safety limits at the point of creation, which is what stops any rule, including one drafted by a model, producing an absurd prescription.

**Adaptive readiness.** I built the readiness scoring that eases the coming week after a hard one, with the thresholds and multipliers as shared constants so the policy lives in one readable place. I also wrote the copy for that feature, which presents a lighter week as the application taking work off the user rather than as the user having failed.

**The guided session and statistics.** I built the session logger with its rest timing and per-set logging, including live-region announcements on every phase change so the session can be followed without watching the timer. I built the training statistics, including the Brzycki strength estimate, which returns no answer rather than a wrong one outside the range the formula is valid for.

**Frontend.** I built the AquaZero design system from the reference screens and the training and workout screens on top of it, with loading, empty and error states throughout, so the application never shows a blank broken screen.

**Documentation.** I wrote section 10 of this report and the training material in the user manual.

## 16.5 Victor Hong, s4685483, 25%

**Ownership.** I own the nutrition and dietary system end to end: targets, the food corpus and search, meal logging, the barcode path, the meal photograph pipeline, the allergen filter, recipes and data export, including the screens, the endpoints and the tests.

**Targets.** I built the calorie and macronutrient engine on the Mifflin-St Jeor equation, with the activity factor and goal adjustment, and the safety floor that clamps any target below the safe minimum. The clamp is applied before the macronutrients are derived, so an unsafe figure cannot leak into them, and the user is told the clamp fired and why rather than having the number moved silently.

**The food corpus and logging.** I built the corpus of 139 foods with its per-record source and licence, the bounded read-through search cache, and meal logging into four slots with an idempotency key so a double tap on a slow connection cannot create two entries. Day totals are recalculated from the underlying records rather than incremented, and I wrote the integration tests that assert the dashboard reconciles exactly to the logs beneath it.

**The photograph pipeline.** I built the meal photograph path, which is the clearest expression of the project's central rule. The model names the items; my code looks each one up in our own corpus, clamps the portion into a plausible range and does the arithmetic itself. Anything that cannot be grounded is dropped rather than guessed. Nothing is written to the diary before the user confirms it, and the photograph is discarded afterwards.

**Safety in the food domain.** I built the allergen filter, deliberately biased towards over-blocking, checking the declared label first and then falling back to keyword matching over the name and ingredients because real food data very often has the label missing. It runs before the AI is shown any candidates at all, rather than as a check afterwards. I also built the barcode checksum validation, which rejects a mistyped code instantly on the device rather than sending a pointless request to an external service.

**Quality engineering.** I wrote the privacy isolation suite that confirms no signed-in user can reach another user's data, the allergen evaluation set used as a build gate, and the integration tests behind the verification figures in section 13. I produced the verification evidence used across the assessment documents.

**Documentation.** I wrote section 9 of this report and the nutrition material in the user manual.

# 17. Conclusion

AquaZeroFit delivers every functional requirement in the brief as working, demonstrable software, verified by 806 automated tests, a clean type check across three workspaces, and a safety evaluation gate that fails the build rather than filing a report. The three engineering decisions that distinguish it are the single AI gateway with one entrance and no way around it, the rule that models identify while code calculates, and safety enforced as arithmetic and control flow rather than as instruction to a model.

The team's handling of the storage discovery is the clearest evidence of professional practice in the project. A serious flaw was found by reading documentation rather than by assuming, options were weighed on time and risk, the chosen fix was implemented and verified inside a day, and its limitation was written into the file that has it rather than hidden.

What is honestly incomplete is small and stated: the password reset path generates a correct code and has no mail service to send it through, and the deployment is pinned to a single instance by the trade-off recorded in section 14.1. Both are scoped, owned and documented rather than discovered.

# 18. References

Australian Government Department of Health and Aged Care. (n.d.). *Australian dietary guidelines*. https://www.health.gov.au/topics/food-and-nutrition

Brzycki, M. (1993). Strength testing: Predicting a one-rep max from reps-to-fatigue. *Journal of Physical Education, Recreation and Dance, 64*(1), 88-90.

Butterfly Foundation. (n.d.). *National helpline*. https://butterfly.org.au/

Colinhacks. (n.d.). *zod: TypeScript-first schema validation*. https://zod.dev/

Express. (n.d.). *Express: Fast, unopinionated, minimalist web framework for Node.js*. https://expressjs.com/

Food Standards Australia New Zealand. (2016). *AUSNUT 2011-13 food nutrient database*. https://www.foodstandards.gov.au/science-data/monitoringnutrients/ausnut

Lovell, L. (n.d.). *sharp: High performance Node.js image processing*. https://sharp.pixelplumbing.com/

Meta Open Source. (n.d.). *React*. https://react.dev/

Mifflin, M. D., St Jeor, S. T., Hill, L. A., Scott, B. J., Daugherty, S. A., & Koh, Y. O. (1990). A new predictive equation for resting energy expenditure in healthy individuals. *The American Journal of Clinical Nutrition, 51*(2), 241-247.

Node.js. (n.d.). *Node.js*. https://nodejs.org/

Open Food Facts. (n.d.). *Open Food Facts: The free food products database*. https://world.openfoodfacts.org/

OpenJS Foundation. (n.d.). *npm workspaces*. https://docs.npmjs.com/cli/using-npm/workspaces

PostgreSQL Global Development Group. (n.d.). *PostgreSQL*. https://www.postgresql.org/

Tailwind Labs. (n.d.). *Tailwind CSS*. https://tailwindcss.com/

TanStack. (n.d.). *TanStack Query*. https://tanstack.com/query/

Telegram. (n.d.). *Telegram Mini Apps*. https://core.telegram.org/bots/webapps

Telegram. (n.d.). *Telegram Stars*. https://core.telegram.org/bots/payments-stars

Vitest. (n.d.). *Vitest: Next generation testing framework*. https://vitest.dev/

Vite. (n.d.). *Vite: Next generation frontend tooling*. https://vite.dev/

wger Project. (n.d.). *wger workout manager*. https://wger.de/

Microsoft. (n.d.). *TypeScript*. https://www.typescriptlang.org/
