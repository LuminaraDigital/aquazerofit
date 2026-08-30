/**
 * Google Play subscription verification.
 *
 * The one rule this module exists to enforce: **a purchase token proves
 * nothing until Google says so.** The Android client sends a token it received
 * from Play, and that token is an opaque string a caller can invent. If this
 * module ever granted an entitlement without a round trip to Google, premium
 * would be one `curl` away and the subscription would be decorative.
 *
 * So the failure posture is: no credentials configured → 503 and grant
 * nothing. Never "assume valid because we cannot check". The alternative — a
 * deployment that silently hands out premium because someone forgot an env var
 * — is the expensive direction, and it is invisible until the revenue does not
 * arrive.
 *
 * NO NEW DEPENDENCY. The `googleapis` package would pull a large tree in for
 * two HTTP calls, so the service-account flow is done by hand: sign a JWT
 * assertion with the key we already have `jsonwebtoken` for, exchange it at
 * Google's token endpoint, call the Developer API with `fetch`. That is the
 * whole of OAuth2 two-legged auth.
 */
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '../../platform/errors';
import { config } from '../../platform/config';
import { logEvent } from '../../platform/telemetry';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
/** Google's own ceiling for an assertion's lifetime. */
const ASSERTION_TTL_SECONDS = 3600;
/** Access tokens last an hour; refresh a minute early rather than on the boundary. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const HTTP_TIMEOUT_MS = 10_000;

export interface PlayServiceAccount {
  client_email: string;
  private_key: string;
}

/** Cached access token, so a burst of purchases is not a burst of token exchanges. */
let cachedToken: { value: string; expiresAt: number } | null = null;

export function resetPlayTokenCache(): void {
  cachedToken = null;
}

function serviceAccount(): PlayServiceAccount | null {
  const raw = config.playServiceAccountJson;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlayServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
      return null;
    }
    // Env vars cannot carry real newlines on most platforms, so the PEM is
    // conventionally stored with the newlines escaped. Restoring them here
    // rather than demanding the operator get it exactly right.
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

/** True when this deployment can actually verify a purchase. */
export function playBillingConfigured(): boolean {
  return serviceAccount() !== null && config.playPackageName.length > 0;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Two-legged OAuth2: a JWT we sign with the service-account key, exchanged for
 * a bearer token. RS256 is required by Google and is why the key is a PEM
 * rather than a shared secret.
 */
async function accessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > now) {
    return cachedToken.value;
  }
  const account = serviceAccount();
  if (!account) {
    throw new AppError('PAYMENT_UNAVAILABLE', 'Play billing is not configured on this server.');
  }

  const issuedAt = Math.floor(now / 1000);
  let assertion: string;
  try {
    assertion = jwt.sign(
      {
        iss: account.client_email,
        scope: ANDROID_PUBLISHER_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + ASSERTION_TTL_SECONDS,
      },
      account.private_key,
      { algorithm: 'RS256' },
    );
  } catch (err) {
    /*
     * A PEM that will not sign — truncated, wrong type, mangled newlines by a
     * deployment console. Left unhandled this escapes as a raw crypto error and
     * the caller gets a 500, which reads to a user as "the app is broken" and
     * to an operator as an application bug. It is neither: it is a credential
     * this deployment cannot use, which is exactly PAYMENT_UNAVAILABLE.
     */
    logEvent('play_assertion_sign_failed', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
    throw new AppError('PAYMENT_UNAVAILABLE', 'Play billing credentials are not usable.');
  }

  const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!res.ok) {
    // The body can carry the service account's own identifiers; log the status
    // only. An operator debugging this has the Google console.
    logEvent('play_token_exchange_failed', { status: res.status });
    throw new AppError('PAYMENT_UNAVAILABLE', 'Could not authenticate with Google Play.');
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (typeof body.access_token !== 'string') {
    throw new AppError('PAYMENT_UNAVAILABLE', 'Google Play returned no access token.');
  }
  cachedToken = {
    value: body.access_token,
    expiresAt: now + (body.expires_in ?? ASSERTION_TTL_SECONDS) * 1000,
  };
  return cachedToken.value;
}

