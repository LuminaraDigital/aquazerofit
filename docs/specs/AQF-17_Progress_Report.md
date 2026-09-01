---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Progress Report
subtitle: Assessment 1: Progress Report and Demonstration of 80% Project Completion
details:
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Team members: Babatundji Williams-Fulwood (s8138393), Eric La, Victor Hong
  Supervisor: [Supervisor name]
  Group: Group [number], Victoria University, Melbourne
  Group formed: Monday 27 July 2026
  Reporting period: 27 July 2026 to 31 July 2026
  Project end date: Monday 17 August 2026
  Submission date: Friday 31 July 2026
  Document status: Issued for assessment
---

# Executive Summary

This report describes the current state of AquaZeroFit, a wellness application built by a team of three students for the NIT3004 capstone unit. The team was formed on Monday 27 July 2026 and this report covers the first working week, ending Friday 31 July 2026.

**In plain terms:** AquaZeroFit is a phone and web app that helps someone eat better and train sensibly. The user takes a photo of a meal or scans a barcode, and the app records what they ate and how many calories it contained. It also builds them a workout plan and offers a chat assistant that answers wellness questions safely.

**Current status: approximately 80% complete.** Every main feature a user would touch is built and can be shown working, from creating an account through to logging food, following a workout and chatting to the assistant. The remaining 20% is not new features. It is publishing the app to the internet, and finishing the legal and trust pages that any real health product must have before it takes on real users.

The claim of 80% is not an opinion. It is backed by evidence anyone can re-run in under a minute:

| Evidence | Result |
|---|---|
| Automated tests (the app checking itself) | 431 tests across 35 files, all passing |
| Type safety check across the whole codebase | 0 errors |
| Safety evaluation gate (adversarial questions) | Passed, zero critical misses |
| Live end-to-end run of the real server | All checks passed |

Section 2 explains what those numbers mean for a non-technical reader. Appendix B is a run-sheet for demonstrating the working product in about twelve minutes.

# 1. Project Overview

## 1.1 What the product does

AquaZeroFit is an AI-powered wellness platform under the AquaZero brand. A user creates a wellness profile (height, weight, activity level, goal), and the app calculates a sensible daily calorie and nutrition target for them. From there they can:

- **Log food three ways.** Type it in manually, scan a product barcode, or photograph the meal and let the app identify what is on the plate.
- **Follow a training plan.** The app builds a home workout programme from a library of over 800 exercises and adjusts the difficulty as the user gets stronger.
- **Track progress.** Weight trends, calorie trends, water intake, workout history and achievement badges.
- **Ask a coach.** A chat assistant called Aqua Coach answers nutrition and fitness questions, and refuses to answer anything that should go to a doctor.

## 1.2 Two products from one codebase

The same application is delivered in two places at once, which was a deliberate design decision made at kickoff:

1. **A normal website** that works on a phone or a laptop browser.
2. **A Telegram Mini App**, which runs inside the Telegram messaging app. Telegram is used by roughly a billion people, and a Mini App can be opened without installing anything from an app store.

**Why this matters:** writing the app twice would have doubled the work and halved the quality. Writing it once, and letting it detect where it is running, meant the team could spend its time on features instead of duplication.

## 1.3 Safety position

AquaZeroFit provides general wellness support only. It does not diagnose, treat, or give medical advice. This is treated as an engineering requirement rather than a disclaimer at the bottom of a page, and Section 5.3 explains exactly how it is enforced in the software.

## 1.4 Project scope

| Work area | What is included |
|---|---|
| Accounts and profile | Sign up, sign in, secure sessions, Telegram sign-in, wellness profile and onboarding |
| Nutrition | Manual food logging, barcode scanning, meal photo recognition, daily nutrition dashboard |
| Training | Exercise library with proper attribution, personalised plans, progression rules, guided workout sessions |
| AI features | Coach chat, meal recognition, meal and recipe suggestions, per-user memory |
| Progress | Weight and water logging, trend charts, achievements |
| Safety and privacy | Calorie floor limits, allergen filtering, consent controls, data export and deletion |
| Quality | Automated test suite, safety evaluations, live verification |
| Deployment | Durable database storage, hosting configuration, custom domain plan |

Deliberately excluded and recorded as future work: wearable device syncing, native iPhone and Android apps, payments, and multiple languages. These were ruled out at kickoff to protect the delivery of the core product, not abandoned later.

# 2. Overall Progress Summary

## 2.1 How to read the status

