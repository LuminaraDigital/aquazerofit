---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Front End Engineering Report
subtitle: How the AquaZeroFit application and its landing pages were designed, built and verified
details:
  Document ID: AQF-23
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Scope: Client-side application, marketing landing pages and legal pages
  Prepared by: Babatundji Williams-Fulwood, Technical Lead and Software Architect
  Team: Babatundji Williams-Fulwood (s8138393), Eric La, Victor Hong
  Date: 4 August 2026
  Audience: Technical and non-technical readers. No prior web development knowledge assumed.
  Document status: Issued
---

# AquaZeroFit Front End Engineering Report

Document ID: AQF-23
Status: Issued
Date: 4 August 2026
Scope: `apps/web`, the entire client-side surface. The server, the AI pipeline and the data platform are covered in AQF-04, AQF-09, AQF-10 and AQF-21.

## 1. Executive summary

### 1.1 What was built

AquaZeroFit's front end is the part of the product a person actually sees and touches. It is one piece of software that serves three different audiences from a single codebase:

1. **The public landing pages.** A marketing front door at `/landing` plus four supporting pages (`/features`, `/how-it-works`, `/aqua-coach`, `/safety`) and three legal pages (`/privacy`, `/terms`, `/support`). This is what a stranger meets before they have an account.
2. **The signed-in application.** Sixteen screens covering the dashboard, meal logging by photograph, nutrition, training, progress charts, the Aqua Coach chat, buddy challenges and settings.
3. **The Telegram Mini App.** The same application, running inside Telegram rather than a browser tab, with a silent sign-in, native haptic feedback and Telegram's own colour theme applied at runtime.

There is no second codebase for Telegram and no separate marketing website. One build produces all three. That decision is the single most consequential architectural choice in this report, and section 4 explains what it bought and what it cost.

### 1.2 The numbers

| Measure | Value |
| --- | --- |
| Source files in the front end | 88 |
| Lines of front end source | 20,383 |
| Screens and pages (routed) | 26, plus a catch-all redirect |
| Reusable interface components | 17 |
| Automated tests, front end | 47 across 10 files, all passing |
| Third-party runtime libraries | 5 |
| Production build time | 3.94 seconds |
| Compressed code delivered on first visit | roughly 120 kB |

### 1.3 The three principles that shaped it

**Deliver the smallest honest thing.** Five runtime libraries is a deliberate figure, not an accident. The animated backgrounds, the three-dimensional hero graphic, the share-card image generator, the toast notifications and the chat text renderer were all written directly rather than pulled in as packages. Every dependency is a licence to audit, a security advisory to track and a chunk of bytes on a phone connection.

**The page must not be able to lie.** The marketing pages do not contain transcribed numbers. Figures such as the calorie floor, the daily credit allowance and the memory limits are imported from the same shared module the server uses, so a change to a safety constant changes the marketing page in the same commit. It is structurally difficult for these pages to make a claim the product no longer honours.

**Nothing decorative may be load-bearing.** Every animation, every three-dimensional effect and every scroll reveal collapses to a plain, complete, readable page when the visitor's device asks for reduced motion, when the graphics hardware refuses, or when the page is printed. Content is never hidden behind an effect that might not run.

## 2. A short glossary for non-technical readers

This report is written to be read by people who do not build software. These terms appear throughout.

| Term | What it means here |
| --- | --- |
| Front end | Everything that runs on the visitor's own device: the layout, the buttons, the charts, the animations. |
| Back end | The server, which holds the data and does the calculating. Covered in other documents. |
| Single-page application | A website that loads once and then swaps its content as you navigate, instead of fetching a whole new page each time. Feels like an app rather than a website. |
| Component | A reusable piece of interface, such as a button or a progress ring, defined once and used in many places. |
| Bundle or chunk | A packaged file of code sent to the browser. Smaller and fewer is faster. |
| Route | A URL inside the application, such as `/progress`, and the screen it shows. |
| Build | The automated step that turns readable source code into the compressed files a browser downloads. |
| WebGL | The browser feature that lets a page use the graphics chip directly, the way a game does. |

