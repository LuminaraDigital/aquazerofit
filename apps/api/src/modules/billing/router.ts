/**
 * /billing — the routes that turn a Play purchase into an entitlement.
 *
 * Two surfaces with opposite threat models:
 *
 *  - `POST /billing/play/verify` is authenticated and called by the app right
 *    after a purchase. The caller is a known user, but the purchase token they
 *    present is not trusted at all: it goes to Google before it grants
 *    anything.
 *  - `POST /billing/play/webhook` is unauthenticated by nature (Google Pub/Sub
 *    calls it) and can grant entitlements, which makes it the highest-value
 *    URL in the product. It authenticates by shared secret and fails closed,
 *    exactly like the Telegram webhook next door, and for the same reason: an
 *    unconfigured webhook that accepts deliveries is a free subscription for
 *    anyone who finds the path.
 *
 * The webhook always answers 200 once authenticated. Pub/Sub redelivers any
 * non-2xx, so a 500 on a payload that will never parse is an infinite retry
 * loop against a message that cannot succeed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, secureEquals, userIdOf } from '../../platform/auth';
import { AppError, asyncHandler } from '../../platform/errors';
import { config } from '../../platform/config';
import { logEvent } from '../../platform/telemetry';
import { getStore } from '../../platform/store';
import {
  effectiveTier,
  grantPremium,
  revokePremium,
  type EntitlementGrant,
} from './entitlements';
import { obfuscatedAccountIdFor, playBillingConfigured, verifyPurchase } from './play';
import type { User } from '@aquazerofit/shared';

export const billingRouter = Router();

/** Advertised so a client can hide the buy button rather than offer a dead one. */
billingRouter.get('/config', (_req, res) => {
  res.json({ play: { available: playBillingConfigured() } });
});

const verifySchema = z.object({
  purchaseToken: z.string().min(1).max(4096),
  productId: z.string().min(1).max(200),
});

/**
 * Exchange a Play purchase token for an entitlement.
 *
 * The period comes from Google's response, never from the request. The
 * purchase token doubles as the idempotency key, so the client may safely
 * retry — and it must, because the Android side only acknowledges the purchase
 * to Google after this succeeds, and an unacknowledged purchase is auto-
 * refunded after three days.
 */
billingRouter.post(
  '/play/verify',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = verifySchema.parse(req.body ?? {});
    const userId = userIdOf(req);

    const verified = await verifyPurchase(input.purchaseToken);
    if (!verified.entitled) {
      // Google knows the token but the subscription is on hold, paused or
      // expired. Not a forgery, not something a retry fixes.
      logEvent('play_purchase_not_entitling', { userId });
      throw new AppError('PURCHASE_INVALID', 'This subscription is not currently active.');
    }

    /*
     * Whose purchase is this? A valid token proves a purchase happened, not
     * that THIS caller made it, and a token is a bearer string: anyone who
     * obtains one could otherwise present it on their own account. The client
     * hands Play a hash of its account id at purchase time and Google echoes
     * it back here, so the two can be compared.
     *
     * Only enforced when Google actually returns one. A purchase made by a
     * client build from before the app sent it has no identifier to check, and
     * refusing those would revoke premium from existing subscribers on deploy.
     */
    if (verified.obfuscatedAccountId && verified.obfuscatedAccountId !== obfuscatedAccountIdFor(userId)) {
      logEvent('play_purchase_account_mismatch', { userId });
      throw new AppError('PURCHASE_INVALID', 'This purchase belongs to a different account.');
    }

    grantPremium({
      userId,
      source: 'play',
      /*
       * The expiry joins the key. The purchase token alone is stable across
       * every renewal of a subscription, so keying on it made the FIRST
       * verification the only one that could ever move the period: every
       * later re-verification deduplicated against it and returned the
       * original month. That left renewals entirely dependent on the RTDN
       * webhook being configured and delivering, with no way for the client to
       * self-heal if it was not. With the expiry included, a re-verify after a
       * renewal is a new event and extends; a genuine retry of the same
       * verification still carries the same expiry and still deduplicates.
       */
      externalId: `play:${input.purchaseToken}:${verified.expiryTime}`,
      providerRef: input.purchaseToken,
      premiumUntil: verified.expiryTime,
      reason: `play:${input.productId}`,
    });

    const user = getStore().byId<User>('users', userId);
    res.json({
      tier: user ? effectiveTier(user) : 'premium',
      premiumUntil: user?.premiumUntil ?? verified.expiryTime,
    });
  }),
);

// ---------------------------------------------------------------------------
// Real-time developer notifications
// ---------------------------------------------------------------------------

/**
 * The slice of a Pub/Sub push we read. The interesting payload is base64 in
 * `message.data` and is itself a JSON DeveloperNotification.
 */