Reporting "we wrote a lot of code" proves nothing. This report uses a stricter definition, taken from the unit's own guidance.

**A deliverable counts as Completed only when all three are true:**

1. It can be **demonstrated** live, in front of the supervisor.
2. Its owner can **explain** how it works and why it was built that way.
3. It is **verified** by an automated test or a documented check, so it keeps working tomorrow.

Anything that fails one of those three stays "In progress". That is why some items below are marked In progress even though the code exists.

## 2.2 Status by area

| Area | Status | Where it stands |
|---|---|---|
| Project setup and code structure | Completed | Organised codebase with automated checks; professional folder structure |
| Accounts and sign-in | Completed | Email and Telegram sign-in both working; secure session handling |
| Wellness profile and targets | Completed | Targets calculated with a safety floor that cannot be bypassed |
| Exercise and food data | Completed | 828 exercises imported with correct licence credit; food database connected |
| Food logging and dashboard | Completed | Manual, barcode and photo logging; daily totals verified against the raw records |
| Meal photo recognition | Completed | Photo to confirmed food log, with the user always confirming before anything is saved |
| AI coach and safety rules | Completed | Chat working; refuses unsafe questions; tested against 43 adversarial cases |
| Personal AI memory | Completed | Remembers user preferences, only with explicit consent, and only facts the user approves |
| Training plans and workouts | Completed | Plan generation, progression, guided sessions, strength statistics |
| Progress tracking | Completed | Trends, history and achievements |
| Durable data storage | Completed | Moved from temporary file storage to a proper database |
| Publishing to the internet | In progress | Configuration and written plan complete; first publish still to happen |
| Legal and trust pages | In progress | Privacy policy, terms, password reset emails still to do |
| Documentation | Completed | Full document set, AQF-01 through AQF-22 |

## 2.3 What the evidence numbers mean

Three figures are quoted throughout this report. Here is what each one actually is, for readers who do not work in software.

**"431 automated tests across 35 files, all passing."**
A test is a small piece of code whose only job is to check that another piece of code behaves correctly. For example, one test creates a user, logs a meal, and then checks that the dashboard total went up by exactly the right number of calories. Another test tries to read a different user's private health records and checks that the app refuses. Because these run automatically in about 25 seconds, the team can change something and immediately find out whether they broke anything. 431 of these currently pass and none fail.

**"Type safety check: 0 errors."**
The project is written in TypeScript, a language that checks for whole categories of mistakes before the program is ever run, such as passing a date where a number was expected. A clean result means none of those mistakes exist anywhere in the codebase.

**"Safety evaluation gate passed."**
This is the check the team is most careful about. A file of 70 deliberately difficult questions is fired at the AI coach, including questions about self-harm, questions asking for medical diagnosis, and questions requesting dangerous crash diets. The check confirms the app refused every one of them and pointed the user toward appropriate help. If even one critical case fails, the check reports failure and the change cannot be shipped.

## 2.4 Key achievements this week

- **Both sign-in methods work.** Standard email and password, plus Telegram sign-in, where the app verifies a cryptographic signature from Telegram so it can trust who the user is without asking them to type a password.
- **The complete food loop works.** A user can photograph a meal, see what the app thinks is on the plate with a confidence score for each item, correct anything wrong, confirm, and see the dashboard update. Crucially, nothing is saved until they confirm.
- **The AI is built as proper infrastructure, not scattered guesswork.** All AI requests go through one controlled gateway with eleven versioned instruction files, safety checks on the way in and on the way out, and a spending limit per user.
- **The app works with no AI provider at all.** If no AI service is connected, a built-in offline engine takes over and every feature still functions. This kept development free and made testing reliable, since the offline engine gives the same answer every time.
- **Data now survives.** The app originally stored everything in files. Research this week showed the intended hosting platform erases files on every update, so the storage layer was rebuilt on a proper database.
- **The app was hardened for real use,** including stripping GPS location data out of uploaded meal photos.

# 3. Deliverables and Milestone Progress

Progress is reported by deliverable rather than by file. Every row can be demonstrated live and is corroborated by the development diary (AQF-16) and the test suite.

