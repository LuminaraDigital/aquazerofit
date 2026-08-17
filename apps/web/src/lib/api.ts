/**
 * Typed API client for /api/v1 (AQF-07). Handles the bearer token, transparent
 * refresh-token rotation, the error envelope, and SSE streaming for chat.
 *
 * FE-01: the refresh token lives in an httpOnly cookie scoped to
 * /api/v1/auth — it is never written to web storage. The access token is
 * kept in a module-level variable (memory only); a page reload restores the
 * session by calling /auth/refresh, whose cookie carries the credential.
 */
import { isApiErrorBody, type ApiErrorBody, type AuthResponse } from '@aquazerofit/shared';

/**
 * API origin. Same-origin by default, which is what the Vite dev proxy and any
 * single-origin deployment want. Split-origin hosting (static site on a CDN,
 * API on its own hostname) sets VITE_API_BASE_URL at build time — without it
 * every request would resolve against the static host and 404.
 */
const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '')}/api/v1`
  : '/api/v1';

/** Origin serving committed exercise media (`/uploads/...`). */
export const MEDIA_BASE = String(import.meta.env.VITE_MEDIA_BASE_URL ?? '').replace(/\/+$/, '');

/** Resolve a server-relative media path against MEDIA_BASE. */
export function mediaUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${MEDIA_BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = 'ApiError';
  }
  get code() {
    return this.body.code;
  }
}

// In-memory access token only — never localStorage/sessionStorage (FE-01).
let accessToken: string | null = null;

export const tokenStore = {
  get access() {
    return accessToken;
  },
  /** Refresh token stays in the httpOnly cookie; exposed values are null. */
  get refresh(): string | null {
    return null;
  },
  /** Accepts the AuthResponse shape; only the access token is retained. */
  set(tokens: { accessToken: string }) {
    accessToken = tokens.accessToken;
  },
  clear() {
    accessToken = null;
  },
  get isAuthenticated() {
    return Boolean(accessToken);
  },
};

let refreshPromise: Promise<boolean> | null = null;

/** JWT-like bearer tokens have three base64url segments. */
function isJwtLike(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const base64url = /^[A-Za-z0-9_-]+$/;
  return parts.every((part) => part.length > 0 && base64url.test(part));
}

/**
 * Rotate the session via the httpOnly refresh cookie. Empty body — the
 * cookie carries the credential. Used on 401 retry, app boot, and SSE.
 */
async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      const data = (await res.json()) as AuthResponse;
      tokenStore.set(data);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/**
 * Restore a session after a page reload: the in-memory access token is gone
 * but the refresh cookie survives. Returns true when a fresh access token
 * was minted. Safe to call unconditionally on boot — it is a no-op when
 * already authenticated and deduplicates concurrent callers.
 */
export async function restoreSession(): Promise<boolean> {
  if (accessToken) return true;
  return tryRefresh();
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | undefined>;
  idempotencyKey?: string;
  auth?: boolean;
  retryOn401?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    formData,
    query,
    idempotencyKey,
    auth = true,
    retryOn401 = true,
  } = options;

  const qs = query
    ? '?' +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';

  const headers: Record<string, string> = {};
  if (!formData) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401 && auth && retryOn401 && (await tryRefresh())) {
    return api<T>(path, { ...options, retryOn401: false });
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(res.status, {
      code: 'INTERNAL',
      message: 'Invalid JSON response from server',
    });
  }

  if (!res.ok) {
    const errBody: ApiErrorBody = isApiErrorBody(json)
      ? json
      : { code: 'INTERNAL', message: 'Unexpected error' };
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(res.status, errBody);
  }
  return json as T;
}

/**
 * Stream an assistant reply over server-sent events.
 * onToken receives incremental text; resolves with the final message payload.
 */
export async function streamChat(
  sessionId: string,
  content: string,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<unknown> {
  const doFetch = () => {
    const access = accessToken;
    if (access && !isJwtLike(access)) {
      throw new ApiError(401, { code: 'AUTH_INVALID', message: 'Invalid access token' });
    }
    return fetch(`${BASE}/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Omit the header entirely when signed out — interpolating a null
        // token sends the literal "Bearer null", which reads as a malformed
        // credential rather than an absent one.
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      body: JSON.stringify({ content }),
      signal,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();
  if (!res.ok) {
    const json = await res.json().catch(() => undefined);
    throw new ApiError(
      res.status,
      isApiErrorBody(json) ? json : { code: 'INTERNAL', message: 'Chat failed' },
    );
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: unknown = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const dataLine = evt
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n');
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine);
        if (parsed.type === 'token') onToken(parsed.token as string);
        else if (parsed.type === 'done') final = parsed.message;
        else if (parsed.type === 'error') {
          throw new ApiError(422, {
            code: parsed.code ?? 'SAFETY_OUTPUT',
            message: parsed.message ?? 'Generation blocked',
          });
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
        // ignore malformed keepalive frames
      }
    }
  }
  return final;
}
