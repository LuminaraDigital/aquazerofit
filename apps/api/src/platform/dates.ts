/**
 * Local-date resolution helpers (AQF-07 §1: timestamps are ISO UTC; the client
 * supplies its timezone - X-Timezone header - so day boundaries resolve
 * correctly server-side when the client omits an explicit localDate).
 *
 * Two "today" semantics (do not mix them):
 * - `todayFor(req)`: the requesting client's calendar day (X-Timezone).
 * - `processLocalToday()`: the server process calendar day (jobs, grants,
 *   challenges with no request context). Prefer `todayFor` whenever a Request
 *   is available.
 */
import type { Request } from 'express';

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

/**
 * Process-local YYYY-MM-DD (server calendar, no timezone header).
 * Alias kept as `localToday` for AI-lane call sites without a Request.
 */
export function processLocalToday(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export const localToday = processLocalToday;

/** UTC calendar day as YYYY-MM-DD (credit grants, UTC-keyed ledgers). */
export function utcToday(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
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

/** Whole calendar days between two YYYY-MM-DD strings (UTC midnight). */
export function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}