| Deliverable | Status | Progress | How it is verified | Owner |
|---|---|---|---|---|
| Sign up, sign in, secure sessions | Completed | 100% | Live demo; 10 automated sign-in tests; session-theft protection test | Babatundji |
| Telegram Mini App sign-in | Completed | 100% | Three signature test cases: valid, tampered, expired | Babatundji |
| Wellness profile and calorie targets | Completed | 100% | Tests covering every case including the safety floor; onboarding demo | Babatundji, Eric |
| Manual food logging and dashboard | Completed | 100% | Tests confirm dashboard totals equal the sum of raw records | Babatundji, Eric |
| Barcode scanning | Completed | 100% | Energy cross-check tests; live scan demo | Victor |
| Meal photo to food log | Completed | 95% | End-to-end demo; upload security tests | Babatundji |
| Exercise library with attribution | Completed | 100% | 828 records each carrying licence and author; credit shown in the app | Victor |
| Training plans and guided workouts | Completed | 95% | 22 progression tests; 17 training tests; session demo | Babatundji, Eric |
| Progress dashboard and achievements | Completed | 100% | Charts checked against logged data | Eric |
| AI coach and safety rules | Completed | 90% | 43-case safety evaluation; live refusal demo | Babatundji |
| Personal AI memory with consent | Completed | 100% | 13 memory tests, 24 privacy isolation tests | Babatundji |
| Durable database storage | Completed | 100% | 16 storage tests; restart survival check | Babatundji |
| Publishing configuration | In progress | 80% | Configuration written and deployment guide issued | Babatundji |
| Legal and trust pages | In progress | 30% | Scoped with time estimates in AQF-22 | Team |

## 3.1 Schedule position

The build was deliberately front-loaded. The team put the hardest engineering into week one so that the remaining fortnight, to 17 August, is spent on publishing, polish and assessment evidence rather than on feature risk.

The most common way capstone projects fail is leaving integration until the end, discovering the pieces do not fit, and running out of time. This was avoided by integrating continuously: no feature was accepted into the project unless its tests passed against the entire application, not just in isolation.

## 3.2 Honest position on the remaining 20%

The team is not claiming the product is finished. What remains:

| Remaining work | Why it is not done | Estimated effort |
|---|---|---|
| Photo storage moved to cloud storage | Uploaded photos are still saved to the server's own disk, which the hosting platform erases on update | Half a day |
| First publish to the internet with the domain | Requires the storage item above to be done first | One day |
| Password reset emails | The app generates a reset code correctly but has no email service connected to send it | Half a day |
| Privacy policy, terms of service, support contact | Required before real users, being written now | One day |
| In-app attribution page | Data licences require a credits page; per-item credits already appear | Two hours |
| Accessibility and Telegram polish | Focus handling, button sizes, Telegram back button | One day |

# 4. Individual Contributions

The report is submitted by the team. Each contribution below is specific, and each member can demonstrate and explain their own work at the review.

## 4.1 Babatundji Williams-Fulwood, Technical Lead and Software Architect

**Responsibility:** overall system design, the server, the AI layer, security, data storage, and deployment.

**Completed contribution:** designed the system architecture and the rules for how the codebase is organised. Built the sign-in system, including secure session handling and Telegram signature verification. Built the calorie target calculator with its safety floor. Built the food logging, analytics and meal photo systems. Built the AI gateway, including the reliability features that stop a failing AI provider from hanging the app. Built the safety guardrails, the per-user spending limit, and the consent-controlled personal memory. Rebuilt the data storage layer on a database when research showed file storage would lose user data on the hosting platform. Hardened the app for production and wrote the deployment configuration and guide.

**Verification:** repository history, the 431-test suite, and a live demonstration of every server-side journey.

**Next task:** move photo storage to cloud storage, complete the first publish, and connect the email service.

## 4.2 Eric La, Frontend Developer

**Responsibility:** everything the user sees and touches, and the Telegram Mini App surface.

**Completed contribution:** implemented the AquaZero visual design system from the 16 reference screens, including the shared building blocks used across the app such as cards, buttons, progress rings and charts. Built the welcome, sign-in and multi-step onboarding screens. Built the nutrition, meal capture and analysis result screens. Built the workout library and the guided workout session screen. Built the progress, coach chat and settings screens including the memory consent controls. Added loading, empty and error states throughout, so the app never shows a blank broken screen. Implemented the Telegram theme binding so the app adopts the user's Telegram colours.

**Verification:** screen-by-screen walkthrough against the design references, and a demonstration of loading, empty and error states.

**Next task:** accessibility pass covering keyboard navigation and button sizes, and Telegram back button handling.

## 4.3 Victor Hong, Data and Quality Engineer

**Responsibility:** getting external data into the product legally and correctly, and proving the product works.

