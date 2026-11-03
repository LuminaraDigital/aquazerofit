/**
 * Reaction delivery accounting.
 *
 * The invariant under test is the one `acknowledgeReactions` states in its own
 * doc comment: "An unacknowledged reaction is one the user did not see, and
 * should reappear." A reaction that reappears is recoverable; one that was
 * burned is gone for good, so every case here pushes on the burn direction.
 *
 * These are unit tests rather than integration ones on purpose: reaching the
 * four-achievements-and-a-level-up state through the HTTP surface exercises the
 * achievement rules, not the delivery accounting that was broken.
 */
import { describe, expect, it } from 'vitest';
import type {
  AchievementDefinition,
  CoachState,
  ExperienceStatus,
  ProgressSummary,
} from '@aquazerofit/shared';
import { coachById } from '@aquazerofit/shared';
import {
  acknowledgeReactions,
  buildReactions,
  emittedAchievements,
  recordDelivery,
} from '../modules/coaches/reactions';

const coach = coachById('akin')!;

function definition(id: string, name: string): AchievementDefinition {
  return {
    id,
    type: 'achievementDefinition',
    name,
    description: name,
    icon: 'star',
    rule: { kind: 'streak', days: 1 },
  } as AchievementDefinition;
}

/** The four an account earns on its first day, in the id order the API sorts by. */
const FIRST_DAY = [
  definition('ach-first-meal', 'First Bite'),
  definition('ach-first-weighin', 'On the Record'),
  definition('ach-first-workout', 'First Rep'),
  definition('ach-profile-complete', 'All Set'),
];

function summaryWith(defs: AchievementDefinition[]): ProgressSummary {
  return {
    currentWeightKg: null,
    startWeightKg: null,
    targetWeightKg: null,
    weightSeries: [],
    streakDays: 1,
    consistency: { state: 'building', currentDays: 1, bestDays: 1 },
    workoutsCompleted: 1,
    totalKcalBurned: 0,
    achievements: defs.map((d) => ({ definition: d, earnedAt: '2026-08-29T10:00:00.000Z' })),
  } as unknown as ProgressSummary;
}

function experienceAt(level: number, rankId = 'rank-1'): ExperienceStatus {
  return {
    totalXp: 75,
    level,
    rank: { id: rankId, name: 'Novice' },
    levelProgress: 0.5,
    bankedIntoLevel: 10,
  } as unknown as ExperienceStatus;
}

function stateWith(seenLevel: number, seenAchievementIds: string[] = []): CoachState {
  return {
    type: 'coachState',
    id: 'u1',
    userId: 'u1',
    activeCoachId: coach.id,
    baselineXp: 0,
    accrued: {},
    purchased: [],
    seenLevel,
    seenRankId: 'rank-1',
    seenAchievementIds,
  } as unknown as CoachState;
}

/** One dashboard read: build the card and record what it showed. */
function readCard(state: CoachState, experience: ExperienceStatus, summary: ProgressSummary) {
  const reactions = buildReactions(coach, state, experience, summary, false);
  recordDelivery(state, experience, summary);
  return reactions;
}

describe('reaction delivery accounting', () => {
  it('never marks an achievement seen that the card had no room to show', () => {
    // First run: four achievements at once, and 75 XP crosses into level 2, so
    // the level-up headline takes one of the three slots.
    const state = stateWith(1);
    const summary = summaryWith(FIRST_DAY);
    const experience = experienceAt(2);

    const shown = readCard(state, experience, summary)
      .filter((r) => r.kind === 'achievement')
      .map((r) => r.text);
    acknowledgeReactions(state);

    const unshown = FIRST_DAY.filter((d) => !shown.some((t) => t.includes(d.name)));
    expect(unshown.length).toBeGreaterThan(0); // the truncation is real
    for (const d of unshown) {
      expect(state.seenAchievementIds).not.toContain(d.id);
    }
  });

  it('reappears on the next card, rather than being burned', () => {
    const state = stateWith(1);
    const summary = summaryWith(FIRST_DAY);

    readCard(state, experienceAt(2), summary);
    acknowledgeReactions(state);

    // Second visit: level already seen, so all three slots are free.
    const second = readCard(state, experienceAt(2), summary).filter(
      (r) => r.kind === 'achievement',
    );
    expect(second.length).toBeGreaterThan(0);
    acknowledgeReactions(state);

    for (const d of FIRST_DAY) {
      expect(state.seenAchievementIds).toContain(d.id);
    }
  });

  it('acks what was displayed, not what has been earned since', () => {
    // The outbox draining behind the celebration overlay is the ordinary case:
    // the card is read with one achievement fresh, three more land while the
    // user is looking at it, and only then does the client acknowledge.
    const state = stateWith(5, []);
    const atRead = summaryWith([definition('ach-a', 'Alpha')]);

    const shown = readCard(state, experienceAt(5), atRead).filter(
      (r) => r.kind === 'achievement',
    );
    expect(shown).toHaveLength(1);

    // Three more earned between the read and the ack. The ack must not see them.
    acknowledgeReactions(state);

    expect(state.seenAchievementIds).toEqual(['ach-a']);
    for (const id of ['ach-b', 'ach-c', 'ach-d']) {
      expect(state.seenAchievementIds).not.toContain(id);
    }
  });

  it('keeps an achievement seen after it is un-earned, so it cannot celebrate twice', () => {
    // Achievements are derived from live activity, so deleting a meal log
    // un-earns one. A replace-based ack dropped it and let it fire again.
    const state = stateWith(5, ['ach-first-meal']);
    const withoutIt = summaryWith([definition('ach-first-workout', 'First Rep')]);

    readCard(state, experienceAt(5), withoutIt);
    acknowledgeReactions(state);

    expect(state.seenAchievementIds).toContain('ach-first-meal');
  });

  it('does not rewind seenRankId when no rank-up was shown', () => {
    // Level can fall (XP is folded from live activity) while seenLevel is a
    // high-water mark, so no headline renders — but an unconditional write
    // pushed the lower rank back into seenRankId and burned the rank-up.
    const state = stateWith(9);
    state.seenRankId = 'rank-3';
    const summary = summaryWith([]);

    const shown = readCard(state, experienceAt(4, 'rank-2'), summary);
    expect(shown.every((r) => r.kind !== 'rankUp' && r.kind !== 'levelUp')).toBe(true);
    acknowledgeReactions(state);

    expect(state.seenRankId).toBe('rank-3');
    expect(state.seenLevel).toBe(9);
  });

  it('marks nothing when no card was read', () => {
    const state = stateWith(1);
    acknowledgeReactions(state);
    expect(state.seenAchievementIds).toEqual([]);
    expect(state.seenLevel).toBe(1);
  });

  it('agrees with what buildReactions emitted', () => {
    const state = stateWith(1);
    const summary = summaryWith(FIRST_DAY);
    const experience = experienceAt(2);

    const emitted = emittedAchievements(state, experience, summary).map((a) => a.definition.id);
    const shown = buildReactions(coach, state, experience, summary, false).filter(
      (r) => r.kind === 'achievement',
    );

    expect(emitted).toHaveLength(shown.length);
  });
});
