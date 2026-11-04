/**
 * Fight Camp routes (AZF-P1 §5.3). Every route is behind requireFeature:
 * a feature that is off for the caller answers 404.
 *
 *   /fight-camp  season enrolment and, from S9, the season recap
 *   /grace       the Cut Man bank
 */
import { Router } from 'express';
import { enrolInputSchema } from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { asyncHandler } from '../../platform/errors';
import { todayFor } from '../../platform/dates';
import { enrol } from './enrolment';
import { requireFeature } from './flags';
import { syncGrace } from './grace';

export const fightCampRouter = Router();

fightCampRouter.use(requireAuth);

/** 201 on the first enrolment of the season, 200 with the same body after. */
fightCampRouter.post(
  '/enrolments',
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireFeature('enrol', userId);
    const { source } = enrolInputSchema.parse(req.body ?? {});
    const { enrolment, created } = await enrol(userId, source, todayFor(req));
    res.status(created ? 201 : 200).json({ enrolment });
  }),
);

export const graceRouter = Router();

graceRouter.use(requireAuth);

graceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireFeature('grace', userId);
    res.json({ grace: (await syncGrace(userId, todayFor(req))).view });
  }),
);
