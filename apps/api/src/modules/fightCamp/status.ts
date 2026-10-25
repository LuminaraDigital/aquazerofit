/**
 * The `fightCamp` block on GET /fight-record (AZF-P1 §5.3): one read that
 * tells every client which Fight Camp parts exist for this person right now.
 *
 * Null when no feature is on for the caller, so with every sub-flag off the
 * response is byte-for-byte what R1a returned. Each part is computed only
 * when its own feature is on, so a dark feature costs no query.
 */
import { seasonFor, seasonTheme, type FightCampStatus } from '@aquazerofit/shared';
import { FC_FEATURES } from '../../platform/fightCampConfig';
import { enrolmentStatus } from './enrolment';
import { fcEnabled } from './flags';
import { syncGrace } from './grace';
import { squadsStatus } from './squads';
import { unseenCheers } from './cheers';
import { syncEarlyCheers } from './earlyCheers';
import { engageRepo } from './repo';
import { recapOffer } from './recap';
import { isAdult } from '../fightRecord/service';
import { getProfile } from '../me/service';

export async function fightCampStatus(userId: string, today: string): Promise<FightCampStatus | null> {
  if (!FC_FEATURES.some((feature) => fcEnabled(feature, userId))) return null;
  const season = seasonFor(today);
  return {
    theme: seasonTheme(season.number),
    enrolment: fcEnabled('enrol', userId) ? await enrolmentStatus(userId, today) : null,
    grace: fcEnabled('grace', userId) ? (await syncGrace(userId, today)).view : null,
    squads: fcEnabled('squads', userId) ? await squadsStatus(userId, today) : null,
    cheers: fcEnabled('cheers', userId) && isAdult(getProfile(userId)) ? await cheersStatus(userId, today) : null,
    shareKit:
      fcEnabled('shareKit', userId) && isAdult(getProfile(userId))
        ? { joined: (await engageRepo().inviteesOf(userId)).length }
        : null,
    recap: fcEnabled('enrol', userId) ? recapOffer(userId, today) : null,
  };
}

async function cheersStatus(userId: string, today: string): Promise<{ unseen: number }> {
  // A new person's coach cheers land before the count is read.
  await syncEarlyCheers(userId, today);
  return { unseen: await unseenCheers(userId) };
}
