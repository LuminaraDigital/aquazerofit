## What and why

<!-- What changes, and what problem it solves. Link the issue if there is one. -->

## How it was verified

<!-- `npm run verify` runs typecheck → tests → the AI safety eval, same as CI. -->

- [ ] `npm run verify` passes locally
- [ ] New behaviour has a test; for a bug fix, the test was confirmed to fail without the fix

## Product invariants

Tick only what the change actually touches (see [CONTRIBUTING.md](../CONTRIBUTING.md)):

- [ ] No calorie arithmetic, allergen filtering or target clamping moved into a prompt
- [ ] Meal-photo recognition still requires explicit user confirmation before writing a log
- [ ] Credit ledger stays append-only, and no paid lane bills on `meta.degraded`
- [ ] Content attribution fields (`licence`, `licenceAuthor`, `sourceId`) preserved
- [ ] Consent gates still enforced on AI personalisation and user memory
- [ ] No AGPL/GPL upstream source vendored (data-only integration, ADR-013)

## Notes for the reviewer

<!-- Trade-offs, follow-ups, anything deliberately left out of scope. -->
