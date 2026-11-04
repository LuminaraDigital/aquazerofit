/**
 * Fight Camp routes (AZF-P1 §5.3). Every route is behind requireFeature:
 * a feature that is off for the caller answers 404.
 *
 *   /fight-camp  season enrolment and, from S9, the season recap
 *   /grace       the Cut Man bank
 *   /squads      squads: peek (public), current, create, join, leave,
 *                settings, Squad Corner, Telegram invite messages
 *   /cheers      send, inbox, mark seen, and the bot-nudge setting
 *   /share       Share Kit links, the public landing redirect, attribution
 */
import { Router } from 'express';
import {
  createSquadInputSchema,
  enrolInputSchema,
  joinSquadInputSchema,
  squadCodeSchema,
  squadCornerInputSchema,
  cheersSeenInputSchema,
  createShareLinkInputSchema,
  shareAttributionInputSchema,
  shareCodeSchema,
  nudgeSettingsInputSchema,
  sendCheerInputSchema,
  updateMySquadSettingsSchema,
  createGiftInvoiceInputSchema,
} from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { config } from '../../platform/config';
import { AppError, asyncHandler } from '../../platform/errors';
import { timezoneOf, todayFor } from '../../platform/dates';
import { logError } from '../../platform/telemetry';
import { enrol } from './enrolment';
import { seasonRecap } from './recap';
import { requireAdult, requireFeature, requireFeatureSwitch } from './flags';
import { prepareSquadInvite, squadCorner } from './corner';
import { cheerInbox, decodeCursor, markCheersSeen, sendCheer } from './cheers';
import { syncEarlyCheers } from './earlyCheers';
import { attributeSquadJoin, claimShareAttribution, isPreviewAgent, landOn, shareLinkFor, shareSummary } from './share';
import { createGiftInvoice } from './gifts';
import { fightCampConfig } from '../../platform/fightCampConfig';
import { engageRepo } from './repo';
import { syncGrace } from './grace';
import {
  createSquad,
  currentSquad,
  joinSquadByCode,
  leaveIfNoLongerAdult,
  leaveSquad,
  peekSquad,
  removeMember,
  rotateInviteCode,
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

/** A finished season's recap: effort only. 404 for the current season or one with no activity. */
fightCampRouter.get(
  '/recap/:seasonNumber',
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireFeature('enrol', userId);
    const recap = await seasonRecap(userId, Number(req.params.seasonNumber), todayFor(req));
    if (!recap) throw new AppError('NOT_FOUND', 'There is no recap for that season.');
    res.json({ recap });
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
    const today = todayFor(req);
    await leaveIfNoLongerAdult(userId, today);
    requireAdult(userId);
    res.json({ squad: await currentSquad(userId, today) });
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
    const userId = userIdOf(req);
    const squad = await joinSquadByCode(userId, code, todayFor(req), via);
    // A new account that came in through a squad invite counts for that
    // squad. The join has happened: an attribution fault is logged, not returned.
    if (via === 'link') {
      await attributeSquadJoin(userId, squad.id, req.query.surface === 'tma' ? 'tma' : 'web').catch((err: unknown) =>
        logError(err, { route: 'squads.join.attribution' }),
      );
    }
    res.json({ squad });
  }),
);

squadsRouter.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    await leaveSquad(userIdOf(req), String(req.params.id));
    res.status(204).end();
  }),
);

/** Owner only: a fresh invite code; old links stop working. */
squadsRouter.post(
  '/:id/rotate-code',
  asyncHandler(async (req, res) => {
    res.json({ squad: await rotateInviteCode(userIdOf(req), String(req.params.id), todayFor(req)) });
  }),
);

/** Owner only: take a member out. 204, or 404 for a ref not in this squad. */
squadsRouter.post(
  '/:id/members/:ref/remove',
  asyncHandler(async (req, res) => {
    await removeMember(userIdOf(req), String(req.params.id), String(req.params.ref));
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

export const cheersRouter = Router();

cheersRouter.use(requireAuth);

cheersRouter.use((req, _res, next) => {
  const userId = userIdOf(req);
  requireFeature('cheers', userId);
  requireAdult(userId);
  next();
});

/** 201 with the cheer; 409 cheer_already_today; 403 not_squad_mate. 30 a minute (rateLimiter). */
cheersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = sendCheerInputSchema.parse(req.body);
    res.status(201).json({ cheer: await sendCheer(userIdOf(req), input, todayFor(req)) });
  }),
);

