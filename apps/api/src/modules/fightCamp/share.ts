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
import { seasonFor, type ShareKindP1, type ShareLinkView, type ShareSummary, type User } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { getStore } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { fcEnabled } from './flags';
import { engageRepo, type ShareLinkRow, type Surface } from './repo';
import { displayNameOf } from './squads';

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
    tgStartParam: `sh_${link.code}`,
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

/** A link was opened. Returns where to send the visitor; never fails. */
export async function landOn(code: string, surface: Surface): Promise<string> {
  const home = `${config.appPublicUrl}/`;
  const link = await engageRepo().shareLinkByCode(code);
  if (!link) return home;
  logEvent('share_link_landed', { kind: link.kind, surface });
  return `${home}?ref=sh_${link.code}`;
}

function isNewAccount(userId: string, now: Date): boolean {
  const createdAt = getStore().byId<User>('users', userId)?.createdAt;
  return createdAt !== undefined && now.getTime() - Date.parse(createdAt) < ATTRIBUTION_WINDOW_MS;
}

/**
 * Credit a new account to the share link it arrived through. Silent either
 * way: the caller learns nothing about codes, accounts or earlier claims.
 */
export async function claimShareAttribution(userId: string, code: string, surface: Surface, now: Date = new Date()): Promise<void> {
  if (!fcEnabled('shareKit', userId) || !isNewAccount(userId, now)) return;
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
  if (!fcEnabled('shareKit', userId) || !isNewAccount(userId, now)) return;
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
  const mates = mine ? new Set((await repo.activeMembers(mine.squadId)).map((m) => m.userId)) : new Set<string>();
  return {
    joined: invitees.length,
    inYourSquad: invitees.filter((id) => mates.has(id)).map(displayNameOf),
  };
}
