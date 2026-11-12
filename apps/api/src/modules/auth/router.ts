/**
 * /auth - register, login, refresh (rotation + family revocation), logout,
 * Telegram launch-data sign-in (AQF-07 §2).
 */
import { Router } from 'express';
import {
  emailConfirmSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshSchema,
  registerSchema,
  telegramAuthSchema,
} from '@aquazerofit/shared';
import { z } from 'zod';
import { verifyAccess } from '../../platform/auth';
import { clientIpForRateLimit } from '../../platform/clientIp';
import { assertHuman, captchaConfig } from '../../platform/botProtection';
import { asyncHandler } from '../../platform/errors';
import {
  confirmEmailClaim,
  confirmPasswordReset,
  login,
  logout,
  refresh,
  register,
  requestPasswordReset,
  telegramAuth,
  tokensFor,
} from './service';
import { ensureUserFromFirebase, firebaseSession, type FirebaseIdentity } from './firebaseUsers';
import { verifyFirebaseIdToken, isFirebaseAdminConfigured } from '../../platform/firebaseAdmin';
import {
  clearRefreshCookie,
  resolveRefreshToken,
  setRefreshCookie,
} from './cookies';
import { AppError } from '../../platform/errors';
import { mfaRouter } from '../mfa/router';
import type { AuthResponse } from '@aquazerofit/shared';

export const authRouter = Router();

/**
 * Second-factor enrolment and step-up (/auth/mfa/*). Mounted here rather than
 * as its own top-level module so it inherits the strict /auth rate lane, which
 * is the correct lane for a surface where codes are submitted.
 */
authRouter.use('/mfa', mfaRouter);

/**
 * Bot-protection discovery. Public and unauthenticated by necessity - it is
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
  sendAuth(req, res, telegramAuth(initData, clientIpForRateLimit(req)));
});

/** Verify the `Authorization: Bearer <Firebase ID token>` header or throw. */
async function firebaseIdentityFrom(req: { headers: { authorization?: string } }): Promise<FirebaseIdentity> {
  if (!isFirebaseAdminConfigured()) {
    throw new AppError('AUTH_INVALID', 'Firebase Auth is not configured on this server');
  }
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('AUTH_REQUIRED', 'Firebase ID token required');
  }
  const identity = await verifyFirebaseIdToken(header.slice(7)).catch((err: unknown) => {
    // A token the verifier rejects (expired, revoked, forged, disabled user)
    // is the caller's problem: 401. Anything else, such as a broken server
    // credential ('app/...' or 'auth/internal-error'), stays a logged 500.
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('auth/') && code !== 'auth/internal-error') {
      return null;
    }
    throw err;
  });
  if (!identity) {
    throw new AppError('AUTH_INVALID', 'Firebase ID token required');
  }
  return identity;
}

/**
 * Web Firebase Auth session bootstrap. Client signs in with the Firebase SDK,
 * then POSTs here with Authorization: Bearer <ID_TOKEN>. Hydrates / links the
 * local User document and returns { user }. Protected API calls continue to
 * send the same Firebase ID token; this route only materialises the public
 * user envelope for the client cache.
 */
authRouter.post(
  '/firebase/session',
  asyncHandler(async (req, res) => {
    res.json(firebaseSession(await firebaseIdentityFrom(req), req.ip));
  }),
);

/**
 * Native Firebase sign-in (Android "Continue with Google"). Same identity
 * rules as /firebase/session (ensureUserFromFirebase), but answers with the
 * access + refresh pair password login returns, so the native client keeps one
 * session model: rotated refresh tokens, family revocation, purge on account
 * switch. The Firebase ID token is spent here and never stored by the client.
 */
authRouter.post(
  '/firebase/token',
  asyncHandler(async (req, res) => {
    const user = ensureUserFromFirebase(await firebaseIdentityFrom(req), req.ip);
    sendAuth(req, res, tokensFor(user));
  }),
);

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

// The link in the confirmation mail from POST /me/credentials. Unauthenticated:
// the mail may be opened on another device. The token is the proof.
authRouter.post('/email-confirm', (req, res) => {
  const { token } = emailConfirmSchema.parse(req.body);
  confirmEmailClaim(token, clientIpForRateLimit(req));
  res.json({ message: 'Email confirmed. Sign in with your email and password.' });
});

authRouter.post(
  '/password-reset/confirm',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = passwordResetConfirmSchema.parse(req.body);
    await confirmPasswordReset(token, newPassword, req.ip);
    res.json({ message: 'Password updated. Sign in with your new password.' });
  }),
);
