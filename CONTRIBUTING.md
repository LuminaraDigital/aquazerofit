# Contributing to AquaZeroFit

## Getting set up

```bash
npm install
npm run api    # API on http://localhost:4000
npm run dev    # Web app on http://localhost:5173
```

Node 20 or newer is required. No API keys are needed — with no provider keys
configured, the AI gateway falls back to a deterministic offline engine and
every core journey works end to end.

## Before you open a pull request

```bash
npm run verify
```

That runs `typecheck` → `test` → `eval`, which is exactly what CI runs. The
`eval` step is the AI safety gate; a regression there blocks the build.

## Things that will get a change rejected

These are product invariants, not style preferences. They are enforced in code
and covered by tests:

- **Models identify, interpret and explain; code calculates, filters and
  enforces.** Never move calorie arithmetic, allergen exclusion or target
  clamping into a prompt.
- **Allergen exclusion is a hard filter with zero tolerance for false
  negatives.** It is never delegated to a model and never softened.
- **Meal-photo recognition never writes a log without explicit user
  confirmation.**
- **The credit ledger is append-only.** Balances are derived by folding
  transactions; never cache a counter or mutate a transaction.
- **Never bill a user for degraded AI output.** When real providers fail and
  the gateway falls back to offline templates it sets `meta.degraded`; paid
  lanes must release the reservation rather than commit it.
- **Attribution fields (`licence`, `licenceAuthor`, `sourceId`) are never
  stripped** from imported content records.
- **No AGPL/GPL source from upstream projects is vendored.** wger is integrated
  as a data import over its public REST API only (ADR-013).

## Repository conventions

- `prompts/` and `evals/` must stay at the repository root. `prompts.ts`
  resolves prompt files by walking up the directory tree and `evals/runner.ts`
  loads fixtures as siblings; moving either breaks prompt loading silently.
- `tools/docgen` is deliberately outside the npm workspaces so its `docx`
  dependency never enters the deployed dependency tree.
- The API wraps single resources in named envelopes (`{profile}`, `{plan}`,
  `{session}`, …) and the frontend unwraps defensively. Keep both sides.
- Prompts are versioned. Changing a prompt's behaviour means bumping its
  version so the change is visible in AI telemetry.

## Commit and PR style

Write commit subjects in the imperative mood and explain *why* in the body when
the reason is not obvious from the diff. Keep a pull request to one concern.

New behaviour needs a test. If you are fixing a bug, add the test first and
confirm it fails without your fix — several existing regression tests were
written that way and it is the standard here.

## Licence

By contributing you agree that your contributions are licensed under the
**GNU Affero General Public License v3.0 or later**, the same terms that cover
the project. See [LICENSE](LICENSE).
