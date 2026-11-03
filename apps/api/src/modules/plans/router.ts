/**
 * /plans — current plan + (re)generation (AQF-07 §3.3). Generation tries the
 * AI lane first (P-05); the deterministic engine is the guaranteed fallback.
 */
import { Router } from 'express';
import { generatePlanSchema } from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { AppError, asyncHandler } from '../../platform/errors';
import { todayFor } from '../../platform/dates';
import { assertLaneAllowed } from '../ai/tierPolicy';
import { getUser } from '../ai/util';
import { assessReadiness } from './readiness';
import { generatePlanForUser, getCurrentPlan } from './service';

export const plansRouter = Router();
plansRouter.use(requireAuth);

plansRouter.get('/current', (req, res) => {
  const plan = getCurrentPlan(userIdOf(req));
  if (!plan) {
    throw new AppError('NOT_FOUND', 'No active training plan yet — generate one to get started');
  }
  res.json({ plan });
});

/**
 * Readiness for the caller's trailing week. No AI lane, no credit cost and no
 * guardrail pass: nothing on this route is model-authored, so there is nothing
 * for a guardrail to check. `requireAuth` is already applied router-wide.
 */
plansRouter.get('/readiness', (req, res) => {
  res.json({ readiness: assessReadiness(userIdOf(req), todayFor(req)) });
});

/**
 * Generation. The lane gate is here; the credit hold is not — it lives in
 * `generatePlanForUser`, because only the service knows whether the AI lane
 * actually ran or `buildPlan` served the request, and a plan no model wrote
 * is not a plan to charge for.
 *
 * `planStructured` is not a premium lane today, so `assertLaneAllowed` admits
 * everyone and this line does nothing at runtime. It is here because the
 * route's lane should be declared at its entry rather than inferred from the
 * service two files away — the day `planStructured` moves into PREMIUM_LANES,
 * a gate that was never written is the bug, not a gate that was a no-op.
 */
plansRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const input = generatePlanSchema.parse(req.body ?? {});
    assertLaneAllowed(getUser(req).tier, 'planStructured');
    const plan = await generatePlanForUser(userIdOf(req), input, todayFor(req));
    res.status(201).json({ plan });
  }),
);
