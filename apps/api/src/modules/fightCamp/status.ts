/**
 * The `fightCamp` block on GET /fight-record (AZF-P1 §5.3): one read that
 * tells every client which Fight Camp parts exist for this person right now.
 *
 * Null when no feature is on for the caller, so with every sub-flag off the
 * response is byte-for-byte what R1a returned. Each part is computed only
 * when its own feature is on for this person, adults only where the feature
 * is, so a dark feature costs no query; the parts are independent and are
 * read together.
 */
import { seasonFor, seasonTheme, type FightCampStatus } from '@aquazerofit/shared';
import { FC_FEATURES, type FcFeature } from '../../platform/fightCampConfig';
import { enrolmentStatus } from './enrolment';
import { fcAvailable, fcEnabled } from './flags';
import { syncGrace } from './grace';
import { squadsStatus } from './squads';
import { firstNameOf } from './people';
import { unseenCheers } from './cheers';
import { syncEarlyCheers } from './earlyCheers';
import { recapOffer } from './recap';
import { giftingStatus } from './gifts';

export async function fightCampStatus(
  userId: string,
  today: string,
  timezone: string | undefined,
): Promise<FightCampStatus | null> {
  if (!FC_FEATURES.some((feature) => fcEnabled(feature, userId))) return null;
  const on = (feature: FcFeature) => fcAvailable(feature, userId);
  const [enrolment, grace, squads, cheers, gifting] = await Promise.all([
    on('enrol') ? enrolmentStatus(userId, today) : null,
    on('grace') ? syncGrace(userId, today).then((g) => g.view) : null,
    on('squads') ? squadsStatus(userId, today) : null,
    on('cheers') ? cheersStatus(userId, today, timezone) : null,
    on('gifting') ? giftingStatus(userId) : null,
  ]);
  return {
    theme: seasonTheme(seasonFor(today).number),
    enrolment,
    grace,
    squads,
    cheers,
    shareKit: on('shareKit') ? { firstName: firstNameOf(userId) } : null,
    recap: on('enrol') ? recapOffer(userId, today) : null,
    gifting,
  };
}

async function cheersStatus(userId: string, today: string, timezone: string | undefined): Promise<{ unseen: number }> {
  // A new person's coach cheers land before the count is read.
  await syncEarlyCheers(userId, today, timezone);
  return { unseen: await unseenCheers(userId) };
}
