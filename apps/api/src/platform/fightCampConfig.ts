/**
 * Fight Camp (AZF-P1) runtime switches, read from the environment on every
 * access like the rest of `config` so tests can flip them per case.
 *
 * Kept out of config.ts because that file sits at the repository's 1,000-line
 * ceiling. The posture is the same as FIGHT_RECORD_ENABLED: every switch is
 * off unless set to exactly "true" or "1", so a typo in a release control
 * fails toward fewer people, never toward everyone.
 *
 * These are the sub-flags only. Every feature also needs the Fight Record
 * master switch and its rollout bucket; `fcEnabled` in modules/fightCamp
 * composes the three, and nothing else should read these directly.
 */
import { readNonNegativeInt } from './config';

export const FC_FEATURES = ['enrol', 'squads', 'cheers', 'grace', 'shareKit', 'gifting'] as const;
export type FcFeature = (typeof FC_FEATURES)[number];

/** Exported so the env documentation test can check every name is documented. */
export const FC_FEATURE_ENV: Record<FcFeature, string> = {
  enrol: 'FC_ENROL_ENABLED',
  squads: 'FC_SQUADS_ENABLED',
  cheers: 'FC_CHEERS_ENABLED',
  grace: 'FC_GRACE_ENABLED',
  shareKit: 'FC_SHARE_KIT_ENABLED',
  gifting: 'FC_GIFTING_ENABLED',
};

/**
 * Below this an HMAC key is guessable enough that a hashed `chat_instance`
 * could be brute-forced back to the group it names. Same floor as the origin
 * secret.
 */
const MIN_ENGAGE_SECRET_LENGTH = 32;

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

export const fightCampConfig = {
  featureEnabled(feature: FcFeature): boolean {
    return envFlag(FC_FEATURE_ENV[feature]);
  },

  /**
   * Treatment share for early cheers (US-D2), 0 to 100. Unset or unparseable
   * means 0: the experiment has a holdout of everyone until someone sets it.
   */
  get earlyCheersPercent(): number {
    return Math.min(100, readNonNegativeInt(process.env.FC_EARLY_CHEERS_PERCENT, 0));
  },

  /**
   * Whole Stars for a gifted week of Premium. No default, like the Premium
   * price: unset, zero or anything that is not a positive safe integer hides
   * gifting rather than inventing an amount.
   */
  get giftPremium7dStars(): number | null {
    const raw = process.env.GIFT_PREMIUM_7D_STARS?.trim() ?? '';
    if (!/^[1-9]\d*$/.test(raw)) return null;
    const price = Number(raw);
    return Number.isSafeInteger(price) ? price : null;
  },

  /**
   * Key for hashing Telegram `chat_instance` values. Empty when unset or too
   * short, which disables Squad Corner: a group must never be bound under a
   * key someone could guess.
   */
  get engageHmacSecret(): string {
    const raw = process.env.ENGAGE_HMAC_SECRET?.trim() ?? '';
    return raw.length >= MIN_ENGAGE_SECRET_LENGTH ? raw : '';
  },
};