## 3. Languages and technologies

### 3.1 The languages

Four languages are in use in the front end. Each does a job the others cannot.

| Language | Where it is used | Why it was chosen |
| --- | --- | --- |
| **TypeScript** | All application logic. 85 of the 88 files. | TypeScript is JavaScript with a type checker attached. It catches whole categories of mistake (a missing field, the wrong shape of data, a value that might be absent) before the code ever runs. The build refuses to complete if the types do not hold, so a broken screen cannot reach the deployed site through this route. |
| **JSX / TSX** | Every screen and component. | The markup dialect React uses. It lets the structure of a screen sit next to the logic that drives it, in one file, in one language. |
| **CSS**, via Tailwind | Styling, 504 hand-written lines plus utility classes throughout. | The look of the product: colour, spacing, glass surfaces, motion. Section 6 covers the design system. |
| **GLSL** | Two shader programs, roughly 130 lines. | The small programs that run on the graphics chip, drawing the aurora background and the liquid hero orb. Explained in section 7. |

There is no plain JavaScript anywhere in the application source. There is no second language for the Telegram build.

### 3.2 The libraries

Five libraries reach the visitor's browser. This is unusually few for an application of this size, and the restraint is intentional.

| Library | Job | Note |
| --- | --- | --- |
| React 18 | Renders the interface and keeps it in step with the data. | The industry default. Hiring, documentation and long-term support all favour it. |
| React Router 6 | Maps URLs to screens, guards private routes. | Version 7 exists and is deliberately not yet adopted. Section 14 explains. |
| TanStack Query 5 | Fetches server data, caches it, refreshes it, and handles loading and error states. | Removes an entire class of hand-written state-management code. |
| Zod | Validates data shapes. | Shared with the server, so both sides agree on what a valid record looks like. |
| `@aquazerofit/shared` | The project's own shared module of types, constants and rules. | Not third-party. This is the mechanism that keeps the marketing pages honest. |

### 3.3 The build and test tooling

| Tool | Job |
| --- | --- |
| Vite 5 | Compiles and bundles the application. Full production build measured at 3.94 seconds. |
| Tailwind CSS 3 | Turns the design tokens into styling utilities. |
| Vitest 2 and Testing Library | Runs the automated tests against a simulated browser. |
| TypeScript compiler | Type-checks the whole codebase as a required build step. |
| `sharp` (build-time only) | Re-encodes product screenshots to modern web formats. Never ships to the browser. |

## 4. Architecture: one application, three audiences

### 4.1 The shape of it

The entire front end is a single-page application. The browser downloads one small shell, and from then on navigation happens instantly on the device rather than by asking the server for a new page.

Layered from the outside in:

1. **Entry.** One file starts the application, initialises Telegram if present, captures any invitation or campaign codes from the web address, and installs the data cache.
2. **Routing.** One file, `App.tsx`, lists all 26 routes. Every screen is declared once, and it is possible to read the whole navigational structure of the product in eighty lines.
3. **Guards.** A route guard sits between the public and private halves. It decides, per visit: is this person signed in, are they inside Telegram, and do they have a profile yet.
4. **Layouts.** Two shells. One for the marketing and legal pages (wide, with a fixed header and a four-column footer), one for the application (a narrow mobile column with a fixed bottom navigation bar).
5. **Screens and components.** The pages themselves, built from a shared component library.

### 4.2 Every screen loads on demand

All 26 routes are loaded lazily. A visitor reading the landing page never downloads the workout library, the coach chat or the settings screens. The production build splits the application into 55 separate files and delivers only the ones a given journey needs.

The measured result, taken from the production build:

