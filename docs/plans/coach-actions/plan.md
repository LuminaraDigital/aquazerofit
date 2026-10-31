# Coach actions

The coach proposes a change and the user confirms it. Code does the parsing,
calculation and enforcement, and nothing is written without the user's tap.

## Shipped

| Sentence | Card | Confirm runs | Cost |
| --- | --- | --- | --- |
| "I drank 500ml of water" | Log water | `createWaterLog` | None |
| "I weigh 82.5kg" | Log weight | `upsertWeightLog` | None |
| "I had chicken breast for lunch" | Meal card | Meal-draft confirm route | None |
| "swap the squats" | Swap exercise | `swapExercise` | Up to 1 credit |
| "rebuild my plan" | Rebuild plan | `generatePlanForUser` | Up to 5 credits |

- Proposals are read in `apps/api/src/modules/chat/actions.ts` with no model
  call, and stored and confirmed in `actionDrafts.ts`.
- Only a client that sends `actionCards: true` gets proposals, because the reply
  refers to the card. Web and the Mini App send it. Android does not yet.
- A card lasts a day, goes when its conversation is cleared, and only the newest
  card of a kind stays live.
- A meal card needs one clearly recognised food. Anything else that is not a
  plain report of today stays ordinary chat, including
  messages about how the user feels.
- `CoachConsentCard` asks for `aiPersonalisation` in the coach screen. It stays
  off until the user taps Allow.

## Deployment

No migration: new documents live in the existing `ai` container, and export and
deletion already sweep that container by user. No new environment variables.

Order: API first, then web. The API ignores nothing an older client sends, and a
newer web client against an older API only loses the cards until the API lands.

1. Run `npm run verify` and `npm run build --workspace apps/web`.
2. Deploy the API. Confirm `/health` and the boot log checks in
   `docs/PRODUCTION_READINESS.md` section 7.
3. Deploy the web client to every surface, including the Mini App host.
4. Smoke test in the real Telegram app with a test account:
   - Open the coach and confirm the consent card appears, then tap Allow.
   - Send each sentence in the table above and confirm each card.
   - Check the water, weight, meal, workout and plan screens show the result.
   - Tap "Not this" on one card and confirm nothing changed.
   - Clear the conversation with a card open and confirm the card goes.
5. Watch API errors for `[chat] coach action failed` and AI spend at `/metrics`.

Rollback: redeploy the previous web client, then the previous API. Open drafts
stay in the store unused and expire on their own terms.

## Next

1. Android card for `/chat/action-drafts`, then send `actionCards: true` from
   its chat turn.
2. Ask for `wellnessDataProcessing` alongside personalisation in Telegram. Until
   it is on, the meal card says allergy checks are off.
3. Let "swap X for Y" honour Y. Today the card says the app picks the replacement.
4. Tighten food matching. "cake" scores the same against Rice Cakes as "chicken
   breast" does against Chicken Breast (grilled), so the card can name the wrong
   food. The user sees the name and must confirm it.
