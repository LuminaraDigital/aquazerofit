/**
 * /mobile/captcha — the Turnstile challenge, rendered for a native host.
 *
 * WHY THIS EXISTS
 * ---------------
 * `assertHuman` (apps/api/src/platform/botProtection.ts) demands a captcha
 * token on POST /auth/register and POST /auth/password-reset/request whenever
 * the deployment has Turnstile keys. The Android client has no browser in that
 * flow, so it sends none and both routes answer VALIDATION_FAILED. The two
 * existing answers are a closed-testing global bypass (boot-fatal in
 * production) and Play Integrity (a seam with no decoder behind it yet), which
 * leaves exactly one way for a real Android build to register today: solve the
 * challenge in a WebView and hand the token back. This page is that WebView.
 *
 * THE CONTRACT WITH THE ANDROID SIDE
 * ----------------------------------
 * It is small on purpose, because the two halves ship separately:
 *
 *   in    `?action=register` | `?action=password-reset` — passed straight to
 *         Turnstile as the action label, so Cloudflare's analytics can tell a
 *         signup flood from a reset flood. Anything else is treated as
 *         `register`; a mistyped parameter must not be able to stop a real
 *         person signing up.
 *   out   `window.AzfCaptcha.onToken(token)` once, on success.
 *   out   `window.AzfCaptcha.onError(reason)` when no token is coming —
 *         `expired`, `error`, `load-failed` or `unavailable`.
 *
 * Both calls are wrapped: a JavaScript bridge method is native code, it can
 * throw, and a throw here would take down the challenge the host is waiting on.
 *
 * NO HOST, NO CRASH
 * -----------------
 * The URL is an ordinary public route, so it will be opened in a normal browser
 * — by a crawler, by someone reading their history, by whoever is debugging the
 * app. `window.AzfCaptcha` is absent there. That case renders a short
 * explanation and stops: no widget, no challenge issued, nothing to throw. It
 * is deliberately not an error state, because nothing has gone wrong.
 *
 * The route is public (outside RequireAuth in App.tsx): registration and
 * password reset both happen before there is a session, so a page that needed
 * one could never be reached by the flows it serves.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Turnstile, type TurnstileFailure } from '../../components/auth/Turnstile';
import { fetchCaptchaConfig } from '../../lib/turnstile';
import { useNoIndex } from '../../lib/seo';

/** Reasons the host may be told. Turnstile's own three, plus one of ours. */
type FailureReason = TurnstileFailure | 'unavailable';

/**
 * The native bridge. Optional at every level: the object may be missing, and a
 * host that only implements half of it must not crash the page either.
 */
interface CaptchaHost {
  onToken?: (token: string) => void;
  onError?: (reason: string) => void;
}

declare global {
  interface Window {
    AzfCaptcha?: CaptchaHost;
  }
}

const ACTIONS = ['register', 'password-reset'] as const;
type CaptchaAction = (typeof ACTIONS)[number];

function readAction(raw: string | null): CaptchaAction {
  return ACTIONS.includes(raw as CaptchaAction) ? (raw as CaptchaAction) : 'register';
}

/** Whether the deployment is challenged at all, before a widget is attempted. */
type Availability = 'checking' | 'available' | 'unavailable';

const PROMPT: Record<CaptchaAction, string> = {
  register: 'Confirm you are a person to finish creating your account.',
  'password-reset': 'Confirm you are a person to continue resetting your password.',
};

export default function MobileCaptcha() {
  const [params] = useSearchParams();
  const action = readAction(params.get('action'));

  // Read once, at mount. The host injects its bridge before the page loads, and
  // re-reading it on every render would make the page's whole behaviour depend
  // on when React happened to re-render.
  const [host] = useState<CaptchaHost | undefined>(() =>
    typeof window === 'undefined' ? undefined : window.AzfCaptcha,
  );
  const [availability, setAvailability] = useState<Availability>('checking');
  const [delivered, setDelivered] = useState(false);

  useNoIndex();

  const report = useCallback(
    (reason: FailureReason) => {
      try {
        host?.onError?.(reason);
      } catch {
        // A throwing bridge is the host's problem, not a reason to blank the
        // page the user is looking at.
      }
    },
    [host],
  );

  /**
   * Ask whether this deployment is challenged at all.
   *
   * `Turnstile` performs the same lookup and it is memoised, so this costs no
   * extra request. It is done here as well because the component renders
   * `null` when there is no site key, which from the host's side is
   * indistinguishable from a challenge the user has not solved yet — the host
   * would sit on a blank page until it timed out. A deployment with no keys
   * does not require a token either, so `unavailable` is the host's cue to
   * submit without one rather than to give up.
   */
  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    void fetchCaptchaConfig().then((cfg) => {
      if (cancelled) return;
      if (cfg.enabled) {
        setAvailability('available');
        return;
      }
      setAvailability('unavailable');
      report('unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, [host, report]);

  const handleToken = useCallback(
    (token: string) => {
      // '' is Turnstile clearing a spent or expired token, not a new one. The
      // matching onError arrives through onFailure below.
      if (token === '') return;
      setDelivered(true);
      try {
        host?.onToken?.(token);
      } catch {
        // Same reasoning as `report`.
      }
    },
    [host],
  );

  if (!host) {
    return (
      <Shell>
        <h1 className="font-heading text-xl text-on-surface">Nothing to do here</h1>
        <p className="text-sm text-on-surface-variant">
          This page is part of signing up in the AquaZeroFit mobile app. It only does anything when
          the app opens it, and the app will do that by itself when it needs you.
        </p>
        <p className="text-sm text-on-surface-variant">
          You can close this page. To create an account in a browser instead, use the sign-in page.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-heading text-xl text-on-surface">Security check</h1>
      <p className="text-sm text-on-surface-variant">{PROMPT[action]}</p>

      {availability === 'available' && (
        <Turnstile action={action} onToken={handleToken} onFailure={report} />
      )}

      {availability === 'unavailable' && (
        <p className="text-sm text-on-surface-variant" role="status">
          No check is needed. You can go back to the app.
        </p>
      )}

      {delivered && (
        <p className="text-sm text-primary" role="status" data-testid="captcha-delivered">
          Verified. Returning to the app.
        </p>
      )}
    </Shell>
  );
}

/**
 * Deliberately plain: no header, no navigation, no branding beyond the type
 * scale. It is a modal panel inside a native app, and anything that looks like
 * a web page invites the user to treat it as one.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-container-margin py-8">
      <div className="w-full max-w-sm space-y-4 text-center">{children}</div>
    </main>
  );
}
