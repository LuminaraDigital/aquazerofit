---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: Desktop, Decentralisation, and the Heavens Bridge
unit: Luminara Digital
title: THE SECOND SCREEN
subtitle: Making the web build a first-class product, running TON without a domain, and bolting the card game on without breaking the wellness app
details:
  Document ID: AQF-27
  Version: 1.0
  Property: AquaZeroFit (app) and Aqua Zero Heavens (game), a Luminara Digital transmedia property
  Prepared by: Research pass commissioned by Babatundji Williams-Fulwood, Creator and Franchise Lead
  Inputs: AQF-25 v2.0, AQF-26 v2.0, the Character Bible v1.0, the current monorepo, and 22 nominated open-source references
  Date: 6 August 2026
  Document status: Research and strategy, for decision
---

# AQF-27: THE SECOND SCREEN

Three questions were asked. This document answers them in order, then maps the
twenty-two nominated repositories against the answers.

1. The app was built for a phone inside Telegram. What does the **web build**
   need in order to be genuinely good — not merely usable — on a computer?
2. Can the **Aqua Zero Heavens** card game connect to **TON** from
   **localhost**, with no hosted domain? Do the **AI** and **blockchain**
   features still work? Is that what "truly AGPLv3 and decentralised" means?
3. Does a no-holds-barred fighting card game **confuse** a wellness product,
   and if so, how does it become a part of the app that feels like it always
   belonged — with **TON and USDT** inside it?

---

# PART 0: THE ANSWERS, UP FRONT

**On desktop.** The phone competes for a *session*. The desktop competes for
*a corner of the screen for eight hours*. Stop porting the phone app wider and
start building for ambient presence: an always-on-top coach window, keyboard-
first logging, and idle-detection nudges that know you have been sitting down
for ninety-six minutes. Those are things a phone app physically cannot do. The
single highest-leverage feature is the **Document Picture-in-Picture API** —
an always-on-top HTML window, now shipping in Chrome and, as of Firefox 151 in
May 2026, in Firefox. Desktop only. Safari still absent.

**On localhost and TON.** The dApp runs on localhost fine. The AI runs on
localhost *today* — `apps/api/src/modules/ai/gateway.ts:146` already carries an
Ollama provider at `http://localhost:11434/v1`, with a deterministic mock as
the terminal fallback, so a full keyless local run already works. The
blockchain is where the honest answer splits in two: **browser-extension
wallets connect to a localhost dApp without a domain; phone wallets and the
Telegram Wallet cannot**, because the wallet fetches your
`tonconnect-manifest.json` from *its own* device, where `localhost` is its own
machine. Telegram itself refuses non-HTTPS Mini App links outright. So: fully
local development and demonstration, yes. A public product on localhost, no.
That is not a failure of decentralisation — the AGPLv3 promise is *anyone can
clone this and run the entire stack, chain included, on their own machine*, and
that promise is achievable in full.

**On the game.** It confuses the product if it is bolted on as a second app.
It does not if it is the layer the coach roster already implies. Your own
rulebook has the correct instinct written into it (AQF-25 §1.2, the wellness
firewall) and the code already has the bridge (`grantPurchasedCoach` in
`apps/api/src/modules/payments/stars.ts`). The rule to hold: **wellness earns
identity, never value.** Nothing tradeable is ever minted by logging a meal.
TON and USDT live entirely on the game side of the wall, and cross it in one
direction only — owning a fighter unlocks that fighter as a coach.

There is a fourth answer nobody asked for, and it is the most important one in
this document. It is in Part 2.6.

---

# PART 1: WHAT THE WEB BUILD IS RIGHT NOW

The monorepo ships one React app that serves both surfaces. `apps/web` is
mobile-first by construction — bottom navigation, bottom sheets, a phone
showcase on the landing page, Telegram theme variables threaded through the
stylesheet. On a 27-inch monitor that is a phone screenshot with whitespace
either side.

That is not a defect. It was the correct first build: Telegram Mini Apps run on
Telegram Desktop for Mac, Windows and Linux without any extra work, so the web
build has always been *reachable* on a computer. What it has never been is
*designed* for one.

The gap is not layout. Widening the container is an afternoon. The gap is that
every desktop-only capability of the modern web platform is currently unused.

---

# PART 2: WHAT A COMPUTER CAN DO THAT A PHONE CANNOT

