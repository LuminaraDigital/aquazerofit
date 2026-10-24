/**
 * Per-user Fight Record state: which belts have been celebrated, and the
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

export interface FightRecordState {
  id: string;
  type: 'fightRecordState';
  userId: string;
  /**
   * Awards whose celebration has been shown and closed. Bounded by the awards
   * themselves (at most five a season), so it cannot grow without limit.
   */
  celebratedAwardIds: string[];
  emojiStatus: {
    enabled: boolean;
    /** The consent copy the user agreed to, so a later rewording is traceable. */
    consentTextVersion: string | null;
    /**
     * What Telegram last accepted. A read only calls out to Telegram when the
     * belt it would send differs from this, so an ordinary dashboard load
     * costs nothing.
     */
    lastSet: { seasonId: string; tier: BeltTier } | null;
    updatedAt: string | null;
  };
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
    celebratedAwardIds: [],
    emojiStatus: { enabled: false, consentTextVersion: null, lastSet: null, updatedAt: null },
    updatedAt: new Date().toISOString(),
  };
}

export function saveFightRecordState(state: FightRecordState): FightRecordState {
  const next: FightRecordState = { ...state, updatedAt: new Date().toISOString() };
  getStore().upsert('logs', next);
  return next;
}
