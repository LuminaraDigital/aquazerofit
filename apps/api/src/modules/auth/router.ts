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
import { assertHuman, captchaConfig } from '../../platform/botProtection';
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
import {
  clearRefreshCookie,
  resolveRefreshToken,
  setRefreshCookie,
} from './cookies';
import { AppError } from '../../platform/errors';
import type { AuthResponse } from '@aquazerofit/shared';

export const authRouter = Router();

/**
 * Bot-protection discovery. Public and unauthenticated by necessity — it is
 * read before anyone has an account, and the site key it returns is public by
 * design (Cloudflare scopes it to the hostnames on the widget).
 *
 * Serving the key here rather than baking it into the web bundle is what lets
 * the same build run challenged in production and unchallenged offline, and
 * lets the key rotate without a rebuild.
 */
authRouter.get('/captcha', (_req, res) => {
  res.json(captchaConfig());
});

// Bot protection guards the two routes a botnet actually wants: register mints
// accounts and AI credits, password-reset/request sends mail to an address the
// caller chose. Both run the challenge BEFORE the zod parse so a flood of
// malformed bodies is turned away by Cloudflare rather than by this process.
// No-op unless both Turnstile keys are set (dev, tests, offline demo).
/** Respond with tokens JSON + the httpOnly refresh cookie (FE-01). */
function sendAuth(req: Parameters<typeof setRefreshCookie>[0], res: Parameters<typeof setRefreshCookie>[1], tokens: AuthResponse, status = 200): void {
  setRefreshCookie(req, res, tokens.refreshToken);
  res.status(status).json(tokens);
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    await assertHuman(req, 'register');
    const input = registerSchema.parse(req.body);
    sendAuth(req, res, await register(input, req.ip), 201);
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    sendAuth(req, res, await login(input, req.ip));
  }),
);

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body ?? {});
  const token = resolveRefreshToken(req, refreshToken);
  if (!token) throw new AppError('AUTH_INVALID', 'Refresh token required');
  sendAuth(req, res, await refresh(token, req.ip));
}));

const logoutSchema = z.object({ refreshToken: z.string().min(10).optional() });

authRouter.post('/logout', (req, res) => {
  const { refreshToken } = logoutSchema.parse(req.body ?? {});
  // Body token wins for back-compat; httpOnly cookie is the fallback (FE-01).
  const token = resolveRefreshToken(req, refreshToken);
  // Clear the cookie regardless of whether revocation finds the token.
  clearRefreshCookie(req, res);
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
  logout(token, userId, req.ip);
  res.status(204).end();
});

authRouter.post('/telegram', (req, res) => {
  const { initData } = telegramAuthSchema.parse(req.body);
  sendAuth(req, res, telegramAuth(initData, req.ip));
});

// ---------------------------------------------------------------------------
// Password reset (frozen contract). Both endpoints sit on the strict /auth
// rate lane. The request endpoint is enumeration-safe: always 202 with the
// same message; when EXPOSE_DEV_TOKENS=true in dev the token is also returned as devToken.
// ---------------------------------------------------------------------------

authRouter.post(
  '/password-reset/request',
  asyncHandler(async (req, res) => {
    await assertHuman(req, 'password-reset');
    const { email } = passwordResetRequestSchema.parse(req.body);
    const { devToken } = requestPasswordReset(email, req.ip);
    res.status(202).json({
      message: 'If that account exists, reset instructions have been issued.',
      ...(devToken ? { devToken } : {}),
    });
  }),
);

authRouter.post(
  '/password-reset/confirm',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = passwordResetConfirmSchema.parse(req.body);
    await confirmPasswordReset(token, newPassword, req.ip);
    res.json({ message: 'Password updated. Sign in with your new password.' });
  }),
);
