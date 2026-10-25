/**
 * Fight Camp `startapp` payloads (AZF-P1 US-C2, US-F3), handled once at launch.
 *
 *   sq_<SQD-XXXXXXXXXX>  a squad invite: open its landing, /s/<code>
 *   sh_<code>            a Share Kit link: keep it as first-touch attribution
 *                        and tell the API the link was opened from Telegram
 *
 * Kept apart from lib/deeplink, whose router only runs on the Nutrition page
 * and splits payloads on underscores, which would break a code in half.
 * Anything that is not one of these leaves the launch exactly as it was.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { shareCodeSchema, squadCodeSchema } from '@aquazerofit/shared';
import { API_BASE, api } from './api';
import { adoptAttribution, getAttribution } from './attribution';
import { getTelegramStartParam, isTMA } from './telegram';

/** The path a Fight Camp start payload opens, or null for any other payload. */
export function fightCampStartPath(startParam: string | null): string | null {
  if (!startParam?.startsWith('sq_')) return null;
  const code = squadCodeSchema.safeParse(startParam.slice(3));
  return code.success ? `/s/${code.data}` : null;
}

/** The Share Kit code in a start payload, or null. */
export function shareCodeIn(startParam: string | null): string | null {
  if (!startParam?.startsWith('sh_')) return null;
  const code = shareCodeSchema.safeParse(startParam.slice(3));
  return code.success ? code.data : null;
}

export function useFightCampStartApp(): void {
  const navigate = useNavigate();
  const routed = useRef(false);
  useEffect(() => {
    if (routed.current) return;
    routed.current = true;
    const startParam = getTelegramStartParam();
    const share = shareCodeIn(startParam);
    if (share) {
      adoptAttribution({ ref: `sh_${share}` });
      // A beacon: the API answers 204 for the Mini App and records the open.
      void fetch(`${API_BASE}/share/r/${share}?surface=tma`).catch(() => undefined);
      return;
    }
    const path = fightCampStartPath(startParam);
    if (path) navigate(path, { replace: true });
  }, [navigate]);
}

const CLAIMED_KEY = 'azf_share_claim_v1';

/**
 * Once signed in, credit a new account to the Share Kit link it arrived
 * through. The server decides whether it counts (only accounts under a day
 * old, never your own link) and answers the same either way; this only
 * avoids asking twice from the same browser.
 */
export function useClaimShareAttribution(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) return;
    const code = shareCodeIn(getAttribution().ref);
    if (!code) return;
    try {
      if (localStorage.getItem(CLAIMED_KEY) === code) return;
    } catch {
      // No storage: the server's first-touch rule still holds.
    }
    void api('/share/attributions', { method: 'POST', body: { code, surface: isTMA() ? 'tma' : 'web' } })
      .then(() => {
        try {
          localStorage.setItem(CLAIMED_KEY, code);
        } catch {
          // Ignore: asking again is harmless.
        }
      })
      .catch(() => undefined);
  }, [signedIn]);
}
