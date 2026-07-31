/**
 * Local-date resolution helpers (AQF-07 §1: timestamps are ISO UTC; the client
 * supplies its timezone — X-Timezone header — so day boundaries resolve
 * correctly server-side when the client omits an explicit localDate).
 */
import type { Request } from 'express';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD for `at` in the given IANA timezone (UTC fallback on bad input). */
export function localDateFor(timeZone: string | undefined, at: Date = new Date()): string {
  try {
    // en-CA locale formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export function timezoneOf(req: Request): string | undefined {
  const tz = req.headers['x-timezone'];
  return typeof tz === 'string' && tz.length > 0 ? tz : undefined;
}

/** Today's local date for the requesting client. */
export function todayFor(req: Request): string {
  return localDateFor(timezoneOf(req));
}

export function isValidLocalDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value);
}

/** date arithmetic on YYYY-MM-DD strings (UTC-safe). */
export function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of the `days` local dates ending at `endDate`. */
export function lastNDates(endDate: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(addDays(endDate, -i));
  return out;
}

export function rangeToDays(range: '7d' | '30d' | '90d'): number {
  return range === '7d' ? 7 : range === '30d' ? 30 : 90;
}
