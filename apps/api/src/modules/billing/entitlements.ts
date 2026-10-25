/**
 * Paid entitlements  -  the one place an account becomes, or stops being,
 * premium.
 *
 * Before this module there was no such place. `UserTier` had a `'premium'`
 * member that nothing outside `data/seed.ts` ever wrote, and both clients said
 * so in their own comments; the Telegram Stars flow bought coach personas, not
 * tier. So the product could describe a paid plan and had no way to sell one.
 *
 * Deliberately RAIL-AGNOSTIC. Google Play, Stripe and Telegram Stars all
 * differ in how they authenticate a purchase and how they notify a renewal,
 * and none of that belongs here: each rail verifies its own receipt in its own
 * module and then calls `grantPremium` with a period and a provider reference.
 * That keeps the entitlement rules in one file instead of once per rail, which
 * is how the two drift apart.
 *
 * Two invariants, both learned from the Stars module next door:
 *
 *  1. **Grants are idempotent on the provider's own reference.** Every billing
 *     provider retries a notification it believes failed. A redelivered
 *     renewal must extend the period once, not once per delivery.
 *  2. **The period comes from the provider, never from the client.** A request
 *     that carries its own expiry date is a request that sets it to 2099.
 */
import { AppError } from '../../platform/errors';
import { getStore, newId } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import type { User, UserTier } from '@aquazerofit/shared';

/** Where an entitlement came from. Recorded for support and reconciliation. */
export type EntitlementSource = 'play' | 'stripe' | 'stars' | 'admin';

/**
 * Append-only record of every entitlement movement.
 *
 * The User document carries only the current period, which is a value that
 * gets overwritten. When a user asks why their premium ended  -  the question
 * support actually receives  -  the overwritten value is the answer, so it is
 * kept here rather than reconstructed from a payment dashboard.
 */
export interface EntitlementGrant {
  id: string;
  type: 'entitlementGrant';
  userId: string;
  source: EntitlementSource;
  /**
   * The provider's own identifier for this purchase or notification  -  Play's
   * purchase token, Stripe's subscription id, Telegram's charge id. Unique per
   * settled event; the idempotency key.
   */
  externalId: string;
  /**
   * The provider's identifier for the SUBSCRIPTION rather than for this event  - 
   * Play's purchase token, which survives every renewal under it.
   *
   * Separate from [externalId] because those two want opposite things.
   * `externalId` must differ per settled event or renewals deduplicate against
   * the original purchase and the period never moves; this must stay constant
   * or an incoming renewal notification cannot be traced back to the account
   * that owns it. Optional only for grants written before the split.
   */
  providerRef?: string;
  /**
   * End of the paid period this grant establishes for the account after the
   * fold below. Support reads this as "what the account became".
   */
  premiumUntil: string;
  /**
   * End of the period THIS source reported, before it was folded with any
   * other source. Absent on grants written before the split: those fall back
   * to `premiumUntil`, which for them is already the folded account end.
   */
  sourceUntil?: string;
  /**
   * On a revoke, the grant `externalId` this movement retires. Set for a
   * refund of one charge. Absent with `providerRef` set retires that whole
   * subscription. Absent for both retires every source (an admin revoke).
   */
  revokesExternalId?: string;
  /** What the account's period was before this grant, for reconstruction. */
  previousPremiumUntil: string | null;
  action: 'grant' | 'revoke';
  reason?: string;
  createdAt: string;
}

/**
 * Is this account premium right now?
 *
 * The single reader of tier in the product. `user.tier === 'premium'` covers
 * seeded and comped accounts, which never expire; `premiumUntil` covers
 * everyone who paid. Derived on read rather than written by a scheduler, so an
 * entitlement cannot outlive its payment because a cron did not run.
 */
export function effectiveTier(user: Pick<User, 'tier' | 'premiumUntil'>, now = new Date()): UserTier {
  if (user.tier === 'premium') return 'premium';
  const until = user.premiumUntil;
  if (!until) return 'free';
  const at = Date.parse(until);
  // An unparseable date is treated as no entitlement. Failing closed here is
  // the cheap direction: the user sees the free tier and contacts support,
  // where failing open would hand out premium on malformed data.
  if (!Number.isFinite(at)) return 'free';
  return at > now.getTime() ? 'premium' : 'free';
}

function grantsFor(externalId: string): EntitlementGrant[] {
  return getStore().where<EntitlementGrant>(
    'ledger',
    (d) => (d as { type?: string }).type === 'entitlementGrant' && (d as EntitlementGrant).externalId === externalId,
  );
}

function userOrThrow(userId: string): User {
  const user = getStore().byId<User>('users', userId);
  if (!user) throw new AppError('NOT_FOUND', 'Account not found.');
  return user;
}

