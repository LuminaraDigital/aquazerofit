/**
 * Turnstile challenge widget for the public auth forms.
 *
 * Renders nothing at all until GET /auth/captcha says the deployment is
 * challenged, so the offline demo, local dev and the test suite see the forms
 * exactly as they were. The parent owns the token: it holds the value, gates
 * submit on it, and bumps `resetSignal` after a failed submit — Turnstile
 * tokens are single-use, so a form that retries with a spent token fails
 * forever while looking correct.
 *
 * `resetSignal` is a counter rather than an imperative ref handle because the
 * reset is always a reaction to state the parent already has (a rejected
 * submit), and a plain number prop keeps that reaction declarative and
 * trivially testable.
 */
import { useEffect, useRef, useState } from 'react';
import { fetchCaptchaConfig, loadTurnstile } from '../../lib/turnstile';

/** Why this widget cannot currently produce a token. */
export type TurnstileFailure = 'expired' | 'error' | 'load-failed';

interface TurnstileProps {
  /** Receives the solved token, or '' whenever the current one stops being valid. */
  onToken: (token: string) => void;
  /** Names the form in Cloudflare's analytics (`register`, `password-reset`). */
  action: string;
  /** Increment to discard the current token and issue a fresh challenge. */
  resetSignal?: number;
  /**
   * Optional notification that no token is coming.
   *
   * The web forms do not need it: `onToken('')` already tells them to disable
   * submit, and the message below tells the person what to do. A host that
   * embeds this widget and waits on a callback does need it, because otherwise
   * an expired or blocked challenge is indistinguishable from one the user has
   * simply not finished yet, and the host waits forever.
   */
  onFailure?: (reason: TurnstileFailure) => void;
}

export function Turnstile({ onToken, action, resetSignal = 0, onFailure }: TurnstileProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Held in a ref so the render effect never re-runs when the parent supplies a
  // new closure — re-running it would tear down a solved widget and silently
  // clear a token the user already earned.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;

  useEffect(() => {
    let cancelled = false;
    void fetchCaptchaConfig().then((cfg) => {
      if (!cancelled && cfg.enabled) setSiteKey(cfg.siteKey);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    setFailed(false);
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !hostRef.current || widgetIdRef.current !== null) return;
        widgetIdRef.current = turnstile.render(hostRef.current, {
          sitekey: siteKey,
          action,
          // 'auto' rather than a pinned palette: the widget is an iframe from
          // Cloudflare, so it cannot inherit this app's tokens, and following
          // the OS preference is the closest it gets to belonging.
          theme: 'auto',
          callback: (token) => onTokenRef.current(token),
          // A token silently expires after five minutes. Clearing it here is
          // what stops a form left open over a coffee break from submitting a
          // stale token and coming back with an error the user cannot act on.
          'expired-callback': () => {
            onTokenRef.current('');
            onFailureRef.current?.('expired');
          },
          'error-callback': () => {
            onTokenRef.current('');
            setFailed(true);
            onFailureRef.current?.('error');
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        onFailureRef.current?.('load-failed');
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action, attempt]);

  // Parent-driven reset. Guarded on a non-zero signal so the initial render
  // does not immediately clear a token the widget may have just produced.
  useEffect(() => {
    if (resetSignal === 0) return;
    onTokenRef.current('');
    if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current);
  }, [resetSignal]);

  if (!siteKey) return null;

  return (
    <div className="space-y-2">
      <div ref={hostRef} className="flex justify-center" data-testid="turnstile-widget" />
      {failed && (
        <p className="text-xs text-error" role="alert">
          The security check could not load. Check your connection or any content blocker, then{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              widgetIdRef.current = null;
              setAttempt((n) => n + 1);
            }}
          >
            try again
          </button>
          .
        </p>
      )}
    </div>
  );
}
