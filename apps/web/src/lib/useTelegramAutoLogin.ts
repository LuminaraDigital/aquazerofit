/**
 * Silent Telegram Mini App auto-login (AQF-09).
 *
 * Inside Telegram (isTMA()), when no session exists, POST /auth/telegram is
 * attempted automatically before the manual sign-in UI is shown. On failure we
 * fall back to the manual buttons without any error flash — the user simply
 * sees the normal screen.
 *
 * The attempt is cached at module scope so it fires exactly once per app load:
 * that guards React strict-mode double-effects AND both entry pages (Welcome +
 * SignIn) sharing one attempt.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthResponse } from '@aquazerofit/shared';
import { tokenStore } from './api';
import { getTelegramInitData, haptic, isTMA } from './telegram';
import { useAuthActions } from './queries';

let autoLoginAttempt: Promise<AuthResponse | null> | null = null;

/**
 * Returns true while the silent attempt is in flight — render a spinner
 * instead of the sign-in UI. Navigates on success; resolves false on failure.
 */
export function useTelegramAutoLogin(): boolean {
  const navigate = useNavigate();
  const { telegramLogin } = useAuthActions();
  const [pending, setPending] = useState<boolean>(
    () => isTMA() && !tokenStore.isAuthenticated && autoLoginAttempt === null,
  );

  useEffect(() => {
    if (!isTMA() || tokenStore.isAuthenticated) return;
    const initData = getTelegramInitData();
    if (!initData) {
      setPending(false);
      return;
    }
    // ??= keeps this to a single network call across strict-mode re-mounts
    // and across the Welcome/SignIn pages.
    autoLoginAttempt ??= telegramLogin(initData).catch(() => null);
    let active = true;
    void autoLoginAttempt.then((res) => {
      if (!active) return;
      setPending(false);
      // Only navigate when the session is really live — a stale resolved
      // attempt after a manual logout must NOT bounce the user around.
      if (res && tokenStore.isAuthenticated) {
        haptic('success');
        navigate(res.user.hasProfile ? '/' : '/onboarding', { replace: true });
      }
    });
    return () => {
      active = false;
    };
    // telegramLogin/navigate identities are stable enough; the module-level
    // cache makes re-runs harmless regardless.
  }, [navigate, telegramLogin]);

  return pending;
}
