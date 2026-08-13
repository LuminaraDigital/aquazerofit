/**
 * Client attribution capture for viral loops (ref / UTM / challenge codes).
 * Persists once per browser so share and signup can credit the source.
 */
export interface Attribution {
  ref: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  challengeCode: string | null;
  capturedAt: string;
}

const STORAGE_KEY = 'azf_attr_v1';

function readStored(): Attribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
}

function writeStored(attr: Attribution): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
  } catch {
    // private mode / quota — attribution is best-effort
  }
}

function pick(params: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const v = params.get(key);
    if (v && v.trim()) return v.trim().slice(0, 120);
  }
  return null;
}

/** Capture invite params from the current URL; keep first-touch attribution. */
export function captureAttributionFromUrl(search = window.location.search): Attribution {
  const params = new URLSearchParams(search);
  const incoming: Attribution = {
    ref: pick(params, ['ref', 'invite']),
    utmSource: pick(params, ['utm_source']),
    utmMedium: pick(params, ['utm_medium']),
    utmCampaign: pick(params, ['utm_campaign']),
    challengeCode: pick(params, ['challenge', 'huddle'])?.toUpperCase() ?? null,
    capturedAt: new Date().toISOString(),
  };

  const existing = readStored();
  const hasIncoming =
    incoming.ref ||
    incoming.utmSource ||
    incoming.utmMedium ||
    incoming.utmCampaign ||
    incoming.challengeCode;

  if (!hasIncoming) {
    return (
      existing ?? {
        ref: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        challengeCode: null,
        capturedAt: new Date().toISOString(),
      }
    );
  }

  // First touch wins for ref/utm; challenge code updates so join deep-links work.
  const merged: Attribution = {
    ref: existing?.ref ?? incoming.ref,
    utmSource: existing?.utmSource ?? incoming.utmSource,
    utmMedium: existing?.utmMedium ?? incoming.utmMedium,
    utmCampaign: existing?.utmCampaign ?? incoming.utmCampaign,
    challengeCode: incoming.challengeCode ?? existing?.challengeCode ?? null,
    capturedAt: existing?.capturedAt ?? incoming.capturedAt,
  };
  writeStored(merged);
  return merged;
}

/**
 * Merge attribution that did not arrive through the URL — in practice, the
 * payload decoded from a Telegram deep link's `start_param`.
 *
 * localStorage does not cross the web → Telegram boundary, so inside the Mini
 * App the store starts empty and this is the only thing that fills it. Same
 * first-touch rule as the URL path: a ref already recorded in *this* browser
 * wins, so a returning user is not re-credited to whoever last shared a link.
 */
export function adoptAttribution(incoming: Partial<Attribution>): Attribution {
  const existing = readStored();
  const merged: Attribution = {
    ref: existing?.ref ?? incoming.ref ?? null,
    utmSource: existing?.utmSource ?? incoming.utmSource ?? null,
    utmMedium: existing?.utmMedium ?? incoming.utmMedium ?? null,
    utmCampaign: existing?.utmCampaign ?? incoming.utmCampaign ?? null,
    /* Challenge codes are a live deep-link target rather than a first touch:
       joining a second huddle must replace the first, or the join silently
       applies to the wrong challenge. */
    challengeCode: incoming.challengeCode ?? existing?.challengeCode ?? null,
    capturedAt: existing?.capturedAt ?? incoming.capturedAt ?? new Date().toISOString(),
  };
  const hasAnything =
    merged.ref || merged.utmSource || merged.utmMedium || merged.utmCampaign || merged.challengeCode;
  if (hasAnything) writeStored(merged);
  return merged;
}

export function getAttribution(): Attribution {
  return (
    readStored() ?? {
      ref: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      challengeCode: null,
      capturedAt: new Date().toISOString(),
    }
  );
}

/** Build a shareable absolute URL with attribution query params. */
export function buildShareUrl(path: string, extras: Record<string, string | null | undefined> = {}): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://aquazero.fit';
  const url = new URL(path.startsWith('http') ? path : `${origin}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(extras)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

export function inviteRefFromUserId(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 10);
}
