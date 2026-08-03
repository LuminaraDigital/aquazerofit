---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Final Report
subtitle: Draft: scope, outcomes, architecture, challenges and contributions
details:
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Team members: Babatundji Williams-Fulwood (s8138393), Eric La, Victor Hong
  Supervisor: [Supervisor name]
  Group: Group [number], Victoria University, Melbourne
  Project window: 27 July 2026 to 17 August 2026
  Document status: Draft, to be finalised after the deployment stage
  Companion documents: AQF-16 Diary, AQF-17 Progress Report, AQF-22 Deployment Guide
---

# 1. Introduction

## 1.1 What was built

AquaZeroFit is an AI-powered wellness platform built for the NIT3004 capstone. A user creates a wellness profile, logs meals by typing, by scanning a barcode or by photographing the plate, and receives calorie targets, meal suggestions and home training plans that adapt as they progress. A chat assistant answers wellness questions within safety limits enforced by the software itself.

**For a non-technical reader:** think of it as a food and fitness diary that can read a photo of your dinner, work out roughly what you ate, and coach you sensibly without ever pretending to be a doctor.

## 1.2 The three decisions that shaped the project

1. **One codebase, two products.** The same application runs as a normal website and as a Telegram Mini App, detecting at start-up where it is running. Building it twice would have doubled the work and halved the quality.
2. **The AI layer is infrastructure, not sprinkles.** Every AI request goes through a single controlled gateway with version-numbered instruction files, safety checks on the way in and out, spending limits, and a working offline fallback. The alternative, scattering AI calls through feature code, makes safety impossible to audit.
3. **Safety is code, not a disclaimer.** Calorie floors, allergen exclusion and photo confirmation are enforced by arithmetic and control flow, not by asking a model to behave.

## 1.3 Scope review

The delivered scope matches the project charter. Deliberately excluded at kickoff and recorded as future work: wearable device syncing, native iPhone and Android apps, payments, and multiple languages. Excluding them was a decision made early to protect the core product, not a failure discovered late.

# 2. Requirements Outcome

| Requirement | Outcome | Evidence |
|---|---|---|
| 1. Secure registration, sign-in and profile | Delivered | Email and Telegram sign-in; single-use renewal passes with theft detection; 10 automated tests |
| 2. Wellness profile | Delivered | Safe-range validation from the shared rules package; targets calculated on the server |
| 3. Food logging with image recognition | Delivered | Manual, barcode and photo paths, with mandatory user confirmation before anything is saved |
| 4. Nutrition monitoring dashboard | Delivered | Calories, macronutrients, water and weight, reconciled to source records by 12 tests |
| 5. Meal and recipe recommendation | Delivered | Structured generation with allergen exclusion enforced in code |
| 6. Home training and weight-loss planning | Delivered | Plan generation with progression rules and upper safety limits |
| 7. Daily workout module with media | Delivered | Guided sessions; 828-exercise library with per-record licence credit |
| 8. Progress tracking dashboard | Delivered | Weight and calorie trends, training history, achievements |
| 9. Conversational assistant | Delivered | Streaming coach with a fixed safety sequence and crisis signposting |
| 10. Safety, privacy and ethical design | Delivered | Calorie floor; consent-gated memory; export and deletion; location data stripped from photos |
| 11. Prompt bank, AI operations, design | Delivered | P-01 to P-11 version-numbered instructions; safety evaluations used as a build gate |

# 3. System Architecture

## 3.1 The shape of the system

The project is one repository containing three connected parts: the server, the user interface, and a shared package of rules used by both.

```
                 +---------------------------------------------+
                 |         Hosting (one server, one port)       |
  Web browser -->|  Server application                          |
                 |   |- delivers the interface to browsers      |
  Telegram    -->|   |- answers data requests (/api/v1)         |
  Mini App       |   |- AI gateway -> providers, or offline     |
                 |   +- stores everything -> PostgreSQL database|
                 +---------------------------------------------+
       Domain registered at Hostinger, pointed at the host,
       HTTPS certificates issued automatically
```

