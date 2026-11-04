/**
 * The one gate every Fight Camp surface goes through (AZF-P1 §5.1):
 *
 *   fcEnabled(feature, userId) =
 *     FIGHT_RECORD_ENABLED && the feature's sub-flag && the user's rollout bucket
 *
 * Off means off. A route answers 404 rather than 403 so a client hides the
 * surface without logging a released-later feature as a fault, and nothing is
 * written for a user outside the gate.
 */
import { config } from '../../platform/config';
import { AppError } from '../../platform/errors';
import { fightCampConfig, type FcFeature } from '../../platform/fightCampConfig';
import { fightRecordEnabledFor, isAdult } from '../fightRecord/service';
import { getProfile } from '../me/service';

export function fcEnabled(feature: FcFeature, userId: string): boolean {
  return fightCampConfig.featureEnabled(feature) && fightRecordEnabledFor(userId);
}

/** The features a protected user (under 18, or age not given) never gets (PRD §2). */
const ADULT_ONLY: ReadonlySet<FcFeature> = new Set<FcFeature>(['squads', 'cheers', 'shareKit', 'gifting']);

/** On for this person: the feature's gate, and adulthood where the feature needs it. */
export function fcAvailable(feature: FcFeature, userId: string): boolean {
  return fcEnabled(feature, userId) && (!ADULT_ONLY.has(feature) || isAdult(getProfile(userId)));
}

/**
 * Adults only, for the routes behind the ADULT_ONLY features. An unknown age
 * is its own reason so a new account arriving by invite can be sent to add
 * it, rather than being told it is a minor.
 */
export function requireAdult(userId: string): void {
  const age = getProfile(userId)?.age;
  if (typeof age !== 'number') {
    throw new AppError('FORBIDDEN', 'Add your age in your wellness essentials first: squads, cheers and sharing are for adults.', {
      reason: 'squad_age_unknown',
    });
  }
  if (!isAdult({ age })) {
    throw new AppError(
      'FORBIDDEN',
      'Squads, cheers and sharing are for members aged 18 and over. Your belts stay on your own Fight Record.',
      { reason: 'squad_adult_only' },
    );
  }
}

/** Throw the not-found every gated route answers when its feature is off. */
export function requireFeature(feature: FcFeature, userId: string): void {
  if (!fcEnabled(feature, userId)) throw new AppError('NOT_FOUND', 'Resource not found');
}

/**
 * For the few public routes (peek, share landing): there is no user to bucket,
 * so only the switches apply. The rollout bucket still gates every signed-in
 * action the visitor can take afterwards.
 */
export function requireFeatureSwitch(feature: FcFeature): void {
  if (!fightCampConfig.featureEnabled(feature) || !config.fightRecordEnabled) {
    throw new AppError('NOT_FOUND', 'Resource not found');
  }
}