| What the visitor is doing | Compressed code delivered |
| --- | --- |
| Shared runtime (React, router, data layer), needed once | 91.7 kB |
| Stylesheet, needed once | 12.9 kB |
| Landing page and its chrome | roughly 16 kB |
| Then: the dashboard | 3.6 kB |
| Then: the coach chat | 4.3 kB |
| Then: the workout library | 5.9 kB |

A first-time visitor to the landing page receives roughly 120 kB of compressed code. Each screen they subsequently open costs a few kilobytes more.

### 4.3 Three guards, one codebase

The decision to serve three audiences from one build is enforced by three small pieces of logic, each in exactly one place:

- **Signed-in visitors never see the marketing page.** The landing route redirects them into the application before anything renders.
- **Telegram never sees the marketing page.** Inside the Mini App there is no browser address bar, no search engine and no need for a sales pitch, so Telegram visitors are sent to the Mini App welcome carousel instead.
- **Signed-out visitors never see the application.** The route guard sends them to the landing page on the web, or to the Telegram welcome inside Telegram, preserving the page they were trying to reach so they arrive there after signing in.

A subtle trap was found and handled here. The application's home screen lives at `/`, and `/` is protected. A footer link of the form `/#screens` would therefore be redirected to the landing page and would lose the `#screens` part on the way, dropping every visitor at the top of the page rather than the section they clicked. All cross-page section links therefore target `/landing#section` explicitly. The reasoning is recorded in the code itself, where the next person to touch it will find it.

## 5. The landing pages

### 5.1 What exists

| Route | Purpose | Compressed size |
| --- | --- | --- |
| `/landing` | The front door. Hero, statistics, features, screen gallery, walkthrough, coach demonstration, safety, platform, closing call to action. | 11.2 kB |
| `/features` | Capability reference. Every safety figure imported from shared code, not transcribed. | 5.1 kB |
| `/how-it-works` | The user journey in order, each step split into what you do and what the application does in response. | 4.4 kB |
| `/aqua-coach` | The coach explained, including its refusal categories drawn from the shipped classifier. | 5.4 kB |
| `/safety` | Safety invariants, the deterministic mathematics, what happens to a meal photograph, security posture. | 5.2 kB |

The four supporting pages share one shell, one hero shape and one specification-table component. That shell was extracted at the third page rather than the second, on the principle that two copies is a coincidence and three is a pattern.

### 5.2 The honesty mechanism

This is the most important engineering decision on the marketing surface, and it is worth explaining carefully for non-technical readers.

Marketing pages normally contain typed-out claims. Someone writes "1,200 calorie floor" into the page, and eighteen months later the product's floor has changed and the page has not. Nobody notices, because nothing connects them.

On AquaZeroFit's `/features` page, that number is not typed. The page imports the constant `KCAL_FLOOR` from the shared module that the server's target calculator uses. If an engineer changes the floor, the marketing page changes in the same commit, automatically, or the build fails. The same applies to the daily credit allowance, the photograph size limit, the accepted image formats, the coach's memory limits, the protein and hydration coefficients, and the formula version.

Where a figure genuinely cannot be imported (server-side values such as token lifetimes and rate limits, which do not belong in a browser bundle) the page carries a written maintenance note naming the exact file to change alongside it. This is the honest fallback, and it is marked as such in the source.

The `/aqua-coach` page goes further: its list of refusal categories, their priority order and the wording of the crisis signpost are drawn from the shipped guardrail classifier rather than written as copy. The page describes the product's actual behaviour because it is reading the product's actual configuration.

### 5.3 The product screenshots are real

The device mock-up on the landing page shows genuine captures of the running application at a 390 by 844 viewport, taken at double resolution, rather than markup imitating the app.

The reason is recorded in the source: a hand-built replica had already drifted from the product within an hour of being written. A landing page whose screenshots are drawings is precisely the tell the project was trying to avoid.

The captures are re-encoded at build time into modern WebP images at two resolutions, giving roughly a tenth of the original file size, and the page serves whichever the device needs. Eight screens are published this way.

