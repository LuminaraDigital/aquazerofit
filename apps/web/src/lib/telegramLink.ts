/**
 * Web → Telegram deep links.
 *
 * The landing page's job is to hand a visitor to the Mini App, and the hop
 * across that boundary is where attribution normally dies: the browser's
 * localStorage does not travel to Telegram, and neither does the query string.
 * Telegram's only channel is the deep-link payload — `?startapp=…`, which
 * arrives back as `start_param` inside the signed launch data.
 *
 * That payload is a hostile little field: 1–64 characters, `A–Z a–z 0–9 _ -`
 * only, and Telegram refuses the whole link rather than truncating one that
 * breaks the rules. So attribution is *encoded* to fit — see `encodePayload`.
 */
import type { Attribution } from './attribution';
import { SITE } from './siteConfig';
import { TELEGRAM_START_PARAM_MAX_CHARS } from './site';

/** Field order is fixed so a payload is stable and diffable in analytics. */
const FIELDS = [
  ['r', 'ref'],
  ['c', 'challengeCode'],
  ['s', 'utmSource'],
  ['m', 'utmMedium'],
  ['p', 'utmCampaign'],
] as const;

const SEPARATOR = '__';

/**
 * Strip a value to the payload alphabet. `_` is dropped as well as everything
 * outside it: it is legal in the payload but it is also what the separator is
 * built from, and a value containing `__` would otherwise split into two
 * fields on the way back.
 */
function sanitise(value: string): string {
  return value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 24);
}

/**
 * Encode attribution into a Telegram start payload, or null when there is
 * nothing worth carrying.
 *
 * Fields are dropped from the end when the budget runs out rather than the
 * whole payload being truncated mid-value, because a truncated `utm_campaign`
 * is indistinguishable from a real but shorter one and quietly corrupts the
 * report it feeds.
 */
export function encodePayload(attr: Partial<Attribution>): string | null {
  const parts: string[] = [];
  for (const [key, field] of FIELDS) {
    const raw = attr[field];
    if (!raw) continue;
    const clean = sanitise(String(raw));
    if (!clean) continue;
    const candidate = `${key}-${clean}`;
    const joined = parts.length ? `${parts.join(SEPARATOR)}${SEPARATOR}${candidate}` : candidate;
    if (joined.length > TELEGRAM_START_PARAM_MAX_CHARS) break;
    parts.push(candidate);
  }
  return parts.length ? parts.join(SEPARATOR) : null;
}

/**
 * Decode a `start_param` produced by `encodePayload`. Unknown keys and
 * malformed segments are skipped rather than throwing: the payload arrives
 * from outside and a bad one must cost attribution, never the app launch.
 */
export function decodePayload(payload: string | null | undefined): Partial<Attribution> {
  if (!payload) return {};
  const out: Partial<Attribution> = {};
  for (const segment of payload.split(SEPARATOR)) {
    const dash = segment.indexOf('-');
    if (dash < 1) continue;
    const key = segment.slice(0, dash);
    const value = segment.slice(dash + 1);
    if (!value) continue;
    const field = FIELDS.find(([k]) => k === key)?.[1];
    if (!field) continue;
    out[field] = field === 'challengeCode' ? value.toUpperCase() : value;
  }
  return out;
}

/**
 * The Mini App deep link.
 *
 * `t.me/<bot>/<shortName>` opens the Mini App directly. Without a registered
 * short name it degrades to `t.me/<bot>`, which opens the bot's main Mini App
 * if one is set and otherwise the chat — still a working link, one tap worse.
 */
export function telegramAppUrl(attr: Partial<Attribution> = {}): string {
  const { telegramBotUsername, telegramMiniAppShortName } = SITE;
  const base = telegramMiniAppShortName
    ? `https://t.me/${telegramBotUsername}/${telegramMiniAppShortName}`
    : `https://t.me/${telegramBotUsername}`;
  const payload = encodePayload(attr);
  return payload ? `${base}?startapp=${payload}` : base;
}

/**
 * `tg://` variant. Registered as a protocol handler by every installed
 * Telegram client, so it opens the desktop or mobile app without the t.me
 * web interstitial — but it fails silently when Telegram is not installed,
 * which is why it is offered alongside the https link rather than instead of it.
 */
export function telegramProtocolUrl(attr: Partial<Attribution> = {}): string {
  const { telegramBotUsername, telegramMiniAppShortName } = SITE;
  const params = new URLSearchParams({ domain: telegramBotUsername });
  if (telegramMiniAppShortName) params.set('appname', telegramMiniAppShortName);
  const payload = encodePayload(attr);
  if (payload) params.set('startapp', payload);
  return `tg://resolve?${params.toString()}`;
}
