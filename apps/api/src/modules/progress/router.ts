/**
 * /progress — weight series, streaks and achievements (AQF-07 §3.3).
 */
import { Router } from 'express';
import { requireAuth, userIdOf } from '../../platform/auth';
import { todayFor } from '../../platform/dates';
import { getProgressSummary } from './service';

export const progressRouter = Router();
progressRouter.use(requireAuth);

progressRouter.get('/summary', (req, res) => {
  res.json(getProgressSummary(userIdOf(req), todayFor(req)));
});