Ranked by leverage. Each item is something no phone app and no mobile web app
can offer, which is the bar that was set.

## 2.1 The always-on-top coach — Document Picture-in-Picture

A floating, always-on-top HTML window containing the rest timer, the next set,
the current macro ring, and one line of coach voice. It survives switching
applications and switching virtual desktops. The user works, and Akin sits in
the corner of the screen saying *again*.

- Chrome 130+ (Oct 2024), **Firefox 151 (May 2026)**, desktop only.
- Safari does not support it; Chrome Android and Firefox Android do not
  support it. This is structurally a desktop feature and will stay one.
- Implementation is small: `documentPictureInPicture.requestWindow()`, move a
  React portal into it, keep the same store.

This is the feature that makes the desktop build a different product rather
than a bigger one. Build it first.

## 2.2 Keyboard-first logging and a command palette

Desktop users are typists. `Ctrl/⌘ K` → "2 eggs, toast, black coffee" → logged
in under two seconds, faster than any tap flow on any phone. The chat meal
extraction pipeline (`P-12-chat-meal-extraction.md`, `mealDraft.ts`) already
does the parsing; it just needs a keyboard front door and a global hotkey.

Add number-key shortcuts everywhere: `1-6` to pick a hand slot, `W` to log
water, `Space` to start/stop a set timer. Speed *is* the retention mechanic on
desktop. Tap-flows lose to typing every time.

## 2.3 Idle detection — the desk-worker loop

The Idle Detection API and `visibilitychange` let the web app know the user has
been *at the computer, active*, for ninety-six minutes. A phone cannot know
this. It knows the clock, and so its nudges are generic.

"You have been at the desk an hour and a half. Two minutes, stand up, King
Yamsiri will count your breathing." That is a nudge with a reason attached, and
it is only possible on the machine the user is actually working at.

This is also the single most defensible *wellness* claim of a desktop build:
sedentary-time interruption is the health problem desk workers actually have,
and it is invisible to a phone in a pocket.

## 2.4 Presence: PWA install, Web Push, Badging

- Install as a PWA so it is a taskbar/dock icon, not a browser tab.
- Web Push works on desktop with the tab closed.
- The Badging API puts an unread count on the dock icon — the same primitive
  that made Slack and Discord ambient.
- Screen Wake Lock during a workout so the monitor does not sleep mid-set.

## 2.5 Big-screen affordances the phone build cannot express

- **Three panes at once**: plan, log, and coach chat side by side. On a phone
  those are three navigations.
- **A real weekly planner grid.** Seven days by five meals is a spreadsheet; it
  is unusable on a phone and trivial on a monitor.
- **Drag-and-drop a meal photo** from the desktop; paste a screenshot of a
  restaurant menu straight into the coach.
- **Analytics that need width** — the twelve-week trend, correlation between
  training days and sleep, full history export as CSV.
- **Webcam form check.** MediaPipe pose estimation runs client-side in the
  browser; the desktop has a webcam pointed at the room and a screen large
  enough to draw the skeleton. Rep counting and "your knee is tracking inside
  your toe" without a single frame leaving the machine — which keeps the
  privacy posture in AQF-11 intact.

## 2.6 The warning, which matters more than any feature above

The brief asked how to make the app *"just as addictive"* on a computer. Read
AQF-11 and P-07 again before acting on that instinct.

**Do not put addiction mechanics on the wellness surface.** Streak anxiety,
loss-aversion timers, variable-reward loops and daily-login pressure aimed at a
calorie tracker are, for a meaningful slice of users, an eating-disorder
accelerant. The app already refuses sub-floor calories and hard-stops on
disordered-eating indicators; engineering compulsion into the same surface
would undo that work from the other direction.

The resolution is the whole reason the game exists. **Put the compulsion loop
on the game side of the firewall.** Card games are allowed to be moreish. Meal
logs are not. This is not a compromise — it is the cleanest possible product
architecture, and it is why the answer to question one and the answer to
question three are the same answer.

## 2.7 And so: the game is the desktop retention engine

A twelve-second face-down commitment window with a three-card combo is
*miserable* on a phone — fat fingers, a timer, and cards you cannot see at
once. It is *excellent* with a mouse and a keyboard. So is a 135-card
constructed deckbuilder, which on a phone is a punishment.