interface PubSubPush {
  message?: { data?: string; messageId?: string };
}

interface DeveloperNotification {
  subscriptionNotification?: {
    /** https://developer.android.com/google/play/billing/rtdn-reference */
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
}

/**
 * Notification types that mean "this entitlement has ended and should not be
 * honoured any longer".
 *
 * REVOKED (12) and EXPIRED (13) only. Deliberately NOT canceled (3): a
 * cancellation means auto-renew is off, and the user has still paid through
 * the end of the current period. Treating it as an immediate revocation would
 * take away time somebody bought — the single most reliable way to turn a
 * lapsing customer into a refund request.
 */
const ENDING_NOTIFICATIONS = new Set([12, 13]);

function rtdnSecretMatches(req: { get(name: string): string | undefined; query: unknown }): boolean {
  const expected = config.playRtdnSecret;
  // Fail closed: unset means trust nobody rather than everybody.
  if (!expected) return false;
  const header = req.get('x-azf-rtdn-secret');
  if (header && secureEquals(header, expected)) return true;
  // Pub/Sub push endpoints are commonly configured with the secret in the
  // query string, because the console does not offer custom headers on every
  // subscription type. Accepted as a fallback, still constant-time compared.
  const fromQuery = (req.query as { secret?: unknown } | undefined)?.secret;
  return secureEquals(fromQuery, expected);
}

billingRouter.post(
  '/play/webhook',
  asyncHandler(async (req, res) => {
    if (!rtdnSecretMatches(req)) {
      logEvent('play_rtdn_rejected', { reason: 'secret_mismatch' });
      res.status(401).json({ code: 'AUTH_INVALID', message: 'Invalid webhook secret.' });
      return;
    }

    const push = req.body as PubSubPush;
    let notification: DeveloperNotification | null = null;
    try {
      const raw = push.message?.data;
      if (raw) {
        notification = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as DeveloperNotification;
      }
    } catch {
      notification = null;
    }

    const sub = notification?.subscriptionNotification;
    const purchaseToken = sub?.purchaseToken;
    if (!sub || !purchaseToken) {
      // Test messages and non-subscription notifications land here. Acknowledged
      // and dropped — redelivering them forever helps nobody.
      res.status(200).json({ ok: true });
      return;
    }

    /*
     * The token is the only identifier Google sends; it does not name our user.
     * The grant record written at purchase time is what maps one to the other,
     * which is why `externalId` is the purchase token rather than an id of our
     * own. A notification for a token we never granted on is not an error — it
     * is a purchase made against a different environment sharing this Play
     * account — so it is acknowledged and ignored.
     */
    const priorGrant = getStore().findOne<EntitlementGrant>(
      'ledger',
      (d) =>
        (d as { type?: string }).type === 'entitlementGrant' &&
        // `providerRef` is the purchase token and stays put across renewals.
        // The `externalId` arm is for grants written before the two were
        // separated, when the token WAS the key; without it this deploy would
        // orphan every subscription bought before it and stop honouring their
        // refunds and expiries.
        ((d as EntitlementGrant).providerRef === purchaseToken ||
          (d as { externalId?: string }).externalId === purchaseToken),
    );
    if (!priorGrant) {
      logEvent('play_rtdn_unknown_token', { messageId: push.message?.messageId ?? null });
      res.status(200).json({ ok: true });
      return;
    }

    const type = sub.notificationType ?? 0;
    try {
      if (ENDING_NOTIFICATIONS.has(type)) {
        revokePremium(
          priorGrant.userId,
          'play',
          `rtdn:${purchaseToken}:${type}`,
          `rtdn:${type}`,
          purchaseToken,
        );
      } else {
        // Everything else — renewal, recovery, restart — is re-verified against
        // Google rather than believed. The notification says something changed;
        // only the API says what the period now is.
        const verified = await verifyPurchase(purchaseToken);
        if (verified.entitled) {
          grantPremium({
            userId: priorGrant.userId,
            source: 'play',
            // The token alone would be a duplicate of the original purchase, so
            // the notification type joins the key: one settlement per event,
            // still idempotent across redeliveries of the SAME event.
            externalId: `rtdn:${purchaseToken}:${type}:${verified.expiryTime}`,
            providerRef: purchaseToken,
            premiumUntil: verified.expiryTime,
            reason: `rtdn:${type}`,
          });
        }
      }
    } catch (err) {
      // Logged, acknowledged, dropped. A 5xx here makes Pub/Sub redeliver, and
      // if the failure is persistent that is an unbounded retry loop against
      // Google's own infrastructure.
      logEvent('play_rtdn_failed', {
        reason: err instanceof Error ? err.message : 'unknown',
        type,
      });
    }

    res.status(200).json({ ok: true });
  }),
);