### 5.4 Legal pages that cannot pretend to be finished

The privacy notice, terms of use and support pages presented a genuine ethical problem. Everything derivable from the source code (what the software collects, how long it keeps it, what it deletes on request) can be written accurately. Everything that depends on **who is operating the service** (the legal entity, the governing jurisdiction, the postal address, the contact mailboxes, which AI providers a given deployment has configured, the effective date) cannot be derived from code, and inventing it would be worse than useless.

The solution is a single file of operator facts, every field of which is currently `null`. While any required value is missing, or while the review status is set to `draft`:

- a prominent draft banner is pinned above the first clause of every legal page, so no reader reaches the substance without meeting it first,
- each missing value is marked inline where it would otherwise appear,
- and nine automated tests assert that this remains true.

The documents are therefore structurally incapable of quietly going live looking finished. To publish them, an operator fills in the fields, obtains legal review, and flips one status flag. This is drafting support, not legal advice, and the file says so.

## 6. The design system

### 6.1 Where the design came from

The visual language, "Modern Aquatic Wellness", was defined in Figma and exported as a design specification. Forty colour tokens, two typefaces, a radius scale and a spacing scale were transcribed once into the Tailwind configuration, and the entire product is styled from those tokens rather than from ad-hoc colour values.

The palette follows Material Design 3's semantic naming: `surface`, `on-surface`, `primary`, `on-primary`, `secondary`, `error` and their container variants. This matters more than it sounds. A colour named `on-surface` carries a promise about contrast against `surface`. A colour named `#dde4e5` carries no promise at all.

Two typefaces: Barlow Condensed for headings, DM Sans for body text, both loaded from Google Fonts with pre-connection hints.

### 6.2 The component library

Seventeen reusable components, roughly 1,650 lines in total:

| Group | Components |
| --- | --- |
| Surfaces | GlassCard, MetricCard, Chip, Skeleton |
| Controls | PrimaryButton, SecondaryButton, Input, form fields |
| Feedback | Toast, EmptyState, ErrorState, PageSpinner |
| Data display | RingProgress, Sparkline, MacroBar |
| Navigation | AppHeader, BottomNav |
| Brand | AkinStage, AquaMascot, ShareMoment |

The card system is tiered rather than uniform: a hero card for the most important content on a screen, a standard glass card as the workhorse, and a compact tonal card for dense lists. Depth, border treatment and shadow all step down together, so importance is legible at a glance.

### 6.3 A deliberate and unusual restriction

Glass surfaces would normally use the CSS `backdrop-filter` blur effect everywhere. AquaZeroFit's cards do not. Blur is applied only to navigation bars and modal sheets, through a single dedicated class.

The reason is a paint bug in Chromium-based browsers where large numbers of blurred surfaces on a scrolling page produce visible artefacts and a measurable frame-rate cost on mid-range phones. The design achieves its depth through layered translucent gradients, hairline inner highlights and long soft shadows instead. The visual result is close to indistinguishable, and it holds up on hardware that the naive version does not.

## 7. Motion and graphics engineering

This section describes the most technically demanding part of the front end. It is written for a non-specialist, because the decisions here are the ones most likely to be asked about.

### 7.1 Two shader programs, written by hand

Two of the visual effects are not CSS. They are programs that run on the visitor's graphics chip, the same mechanism a video game uses.

**The aurora background** renders slow bands of aqua and teal light behind every screen of the product. It is drawn as a single triangle covering the viewport, with a program that calculates the colour of each pixel from the current time. One drawing instruction per frame.

**The hero orb** on the landing page is more ambitious: a liquid metaball, three spheres fused into one body of moving fluid, lit with a rim light, a specular highlight and caustic banding, and orbited by the visitor's cursor. It is produced by ray marching, a technique that steps a ray forward through space until it meets a mathematically defined surface. Seventy-two steps per pixel, per frame, and still one drawing instruction.