Desktop is where **Aqua Zero Heavens** should live best:

- Hotkeys `1-6` for hand slots, drag to commit, `Enter` to lock in.
- Server-authoritative twelve-second clock over WebSocket, so the timer is not
  a trust exercise (AQF-25 §3.11 says "digital enforces it exactly" — that
  means the server owns the clock, never the client).
- Spectator mode and replays. Deterministic seeded resolution makes a replay a
  seed plus a move list, which is a few kilobytes.
- A deckbuilder with real filters, and Bracket mode for 3–8 players, which is
  a lobby, which is a desktop experience.

The fitness app makes people *return*. The game makes them *stay*. That is the
honest answer to what makes this addictive on a computer.

---

# PART 3: TON, LOCALHOST, AND WHAT "DECENTRALISED" ACTUALLY BUYS

## 3.1 The AI already works locally. This is settled.

`apps/api/src/modules/ai/gateway.ts` defines a provider chain with a per-
provider circuit breaker. One of those providers is **Ollama**, based at
`http://localhost:11434/v1` and overridable by `OLLAMA_BASE_URL`, with an
optional key. Behind the whole chain sits the deterministic mock engine as a
terminal fallback that never rejects.

So a clone of this repository, with no API keys and no internet, produces a
working coach. That is a genuinely strong open-source story and it should be
stated loudly in the README. It is rare.

## 3.2 The blockchain: the manifest is the whole problem

TON Connect works like this: your dApp publishes a `tonconnect-manifest.json`,
and **the wallet fetches it** before showing the connect prompt. Not your
browser — the wallet. That single fact decides everything.

The manifest must be reachable by GET from any origin, without CORS
restrictions, without auth, and without a proxy challenge, and wallets do not
guarantee they will fetch one served over plain HTTP.

What follows:

| Scenario | Works on pure localhost? | Why |
|---|---|---|
| **Browser-extension wallet** (Tonkeeper / MyTonWallet extension) | **Yes** | The extension runs in the same browser, so `http://localhost:5173/tonconnect-manifest.json` resolves to your dev server. This is the standard local loop. |
| **Phone wallet via QR or deep link** | **No** | The phone fetches the manifest itself. `localhost` is the phone. |
| **Telegram Wallet / any in-Telegram flow** | **No** | Telegram will not load a non-HTTPS Mini App at all; BotFather rejects `https://localhost:3000` outright. |
| **Telegram test environment** | Partially | The test environment accepts HTTP and raw IPs; `https://127.0.0.1:3000` is accepted where `localhost` is not. Test bots only. |
| **Smart contracts, jettons, USDT transfers, indexing** | **Yes, completely** | See MyLocalTon below. |

## 3.3 Fully offline chain: MyLocalTon

`neodix42/MyLocalTon` runs a personal TON network on one machine — up to six
validators, a lite-server, an explorer, a faucet, TON-HTTP-API v2 and Indexer
v3. JDK 21+, and it wants ~16 GB RAM and 20 GB disk to be comfortable.

This means the *entire* Heavens economy — the Shen token contract, fighter
NFTs, USDT-style jetton payment flows, marketplace fees — can be written,
deployed, exercised and regression-tested with no internet and no mainnet
exposure. Wire it into CI and the token economics in AQF-25 §5.3 become a test
suite instead of a hope. Testnet USDT (`USDTTT`, master
`kQD0GKBM8ZbryVk2aESmzfU6b9b_8era_IkvBSELujFZPsyy`) covers the stage between
local and mainnet.

## 3.4 Domain-free hosting that is real: TON Sites

If the goal is *no domain registrar, no seizure risk*, the honest option is
**TON Sites** via `tonutils/reverse-proxy`. It generates a persistent ADNL key
pair, shows a QR code, and links the address to a `.ton` domain — and it will
run in simple mode on a bare `.adnl` address if you have no `.ton` domain at
all. Behind it sits an ordinary web server on localhost.

The catch, stated plainly: it needs a **public IP** and inbound/outbound **UDP
3333**, and `.ton`/`.adnl` sites are only reachable through TON Proxy-capable
clients. So it is a real answer to "host without a registrar" and *not* an
answer to "serve a TON Connect manifest to an arbitrary wallet," because the
wallet still wants clearnet HTTPS. Treat it as a censorship-resistant mirror,
not as the primary origin.

