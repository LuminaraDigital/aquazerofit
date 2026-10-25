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
import { fightRecordEnabledFor } from '../fightRecord/service';

export function fcEnabled(feature: FcFeature, userId: string): boolean {
  return fightCampConfig.featureEnabled(feature) && fightRecordEnabledFor(userId);
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
