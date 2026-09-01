/**
 * Small shared helpers for the AI-owned modules (ai, chat, vision, recommendations).
 * Kept local to avoid cross-team file conflicts; platform owns the global
 * express Request augmentation, so we read req.user through getUser().
 */
import crypto from 'node:crypto';
import { computeTargets } from '../me/targets';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../../platform/errors';
import { store } from '../../platform/store';
import {
  ACTIVITY_FACTORS,
  FAT_KCAL_FRACTION_MIN,
  KCAL_FLOOR,
  KCAL_PER_G,
  KCAL_PER_KG,
  PROTEIN_G_PER_KG,
  WATER_ML_MAX,
  WATER_ML_MIN,
  WATER_ML_PER_KG,
  WEEKLY_LOSS_FRACTION,
} from '@aquazerofit/shared';
import type { UserRole, UserTier, WellnessProfile } from '@aquazerofit/shared';

export interface RequestUser {
  id: string;
  role: UserRole;
  tier: UserTier;
}

/** requireAuth (platform/auth) sets req.user; we read it defensively. */
export function getUser(req: Request): RequestUser {
  const user = (req as unknown as { user?: RequestUser }).user;
  if (!user || typeof user.id !== 'string') {
    throw new AppError('AUTH_REQUIRED', 'Authentication required.');
  }
  return user;
}

/** Express 4 does not catch async errors — every async route goes through this. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Ids for chat sessions, messages and meal-log rows.
 *
 * Unguessable: crypto.randomUUID, not a timestamp plus a counter. The previous
 * shape was Date.now() in base36, a module-level sequence and four base36
 * characters of Math.random() — roughly twenty bits of non-cryptographic
 * entropy hung off a value the caller already knows, with the counter leaking
 * how much traffic the process had served. These ids address rows a request
 * can name, so they must not be enumerable.
 */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Store read helpers. The JsonStore contract is
// container(name).all()/byId(id)/where(pred)/upsert(doc)/delete(id); methods
// may be sync or async, so every call site awaits (awaiting a plain value is
// a no-op).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function whereDocs<T>(container: string, pred: (d: any) => boolean): Promise<T[]> {
  const c = store.container(container) as unknown as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where(p: (d: any) => boolean): T[] | Promise<T[]>;
  };
  const result = await c.where(pred);
  return Array.isArray(result) ? result : [];
}

export async function byIdDoc<T>(container: string, id: string): Promise<T | null> {
  const c = store.container(container) as unknown as {
    byId(id: string): T | null | undefined | Promise<T | null | undefined>;
  };
  const result = await c.byId(id);
  return (result ?? null) as T | null;
}

export async function upsertDoc<T extends { id: string }>(container: string, doc: T): Promise<T> {
  const c = store.container(container) as unknown as {
    upsert(d: T): unknown;
  };
  await c.upsert(doc);
  return doc;
}

export async function deleteDoc(container: string, id: string): Promise<void> {
  const c = store.container(container) as unknown as {
    delete(id: string): unknown;
  };
  await c.delete(id);
}

// ---------------------------------------------------------------------------
// Deterministic target derivation (fallback duplicate of TargetCalculator —
// deliberately duplicated per the team boundary so the AI lane never imports
// another team's service; formulas come from shared constants, AQF-09 §2.2).
// ---------------------------------------------------------------------------

export interface TargetsLike {
  kcalTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
}

const DEFAULT_TARGETS: TargetsLike = {
  kcalTarget: 2000,
  proteinG: 110,
  carbsG: 230,
  fatG: 65,
  waterMl: 2000,
};

/**
 * The coach's view of a user's targets — the SAME numbers the dashboard shows.
 *
 * This used to be a second implementation of the formula in
 * `modules/me/targets.ts`, and the two had drifted three ways: 'unspecified'
 * took the female sex offset instead of its own, `lose` used the top of the
 * 0.5–1.0 %/wk band instead of the midpoint, and `gain` was a flat +250
 * instead of the computed surplus. Up to ~220 kcal/day apart.
 *
 * That divergence was not cosmetic. `readTargets` feeds coach chat, batch
 * insights and recommendations, so the coach could tell a user to eat one
 * number while their own dashboard showed another — and the coach is the
 * surface people are most likely to believe. Delegating means there is one
 * formula, and `FORMULA_VERSION` continues to describe it honestly.
 *
 * `computeTargets` returns a superset of [TargetsLike]; the extra fields
 * (bmr, tdee, clamp reason, formula version) are for the profile screen and
 * are dropped here on purpose rather than leaked into model context.
 */
export function deriveTargetsFromProfile(profile: WellnessProfile): TargetsLike {
  const targets = computeTargets(profile);
  return {
    kcalTarget: targets.kcalTarget,
    proteinG: targets.proteinG,
    carbsG: targets.carbsG,
    fatG: targets.fatG,
    waterMl: targets.waterMl,
  };
}


export async function readProfile(userId: string): Promise<WellnessProfile | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches = await whereDocs<WellnessProfile>('profiles', (d: any) => {
    return d?.userId === userId && typeof d?.weightKg === 'number' && typeof d?.goal === 'string';
  });
  return matches[0] ?? null;
}

/** Prefer stored DerivedTargets; fall back to a local derivation; then to defaults. */
export async function readTargets(userId: string): Promise<TargetsLike> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stored = await whereDocs<TargetsLike & { userId: string; formulaVersion?: string }>(
    'profiles',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (d: any) => d?.userId === userId && typeof d?.kcalTarget === 'number' && typeof d?.formulaVersion === 'string',
  );
  if (stored[0]) {
    const t = stored[0];
    return {
      kcalTarget: t.kcalTarget,
      proteinG: t.proteinG,
      carbsG: t.carbsG,
      fatG: t.fatG,
      waterMl: t.waterMl,
    };
  }
  const profile = await readProfile(userId);
  if (profile) return deriveTargetsFromProfile(profile);
  return { ...DEFAULT_TARGETS };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
