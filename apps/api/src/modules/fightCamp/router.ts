/**
 * Fight Camp routes (AZF-P1 §5.3). Every route is behind requireFeature:
 * a feature that is off for the caller answers 404.
 *
 *   /fight-camp  season enrolment and, from S9, the season recap
 *   /grace       the Cut Man bank
 *   /squads      squads: peek (public), current, create, join, leave,
 *                settings, Squad Corner, Telegram invite messages
 */
import { Router } from 'express';
import {
  createSquadInputSchema,
  enrolInputSchema,
  joinSquadInputSchema,
  squadCodeSchema,
  squadCornerInputSchema,
  updateMySquadSettingsSchema,
} from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { asyncHandler } from '../../platform/errors';
import { todayFor } from '../../platform/dates';
import { enrol } from './enrolment';
import { requireFeature, requireFeatureSwitch } from './flags';
import { prepareSquadInvite, squadCorner } from './corner';
import { syncGrace } from './grace';
import {
  createSquad,
  currentSquad,
  joinSquadByCode,
  leaveSquad,
  peekSquad,
  requireSquadAdult,
  setShowStats,
} from './squads';

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

export const squadsRouter = Router();

/**
 * Public, for the invite landing before sign-in: name, size and season only.
 * An unknown, malformed, archived or past-season code all answer the same
 * null, so the route cannot be used to tell which codes once existed.
 * Rate-limited per IP in the anonymous lane (platform/rateLimiter).
 */
squadsRouter.get(
  '/peek/:code',
  asyncHandler(async (req, res) => {
    requireFeatureSwitch('squads');
    const code = squadCodeSchema.safeParse(req.params.code);
    res.json({ squad: code.success ? await peekSquad(code.data, todayFor(req)) : null });
  }),
);

squadsRouter.use(requireAuth);

squadsRouter.use((req, _res, next) => {
  requireFeature('squads', userIdOf(req));
  next();
});

squadsRouter.get(
  '/current',
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireSquadAdult(userId);
    res.json({ squad: await currentSquad(userId, todayFor(req)) });
  }),
);

squadsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name } = createSquadInputSchema.parse(req.body);
    res.status(201).json({ squad: await createSquad(userIdOf(req), name, todayFor(req)) });
  }),
);

squadsRouter.post(
  '/join',
  asyncHandler(async (req, res) => {
    const { code } = joinSquadInputSchema.parse(req.body);
    const via = req.query.via === 'link' ? 'link' : 'code';
    res.json({ squad: await joinSquadByCode(userIdOf(req), code, todayFor(req), via) });
  }),
);

squadsRouter.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    await leaveSquad(userIdOf(req), String(req.params.id));
    res.status(204).end();
  }),
);

squadsRouter.patch(
  '/:id/me',
  asyncHandler(async (req, res) => {
    const { showStats } = updateMySquadSettingsSchema.parse(req.body);
    res.json({ member: await setShowStats(userIdOf(req), String(req.params.id), showStats, todayFor(req)) });
  }),
);

/** Opened from a Telegram group: what that group's Squad Corner is, and act on it. */
squadsRouter.post(
  '/corner',
  asyncHandler(async (req, res) => {
    const input = squadCornerInputSchema.parse(req.body);
    res.json({ corner: await squadCorner(userIdOf(req), input, todayFor(req)) });
  }),
);

/** A prepared Telegram message for shareMessage, or null: fall back to a link. */
squadsRouter.post(
  '/:id/invite-message',
  asyncHandler(async (req, res) => {
    res.json({ preparedMessageId: await prepareSquadInvite(userIdOf(req), String(req.params.id)) });
  }),
);
