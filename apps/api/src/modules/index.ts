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
  router.use('/admin', adminRouter);

  // AI lane
  router.use('/chat', chatRouter);
  router.use('/meal-photos', visionRouter);
  router.use('/recommendations', recommendationsRouter);

  // Log routes live at the root: /meal-logs, /water-logs, /weight-logs.
  router.use('/', logsRouter);

  return router;
}