## 3.5 The bottom line on decentralisation

Being AGPLv3 and decentralised does not mean "runs only on localhost." It
means:

1. Every line ships under AGPLv3, network use included, so a hosted fork must
   publish its source.
2. `git clone && npm install && npm run dev` yields a **complete working
   product** — local AI via Ollama, local chain via MyLocalTon, mock providers
   for everything else. No keys, no accounts, no permission.
3. The user's assets live in their own TON wallet, not in your database. If
   Luminara vanishes tomorrow, the fighters are still theirs and someone else
   can stand the client back up from the repo.
4. For *public* use you accept one HTTPS origin, because Telegram, the wallets
   and the browsers all require one. Optionally mirror it as a TON Site.

Point 3 is the part that actually matters to a player, and it does not require
localhost at all.

## 3.6 Recommended local development recipe

```
Web + API          → localhost, unchanged
AI                 → Ollama at localhost:11434 (already wired) or the mock
Chain              → MyLocalTon, or TON testnet
Wallet, dev        → Tonkeeper/MyTonWallet browser extension against
                     http://localhost:5173/tonconnect-manifest.json
Wallet, phone test → cloudflared or ngrok tunnel (temporary public HTTPS,
                     no domain purchase) and point the manifest at it
Telegram Mini App  → the same tunnel URL, or the test environment on
                     https://127.0.0.1:3000
```

Build the manifest URL from `window.location.origin` so the same code works in
all four cases without a rebuild.

---

# PART 4: DOES THE FIGHTING GAME BREAK THE WELLNESS APP?

## 4.1 The risk is real and it is specific

The risk is not "MMA is too violent for a fitness app" — the coach roster is
*already* nine cage fighters, and Akin is already the brand face. The roster
landed without confusing anyone because every fighter is a *voice over a
training domain*.

The risk is money and chance. A tradeable token, purchasable card packs with
random contents, and a marketplace, sitting in the same product as a calorie
tracker, produces two specific harms:

1. **Regulatory.** In Australia, since 22 September 2024, a game with in-game
   purchases linked to elements of chance takes a minimum **M** classification,
   and simulated gambling is legally restricted at a mandatory minimum **R18+**.
   Your app has minors in its addressable market and a health-adjacent framing.
2. **Product-integrity.** The instant a user can suspect that logging food
   moves something with resale value, every number the app reports becomes
   suspect, and the safety engine's authority collapses.

## 4.2 The firewall, stated as an invariant

AQF-25 §1.2 already says this. Make it a code-level invariant with a test, not
a paragraph:

> **No tradeable asset is ever created, granted, or increased in value by any
> wellness action.** Not by logging food, not by logging weight, not by
> completing a workout, not by a streak, not by a challenge.

The one legal crossing is **identity, one-way**:

```
own a fighter (game, paid in TON/USDT/Stars)
        │
        ▼
unlock that fighter as a coach persona (app, permanent)
```

Never the reverse. Training never mints. This is exactly what the existing
`grantPurchasedCoach` bridge already does for Telegram Stars — the game does
not need a new mechanism, it needs a second entitlement source pointed at the
same door.

## 4.3 Three currencies, one valve

| Currency | Earned by | Spends on | Tradeable |
|---|---|---|---|
| **Consistency** (non-transferable) | Training, logging, streaks | Coach personas, card backs, arena skins, cosmetics | **Never** |
| **Telegram Stars** | Bought with fiat in-app | The same cosmetic and persona layer | No (Apple/Google compliant) |
| **TON / USDT** | Brought by the user | Packs, fighter NFTs, marketplace, tournament entry | Yes — **game side only** |

Consistency and TON buy overlapping things and never convert into each other.
A disciplined free user and a spending user can both end up with Ogun; only one
of them can sell him.

## 4.4 Making it feel like it belonged all along

The framing sentence is already written into the Character Bible: *your coaches
came from somewhere.*

- **Entry point:** the coach select screen, which already exists. A locked
  fighter shows two doors — "earn by training" and "meet him in the Heavens
  Tournament." Both doors already end at the same grant.
- **Naming:** the game is **Aqua Zero Heavens**, a distinct surface with its
  own route, own chrome, own colour treatment. It is not a tab on the wellness
  dashboard and it never appears in the nutrition or progress flows.