export interface GrantInput {
  userId: string;
  source: EntitlementSource;
  externalId: string;
  /** Stable per-subscription reference; see [EntitlementGrant.providerRef]. */
  providerRef?: string;
  /** End of the paid period, as the PROVIDER reports it. */
  premiumUntil: string;
  reason?: string;
}

export interface GrantOutcome {
  status: 'granted' | 'duplicate';
  premiumUntil: string;
}

/**
 * How Stripe, Play and Stars share one account.
 *
 * Each settled payment stores its own end in `sourceUntil`. The account's
 * `premiumUntil` is the latest of the ends that are still in force. Overlapping
 * periods are not added together: ten days of Stars and twenty-five days of
 * Stripe is twenty-five days, not thirty-five.
 *
 * A revoke names what it retires:
 *
 *  - `revokesExternalId` retires that one charge. A Stars refund uses this so
 *    a still-running Stripe or Play period stays.
 *  - `providerRef` and no `revokesExternalId` retires that subscription. A
 *    later payment on the same reference (a Play restart) is a new grant and
 *    counts again.
 *  - Neither retires every source. That is the admin revoke.
 *
 * A renewal that never arrives writes nothing, so the last reported end is
 * where the period stops. Nothing here adds a month the provider did not send.
 */
export function activePremiumUntil(userId: string): string | null {
  const raw = getStore().where<EntitlementGrant>(
    'ledger',
    (d) => (d as { type?: string }).type === 'entitlementGrant' && (d as EntitlementGrant).userId === userId,
  );
  const ordered = raw
    .map((grant, index) => ({ grant, index }))
    .sort((a, b) => a.grant.createdAt.localeCompare(b.grant.createdAt) || a.index - b.index);

  let accountWipe = -1;
  const externalWipe = new Map<string, number>();
  const providerWipe = new Map<string, number>();
  ordered.forEach(({ grant }, pos) => {
    if (grant.action !== 'revoke') return;
    if (grant.revokesExternalId) externalWipe.set(grant.revokesExternalId, pos);
    else if (grant.providerRef) providerWipe.set(grant.providerRef, pos);
    else accountWipe = pos;
  });

  let best = Number.NEGATIVE_INFINITY;
  ordered.forEach(({ grant }, pos) => {
    if (grant.action === 'revoke') return;
    if (pos < accountWipe) return;
    const chargeWipe = externalWipe.get(grant.externalId);
    if (chargeWipe !== undefined && pos < chargeWipe) return;
    const subscriptionRef = grant.providerRef ?? grant.externalId;
    const subscriptionWipe = providerWipe.get(subscriptionRef);
    if (subscriptionWipe !== undefined && pos < subscriptionWipe) return;
    const rawUntil = grant.sourceUntil ?? grant.premiumUntil;
    const at = Date.parse(rawUntil);
    if (Number.isFinite(at) && at > best) best = at;
  });
  if (!Number.isFinite(best)) return null;
  return new Date(best).toISOString();
}

/**
 * Establish or extend a paid period.
 *
 * The account end is the latest surviving source, not a sum and not a blind
 * overwrite. Providers deliver notifications out of order. A renewal arriving
 * before the purchase it renews is ordinary, and a shorter period must not
 * replace a longer one the user has already paid for.
 */
export function grantPremium(input: GrantInput): GrantOutcome {
  const at = Date.parse(input.premiumUntil);
  if (!Number.isFinite(at)) {
    throw new AppError('VALIDATION_FAILED', 'premiumUntil must be an ISO instant.');
  }
  const ownUntil = new Date(at).toISOString();
  const store = getStore();
  const user = userOrThrow(input.userId);

  const existing = grantsFor(input.externalId);
  if (existing.length > 0) {
    // Already settled. Report the account's current period rather than the
    // request's, so a retrying provider sees the truth we are holding.
    return { status: 'duplicate', premiumUntil: user.premiumUntil ?? ownUntil };
  }

  const grant: EntitlementGrant = {
    id: newId('ent'),
    type: 'entitlementGrant',
    userId: user.id,
    source: input.source,
    externalId: input.externalId,
    providerRef: input.providerRef,
    sourceUntil: ownUntil,
    premiumUntil: ownUntil,
    previousPremiumUntil: user.premiumUntil ?? null,
    action: 'grant',
    reason: input.reason,
    createdAt: new Date().toISOString(),
  };
  store.upsert('ledger', grant);
  const accountUntil = activePremiumUntil(user.id) ?? ownUntil;
  store.upsert('ledger', { ...grant, premiumUntil: accountUntil });
  store.upsert('users', { ...user, premiumUntil: accountUntil });

  logEvent('entitlement_granted', {
    userId: user.id,
    source: input.source,
    premiumUntil: accountUntil,
  });
  return { status: 'granted', premiumUntil: accountUntil };
}