**Completed contribution:** imported the 828-exercise library from the open wger project, keeping the licence and author on every single record so credit can be displayed correctly. Connected the Open Food Facts database for barcode lookups, keeping that data in a separate area of the database to respect its licence terms, and added cross-checks that catch nutrition data where the stated energy does not match the stated macronutrients. Wrote the privacy isolation test suite, 24 tests that confirm no signed-in user can read or affect another user's health records. Built the three safety evaluation sets used as the project's safety gate. Ran and captured the verification evidence used throughout this report.

**Verification:** attribution records, test files in the repository, and the safety gate output.

**Next task:** formal test evidence pack for final submission, and the in-app attribution page.

## 4.4 Contribution verification

At the project review, each member demonstrates the work attributed to them and explains how it works. The development diary records who did what on each day and names the files touched, so the diary and the repository history confirm each other.

# 5. Technical Approach and Verification

## 5.1 Technology choices and why

| Part | Technology used | Why this choice, in plain terms |
|---|---|---|
| User interface | React with TypeScript | The most widely used way to build modern app interfaces. One codebase serves both the website and the Telegram Mini App |
| Server | Node.js with Express and TypeScript | Same language as the interface, so the team shares knowledge instead of splitting it |
| Shared rules | A shared validation package | The rules for what counts as valid data are written once and used by both the interface and the server, so they can never disagree |
| Database | PostgreSQL | A well-proven database. Chosen when research showed file storage would be erased by the host |
| AI | A gateway in front of several AI providers, plus an offline engine | If one provider fails, another is tried. If none are available, the offline engine keeps the app working |
| Hosting | A single reserved VM on a managed host, one address for the whole product | Simplest reliable setup: the server also delivers the interface, so there is one address and one security certificate |
| Domain | Registered at Hostinger, pointed at the host | Keeps the existing registration and simply directs traffic to the app |

## 5.2 How the pieces fit together

```
                 +---------------------------------------------+
                 |          Hosting (one server, one port)      |
  Web browser -->|  Server application                          |
                 |   |- delivers the app interface to browsers  |
  Telegram    -->|   |- answers data requests (/api/v1)         |
  Mini App       |   |- AI gateway -> providers, or offline     |
                 |   +- stores everything -> PostgreSQL database|
                 +---------------------------------------------+
     Domain name registered at Hostinger, pointed at the host,
     with HTTPS security certificates issued automatically
```

**Reading this diagram:** requests arrive from either a normal browser or from inside Telegram. Both reach the same server. That server does three jobs: it hands out the app interface, it answers requests for data, and it talks to the AI when a feature needs it. Everything the user creates is written to the database, which is separate from the server so that updating the app never erases anyone's data.

## 5.3 How safety is enforced

This is the part of the project the team considers most important, because the product touches health.

**The core principle: the AI identifies, the code calculates.**

An AI model is good at looking at a photograph and saying "that looks like grilled chicken and rice". It is unreliable at arithmetic, and it will produce a slightly different answer each time. So the app never lets the AI decide how many calories something contains. The AI names the food; the code then looks that food up in a nutrition database and multiplies by the portion size. The result is identical every single time for the same input, and it can be checked by hand.

**Four safety rules enforced in code, not by asking the AI nicely:**

1. **Calorie floor.** If a user's profile would produce a dangerously low daily calorie target, the number is raised to a safe minimum and the user is shown a visible notice explaining why. The user cannot argue their way past this, because it is arithmetic, not conversation.
2. **Allergen exclusion.** If a user declares an allergy, foods containing that allergen are filtered out by code before anything reaches the user. This is a zero-tolerance filter: a missed allergen is treated as a serious defect.
3. **Photo confirmation.** A meal photo never becomes a food log entry on its own. The user must review the identified items and press confirm.
4. **Refusal and signposting.** Questions about self-harm, medical diagnosis, or extreme dieting are refused, and the user is shown supportive information about where to get proper help.

## 5.4 How each function is verified

| Function | How it is tested | Expected result |
|---|---|---|
| Sign up and sign in | Create an account, then try correct and incorrect passwords | Correct password signs in; wrong password gives the same generic error either way, so an attacker cannot discover which emails are registered |
| Session security | Try to reuse an old session token | The entire session family is cancelled, forcing a fresh sign-in |
| Telegram sign-in | Send valid, tampered and expired sign-in data | Only the valid one is accepted |
| Calorie targets | Enter profile values at the extreme edges | Target is raised to the safety floor with a visible notice |
| Meal photo | Upload a photo containing GPS data, then confirm the items | Food log created only after confirming; the stored photo contains no location data |
| Allergen filtering | Ask for suggestions with a declared allergy | Zero suggestions contain that allergen |
| AI safety | 43 deliberately difficult questions | Every critical case is refused with a supportive signpost |
| Privacy between users | Signed in as user A, try to read user B's records | Refused in all 24 scenarios |
| Data durability | Write data, restart the server, look again | All records still present |
| Whole suite | Run the three verification commands | 0 type errors, 431 of 431 tests passing, safety gate passed |

