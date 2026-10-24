/**
 * /fight-record — seasons and Consistency Belts (AZF-W3-05 §4.3).
 *
 * GET  /              the read model; also writes any belt newly reached
 * POST /ack           mark the celebration the client displayed as seen
 * PUT  /emoji-status  opt in or out of the belt as Telegram emoji status
 *
 * Every route sits behind the rollout check, and off means off. The read
 * answers `{ fightRecord: null }` rather than 404 so a client hides the
 * surface without logging a released-later feature as a fault, and none of
 * the routes writes anything for a user outside the rollout.
 */
import { Router } from 'express';
import { ackBeltSchema, emojiStatusPreferenceSchema } from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { AppError, asyncHandler } from '../../platform/errors';
import { todayFor } from '../../platform/dates';
import {
  acknowledgeBelt,
  fightRecordEnabledFor,
  readFightRecord,
  setEmojiStatusPreference,
} from './service';

export const fightRecordRouter = Router();

fightRecordRouter.use(requireAuth);

fightRecordRouter.get('/', (req, res) => {
  const userId = userIdOf(req);
  if (!fightRecordEnabledFor(userId)) {
    res.json({ fightRecord: null });
    return;
  }
  res.json({ fightRecord: readFightRecord(userId, todayFor(req)) });
});

/**
 * 204 whether or not anything was marked: an id that is not the caller's, or
 * a feature that is off for them, has nothing to acknowledge, and saying so
 * would only tell a prober which award ids exist.
 */
fightRecordRouter.post('/ack', (req, res) => {
  const { awardId } = ackBeltSchema.parse(req.body);
  const userId = userIdOf(req);
  if (fightRecordEnabledFor(userId)) acknowledgeBelt(userId, awardId);
  res.status(204).end();
});

fightRecordRouter.put(
  '/emoji-status',
  asyncHandler(async (req, res) => {
    const { enabled } = emojiStatusPreferenceSchema.parse(req.body);
    const userId = userIdOf(req);
    if (!fightRecordEnabledFor(userId)) {
      throw new AppError('FORBIDDEN', 'Fight Record is not available for this account.');
    }
    res.json({ emojiStatus: await setEmojiStatusPreference(userId, enabled, todayFor(req)) });
  }),
);