/** The last thirty days, newest first. `cursor` is the previous page's nextCursor. */
cheersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const today = todayFor(req);
    await syncEarlyCheers(userId, today, timezoneOf(req));
    res.json(await cheerInbox(userId, decodeCursor(req.query.cursor), today));
  }),
);

cheersRouter.post(
  '/seen',
  asyncHandler(async (req, res) => {
    const { ids } = cheersSeenInputSchema.parse(req.body);
    await markCheersSeen(userIdOf(req), ids);
    res.status(204).end();
  }),
);

/** Bot messages for cheers: on unless switched off. The master switch is the reminders consent. */
cheersRouter.get(
  '/nudges',
  asyncHandler(async (req, res) => {
    const settings = await engageRepo().nudgeSettings(userIdOf(req));
    res.json({ nudges: { cheer: settings.cheer !== false } });
  }),
);

cheersRouter.put(
  '/nudges',
  asyncHandler(async (req, res) => {
    const { cheer } = nudgeSettingsInputSchema.parse(req.body);
    await engageRepo().setNudgeSetting(userIdOf(req), 'cheer', cheer, new Date().toISOString());
    res.json({ nudges: { cheer } });
  }),
);

export const shareRouter = Router();

/**
 * Public: someone opened a share link. Web visitors are redirected to the
 * landing page with `?ref=sh_<code>` (nothing about the sharer); the Mini
 * App reports its own launch with `?surface=tma` and gets 204. A code that
 * matches nothing, or a Share Kit that is switched off, still lands on the
 * home page rather than an error: the link is already out in the world.
 */
shareRouter.get(
  '/r/:code',
  asyncHandler(async (req, res) => {
    const surface = req.query.surface === 'tma' ? 'tma' : 'web';
    const code = shareCodeSchema.safeParse(req.params.code);
    let target = `${config.appPublicUrl}/`;
    try {
      requireFeatureSwitch('shareKit');
      // The Mini App's own beacon is a launch; on the web, a preview fetcher is not a visit.
      const count = surface === 'tma' || !isPreviewAgent(req.get('user-agent'));
      if (code.success) target = await landOn(code.data, surface, count);
    } catch {
      // Off, or the lookup failed: home, without a ref.
    }
    if (surface === 'tma') {
      res.status(204).end();
      return;
    }
    res.redirect(302, target);
  }),
);

shareRouter.use(requireAuth);

shareRouter.use((req, _res, next) => {
  const userId = userIdOf(req);
  requireFeature('shareKit', userId);
  next();
});

shareRouter.post(
  '/links',
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireAdult(userId);
    const { kind } = createShareLinkInputSchema.parse(req.body);
    res.json({ shareLink: await shareLinkFor(userId, kind, todayFor(req)) });
  }),
);

/** 204 whatever happened: the answer says nothing about codes or accounts. */
shareRouter.post(
  '/attributions',
  asyncHandler(async (req, res) => {
    const { code, surface } = shareAttributionInputSchema.parse(req.body);
    await claimShareAttribution(userIdOf(req), code, surface);
    res.status(204).end();
  }),
);

shareRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireAdult(userId);
    res.json({ summary: await shareSummary(userId, todayFor(req)) });
  }),
);

// ---------- gifts (Epic G, optional) ----------

export const giftsRouter = Router();

giftsRouter.use(requireAuth);

/** Off, or no price set: gifting does not exist, so it answers like nothing is here. */
giftsRouter.use((req, _res, next) => {
  requireFeature('gifting', userIdOf(req));
  if (fightCampConfig.giftPremium7dStars === null) throw new AppError('NOT_FOUND', 'Resource not found');
  next();
});

/** 201 with the Stars invoice link the Mini App opens; 403 gift_not_eligible, 409 recipient_has_premium. */
giftsRouter.post(
  '/premium/invoice',
  asyncHandler(async (req, res) => {
    const { to } = createGiftInvoiceInputSchema.parse(req.body);
    res.status(201).json(await createGiftInvoice(userIdOf(req), to));
  }),
);