- **Gating:** explicit opt-in, an 18+ gate on anything involving purchase or
  chance, and a hard default of *off* for accounts that have not opted in.
  Users who only want a calorie tracker should never see a card.
- **Data:** separate stores. Wallet address, holdings and match history do not
  sit in the same records as weight and food. AQF-11's data-minimisation
  posture applies to the wallet too — a wallet address is a permanent public
  identifier and correlating it with health data is the one mistake that cannot
  be undone later.
- **Voice:** the same coach lines. Sanzō celebrating your first bout and Sanzō
  celebrating your first workout are the same character being consistent, and
  that is what makes it feel native rather than bolted on.

## 4.5 Legal flags carried forward, unresolved

These were flagged in AQF-25 Appendix B and AQF-26. They are restated here
because monetisation is what converts them from theoretical to live:

- **Name clearance.** Several ring names are recognisable athlete mashups.
  Publicity rights in the United States and Australian passing-off/consumer-law
  exposure both attach at the point of *sale*, not at the point of writing.
  Playtest freely; clear before the first paid printing.
- **"Recognisable like a UFC game" is a design goal, not a branding one.** The
  UFC word mark, the Octagon trade dress and the fighter likenesses are all
  protected. Build the feel; use none of the marks.
- **Token counsel.** A purchasable token with a marketplace needs securities
  advice in Australia and the United States before sale.
- **Classification.** Paid packs with random contents → minimum M in Australia.
  Design decision available: sell *deterministic* card sets rather than random
  packs and the classification problem largely evaporates. Fusion (AQF-25 §5.2)
  already gives scarcity without a lottery — lean on it and consider dropping
  randomised packs entirely.

---

# PART 5: THE TWENTY-TWO REPOSITORIES, MAPPED

Licence compatibility for an AGPLv3 project: **MIT, Apache-2.0 and GPLv3 code
can be absorbed** (GPLv3 §13 explicitly permits combination with AGPLv3, and
the AGPL terms then govern the network clause). **A repository with no licence
is all-rights-reserved and cannot be used at all** — not even a copied
function. Several nominations fall in that last bucket.

## 5.1 Genuinely useful

| Repo | Licence | Verdict |
|---|---|---|
| **JavierIslas/Card-Combat-System** | AGPL-3.0-or-later, verified in `LICENSE` (README also offers a commercial licence) | **The most valuable item on the list.** A headless, domain-agnostic, *deterministic-with-seed* card combat engine with rules injected by the host, explicitly built for server-authoritative multiplayer and replays. That is precisely the architecture the Shen Engine needs. GDScript, so port the design, not the file — the pattern is the prize. Licence aligns exactly. |
| **soonfx-engine/core** | Apache-2.0 (verified in `package.json`) | **TypeScript, and a published npm package** — `@soonfx/engine`, built with tsup, shipping both CJS and ESM with type definitions. So it is an `npm install` into `packages/`, not a vendored port. A data-driven numeric/formula engine: card damage, block totals, POWER bonuses and tier scaling become configuration rather than code. AQF-25 Part 7 says "tune Part 4's numbers, then freeze"; this is how you tune without a deploy. |
| **pkirilin/food-diary** | AGPLv3 | React + .NET + Postgres, responsive with a real **desktop** layout and PWA. Same licence as you. The best available reference for what a nutrition tracker looks like when it is designed for a monitor. Study the desktop information density. |
| **db0/godot-card-game-framework** | **AGPL-3.0**, verified in `LICENSE` (the README additionally mentions a Steamworks addendum — unverified, check before any Steam release) | Mature (v2.2) card-game framework with full rules scripting. Licence is a perfect match. The caveat is honest: it is Godot/GDScript, so using it means shipping a Godot web export inside the app — tens of megabytes and mediocre mobile-web performance. Recommended as a *design* reference for card state machines, hand/pile management and targeting, not as a runtime. |
| **pratik-dhende/AI-based-Workout-Assistant** | **None** | The *idea* is the deliverable: MediaPipe pose estimation for rep counting and form correction from a webcam. That is Part 2.5's webcam form check. No licence, so read nothing and copy nothing — build it from MediaPipe's own Apache-2.0 docs. |
| **Qsgs-Fans/FreeKill** | GPLv3 | A shipping networked card-game engine with lobby, **disconnect-reconnect and replay**. Those three are the hard parts of online card games and the ones most likely to be underestimated. Qt/C++/Lua, so reference the netcode design, not the code. |

