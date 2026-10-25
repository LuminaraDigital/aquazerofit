/**
 * /fight-camp: season enrolment and, from S9, the season recap
 * (AZF-P1 §5.3). Every route is behind requireFeature: off is a 404.
 */
import { Router } from 'express';
import { enrolInputSchema } from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { asyncHandler } from '../../platform/errors';
import { todayFor } from '../../platform/dates';
import { enrol } from './enrolment';
import { requireFeature } from './flags';

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
