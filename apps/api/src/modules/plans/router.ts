/**
 * /plans — current plan + (re)generation (AQF-07 §3.3). Generation tries the
 * AI lane first (P-05); the deterministic engine is the guaranteed fallback.
 */
import { Router } from 'express';
import { generatePlanSchema } from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { AppError, asyncHandler } from '../../platform/errors';
import { todayFor } from '../../platform/dates';
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

plansRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const input = generatePlanSchema.parse(req.body ?? {});
    const plan = await generatePlanForUser(userIdOf(req), input, todayFor(req));
    res.status(201).json({ plan });
  }),
);