Both were written directly against the browser's graphics interface rather than by adding a three-dimensional library. The rationale is recorded in the source: a library would add a runtime dependency and a third-party licence entry for one decorative element on one page.

### 7.2 The guards, in order of importance

Decorative graphics that misbehave on real hardware are worse than no graphics. The hero orb carries five guards, layered:

1. If the visitor has asked their device for reduced motion, the shader never initialises. A static gradient shows instead.
2. If graphics acceleration is unavailable, the code returns quietly and the same static gradient shows.
3. When the element scrolls out of view, the animation loop stops.
4. When the browser tab is backgrounded, the animation loop stops.
5. If the browser reclaims the graphics context (which happens on memory pressure, particularly on phones), the loop cancels cleanly instead of throwing an error on every frame.

There is also a pixel budget. Ray marching is limited by how many pixels must be calculated, so rather than trusting the device's pixel ratio, the code caps the total pixel count at 900,000 and scales down beyond that. A 4K display therefore does not pay four times over for a decoration.

### 7.3 Motion primitives

Scroll animations are handled by four small hooks, all observer-driven. There are no scroll event listeners performing layout calculations, which is the classic cause of janky marketing pages.

- **Reveal** fades content up as it enters view, once, and never again. Entrance animations that replay on every scroll pass read as noise.
- **Tilt** rotates cards toward the cursor. It writes CSS custom properties from inside an animation frame rather than re-rendering React on every pointer movement, so the compositor does the work.
- **Count-up** animates statistics from zero. Under reduced motion it jumps straight to the final value, because a figure must never be withheld from a reader in the name of an effect.
- **Hash scroll** handles the case where someone follows a link to a section of a page that has not finished loading yet. Because every route loads on demand, the browser gives up looking for the section long before it exists. Without this, every cross-page section link would silently land at the top of the page.

One detail is worth calling out because it is the kind of thing that is usually got wrong. Content above the fold is revealed immediately on mount if it is already on screen, without waiting for the observer to fire. A backgrounded browser tab delivers no observer callbacks at all, and content that is hidden by default and never revealed is far worse than no animation.

### 7.4 Reduced motion and print

A single block of CSS disables the floor grid, the orbits, the marquee, the tilt, the reveals, the character animation and the rail fill when the visitor prefers reduced motion. A second block does the same for printing, on the rule that nothing may stay hidden behind an animation that will never run.

## 8. The signed-in application

### 8.1 The screens

| Area | Screens |
| --- | --- |
| Entry | Welcome carousel, sign-in and registration, onboarding profile builder |
| Home | Dashboard: calories remaining on a progress ring, macro split, hydration, today's workout, weight trend |
| Nutrition | Nutrition dashboard, meal photograph capture, analysis results, meal plan, recipe detail |
| Training | Workout library, workout detail with set logging |
| Progress | Progress charts, weight logging |
| Coach | Aqua Coach chat |
| Social | Buddy huddles (private, invite-only challenges) |
| Settings | Settings, notification preferences, coach memory |

### 8.2 The meal photograph flow, as an illustration of the product's core rule

The capture screen accepts a photograph from the camera or the gallery, validates its type and size against the shared limit before uploading, shows a viewfinder with corner brackets, and hands the file to the server for analysis.

What comes back is a **proposal**, not a log entry. The analysis screen presents what the model thinks the plate contains, and every item and every portion is editable. Nothing enters the user's day until they confirm it.

This is the front end's expression of the product's central invariant: code calculates, models describe. A language model never produces a number that is presented to the user as fact, and it never writes into the user's record on its own. The landing page's safety section states this claim, and the capture flow is where it is kept.

### 8.3 The coach chat

The chat screen is the most intricate in the application. Replies stream in token by token over a server-sent event connection while a typing indicator runs. Tool results (a calculated target, a looked-up food) render as structured cards rather than as text. Suggested prompts appear as tappable chips. A wellness disclaimer is always present, not dismissible.

