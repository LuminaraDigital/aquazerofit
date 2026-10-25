/**
 * Squad Corner and Telegram invites (AZF-P1 US-C3, US-C4).
 *
 * Squad Corner: when the Mini App is opened from a Telegram group, that
 * group can have one squad per season. The group is identified by the
 * `chat_instance` inside Telegram's signed launch data, which the server
 * verifies itself and stores only as an HMAC under a server secret. Nothing
 * here reads the group's messages or members, and nothing posts to it:
 * members share the invite themselves.
 *
 * Invites: in a Bot API 8.0 client the bot prepares a fixed-copy message the
 * user then sends to chats they pick in Telegram's own chooser. Where that is
 * unavailable the answer is null and the client falls back to a share link.
 */
import { createHmac } from 'node:crypto';
import {
  seasonFor,
  type SquadCornerInput,
  type SquadCornerView,
  type User,
} from '@aquazerofit/shared';
import { AppError } from '../../platform/errors';
import { fightCampConfig } from '../../platform/fightCampConfig';
import { getStore, newId } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { validateTelegramInitData } from '../auth/telegram';
import { botConfigured, savePreparedInlineMessage } from '../payments/telegramBot';
import { engageRepo } from './repo';
import { createSquad, joinSquad, membershipIn, peekOf, requireSquadAdult } from './squads';

const GROUP_CHAT_TYPES = new Set(['group', 'supergroup']);

/** HMAC-SHA256 of the group's chat_instance: stable per group, useless without the key. */
export function cornerHash(chatInstance: string, secret: string): string {
  return createHmac('sha256', secret).update(`squad-corner:${chatInstance}`).digest('hex');
}

/**
 * Verify the launch data belongs to the caller and came from a group, and
 * return that group's hash. Every refusal happens before any lookup, so the
 * route cannot be used to ask about a group the caller was not launched from.
 */
function groupHashFor(userId: string, tgInitData: string, secret: string): string {
  const tgUser = validateTelegramInitData(tgInitData);
  const user = getStore().byId<User>('users', userId);
  if (typeof user?.tgId !== 'number' || user.tgId !== tgUser.id) {
    throw new AppError('FORBIDDEN', 'Open AquaZeroFit from Telegram with the account you signed in with.', {
      reason: 'tg_account_mismatch',
    });
  }
  const params = new URLSearchParams(tgInitData);
  const chatType = params.get('chat_type') ?? '';
  const chatInstance = params.get('chat_instance') ?? '';
  if (!GROUP_CHAT_TYPES.has(chatType) || chatInstance.length === 0 || chatInstance.length > 128) {
    throw new AppError('VALIDATION_FAILED', 'Squad Corner opens from a Telegram group.', {
      reason: 'not_a_group',
    });
  }
  return cornerHash(chatInstance, secret);
}

export async function squadCorner(userId: string, input: SquadCornerInput, today: string): Promise<SquadCornerView> {
  const secret = fightCampConfig.engageHmacSecret;
  if (!secret) throw new AppError('NOT_FOUND', 'Resource not found');
  const hash = groupHashFor(userId, input.tgInitData, secret);
  requireSquadAdult(userId);

  const season = seasonFor(today).number;
  if (input.action === 'create') {
    await createSquad(userId, input.name, today, new Date(), { cornerHash: hash });
  } else if (input.action === 'join') {
    const squad = await engageRepo().squadByCorner(season, hash);
    if (!squad) throw new AppError('NOT_FOUND', 'This group has no Squad Corner yet.', { reason: 'squad_not_found' });
    await joinSquad(userId, squad, today, 'corner');
  }

  const squad = await engageRepo().squadByCorner(season, hash);
  if (!squad) return { state: 'none', squad: null };
  const peek = await peekOf(squad);
  const mine = await engageRepo().activeMembership(userId, season);
  const state = mine?.squadId === squad.id ? 'member' : peek.full ? 'full' : 'joinable';
  return { state, squad: peek };
}

/**
 * A prepared invite for `WebApp.shareMessage`, or null where Telegram cannot
 * do it (no bot, no linked Telegram account, an older Bot API, an error):
 * the client then falls back to a share link, so null is not a failure.
 */
export async function prepareSquadInvite(userId: string, squadId: string): Promise<string | null> {
  await membershipIn(userId, squadId);
  const tgId = getStore().byId<User>('users', userId)?.tgId;
  const squad = await engageRepo().squad(squadId);
  if (!squad || typeof tgId !== 'number' || !botConfigured()) return null;
  const prepared = await savePreparedInlineMessage(tgId, {
    id: newId('inv').slice(0, 64),
    title: 'Join my squad on AquaZeroFit',
    description: squad.name,
    text: `Join "${squad.name}", my Fight Camp squad on AquaZeroFit. We cheer each other on for showing up.`,
    button: {
      text: 'Join the squad',
      url: `${fightCampConfig.telegramMiniAppLink}?startapp=sq_${squad.inviteCode}`,
    },
  });
  if (!prepared.ok) {
    logEvent('squad_invite_prepare_failed', {});
    return null;
  }
  return prepared.result.id;
}
