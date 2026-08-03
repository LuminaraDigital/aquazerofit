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