Two details matter for safety and security respectively:

- **Safety frames are supportive, never alarm-styled.** When the guardrail classifier stops a reply, the screen shows a calm, warm frame with a signpost to real support. Red borders and warning icons in that moment are actively harmful.
- **The renderer is deliberately minimal.** Assistant replies are rendered with a small purpose-written formatter that understands bold text and bullet points, and nothing else. The browser's raw HTML insertion mechanism is not used anywhere in the front end. Model output is text, and it is treated as text.

### 8.4 The growth surface

Three mechanisms, added in the most recent release:

- **Attribution capture.** Invitation codes, campaign parameters and challenge codes are read from the web address on first arrival and stored once per browser. First touch wins for the referrer, so credit is not stolen by a later link.
- **Share cards.** After a milestone, the app draws a 1080 by 1350 branded image on a canvas, in code, with no external library, featuring the Akin character in a randomly selected pose. It then offers the native share sheet, a Telegram share, or a clipboard copy.
- **Buddy huddles.** Private accountability challenges joined by an invite code. Explicitly not a public social feed.

Growth telemetry is fire-and-forget: it never blocks the interface, and failures are silent by design.

## 9. The data layer

### 9.1 One API client, one contract

Every request the front end makes goes through a single typed client, roughly 240 lines, which owns five responsibilities:

1. **The bearer token.** Attached to every authenticated request.
2. **Transparent session renewal.** When the server answers "your token has expired", the client renews it and retries the original request once, silently. Concurrent expiries share a single renewal attempt rather than stampeding the server. If renewal fails, credentials are cleared.
3. **The error envelope.** Server errors arrive in a known shape and are converted into a typed error carrying a status and a machine-readable code, so screens can distinguish "not found" from "consent required" from "rate limited" and respond appropriately.
4. **The visitor's time zone.** Sent on every request, so "today" means the user's today.
5. **Streaming.** The chat's token-by-token stream is parsed here.

Two defensive details, both of which were bugs somewhere before they were rules here: an absent token omits the authorisation header entirely rather than sending the literal text `Bearer null` (a malformed credential reads very differently from an absent one in a server log), and the token's shape is validated before a streaming request rather than after.

### 9.2 Server state versus screen state

The application keeps almost no state of its own. Server data lives in the query cache, keyed by a namespaced scheme, and every screen reads from that cache. Every action that changes data declares exactly which slices of the cache it invalidates.

Logging a meal, for example, invalidates nutrition and progress. Logging a weight invalidates weight, progress and targets, because a new weight changes the calculated targets. These relationships are written once, next to the action, rather than scattered as manual refreshes across the screens that happen to be affected.

Two refinements are worth noting for a technical reader. Edits to coach memory are applied **optimistically**: the screen updates instantly and rolls back if the server rejects the change. And the signed-in identity is seeded from a local snapshot so the user's name paints immediately on launch, while the server response remains the source of truth.

### 9.3 Defensive contract handling

The server wraps single resources in named envelopes: a profile arrives as `{ profile: ... }`, targets as `{ targets: ... }`. The front end unwraps them through one helper that accepts both the wrapped and the bare shape. If the envelope convention ever changes on one endpoint, screens do not break.

Similarly, a "not found" response for a profile, a plan or a session is translated into "absent" rather than treated as an error, because for a new user those things are legitimately not there yet.

## 10. The Telegram Mini App

The same build runs inside Telegram. Five pieces of integration make it feel native rather than like a website in a frame:

1. **Detection.** The app knows it is inside Telegram only when signed launch data is present, not by guessing from the user agent.
2. **Silent sign-in.** When Telegram provides signed launch data and no session exists, the app authenticates in the background before showing any sign-in interface. On failure it falls back to the normal screen with no error flash. The attempt is cached at module level so it fires exactly once per launch, which guards both against React's development double-rendering and against two entry screens each trying independently.
3. **Theme binding.** Telegram's own colour parameters are validated and bound onto CSS custom properties at startup, so the Mini App adopts the user's Telegram theme.
4. **Haptics.** Navigation taps and confirmations trigger native haptic feedback, through a helper that is a silent no-op in a browser.
5. **Share links.** Telegram's own link opener is used inside Telegram, with a browser fallback outside it.