## 3.2 Why it is arranged this way

- **One interface codebase for both targets** avoids duplicating every screen. Behaviour branches only at start-up, where the app checks whether Telegram supplied sign-in data.
- **The server also delivers the interface.** This gives one address, one certificate, and none of the cross-origin complexity that comes from splitting them. It also matches the hosting platform, which exposes a single external port per deployment.
- **Data lives in a database outside the application.** This is the single most important structural decision, and Section 5 explains why it had to change mid-project.
- **All AI access is funnelled through one gateway.** Safety checks, spending limits and provider failover exist in exactly one place, so there is no path around them.
- **Validation rules are shared.** The screen and the server enforce identical limits because they import the same definitions.

## 3.3 Security design

| Control | What it does |
|---|---|
| Password storage | Only an irreversible scrambled value is stored, never the password |
| Sessions | A 15-minute pass plus a single-use renewal pass. Reusing an old renewal pass cancels the whole chain, which is what happens when a pass is stolen |
| Telegram sign-in | Signature verified with a constant-time comparison, plus a freshness check so old captured data cannot be replayed |
| Privacy between users | Every record is owned, and 24 tests confirm no signed-in user can reach another user's data |
| Photo privacy | Uploaded images are rebuilt from pixels, discarding hidden GPS and camera data |
| Start-up guard | The server refuses to start in production without real security settings, rather than running with development defaults |
| Framing policy | Other websites cannot embed the app, with a deliberate exception for Telegram, which legitimately embeds Mini Apps |

# 4. Data Design

Information is stored as documents in named collections: users, profiles, logs, plans, content, two separate food collections (kept apart to respect differing data licences), AI data, the credit ledger and the audit trail.

The credit ledger is add-only. A user's balance is calculated by adding up the history rather than by editing a stored number, so the record of what happened cannot be quietly rewritten.

# 5. The Most Significant Problem, and How It Was Solved

This section is included because the way a team handles a serious mid-project discovery says more than a list of features.

**The discovery.** On the final day of the reporting week, the team confirmed from the hosting provider's own documentation that a published app's file storage "is not persistent and resets every time you publish".

**Why it mattered.** All application data was stored in files. Publishing an update would have deleted every account, weight record, meal log and conversation. The failure would never have appeared in development, because nothing is published during development. It would have appeared the first time the live app was updated, in front of real users.

**The options considered.**

| Option | Assessment |
|---|---|
| Convert every part of the app to database-style access | Correct long-term, but roughly a week of work across 24 files and 77 places in the code, with high risk of breaking working features. Not available in the time remaining |
| Accept it and hope | Not acceptable for a product holding health data |
| Change only the storage layer, leaving the rest untouched | Chosen. Data is written through to a database, while the rest of the application keeps working exactly as before |

**The trade-off, recorded openly.** The chosen design is durable for a single server. Running several copies at once would need the fuller conversion, so the hosting is configured for a single server, and this is written into the deployment guide rather than left to be discovered later.

**What this demonstrates.** The problem was found by checking the platform documentation rather than by assuming, the options were compared on time and risk rather than on preference, and the limitation of the chosen solution was written down instead of being glossed over.

# 6. Other Challenges

| Challenge | Response | Outcome |
|---|---|---|
| Meal photos carry GPS coordinates at home-address precision | Rebuild every uploaded image from its pixels, discarding hidden data | Location data never reaches health records; verified by tests |
| Telegram Mini Apps run inside a frame, which standard security headers block | Used the modern framing policy that can name Telegram as an exception, and deliberately omitted the older header that would override it | Mini App works, and protection against other sites is retained |
| AI providers fail, rate-limit or hang | Retry with increasing waits, stop contacting a repeatedly failing provider, cap the whole chain at 12 seconds, fall back to the offline engine | Worst-case wait cut from about 100 seconds to 12; fallbacks are now flagged rather than silent |
| The file-upload library was no longer supported and had a known flaw | Upgraded to the current version | Any signed-in user could previously crash the server with a malformed upload |
| Open data licences require per-item credit | Licence and author stored on every single record; credit shown next to each item; separate collections for differently-licensed data | Obligations met at the record level, not just in a repository file |
| A three-person team formed five days before the first assessment | Bounded individual ownership, daily minuted meetings, same-day diary | Each member can demonstrate and explain their own work |

