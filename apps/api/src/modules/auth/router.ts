/**
 * /auth — register, login, refresh (rotation + family revocation), logout,
 * Telegram launch-data sign-in (AQF-07 §2).
 */
import { Router } from 'express';
import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshSchema,
  registerSchema,
  telegramAuthSchema,
} from '@aquazerofit/shared';
import { z } from 'zod';
import { verifyAccess } from '../../platform/auth';
import { asyncHandler } from '../../platform/errors';
import {
  confirmPasswordReset,
  login,
  logout,
  refresh,
  register,
  requestPasswordReset,
  telegramAuth,
} from './service';

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    res.status(201).json(await register(input, req.ip));
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    res.json(await login(input, req.ip));
  }),
);

authRouter.post('/refresh', (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  res.json(refresh(refreshToken, req.ip));
});

const logoutSchema = z.object({ refreshToken: z.string().min(10).optional() });

authRouter.post('/logout', (req, res) => {
  const { refreshToken } = logoutSchema.parse(req.body ?? {});
  // Best-effort attribution: a presented bearer token lets the audit event
  // name the user, but logout always succeeds with 204 either way.
  let userId: string | undefined;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      userId = verifyAccess(header.slice(7)).id;
    } catch {
      /* invalid/expired token: stay unattributed */
    }
  }
  logout(refreshToken, userId, req.ip);
  res.status(204).end();
});

authRouter.post('/telegram', (req, res) => {
  const { initData } = telegramAuthSchema.parse(req.body);
  res.json(telegramAuth(initData, req.ip));
});

// ---------------------------------------------------------------------------
// Password reset (frozen contract). Both endpoints sit on the strict /auth
// rate lane. The request endpoint is enumeration-safe: always 202 with the
// same message; when EXPOSE_DEV_TOKENS=true in dev the token is also returned as devToken.
// ---------------------------------------------------------------------------

authRouter.post('/password-reset/request', (req, res) => {
  const { email } = passwordResetRequestSchema.parse(req.body);
  const { devToken } = requestPasswordReset(email, req.ip);
  res.status(202).json({
    message: 'If that account exists, reset instructions have been issued.',
    ...(devToken ? { devToken } : {}),
  });
});

authRouter.post(
  '/password-reset/confirm',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = passwordResetConfirmSchema.parse(req.body);
    await confirmPasswordReset(token, newPassword, req.ip);
    res.json({ message: 'Password updated. Sign in with your new password.' });
  }),
);