Every one of these helpers is safe to call on the web, where it does nothing. There is no conditional branching scattered through the screens.

One deployment subtlety, recorded here because it is easy to get wrong and expensive to diagnose: the standard `X-Frame-Options` security header is deliberately **not** sent. It would prevent Telegram from embedding the app at all. Frame control is handled instead through a Content Security Policy that names Telegram's domains explicitly, which is the modern and more precise mechanism.

## 11. Accessibility

Accessibility was treated as a build requirement rather than a later audit.

| Practice | Implementation |
| --- | --- |
| Skip links | Every marketing and legal page has a keyboard-reachable "skip to content" link as its first focusable element. |
| Focus visibility | Every interactive element carries an explicit visible focus ring. Focus is never removed without replacement. |
| Semantic structure | Real `nav`, `main`, `header`, `footer` and `table` elements with scoped headers, not styled `div` elements. |
| Screen reader labelling | 454 accessibility attributes across the codebase. Decorative graphics are hidden from assistive technology; the progress rings expose their value as readable text. |
| Motion preference | Honoured throughout, as described in section 7.4. |
| Touch targets | Primary actions have a minimum height of 52 pixels; navigation items 54 pixels. |
| Safe areas | Bottom navigation respects the safe area inset on notched phones. |
| Numeric legibility | Tabular figures used for all numbers that change, so digits do not jitter as they update. |

## 12. Security posture of the front end

The front end is not where security is enforced, but it is where it can be undone. The measures below are the client-side half of the posture documented in AQF-11 and AQF-21.

| Measure | Detail |
| --- | --- |
| No raw HTML insertion | The browser's `dangerouslySetInnerHTML` mechanism appears nowhere in the application. Model output and user content are rendered as text. |
| Content Security Policy | Scripts restricted to the app's own origin and Telegram. Styles and fonts restricted to Google Fonts. Object embedding disabled. Form submission restricted to the app's own origin. |
| Frame ancestors | Restricted to the app itself and Telegram's web clients, as described in section 10. |
| Session handling | Access and refresh tokens stored under namespaced keys, cleared on sign-out and on authentication failure. Sign-out sends the refresh token so the server can revoke the whole token family, and proceeds locally even if that call fails. |
| Permissions policy | Camera permitted to the app only. Microphone, geolocation and interest-cohort tracking disabled outright. |
| Caching | Fingerprinted assets cached for a year and immutable; the entry document explicitly not cached, so a deployment reaches users immediately. |
| External script | Telegram's SDK is loaded with cross-origin isolation. Its integrity hash is not yet pinned, and the reason is documented in the source. See section 14. |

## 13. Quality assurance

### 13.1 Automated tests

Forty-seven tests across ten files, all passing at the time of writing, verified by a full run for this report.

| Suite | Tests | What it protects |
| --- | --- | --- |
| Legal pages | 9 | The draft gate. That the pages cannot present themselves as finished while operator facts are missing. |
| Safety page | 6 | That the safety claims render and match the imported constants. |
| Landing page | 5 | The hero, both entry points, and the redirect behaviour for signed-in and Telegram visitors. |
| Features page | 5 | That every documented section renders. |
| How it works | 5 | The walkthrough structure. |
| Aqua Coach page | 5 | The guardrail categories and coach claims. |
| Attribution | 5 | First-touch attribution and code capture. |
| Password reset | 3 | That a reset link prefills the sign-in form correctly. |
| Brand stage | 2 | Character pose cycling and reduced-motion behaviour. |
| Workout media | 2 | Exercise media resolution. |

