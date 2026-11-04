/**
 * Fight Record client (AZF-W3-05 §4.2): the one read, its two writes, and the
 * belt vocabulary every surface draws from, so the dashboard card, the page,
 * the celebration and the share card cannot name or colour a belt differently.
 *
 * Kept out of ./queries, which is the shared data layer for everything else
 * and is already near the size where a file stops being readable whole.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  BeltAwardView,
  BeltTier,
  EmojiStatusSetting,
  FightCampStatus,
  FightRecordStatus,
} from '@aquazerofit/shared';
import { api } from './api';
import { unwrap } from './envelopes';
import type { ShareCardPayload } from './shareCard';

/**
 * Nested under ['progress'] on purpose. Every mutation that logs activity
 * (meals, water, weight, workouts) already invalidates that prefix, so a new
 * active day refreshes the belt without new wiring at a dozen call sites, and
 * one a future logging surface adds cannot forget it.
 */
export const fightRecordKey = ['progress', 'fightRecord'] as const;

/**
 * The whole GET /fight-record body. One cache entry, one queryFn, and each
 * hook below carves its slice with `select` (the rule in lib/queries.ts:
 * same key, same raw shape). `fightCamp` is read by hand rather than with
 * `unwrap`, which answers the whole body when a key is absent.
 */
export interface FightRecordEnvelope {
  fightRecord: FightRecordStatus | null;
  /** Absent unless a Fight Camp feature is on (AZF-P1 §5.3). */
  fightCamp: FightCampStatus | null;
}

async function fetchFightRecord(): Promise<FightRecordEnvelope> {
  const body = await api<unknown>('/fight-record');
  return {
    fightRecord: unwrap<FightRecordStatus>(body, 'fightRecord'),
    fightCamp: (body as { fightCamp?: FightCampStatus } | null)?.fightCamp ?? null,
  };
}

/**
 * `staleTime: 0` for the same reason as useProgression: this is the surface
 * that announces a new belt, so a cached answer right after a log is wrong at
 * exactly the moment it matters.
 */
const fightRecordQuery = { queryKey: fightRecordKey, queryFn: fetchFightRecord, staleTime: 0 } as const;

/** Null when the feature is off for this account: the caller renders nothing. */
export function useFightRecord(): UseQueryResult<FightRecordStatus | null> {
  return useQuery({ ...fightRecordQuery, select: (envelope) => envelope.fightRecord });
}

/** Null unless a Fight Camp feature is on: callers render only what exists. */
export function useFightCamp(): UseQueryResult<FightCampStatus | null> {
  return useQuery({ ...fightRecordQuery, select: (envelope) => envelope.fightCamp });
}

/** Update the cached record in place, leaving the Fight Camp block alone. */
function patchRecord(
  qc: ReturnType<typeof useQueryClient>,
  patch: (record: FightRecordStatus) => FightRecordStatus,
): void {
  qc.setQueryData<FightRecordEnvelope>(fightRecordKey, (envelope) =>
    envelope?.fightRecord ? { ...envelope, fightRecord: patch(envelope.fightRecord) } : envelope,
  );
}

/**
 * Acknowledge the celebration that was displayed. The cache is cleared before
 * the request so the sheet cannot reopen behind its own dismissal if the
 * network is slow; the refetch afterwards is the server's word on it.
 */
export function useAckBelt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (awardId: string) =>
      api<void>('/fight-record/ack', { method: 'POST', body: { awardId } }),
    onMutate: (awardId) => {
      patchRecord(qc, (record) =>
        record.celebrate?.id === awardId ? { ...record, celebrate: null } : record,
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: fightRecordKey }),
  });
}

export function useSetEmojiStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) =>
      unwrap<EmojiStatusSetting>(
        await api<unknown>('/fight-record/emoji-status', { method: 'PUT', body: { enabled } }),
        'emojiStatus',
      ),
    onSuccess: (emojiStatus) => {
      if (!emojiStatus) return;
      patchRecord(qc, (record) => ({ ...record, emojiStatus }));
    },
  });
}

// ---------- vocabulary ----------

export const BELT_LABEL: Record<BeltTier, string> = {
  white: 'White',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
};

export function beltName(tier: BeltTier): string {
  return `${BELT_LABEL[tier]} Belt`;
}

/**
 * Belt colours are the sport's, not the theme's: a blue belt is blue in light
 * and dark mode alike, which is why these are not design tokens. Every surface
 * that draws one also draws an outline, so white and black stay visible on
 * either background.
 */
export const BELT_COLOUR: Record<BeltTier, string> = {
  white: '#f4f6f8',
  blue: '#2f6fed',
  purple: '#7b4fd6',
  brown: '#8a5a3b',
  black: '#16181d',
};

/** The rank bar near the belt's end: black on every belt, red on a black belt. */
export function rankBarColour(tier: BeltTier): string {
  return tier === 'black' ? '#d62828' : '#16181d';
}

export function daysPhrase(n: number): string {
  return `${n} active ${n === 1 ? 'day' : 'days'}`;
}

/** What the next belt asks for, or what holding the top of the ladder means. */
export function nextBeltCopy(record: FightRecordStatus): string {
  const { activeDays, next } = record.current;
  if (!next) return 'Black Belt: the top of the ladder this season.';
  return `${daysPhrase(next.activeDays - activeDays)} to your ${beltName(next.tier)}.`;
}

/** Public, static, personal-data-free story art (tools/belts). */
export function storyMediaUrl(tier: BeltTier): string {
  return `${window.location.origin}/belts/${tier}.png`;
}

/**
 * The belt share card. Tier and season only: no count of days, no health
 * figure, nothing the card's recipients could not already infer from the
 * belt's name (AZF-W3-05 §5.2).
 *
 * The catchphrase is the product's line, not the coach's. The share sheet and
 * card attribute their catchphrase to the brand character, so putting a
 * coach's words there would credit one fighter with another's voice; the
 * coach already had the moment in the celebration itself.
 */
export function beltSharePayload(award: BeltAwardView): ShareCardPayload {
  return {
    kind: 'belt',
    headline: `${beltName(award.tier)} · Season ${award.seasonNumber}`,
    subline: award.seasonName,
    stats: [
      { label: 'Belt', value: BELT_LABEL[award.tier] },
      { label: 'Season', value: String(award.seasonNumber) },
    ],
    catchphrase: 'Earned by showing up.',
    belt: { colour: BELT_COLOUR[award.tier], bar: rankBarColour(award.tier) },
  };
}

/** Short caption for a story; the invite link is appended by the share sheet. */
export function beltStoryCaption(award: BeltAwardView): string {
  return `${beltName(award.tier)}, Season ${award.seasonNumber} on AquaZeroFit.`;
}