export interface VerifiedPurchase {
  /** End of the paid period, as GOOGLE reports it — never as the client claims. */
  expiryTime: string;
  /** Google's stable identifier for the subscription, for cross-referencing. */
  orderId?: string;
  /** True when the subscription is in a state that should hold entitlement. */
  entitled: boolean;
  /**
   * The obfuscated account id the BUYER's app set when it opened Play's sheet,
   * if it set one. Google echoes back what it was given at purchase time, so
   * this is the one field that says *whose* purchase this token is, rather
   * than merely that the token is real. Undefined for a purchase made by a
   * client build that predates the app sending it.
   */
  obfuscatedAccountId?: string;
}

/**
 * Shape of the slice of `purchases.subscriptionsv2.get` we read.
 * https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
 */
interface SubscriptionV2 {
  subscriptionState?: string;
  latestOrderId?: string;
  lineItems?: { expiryTime?: string }[];
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
}

/**
 * States that hold entitlement.
 *
 * IN_GRACE_PERIOD is included on purpose: the user's card failed and Google is
 * retrying, and cutting them off mid-retry is how a recoverable payment
 * problem turns into a cancellation. ON_HOLD and PAUSED are not — at that point
 * Google has stopped trying and the user genuinely is not paying.
 */
const ENTITLING_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED', // cancelled but not yet expired — paid through the period
]);

/**
 * Ask Google what this token actually bought.
 *
 * Returns the expiry Google reports. The client's `productId` is NOT trusted to
 * decide the period: it is carried only so a mismatch can be logged.
 */
export async function verifyPurchase(purchaseToken: string): Promise<VerifiedPurchase> {
  if (!playBillingConfigured()) {
    throw new AppError('PAYMENT_UNAVAILABLE', 'Play billing is not configured on this server.');
  }
  const token = await accessToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(config.playPackageName)}/purchases/subscriptionsv2/tokens/` +
    `${encodeURIComponent(purchaseToken)}`;

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404 || res.status === 400) {
    // Google does not recognise the token. This is the forged-token path and
    // the ordinary stale-token path at once; both grant nothing.
    throw new AppError('PURCHASE_INVALID', 'Google Play did not recognise this purchase.');
  }
  if (res.status === 401 || res.status === 403) {
    // Our own credentials are wrong — an operator problem, not the user's.
    // Dropping the cache means the next attempt re-authenticates rather than
    // replaying a token that has been revoked.
    resetPlayTokenCache();
    logEvent('play_verify_unauthorised', { status: res.status });
    throw new AppError('PAYMENT_UNAVAILABLE', 'Could not reach Google Play to verify this purchase.');
  }
  if (!res.ok) {
    throw new AppError('PAYMENT_UNAVAILABLE', 'Google Play verification failed.');
  }

  const body = (await res.json()) as SubscriptionV2;
  const expiryTime = body.lineItems?.find((item) => item.expiryTime)?.expiryTime;
  if (!expiryTime) {
    // A subscription with no expiry on any line item is a shape we do not
    // understand, and guessing a period here would be inventing an entitlement.
    throw new AppError('PURCHASE_INVALID', 'Google Play returned no expiry for this purchase.');
  }
  return {
    expiryTime,
    orderId: body.latestOrderId,
    entitled: ENTITLING_STATES.has(body.subscriptionState ?? ''),
    obfuscatedAccountId: body.externalAccountIdentifiers?.obfuscatedExternalAccountId,
  };
}

/**
 * The value the Android client is expected to have handed Play for this user.
 *
 * Must stay byte-identical to `BillingRepository.obfuscatedAccountId()` on the
 * client: SHA-256 of the account id, lowercase hex. Hashed rather than sent
 * raw because Play stores the value and surfaces it in the Play Console, and
 * our account ids have no business being there.
 */
export function obfuscatedAccountIdFor(userId: string): string {
  return createHash('sha256').update(userId, 'utf8').digest('hex');
}
