# Coach actions

The coach proposes a change and the user confirms it. Code does the parsing,
calculation and enforcement, and nothing is written without the user's tap.

## Shipped

- Water and weight reports typed in chat become a `chatActionDraft`
  (`apps/api/src/modules/chat/actions.ts`). No model call, so no credit and no
  provider dependency.
- Confirm writes through the same `createWaterLog` and `upsertWeightLog` as the
  logging tabs.
- Web renders `CoachActionCard`. P-07 1.0.4 keeps the reply consistent with it.

## Next

1. Android card for `/chat/action-drafts`, then send `actionCards: true` from
   its chat turn. Android gets no proposals until it does.
2. Route meal sentences typed in chat into the existing meal-draft flow.
3. Swap an exercise in today's workout, using `swapExercise` and its credits.
4. Regenerate the plan, using the existing credit reservation.
5. Offer the aiPersonalisation consent inside the Telegram first run.
