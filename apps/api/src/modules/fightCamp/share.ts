/**
 * Share Kit links and attribution (AZF-P1 US-F1, US-F3).
 *
 *  - One reusable link per person, card kind and season. The code is 8
 *    characters from a CSPRNG and says nothing about who made it.
 *  - Landing on a link records that it was opened (kind and surface only)
 *    and hands the visitor to the landing page with `?ref=sh_<code>`, which
 *    the existing first-touch attribution captures. No user data is in the
 *    redirect.
 *  - An account created with a captured code writes one attribution row,
 *    first touch wins. Only a new account (under a day old) can be
 *    attributed, and never to its own link.
 *  - No rewards for referrals in Phase 1 (Spam Act, trade promotions): the
 *    inviter only sees how many people joined from their cards, and the
 *    names of those who are now in the same squad.
 */
import { randomInt } from 'node:crypto';
import { SHARE_START_PREFIX, seasonFor, type ShareKindP1, type ShareLinkView, type ShareSummary } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { getProfile } from '../me/service';
import { logError, logEvent } from '../../platform/telemetry';
import { fcEnabled } from './flags';
import { engageRepo, type ShareLinkRow, type Surface } from './repo';
import { adultMembers } from './squads';
import { accountYoungerThan, displayNameOf } from './people';

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** An account this young can still be credited to a share link. */
export const ATTRIBUTION_WINDOW_MS = 24 * 3_600_000;

function issueShareCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!;
  return code;
}

function viewOf(link: ShareLinkRow): ShareLinkView {
  return {
    code: link.code,
    url: `${config.appPublicUrl}/r/${link.code}`,
    tgStartParam: `${SHARE_START_PREFIX}${link.code}`,
  };
}

/** The person's link for this kind this season, made the first time it is asked for. */
export async function shareLinkFor(
  userId: string,
  kind: ShareKindP1,
  today: string,
  now: Date = new Date(),
): Promise<ShareLinkView> {
  const repo = engageRepo();
  const seasonNumber = seasonFor(today).number;
  const held = await repo.shareLink(userId, kind, seasonNumber);
  if (held) return viewOf(held);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const row: ShareLinkRow = { code: issueShareCode(), userId, kind, seasonNumber, createdAt: now.toISOString() };
    const outcome = await repo.insertShareLink(row);
    if (outcome === 'inserted') return viewOf(row);
    if (outcome === 'exists') return viewOf((await repo.shareLink(userId, kind, seasonNumber))!);
  }
  throw new Error('Could not issue a share code');
}

/**
 * Link-preview fetchers (the chat apps unfurling a posted link) and other
 * crawlers. They open a link every time it is posted, which would count as
 * visits nobody made and drag share-to-install down.
 */
const PREVIEW_AGENT = /bot\b|crawl|spider|preview|facebookexternalhit|embedly|slack|whatsapp|discord|skype|curl|wget|python-requests|headless/i;

export function isPreviewAgent(userAgent: string | undefined): boolean {
  return !userAgent || PREVIEW_AGENT.test(userAgent);
}

/**
 * A link was opened. Returns where to send the visitor. `count` is false for
 * a preview fetcher: it still gets the redirect, it is just not a visit. The
 * counter is best effort and never costs the visitor their ref.
 */
export async function landOn(code: string, surface: Surface, count = true): Promise<string> {
  const home = `${config.appPublicUrl}/`;
  const link = await engageRepo().shareLinkByCode(code);
  if (!link) return home;
  if (count) {
    await engageRepo()
      .recordLanding(new Date().toISOString().slice(0, 10), link.kind, surface)
      .catch((err: unknown) => logError(err, { route: 'share.landing' }));
    logEvent('share_link_landed', { kind: link.kind, surface });
  }
  return `${home}?ref=${SHARE_START_PREFIX}${link.code}`;
}

/**
 * Under a day old, and not known to be a minor. An age not given yet still
 * counts: a new account usually claims before onboarding asks for it.
 */
function attributable(userId: string, now: Date): boolean {
  const age = getProfile(userId)?.age;
  if (typeof age === 'number' && age < 18) return false;
  return accountYoungerThan(userId, ATTRIBUTION_WINDOW_MS, now);
}

/**
 * Credit a new account to the share link it arrived through. Silent either
 * way: the caller learns nothing about codes, accounts or earlier claims.
 */
export async function claimShareAttribution(userId: string, code: string, surface: Surface, now: Date = new Date()): Promise<void> {
  // The router has already checked the Share Kit is on for this person.
  if (!attributable(userId, now)) return;
  const link = await engageRepo().shareLinkByCode(code);
  if (!link || link.userId === userId) return;
  const recorded = await engageRepo().attribute({
    inviteeUserId: userId,
    shareCode: link.code,
    squadId: null,
    surface,
    createdAt: now.toISOString(),
  });
  if (recorded) logEvent('referral_attributed', { kind: link.kind, surface });
}

/** A new account that joined a squad by its invite counts for that squad. */
export async function attributeSquadJoin(userId: string, squadId: string, surface: Surface, now: Date = new Date()): Promise<void> {
  if (!fcEnabled('shareKit', userId) || !attributable(userId, now)) return;
  const recorded = await engageRepo().attribute({
    inviteeUserId: userId,
    shareCode: null,
    squadId,
    surface,
    createdAt: now.toISOString(),
  });
  if (recorded) logEvent('referral_attributed', { kind: 'squad_invite', surface });
}

export async function shareSummary(userId: string, today: string): Promise<ShareSummary> {
  const repo = engageRepo();
  const invitees = await repo.inviteesOf(userId);
  const mine = await repo.activeMembership(userId, seasonFor(today).number);
  const mates = mine ? new Set((await adultMembers(mine.squadId)).map((m) => m.userId)) : new Set<string>();
  return {
    joined: invitees.length,
    inYourSquad: invitees.filter((id) => mates.has(id)).map(displayNameOf),
  };
}
