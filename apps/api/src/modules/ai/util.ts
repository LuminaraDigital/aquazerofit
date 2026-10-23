/**
 * Small shared helpers for the AI-owned modules (ai, chat, vision, recommendations).
 * Kept local to avoid cross-team file conflicts; platform owns the global
 * express Request augmentation, so we read req.user through getUser().
 *
 * Date helpers and asyncHandler live in platform (SSOT); re-exported here so
 * existing AI-lane imports keep working.
 */
import crypto from 'node:crypto';
import { computeTargets } from '../me/targets';
import type { Request } from 'express';
import { AppError, asyncHandler } from '../../platform/errors';
import { localToday } from '../../platform/dates';
import { store } from '../../platform/store';
import type { UserRole, UserTier, WellnessProfile } from '@aquazerofit/shared';

export { asyncHandler };
export { localToday };

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

/**
 * Ids for chat sessions, messages and meal-log rows.
 *
 * Unguessable: crypto.randomUUID, not a timestamp plus a counter. Prefix uses
 * underscore (`cm_…`) so these stay distinct from store.newId's hyphen form.
 */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
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
 * The coach's view of a user's targets - the SAME numbers the dashboard shows.
 * Delegates to `computeTargets` so coach chat and the profile screen cannot drift.
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