# 6. Challenges and Risks

## 6.1 The most significant problem found and solved

**The hosting platform erases files every time the app is updated.**

Midway through the week the team confirmed, from the hosting provider's own documentation, that the file system of a published app "is not persistent and resets every time you publish".

**What that would have meant:** the app stored every user account, weight record, meal log and chat conversation in files on the server. Publishing an update would have deleted all of it. Every user would have found their account gone. This would not have appeared during development, because nothing is published during development. It would have appeared the first time the team updated the live app, in front of real users.

**How it was solved:** the storage layer was rebuilt so that data is written through to a PostgreSQL database, which lives outside the server and is unaffected by updates. The design keeps the rest of the application unchanged, which mattered because rewriting how all 24 affected files talk to storage would have taken roughly a week the team did not have.

**Trade-off accepted and recorded:** this design is durable for a single server. Running several copies of the server at once would need further work, so the hosting is configured for a single server. This is written down rather than discovered later.

## 6.2 Risk register

| Risk | Priority | What could go wrong | Response | Owner | Status |
|---|---|---|---|---|---|
| Host erases files on publish | High | Total loss of all user data | Rebuilt storage on a database; verified data survives a restart | Babatundji | Closed |
| Meal photos carry GPS location | High | A photo of dinner reveals the user's home address, attached to health data | Every uploaded photo is re-processed on arrival, discarding all hidden metadata | Babatundji | Closed |
| One week to build with a brand new team | High | Nothing finished, or one person carrying everything | Clear separate ownership per member; daily meetings; continuous integration | Team | Closed |
| An AI provider goes down or rate-limits us | Medium | Coach and photo features break | Automatic retry, switching providers, a time limit, and an offline fallback | Babatundji | Closed |
| File upload library was end-of-life | Medium | A known flaw allowed any user to crash the server | Upgraded to the current supported version | Babatundji | Closed |
| Password reset cannot send email | High | A user who forgets their password is locked out permanently | Email service to be connected next stage | Babatundji | In progress |
| Licence obligations on imported data | Medium | Using open data without required credit | Credit stored on every record and shown per item; full credits page to follow | Victor | In progress |
| Some exercise images are placeholders | Low | Demonstration looks unfinished | Curated replacement continuing | Victor | In progress |

# 7. Team Communication and Management

The team formed on Monday 27 July 2026 and met every working day of the reporting period. Discord is used for meetings, the development diary records what was decided, and the code repository is the single source of truth for what actually exists.

| Area | Current position |
|---|---|
| Meeting frequency | Five meetings, one per working day, 27 July to 31 July, all minuted in AQF-16 |
| Task allocation | One named owner per deliverable, agreed at kickoff and unchanged since |
| Progress tracking | Diary tables per area, the deliverable table in Section 3, and test counts as objective evidence |
| Definition of done | Demonstrated, explained and verified, as set out in Section 2.1 |
| Escalation | Blockers raised at the daily meeting; anything needing the supervisor is flagged the same day |

## 7.1 How work was divided, and why

The team was assembled at short notice with three members of differing experience. Rather than have everyone touch everything, which typically produces work nobody can explain at a review, each member was given a bounded area they own completely and can demonstrate alone.

- **Babatundji** took the architecture, server, AI and security work, which is the largest and most technically demanding portion.
- **Eric** took the entire user interface, which is the most visible portion and the one the supervisor will see first.
- **Victor** took data ingestion and quality, which is the portion that protects the project legally and proves the rest works.

Cross-review happens at the daily meeting: each member walks the others through what they built, which keeps knowledge shared even though ownership is separate.

## 7.2 Weekly team check

- Confirm what was completed and demonstrated.
- Review each member's contribution and workload.
- Identify blockers needing supervisor or sponsor help.
- Assign next tasks with owners and dates.
- Update this report from verified results only.

# 8. Next-Stage Plan

Covering 1 August 2026 to the project end date of 17 August 2026.

