/**
 * /me — profile, targets, consents, telegram link, export, deletion.
 */
import { Router } from 'express';
import {
  CREDIT_COSTS,
  dailyCreditsFor,
  maxBankedCreditsFor,
  consentsSchema,
  profileSchema,
  setCredentialsSchema,
  telegramAuthSchema,
  updateIdentitySchema,
  type User,
} from '@aquazerofit/shared';
import { creditLedger } from '../ai/creditLedger';
import { PREMIUM_LANES } from '../ai/tierPolicy';
import { asyncHandler } from '../ai/util';
import { requireAuth, userIdOf } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import { getStore } from '../../platform/store';
import { setCredentials } from '../auth/service';
import { validateTelegramInitData } from '../auth/telegram';
import { memoryRouter } from '../memory/router';
import { effectiveTier } from '../billing/entitlements';
import {
  exportUserData,
  getConsents,
  getProfile,
  getTargets,
  linkTelegram,
  requestDeletion,
  saveConsents,
  saveProfile,
  toPublicUser,
  updateIdentity,
} from './service';

export const meRouter = Router();

meRouter.use(requireAuth);

// AI memory lives under /me/memory (its own module + consent gate, memory Phase 1).
meRouter.use('/memory', memoryRouter);

/**
 * What this account can currently do, and how much of today's allowance is
 * left. Exposed so the plan surface can state the actual position rather than
 * marketing it — "you have used 38 of 50 credits today" is a fact the user can
 * act on, where "upgrade for more!" is not.
 *
 * Read-only by construction. There is deliberately no route here (or anywhere
 * client-reachable) that changes `tier`: a self-serve tier flip with no payment
 * behind it is an entitlement any caller could grant themselves.
 */
meRouter.get(
  '/entitlements',
  // Express 4 does not forward a rejected promise to the error middleware, so
  // an unwrapped async handler would leave the request hanging until timeout.
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const user = getStore().byId<User>('users', userId);
    if (!user) throw new AppError('NOT_FOUND', 'Account not found.');
    // The daily grant is lazy — it is appended by the first `reserve` of the
    // day, not by a scheduler. Reading the balance without it would report a
    // true-but-meaningless 0 to anyone who has not yet triggered an AI action,
    // which on this surface reads as "you have nothing" rather than "you have
    // not started". The call is idempotent per UTC day, so doing it here just
    // moves the same grant slightly earlier.
    const tier = effectiveTier(user);
    await creditLedger.grantDailyIfNeeded(userId, tier);
    const remaining = await creditLedger.balance(userId);
    res.json({
      tier,
      // Per tier, not the free constant: a premium account told it receives
      // the free allowance is being shown the plan it did not buy.
      dailyCredits: dailyCreditsFor(tier),
      creditsRemaining: remaining,
      // The carry-over ceiling. Sent because the daily top-up stops at it, so
      // a client that says "unspent credits carry over" without naming the
      // limit is describing behaviour the server no longer has.
      maxBankedCredits: maxBankedCreditsFor(tier),
      costs: CREDIT_COSTS,
      premiumLanes: PREMIUM_LANES,
    });
  }),
);

meRouter.get('/profile', (req, res) => {
  const userId = userIdOf(req);
  const profile = getProfile(userId) ?? null;
  res.json({ profile });
});

meRouter.put('/profile', (req, res) => {
  const input = profileSchema.parse(req.body);
  const { profile, targets } = saveProfile(userIdOf(req), input);
  res.json({ profile, targets });
});

meRouter.get('/targets', (req, res) => {
  res.json({ targets: getTargets(userIdOf(req)) });
});

meRouter.post('/link-telegram', (req, res) => {
  const { initData } = telegramAuthSchema.parse(req.body);
  const tgUser = validateTelegramInitData(initData);
  const user = linkTelegram(userIdOf(req), tgUser.id, tgUser.username);
  res.json({ user });
});

// First-time email + password for a Telegram-provisioned account, so it can
// sign in on the web (mirror of link-telegram; one-shot, see setCredentials).
meRouter.post(
  '/credentials',
  asyncHandler(async (req, res) => {
    const input = setCredentialsSchema.parse(req.body);
    const user = await setCredentials(userIdOf(req), input, req.ip);
    res.json({ user });
  }),
);

meRouter.get('/consents', (req, res) => {
  res.json({ consents: getConsents(userIdOf(req)) });
});

meRouter.put('/consents', (req, res) => {
  const input = consentsSchema.parse(req.body);
  res.json({ consents: saveConsents(userIdOf(req), input) });
});

meRouter.get('/export', (req, res) => {
  const bundle = exportUserData(userIdOf(req));
  res.setHeader('Content-Disposition', 'attachment; filename="aquazerofit-export.json"');
  res.json(bundle);
});

meRouter.get('/', (req, res) => {
  const user = getStore().byId<User>('users', userIdOf(req));
  if (!user) throw new AppError('NOT_FOUND', 'Account not found');
  res.json({ user: toPublicUser(user) });
});

// Identity mutation: displayName was previously set only at registration;
// timezone is optional IANA (loose Intl-backed validation in the shared schema).
meRouter.patch('/', (req, res) => {
  const input = updateIdentitySchema.parse(req.body);
  res.json({ user: updateIdentity(userIdOf(req), input) });
});

meRouter.delete('/', (req, res) => {
  const result = requestDeletion(userIdOf(req));
  res.json({
    ...result,
    message: result.purged
      ? 'Your account and data have been deleted.'
      : 'Deletion requested. Your account will be removed after the grace period; call again to delete immediately.',
  });
});