/**
 * End a paid period now  -  a refund, a chargeback, or a revoked comp.
 *
 * Does NOT touch `user.tier`: a seeded or staff account is premium for a
 * reason that has nothing to do with a payment, and a refund on some unrelated
 * purchase must not silently demote it.
 */
export function revokePremium(
  userId: string,
  source: EntitlementSource,
  externalId: string,
  reason?: string,
  providerRef?: string,
  revokesExternalId?: string,
): void {
  const store = getStore();
  const user = userOrThrow(userId);
  const now = new Date().toISOString();
  const grant: EntitlementGrant = {
    id: newId('ent'),
    type: 'entitlementGrant',
    userId: user.id,
    source,
    externalId,
    providerRef,
    revokesExternalId,
    premiumUntil: now,
    previousPremiumUntil: user.premiumUntil ?? null,
    action: 'revoke',
    reason,
    createdAt: now,
  };
  store.upsert('ledger', grant);
  // Recomputed from the grants this revoke left standing. An admin revoke
  // (no providerRef, no revokesExternalId) clears every source. A
  // subscription or charge revoke leaves the others at their own ends.
  const remaining = activePremiumUntil(user.id);
  store.upsert('users', { ...user, premiumUntil: remaining });
  logEvent('entitlement_revoked', { userId: user.id, source, reason: reason ?? null });
}

/**
 * revokePremium at most once per `externalId`, for a rail whose revoke key
 * names one settled event (a Stripe deletion, refund or dispute). A
 * redelivered notification then writes nothing, rather than a second revoke
 * that would sort after any period paid since and retire it.
 *
 * revokePremium itself keeps appending on every call, deliberately: Play's
 * `rtdn:<token>:<type>` key repeats legitimately when one subscription lapses
 * the same way twice, and the second lapse must still revoke.
 */
export function revokePremiumOnce(
  userId: string,
  source: EntitlementSource,
  externalId: string,
  reason?: string,
  providerRef?: string,
  revokesExternalId?: string,
): void {
  if (grantsFor(externalId).length > 0) return;
  revokePremium(userId, source, externalId, reason, providerRef, revokesExternalId);
}

/**
 * Entitlement history for one account, newest first. Support-facing.
 *
 * Reversed before sorting because `createdAt` is millisecond-resolution and a
 * grant immediately followed by a revoke  -  a refund processed the instant it
 * arrives, which is the ordinary case  -  carries the identical timestamp. Sort
 * is stable, so reversing first makes insertion order the tiebreak and the
 * later write genuinely sorts first. Without it the two appear in the wrong
 * order exactly when someone is reading this to find out what happened.
 */
export function entitlementHistory(userId: string): EntitlementGrant[] {
  return getStore()
    .where<EntitlementGrant>(
      'ledger',
      (d) => (d as { type?: string }).type === 'entitlementGrant' && (d as EntitlementGrant).userId === userId,
    )
    .reverse()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Which account, if any, a provider's subscription reference is already bound
 * to.
 *
 * A purchase token is a bearer string: whoever holds it can present it. Google
 * echoing back an `obfuscatedExternalAccountId` is the strong answer to "whose
 * purchase is this", but it exists only for purchases made by a client build
 * that sent one  -  and for the rest, nothing else in this module says a token
 * may not be claimed twice. The idempotency key hides that for an exact replay
 * (same token, same expiry, already settled) and stops hiding it the moment the
 * subscription renews, because the expiry moves and the replay becomes a new
 * event on somebody else's account.
 *
 * So the first account to settle a reference owns it. That is trust on first
 * use, which is weaker than Google's own identifier and is deliberately only
 * the fallback for tokens that carry none.
 *
 * Matches `providerRef` and, for grants written before the two were separated,
 * `externalId`. Returns the EARLIEST claimant: a ledger that already contains
 * two accounts for one token  -  written before this check existed  -  must resolve
 * to the same account every time it is asked, and the first one is the one that
 * actually paid.
 */
export function accountForProviderRef(providerRef: string): string | null {
  const grants = getStore()
    .where<EntitlementGrant>(
      'ledger',
      (d) =>
        (d as { type?: string }).type === 'entitlementGrant' &&
        ((d as EntitlementGrant).providerRef === providerRef ||
          (d as { externalId?: string }).externalId === providerRef),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return grants[0]?.userId ?? null;
}

/**
 * Effective tier for a userId, for callers deep in a service that hold an id
 * rather than a document.
 *
 * The credit grant is tier-dependent, and the two places that spend credits
 * from inside a service  -  plan generation and the exercise swap  -  receive only
 * a userId. Without this they would silently grant the free allowance to a
 * paying account, which is a subscription quietly not working.
 *
 * Free for an id that does not resolve: an entitlement is something an account
 * has, and there is no account here.
 */
export function tierOf(userId: string): UserTier {
  const user = getStore().byId<User>('users', userId);
  return user ? effectiveTier(user) : 'free';
}