| Planned task | Responsible | Target | Expected outcome |
|---|---|---|---|
| Move photo storage to cloud object storage | Babatundji | Week of 3 August | Uploaded photos survive an app update |
| First publish, and connect the domain name | Babatundji | Week of 3 August | A live public address with HTTPS working |
| Connect the email service for password reset | Babatundji | Week of 3 August | Password recovery works for real users |
| Privacy policy, terms of service, support contact | Victor | Week of 10 August | Legal requirements met |
| In-app attribution and credits page | Victor | Week of 10 August | Data licence obligations fully satisfied |
| Accessibility and Telegram polish | Eric | Week of 10 August | Keyboard navigation, button sizes, Telegram back button |
| Formal test evidence pack | Victor | Week of 10 August | Submission-ready evidence |
| Full rehearsal of the final demonstration | Team | 14 August | A timed, scripted, end-to-end demonstration |

## 8.1 Priority for the next review

Demonstrate the working product end to end, explain how it was built, and show that every function reported here behaves as described. Anything that cannot be demonstrated will be reported as In progress rather than claimed as complete.

# Appendix A. Supporting Evidence Index

| Ref | Evidence | Location | What it proves |
|---|---|---|---|
| A1 | Application source code | Team GitHub repository (private) | All work, with history showing who wrote what and when |
| A2 | Development diary | AQF-16 | Dated records naming the member and the files touched, plus meeting minutes |
| A3 | Automated test suite | 35 files in the project; run with `npm test` | 431 passing tests |
| A3b | Continuous integration workflow | `.github/workflows/ci.yml` | Every change automatically runs typecheck, tests, safety gate and build |
| A4 | Safety evaluation gate | Run with `npm run eval` | Zero critical safety misses, zero allergen violations |
| A5 | Deployment guide | AQF-22 | Hosting and domain plan with verified platform facts |
| A6 | Security review | AQF-21 | Security work completed and remaining items |
| A7 | Licence attribution records | Attribution files and import records | Correct credit for wger and Open Food Facts data |
| A8 | Design references | 16 reference screens | Evidence the built screens match the intended design |

# Appendix B. Demonstration Run-Sheet for 80% Completion

A twelve minute demonstration, ordered so the strongest evidence comes first.

1. **Introduction, 1 minute.** What the product does, the two delivery targets, and the claim being made: approximately 80% complete, all core journeys working.
2. **Evidence first, 1 minute.** Run the three verification commands live on screen. Show 0 type errors, 431 of 431 tests passing, and the safety gate passing. Doing this before the feature tour means everything that follows is already backed by proof.
3. **Accounts, 2 minutes.** Register a new account, sign out, sign back in. Show the seeded demo account with two weeks of history so the app appears populated.
4. **Nutrition, 3 minutes.** Log a meal by typing. Scan a barcode. Photograph a meal, review the identified items with their confidence scores, correct one, then confirm. Point out that nothing was saved until confirm was pressed, and that the stored photo has had its location data removed.
5. **Training, 2 minutes.** Generate a plan, open a workout, complete a session, show the progression and strength statistics.
6. **Coach and safety, 2 minutes.** Ask a normal nutrition question. Then ask something the app must refuse and show the supportive response. Open the memory settings and show the consent control and the facts awaiting user approval.
7. **Progress, 1 minute.** Weight trend against the goal line, and achievements.
8. **The remaining 20%, 1 minute.** Walk the next-stage table in Section 8 honestly, naming what is not done and when it will be.
9. **Questions.**

# Appendix C. Glossary for Non-Technical Readers

| Term | Plain meaning |
|---|---|
| API | The set of requests an app's server understands, for example "log this meal" or "give me today's totals" |
| Automated test | A small program that checks another program behaves correctly, run automatically in seconds |
| Backend / server | The part of the app the user never sees, which stores data and does the calculations |
| Frontend | The part the user sees and taps |
| Database | Organised long-term storage for information, separate from the app so updates do not erase it |
| Repository | The shared store of the project's code, which also records who changed what and when |
| Deploy / publish | Putting the app on the internet so real people can use it |
| Token / session | A temporary pass proving a user is signed in, so they do not retype their password constantly |
| EXIF data | Hidden information saved inside a photo, which can include the exact GPS location where it was taken |
| Guardrail | A rule in the code that stops the AI doing something unsafe, regardless of what the user asks |
| Telegram Mini App | An app that runs inside the Telegram messaging app, with no app store install needed |
| Type safety | Automatic checking that catches whole classes of mistakes before the program is ever run |
