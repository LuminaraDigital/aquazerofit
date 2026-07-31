/**
 * /me — profile, targets, consents, telegram link, export, deletion.
 */
import { Router } from 'express';
import {
  consentsSchema,
  profileSchema,
  telegramAuthSchema,
  updateIdentitySchema,
  type User,
} from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import { getStore } from '../../platform/store';
import { validateTelegramInitData } from '../auth/telegram';
import { memoryRouter } from '../memory/router';
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