The concentration on the public pages is deliberate: those are the surfaces where a silent regression is invisible to the team and visible to every stranger.

### 13.2 The other gates

| Gate | Status |
| --- | --- |
| Type checking | Required step of the build. The build fails on any type error. |
| Production build | Clean. 170 modules, 3.94 seconds. |
| Continuous integration | Runs install, type check, test, safety evaluation and build on every push and pull request. |
| Backend test suite | 473 tests across 38 files, run alongside the front end. |

## 14. Known limitations and recommendations

Reported plainly, because a report that only lists strengths is not an engineering report.

### 14.1 Carried deliberately

**React Router 7 is pending and not yet adopted.** The upgrade breaks the front end test suite with duplicate-runtime rendering errors and needs genuine migration work rather than a version bump. Dependency automation has been reconfigured so that major versions arrive as separate proposals rather than one un-migratable change blocking every routine security patch. Recommendation: schedule the migration as its own piece of work, verified in an isolated checkout with a clean install, because continuous integration stops at type checking and would hide the failures that follow.

**The Telegram SDK's integrity hash is not pinned.** The script is loaded with cross-origin isolation, but the subresource integrity hash could not be verified at build time because the fetch timed out. The gap is documented in the source. Recommendation: pin it when the script is reachable.

**Legal pages render as drafts.** By design, as described in section 5.4. They require operator facts and legal review, both of which are the operator's to supply and must never be invented.

**Notification preferences are saved but not delivered.** The settings screen honestly says so rather than implying a delivery mechanism that does not exist.

**Exercise media is placeholder artwork.** Properly licensed imagery is needed before a public demonstration.

### 14.2 Recommended improvements

**Harden the background shader to match the hero.** The aurora background lacks three guards the hero orb has: the pixel budget cap, the graphics-context-loss handler, and the visibility observer. The browser pauses animation frames in backgrounded tabs on its own, so the practical exposure is limited to context loss on memory-constrained devices, but the two should be brought to the same standard. Estimated cost: half a day.

**Unify the two data-access styles.** Most screens use the shared query hooks; the dashboard defines its own equivalent queries inline. Both work, and cache invalidation still matches correctly because of how the keys are structured, but a future reader will reasonably wonder which pattern is the intended one. Estimated cost: half a day.

**Extend automated coverage into the signed-in application.** Test coverage is strongest on the public pages and thinnest on the screens that handle real user data. The meal capture flow and the coach chat, in particular, carry safety-relevant behaviour that is currently verified only through the server's own test suite.

**Add end-to-end and visual regression coverage.** Component tests cannot catch a layout that breaks only in a real browser at a real viewport size, and the visual identity is a substantial part of this product's value.

**Reconsider the external font dependency.** Typefaces are loaded from Google Fonts. Self-hosting them would remove a third-party request from every page load, tighten the Content Security Policy and improve the privacy posture, at the cost of slightly more work in the build.

## 15. Conclusion

The AquaZeroFit front end is a single TypeScript and React application, roughly 20,000 lines across 88 files, which serves a marketing site, a legal document set, a full wellness application and a Telegram Mini App from one build, on five runtime libraries, in a build that completes in under four seconds.

Three things distinguish it from a conventional implementation of the same brief.

The **honesty mechanism**: the marketing pages import the product's real constants instead of transcribing them, so they cannot drift into making claims the product no longer keeps.

The **restraint**: shaders, share-card rendering, toasts and the chat text renderer were written directly rather than imported, which keeps the dependency surface, the licence obligations and the delivered bytes all small enough to reason about.

The **degradation discipline**: every effect on the page has a defined behaviour when the graphics chip refuses, when the visitor asks for less motion, when the tab is hidden, and when the page is printed. Nothing decorative is load-bearing.

The limitations in section 14 are known, documented in the source where an engineer will meet them, and none of them is structural. The router migration and the operator facts for the legal pages are the two items on the critical path to a public launch.
