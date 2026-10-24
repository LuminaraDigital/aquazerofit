/**
 * Per-user Fight Record state: how far celebrations have been seen, and the
 * emoji-status preference (AZF-W3-05 §4.4).
 *
 * One document in `logs` with a top-level `userId`, deliberately: the export
 * and erasure sweeps in me/service take every `logs` document by `userId`, so
 * this record is exported and erased with no list anywhere to keep in sync.
 *
 * Nothing is written until something actually changes. A user who never earns
 * a belt or touches the setting never gets a document, which keeps a dark or
 * partially rolled-out feature from leaving a row behind for everyone who
 * merely loaded the dashboard.
 */
import type { BeltTier } from '@aquazerofit/shared';
import { getStore } from '../../platform/store';

/** A belt's position in acknowledgement order: season first, then tier. */
export interface BeltMark {
  seasonNumber: number;
  tier: BeltTier;
}

/**
 * Off, or on with the consent it was granted under. A union rather than a
 * flag beside nullable fields, so "off but still remembering a status it set"
 * is a state the type cannot hold.
 */
export type EmojiStatusPreference =
  | { enabled: false }
  | {
      enabled: true;
      /** The consent copy the user agreed to, so a later rewording is traceable. */
      consentTextVersion: string;
      /**
       * What Telegram last accepted. A read only calls out to Telegram when
       * the belt it would send differs from this, so an ordinary dashboard
       * load costs nothing.
       */
      lastSet: { seasonId: string; tier: BeltTier } | null;
    };

export interface FightRecordState {
  id: string;
  type: 'fightRecordState';
  userId: string;
  /**
   * The highest belt whose celebration has been shown and closed. Everything
   * at or below it counts as seen, which is what one acknowledgement means:
   * a returning user shown their newest belt is not then walked through older
   * ones, and a log backfilled into a finished season cannot resurrect a
   * celebration for it.
   */
  celebratedThrough: BeltMark | null;
  emojiStatus: EmojiStatusPreference;
  updatedAt: string;
}

export const fightRecordStateId = (userId: string): string => `fight-record-${userId}`;

export function getFightRecordState(userId: string): FightRecordState {
  const existing = getStore().byId<FightRecordState>('logs', fightRecordStateId(userId));
  if (existing && existing.type === 'fightRecordState' && existing.userId === userId) {
    return existing;
  }
  return {
    id: fightRecordStateId(userId),
    type: 'fightRecordState',
    userId,
    celebratedThrough: null,
    emojiStatus: { enabled: false },
    updatedAt: new Date().toISOString(),
  };
}

export function saveFightRecordState(state: FightRecordState): FightRecordState {
  const next: FightRecordState = { ...state, updatedAt: new Date().toISOString() };
  getStore().upsert('logs', next);
  return next;
}
