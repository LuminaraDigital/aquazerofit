/**
 * Module registry: buildRouter() mounts every module router on the versioned
 * base path (app.ts mounts this at config.basePath = /api/v1). Endpoint
 * surface per AQF-07 §3.
 */
import { Router } from 'express';
import { authRouter } from './auth/router';
import { meRouter } from './me/router';
import { foodsRouter } from './foods/router';
import { logsRouter } from './logs/router';
import { analyticsRouter } from './analytics/router';
import { plansRouter } from './plans/router';
import { workoutsRouter, exercisesRouter } from './workouts/router';
import { progressRouter } from './progress/router';
import { recipesRouter } from './recipes/router';
import { adminRouter } from './admin/router';
// AI lane (owned by the AI/chat engineer):
import { chatRouter } from './chat/router';
import { visionRouter } from './vision/router';
import { recommendationsRouter } from './recommendations/router';
import { challengesRouter } from './challenges/router';
import { coachesRouter } from './coaches/router';
import { telegramWebhookRouter } from './payments/router';

import { exportRouter } from './export/export';

export { exportRouter };

export function buildRouter(): Router {
  const router = Router();

  router.use('/auth', authRouter);
  router.use('/me', meRouter);
  router.use('/foods', foodsRouter);
  router.use('/analytics', analyticsRouter);
  router.use('/plans', plansRouter);
  router.use('/workouts', workoutsRouter);
  router.use('/exercises', exercisesRouter);
  router.use('/progress', progressRouter);
  router.use('/recipes', recipesRouter);
  router.use('/challenges', challengesRouter);
  router.use('/coaches', coachesRouter);
  router.use('/admin', adminRouter);
  router.use('/export', exportRouter);

  // Telegram's payment callbacks. Mounted with the API rather than at the root
  // so it inherits CORS, helmet and the rate limiter; it authenticates by
  // shared secret rather than by bearer token, and is the only unauthenticated
  // route here that can grant an entitlement.
  router.use('/telegram', telegramWebhookRouter);

  // AI lane
  router.use('/chat', chatRouter);
  router.use('/meal-photos', visionRouter);
  router.use('/recommendations', recommendationsRouter);

  // Log routes live at the root: /meal-logs, /water-logs, /weight-logs.
  router.use('/', logsRouter);

  return router;
}
