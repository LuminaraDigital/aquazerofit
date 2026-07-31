/**
 * Token service + auth middleware (AQF-09 §1 auth module, AQF-07 §2):
 * short-lived JWT access tokens (15 min) and single-use rotating refresh
 * tokens grouped into families. Reuse of a consumed/revoked refresh token
 * revokes the whole family (stolen-token containment).
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { User, UserRole, UserTier } from '@aquazerofit/shared';
import { config } from './config';
import { AppError } from './errors';
import { getStore, newId } from './store';

export interface AuthUser {
  id: string;
  role: UserRole;
  tier: UserTier;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface RefreshTokenRecord {
  id: string;
  type: 'refreshToken';
  /**
   * sha256 hex of the opaque token. Only the hash is stored at rest; the raw
   * value is returned to the client exactly once at issue time, so a leaked
   * store cannot be replayed as live sessions.
   */
  tokenHash: string;
  userId: string;
  familyId: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// ----- access tokens -----

export function signAccess(user: Pick<User, 'id' | 'role' | 'tier'>): string {
  return jwt.sign({ role: user.role, tier: user.tier }, config.jwtAccessSecret, {
    subject: user.id,
    expiresIn: config.accessTtlSeconds,
  });
}

export function verifyAccess(token: string): AuthUser {
  try {
    // Pin the algorithm: without an allowlist a future config change that
    // introduces an asymmetric key opens the classic alg-confusion swap.
    const payload = jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw new AppError('AUTH_INVALID', 'Invalid access token');
    }
    return {
      id: payload.sub,
      role: (payload as { role?: UserRole }).role ?? 'user',
      tier: (payload as { tier?: UserTier }).tier ?? 'free',
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('AUTH_INVALID', 'Access token is invalid or expired');
  }
}

// ----- refresh tokens (rotation + family revocation) -----

function refreshExpiry(now: Date): string {
  return new Date(now.getTime() + config.refreshTtlDays * 24 * 3600 * 1000).toISOString();
}

/** sha256 hex digest used to store/look up refresh tokens without keeping raw values. */
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export interface IssuedRefresh {
  record: RefreshTokenRecord;
  /** Raw token for the client; never persisted. */
  token: string;
}

export function issueRefresh(userId: string, familyId?: string): IssuedRefresh {
  const now = new Date();
  const token = crypto.randomBytes(48).toString('base64url');
  const record: RefreshTokenRecord = {
    id: newId('rt'),
    type: 'refreshToken',
    tokenHash: sha256Hex(token),
    userId,
    familyId: familyId ?? newId('rtf'),
    expiresAt: refreshExpiry(now),
    usedAt: null,
    revokedAt: null,
    createdAt: now.toISOString(),
  };
  getStore().upsert('users', record);
  return { record, token };
}

export function revokeFamily(familyId: string): void {
  const store = getStore();
  const now = new Date().toISOString();
  for (const rec of store.where<RefreshTokenRecord>(
    'users',
    (d) => d.type === 'refreshToken' && d.familyId === familyId && d.revokedAt === null,
  )) {
    store.upsert('users', { ...rec, revokedAt: now });
  }
}

/**
 * Rotate a refresh token: single use. A second presentation of the same token
 * is treated as theft — the entire family is revoked (AQF-07 §2.1).
 *
 * Concurrency note: rotation is read-modify-write, not an atomic CAS. The
 * JsonStore gives single-writer semantics in one process; Postgres or any
 * multi-instance store must compare-and-swap on tokenHash/usedAt (or use a
 * row-level lock) so two concurrent refresh requests cannot both succeed.
 */
export function rotateRefresh(token: string): IssuedRefresh & { userId: string } {
  const store = getStore();
  const tokenHash = sha256Hex(token);
  const existing = store.findOne<RefreshTokenRecord>(
    'users',
    (d) => d.type === 'refreshToken' && d.tokenHash === tokenHash,
  );
  if (!existing) throw new AppError('AUTH_INVALID', 'Refresh token not recognised');
  if (existing.usedAt !== null || existing.revokedAt !== null) {
    revokeFamily(existing.familyId);
    throw new AppError('AUTH_INVALID', 'Refresh token reuse detected; session revoked');
  }
  if (new Date(existing.expiresAt).getTime() < Date.now()) {
    throw new AppError('AUTH_INVALID', 'Refresh token expired');
  }
  store.upsert('users', { ...existing, usedAt: new Date().toISOString() });
  const next = issueRefresh(existing.userId, existing.familyId);
  return { ...next, userId: existing.userId };
}

export function revokeFamilyByToken(token: string): void {
  const tokenHash = sha256Hex(token);
  const existing = getStore().findOne<RefreshTokenRecord>(
    'users',
    (d) => d.type === 'refreshToken' && d.tokenHash === tokenHash,
  );
  if (existing) revokeFamily(existing.familyId);
}

export function revokeAllForUser(userId: string): void {
  const store = getStore();
  const now = new Date().toISOString();
  for (const rec of store.where<RefreshTokenRecord>(
    'users',
    (d) => d.type === 'refreshToken' && d.userId === userId && d.revokedAt === null,
  )) {
    store.upsert('users', { ...rec, revokedAt: now });
  }
}

// ----- middleware -----

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('AUTH_REQUIRED', 'Authentication required'));
    return;
  }
  try {
    const claims = verifyAccess(header.slice(7));
    const user = getStore().byId<User>('users', claims.id);
    if (!user || (user as { type?: string }).type === 'refreshToken') {
      throw new AppError('AUTH_INVALID', 'Account no longer exists');
    }
    // Role/tier reflect the current user record, not stale token claims.
    req.user = { id: user.id, role: user.role, tier: user.tier };
    next();
  } catch (err) {
    next(err);
  }
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new AppError('AUTH_REQUIRED', 'Authentication required'));
    return;
  }
  if (req.user.role !== 'admin') {
    next(new AppError('FORBIDDEN', 'Administrator access required'));
    return;
  }
  next();
};

/** Convenience: the authenticated user id (requireAuth must have run). */
export function userIdOf(req: Request): string {
  if (!req.user) throw new AppError('AUTH_REQUIRED', 'Authentication required');
  return req.user.id;
}
