/**
 * Logs module handler extensions for copy-previous meal entries (AQF-09).
 */
import type { Request, Response } from 'express';
import { localDateSchema } from '@aquazerofit/shared';
import { userIdOf } from '../../platform/auth';
import { todayFor } from '../../platform/dates';
import { copyPreviousDayMealLogs } from './service';

export { copyPreviousDayMealLogs };

export function copyPreviousHandler(req: Request, res: Response): void {
  const userId = userIdOf(req);
  const bodyDate =
    typeof req.body === 'object' && req.body !== null && typeof req.body.localDate === 'string'
      ? localDateSchema.parse(req.body.localDate)
      : undefined;
  const targetDate = bodyDate ?? todayFor(req);
  const result = copyPreviousDayMealLogs(userId, targetDate);
  res.status(201).json(result);
}