## 5.2 Marginal

| Repo | Licence | Verdict |
|---|---|---|
| **brandonp2412/FitBook** | MIT | Flutter, runs on Windows/macOS/Linux/Web. Useful mainly as proof that offline-first with a local food DB is tractable. You already have Open Food Facts wired. |
| **simonoppowa/OpenNutriTracker** | GPL-3.0 | Flutter/Dart. Already assessed in AQF-12; the privacy posture is the takeaway and you already match it. Low new value. |
| **Zayzoon-15/Kaos-Kards** | MIT | GameMaker jam game — "cards plus fighting plus luck." Useful only for a feel check on how much randomness a card fighter can carry before it stops feeling like skill. |
| **Oshan96/OpenFighting** | Apache-2.0 | Java/JOGL 2D local-versus fighter. Wrong genre, wrong stack. Licence is clean if anything is ever wanted from it. |
| **sindresorhus/awesome**, **leereilly/games**, **CardsMP** | index/list | Directories, not code. Useful for further prospecting, nothing to integrate. |

## 5.3 Do not use

| Repo | Reason |
|---|---|
| **scornsaber/Turn-Based-UFC-Game** | **No licence.** All rights reserved. A CS-321 group project with no documentation. Do not read it while implementing turn-based combat — the resemblance argument is not worth the zero upside. |
| **HARIHARANS24/AthletiQ-AI**, **BALADURGAG24/smartfit-planner-ai**, **fyildirim-debug/diet-app**, **CipherCereal/SnackTax**, **hafsa-imtiaz/FlexTrainer**, **programmersd21/food-rec**, **JuneYaooo/mediwise-health-suite** | Student/portfolio projects, Streamlit or similar, no licence stated in most cases, and every one of them does something AquaZeroFit already does *better* and more safely. AthletiQ-AI in particular pipes user metrics straight into Gemini for plan generation with none of the guardrail architecture in P-07/P-09. |
| **C4J/Commander4j** | Warehouse/labelling ERP in Java. No relationship to this product. |

---

# PART 6: BUILD ORDER

Sequenced so that nothing later is blocked and each step ships something real.

**Phase 1 — Make the web build a desktop product.** No game, no chain.
1. Desktop layout: multi-pane at `lg:` and up, side navigation replacing the
   bottom bar, the analytics width the phone cannot give.
2. Command palette and global hotkeys over the existing meal-extraction path.
3. Document Picture-in-Picture coach HUD.
4. PWA install, Web Push on desktop, Badging, Wake Lock.
5. Idle-detection desk-worker nudges.

**Phase 2 — The Shen Engine as a headless TypeScript core.** No UI, no money.
6. Port the Card-Combat-System *architecture*: pure, deterministic, seeded,
   rules injected. Card values loaded through soonfx-style configuration.
7. The full AQF-25 rule set as a test suite. Twenty simulated Akin-vs-Uthman
   Quickstart bouts, run in CI, checking the three failure modes named in
   AQF-25 Part 7 — dominant stance, dead energy turns, fights that end too
   early or never.
8. Local hot-seat play on desktop with the keyboard bindings. This is playable
   and shippable with zero blockchain.

**Phase 3 — Online.** 
9. Server-authoritative twelve-second clock over WebSocket. Replays as seed
   plus move list. Reconnect, because FreeKill is right that it matters.

**Phase 4 — Money and chain, last.**
10. MyLocalTon in CI. Contracts and the economy exercised offline.
11. TON Connect, extension wallet first, `window.location.origin` manifest.
12. **TON Pay** for checkout — the TON Foundation's payment SDK launched
    9 February 2026 with TON and USDT support and wallet-agnostic integration,
    which removes the need to build settlement and checkout tooling yourself.
13. The entitlement bridge: fighter ownership → `grantPurchasedCoach`.
14. Nothing tradeable ships until counsel has cleared names, token and
    classification.

The firewall test — *no wellness action mutates a tradeable balance* — is
written in Phase 2 and must stay green through Phase 4.

---

*AquaZero, AquaZeroFit, Aqua Zero Heavens and all characters herein are
copyright 2026 Luminara Digital. Created by Babatundji Williams-Fulwood.*
