# Working in this repository

AquaZeroFit is an AI wellness platform: meal logging and nutrition targets,
training plans, progress tracking and a coach persona layer, delivered as a
React web app, a Telegram Mini App and a native Android app against a shared
Node.js API. It is an npm-workspaces monorepo licensed AGPL-3.0-or-later.
`apps/web` and `apps/api` are the two TypeScript workspaces, `packages/shared`
carries the types, validation schemas and error taxonomy both depend on, and
`apps/android` is a Gradle build that sits outside the npm workspaces
entirely. `prompts/`, `evals/`, `content/`, `design/`, `docs/` and `tools/` are
the supporting trees; `tools/README.md` explains the generators.

This file is the tool-agnostic entry point for anyone — human or automated —
picking the repository up cold. It is the only file of its kind that is
tracked. Assistant-specific directories are gitignored developer-local scratch
and nothing tool-specific is ever committed here.

## Build and verify

```bash
npm install
npm run verify        # typecheck -> test -> eval
```

Node 20 or newer. No API keys are needed: with no provider keys configured the
AI gateway falls back to a deterministic offline engine and every core journey
works end to end. `npm run verify` is exactly what CI runs, and the `eval` step
is the AI safety gate — a regression there blocks the build and is not to be
worked around.

For the Android app:

```bash
cd apps/android && ./gradlew ktlintCheck detekt test assembleDebug
```

## Before changing behaviour

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. It lists the product invariants
that will get a change rejected on principle rather than on style: models
identify and explain while code calculates and enforces, allergen exclusion is
a hard zero-tolerance code-side filter, the credit ledger is append-only,
degraded AI output is never billed, upstream attribution fields are never
stripped, and no AGPL source is vendored. These are enforced in code and
covered by tests. Do not restate or reinterpret them — go and read the list.

## Conventions that break things silently

- **`prompts/` and `evals/` must stay at the repository root.**
  `apps/api/src/modules/ai/prompts.ts` resolves prompt files by walking up the
  directory tree and `evals/runner.ts` loads its fixtures as siblings. Moving
  either breaks prompt loading with no error at the point of the mistake.
- **`tools/docgen` stays outside the npm workspaces.** That is what keeps its
  `docx` dependency out of the deployed dependency tree. It has its own
  install step and its own Dependabot schedule.
- **The API wraps single resources in named envelopes** (`{profile}`,
  `{plan}`, `{session}`) and the frontend unwraps defensively. Keep both sides.
- **Prompts are versioned.** Changing a prompt's behaviour means bumping its
  version, so the change is visible in AI telemetry.

## Android module boundaries

The standing rule: **feature modules must never depend on one another.**
Anything two features both need is shared code and belongs in `:core:ui` or
`:core:designsystem`, never reached across from one feature to another. A
feature-to-feature import is the change that turns a modular build into a ball
of mud, and it is refused in review.

Today this boundary is enforced by convention rather than by Gradle: the build
is still a single `:app` module with `core/` and `feature/` packages inside it,
so nothing stops a bad import mechanically. Respect the rule as though the
modules were already split, because the split is what the layout is for.

## Driving the Android app from the command line

The Android CLI (<https://developer.android.com/tools/agents/android-cli>)
covers the emulator and device loop without an IDE:

```bash
android emulator create      # define an AVD
android emulator start       # boot it
android run                  # build, install and launch
android screen capture       # screenshot the running app
android layout               # dump the view hierarchy
```

Its configuration lives in `%USERPROFILE%\.androidrc` and its skills install
into the user's home directory. Both are outside the repository and stay that
way — **nothing tool-specific is ever committed to this repository.** If a
workflow seems to need a config file checked in, it does not; put it in your
home directory.

## Commits

Imperative mood in the subject, and explain *why* in the body when the diff
does not make it obvious. One concern per pull request. New behaviour needs a
test; for a bug fix, write the failing test first and confirm it fails without
the fix.
