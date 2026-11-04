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
import { SHARE_START_PREFIX, SQUAD_START_PREFIX, shareCodeSchema, squadCodeSchema } from '@aquazerofit/shared';
import { API_BASE, api } from './api';
import { adoptAttribution, getAttribution } from './attribution';
import { getTelegramStartParam, isTMA } from './telegram';

/** The path a Fight Camp start payload opens, or null for any other payload. */
export function fightCampStartPath(startParam: string | null): string | null {
  if (!startParam?.startsWith(SQUAD_START_PREFIX)) return null;
  const code = squadCodeSchema.safeParse(startParam.slice(SQUAD_START_PREFIX.length));
  return code.success ? `/s/${code.data}` : null;
}

/**
 * The Share Kit code in a start payload or a stored ref, or null. A ref that
 * crossed from the landing page into Telegram has lost its `_` (telegramLink
 * keeps underscores out of its payload), so `sh<code>` is read as well.
 */
export function shareCodeIn(value: string | null): string | null {
  const match = value ? /^sh_?(.*)$/.exec(value) : null;
  const code = match ? shareCodeSchema.safeParse(match[1]) : null;
  return code?.success ? code.data : null;
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
      adoptAttribution({ ref: `${SHARE_START_PREFIX}${share}` });
      // A beacon: the API answers 204 for the Mini App and records the open,
      // once per code per session so a reload is not a second visit.
      if (firstLaunchWith(share)) void fetch(`${API_BASE}/share/r/${share}?surface=tma`).catch(() => undefined);
      return;
    }
    const path = fightCampStartPath(startParam);
    if (path) navigate(path, { replace: true });
  }, [navigate]);
}

const CLAIMED_KEY = 'azf_share_claim_v1';
const BEACON_KEY = 'azf_share_beacon_v1';

function firstLaunchWith(code: string): boolean {
  try {
    if (sessionStorage.getItem(BEACON_KEY) === code) return false;
    sessionStorage.setItem(BEACON_KEY, code);
  } catch {
    // No storage: count it; one extra open is the safe error.
  }
  return true;
}

/**
 * Credit a new, signed-in account to the Share Kit link it arrived through.
 * The server decides whether it counts (only accounts under a day old, never
 * your own link) and answers the same either way; this only avoids asking
 * twice from the same browser. Never rejects.
 */
export async function claimStoredShareAttribution(): Promise<void> {
  const code = shareCodeIn(getAttribution().ref);
  if (!code) return;
  try {
    if (localStorage.getItem(CLAIMED_KEY) === code) return;
  } catch {
    // No storage: the server's first-touch rule still holds.
  }
  try {
    await api('/share/attributions', { method: 'POST', body: { code, surface: isTMA() ? 'tma' : 'web' } });
    localStorage.setItem(CLAIMED_KEY, code);
  } catch {
    // Asking again later is harmless.
  }
}

/** Claim once, on the signed-in shell; a squad join claims first itself (first touch wins). */
export function useClaimShareAttribution(): void {
  useEffect(() => {
    void claimStoredShareAttribution();
  }, []);
}