# 7. What We Would Do Differently

- **Check the hosting platform's storage behaviour in the first hour, not the final day.** The fix was manageable because it was found before launch, but finding it earlier would have avoided rebuilding a working layer under time pressure.
- **Connect the email service in week one.** Password reset generates a correct code and has nowhere to send it, which makes an otherwise finished feature unusable.
- **Set up the automated build pipeline on day one.** The safety evaluations existed for days before anything ran them automatically. A gate nobody runs is documentation.
- **Draft the privacy policy alongside the consent controls.** The engineering for consent was finished well before the legal wording it depends on.
- **Test unusual photo formats on a real phone early.** Whether a given image format works depends on what is installed on the server, not on whether the file is valid.

# 8. Student Contributions

| Member | Contribution |
|---|---|
| Babatundji Williams-Fulwood | Technical lead and architect. Designed the system structure and the rules for organising the code. Built sign-in including Telegram signature verification and session security; the calorie target calculator with its safety floor; food logging and analytics; the meal photo pipeline and its privacy protection; the AI gateway with reliability and spending controls; the safety guardrails; consent-controlled personal memory; the database storage layer built in response to the hosting discovery; production hardening; and the deployment configuration and guide. Facilitated the daily meetings and the integrated demonstration. |
| Eric La | Frontend developer. Built the AquaZero design system from the 16 reference screens, then the sign-in and onboarding screens, the nutrition, capture and analysis screens, the workout library and guided session screens, and the progress, coach and settings screens. Added loading, empty and error states throughout so the app never shows a blank broken screen. Implemented Telegram theme adoption and automatic sign-in. |
| Victor Hong | Data and quality engineer. Researched data licences before any import code was written, then imported the 828-exercise library with per-record credit and connected the food database with its own separate storage and self-consistency checks. Wrote the 24-test privacy isolation suite, the three safety evaluation sets, and the integration tests confirming dashboard totals match the underlying records. Produced the verification evidence used across the assessment documents. |

# 9. Verification Summary

As at Friday 31 July 2026:

| Check | Result |
|---|---|
| Automated tests | 431 passing across 35 files (427 server, 4 interface) |
| Type safety across the codebase | 0 errors |
| Safety evaluation gate | Passed: zero critical misses, zero allergen violations, zero plan failures |
| Live end-to-end run | Health and readiness checks, interface delivery, deep links, error handling, caching and framing policy all verified |
| Continuous integration | Every change automatically runs all of the above |

# 10. Remaining Work to 17 August 2026

| Task | Owner | Effort |
|---|---|---|
| Move photo storage to cloud object storage | Babatundji | Half a day |
| First publish and domain connection | Babatundji | One day |
| Connect the email service for password reset | Babatundji | Half a day |
| Privacy policy, terms of service, support contact | Victor | One day |
| In-app attribution and credits page | Victor | Two hours |
| Accessibility and Telegram polish | Eric | One day |
| Formal test evidence pack | Victor | Half a day |
| Full rehearsal of the final demonstration | Team | Half a day |

# 11. Conclusion

AquaZeroFit delivers every functional requirement in the brief as working, demonstrable software, backed by 431 automated tests, a clean type check and a safety evaluation gate that runs on every change. The engineering decisions that distinguish it are the single AI gateway, the rule that models identify while code calculates, and safety enforced as arithmetic rather than as instruction.

The team's handling of the storage discovery is the clearest evidence of professional practice in the project: a serious flaw was found by checking documentation rather than assuming, options were weighed on time and risk, the chosen fix was implemented and verified within a day, and its limitation was recorded rather than hidden.

What remains is publishing and the legal surface. Both are scoped, owned and dated in Section 10.
