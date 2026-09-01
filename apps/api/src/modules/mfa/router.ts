/**
 * /auth/mfa — TOTP enrolment and the admin step-up challenge.
 *
 * Mounted under the auth router rather than as a top-level module so it lands
 * on the strict /auth rate lane (platform/rateLimiter: 10/min per IP), which is
 * the right lane for a credential-guessing surface. The per-user lockout in
 * ./service is the real brake — the IP lane is disabled under test and does not
 * distinguish accounts — but the two stack.
 *
 * Every route requires an authenticated session: MFA here is a SECOND factor
 * layered on the existing password session, not a login step of its own.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { User } from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import { getStore } from '../../platform/store';
import {
  accessTokenOf,
  confirmEnrolment,
  findFreshStepUp,
  isMfaActive,
  mfaStatus,
  startEnrolment,
  verifyStepUp,
} from './service';
import { MFA_CHALLENGE_PATH } from './middleware';

export const mfaRouter = Router();
mfaRouter.use(requireAuth);

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

/**
 * Both a TOTP code and a recovery code are accepted, but exactly one of them:
 * a body carrying both would otherwise let a caller spend a guess on each per
 * request, which halves the cost of the lockout.
 */
const challengeSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/).optional(),
    recoveryCode: z.string().trim().min(8).max(40).optional(),
  })
  .refine((v) => (v.code === undefined) !== (v.recoveryCode === undefined), {
    message: 'Provide either code or recoveryCode, not both',
  });

/** Enrolment state. Never contains a secret. */
mfaRouter.get('/status', (req, res) => {
  res.json({ mfa: mfaStatus(userIdOf(req), accessTokenOf(req)) });
});

/**
 * Step 1 of 2: issue a pending secret. The response is the only place the
 * secret ever appears, and after confirmation there is no route that returns
 * it again.
 *
 * Re-enrolling over an ACTIVE factor demands a fresh step-up first, so a
 * stolen access token cannot swap the second factor for the attacker's own.
 */
mfaRouter.post('/enroll', (req, res) => {
  const userId = userIdOf(req);
  const user = getStore().byId<User>('users', userId);
  if (!user) throw new AppError('NOT_FOUND', 'Account not found');
  if (isMfaActive(userId)) {
    const token = accessTokenOf(req);
    if (!token || !findFreshStepUp(userId, token)) {
      throw new AppError('FORBIDDEN', 'Re-verify with your current authenticator first.', {
        reason: 'mfa_step_up_required',
        challengePath: MFA_CHALLENGE_PATH,
      });
    }
  }
  res.status(201).json({ enrolment: startEnrolment({ id: user.id, email: user.email }) });
});

/**
 * Step 2 of 2: prove possession, activate, and hand back the recovery codes
 * ONCE. They are stored hashed and are not retrievable afterwards.
 */
mfaRouter.post('/confirm', (req, res) => {
  const userId = userIdOf(req);
  const { code } = codeSchema.parse(req.body ?? {});
  const result = confirmEnrolment(userId, code);
  res.json({
    mfa: {
      confirmedAt: result.confirmedAt,
      // Shown exactly once. Store them now or lose them.
      recoveryCodes: result.recoveryCodes,
    },
  });
});

/** The step-up itself: opens the admin router for config.mfaStepUpTtlSeconds. */
mfaRouter.post('/challenge', (req, res) => {
  const userId = userIdOf(req);
  const token = accessTokenOf(req);
  if (!token) throw new AppError('AUTH_REQUIRED', 'Authentication required');
  const input = challengeSchema.parse(req.body ?? {});
  const result = verifyStepUp(userId, token, input, { ip: req.ip });
  res.json({ stepUp: result });
});
