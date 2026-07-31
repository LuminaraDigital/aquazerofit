/**
 * Typed API client for /api/v1 (AQF-07). Handles the bearer token, transparent
 * refresh-token rotation, the error envelope, and SSE streaming for chat.
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

const ACCESS_KEY = 'azf.accessToken';
const REFRESH_KEY = 'azf.refreshToken';

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

export const tokenStore = {
  get access() {
    return sessionStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return sessionStorage.getItem(REFRESH_KEY) ?? localStorage.getItem(REFRESH_KEY);
  },
  set(tokens: { accessToken: string; refreshToken: string }) {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },
  clear() {
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(ACCESS_KEY);
      store.removeItem(REFRESH_KEY);
    }
  },
  get isAuthenticated() {
    return Boolean(this.access);
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

async function tryRefresh(): Promise<boolean> {
  if (!tokenStore.refresh) return false;
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokenStore.refresh }),
      });
      if (!res.ok) {
        tokenStore.clear();
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
  if (auth && tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`;
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
    const access = tokenStore.access;
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
