/**
 * The coach's reaction to what the user actually did.
 *
 * Everything here is a *lookup*, not a generation. The line is authored in the
 * roster, the trigger is a comparison over data the store already holds, and
 * the result is assembled with string substitution. That is a deliberate
 * architectural choice rather than a shortcut:
 *
 *  - it is instant, so the celebration lands in the same frame as the action;
 *  - it is free, so it does not consume a credit the user would rather spend
 *    on an actual coaching answer;
 *  - it works with no provider keys configured, like the rest of the offline
 *    path; and
 *  - it cannot say anything unsafe, because nothing is being written at
 *    runtime. The app's warmest moment is also its most predictable one.
 *
 * Ordering is by significance and capped at REACTION_LIMIT. A card that says
 * six things says none of them.
 */
import {
  renderReaction,
  type CoachEventKind,
  type CoachPersona,
  type CoachReaction,
  type CoachState,
  type ConsistencyStatus,
  type ExperienceStatus,
  type ProgressSummary,
} from '@aquazerofit/shared';

const REACTION_LIMIT = 3;

const EXPRESSION: Record<CoachEventKind, CoachReaction['expression']> = {
  greeting: 'neutral',
  levelUp: 'celebrate',
  rankUp: 'celebrate',
  achievement: 'celebrate',
  steady: 'neutral',
  returning: 'encourage',
  restDay: 'encourage',
  resting: 'encourage',
};

function reaction(
  coach: CoachPersona,
  kind: CoachEventKind,
  values: { n?: number; name?: string } = {},
): CoachReaction {
  return {
    coachId: coach.id,
    kind,
    text: renderReaction(coach.reactions[kind], values),
    expression: EXPRESSION[kind],
  };
}

// `earnedAchievementIds(summary)` used to live here and is deliberately gone.
// It answered "everything this user has earned", and the acknowledgement used
// it to decide what had been *shown* — two different questions whose answers
// only coincide when nothing was truncated and no time passed. Delivery is now
// recorded by the read (see [recordDelivery]); if you find yourself wanting
// this helper back, the question you actually have is what was displayed.

/**
 * Does a level-up or rank-up headline this card?
 *
 * Both branches in [buildReactions] require `experience.level > seenLevel` —
 * a rank-up is a level-up that also crossed a rank boundary — so this single
 * predicate decides whether the headline consumes one of the three slots.
 */
function hasHeadline(state: CoachState, experience: ExperienceStatus): boolean {
  return experience.level > state.seenLevel;
}

/**
 * The achievements this card will ACTUALLY show, newest first.
 *
 * Shared by [buildReactions] and [acknowledgeReactions] so the two cannot
 * disagree about what was delivered. They used to: the builder emitted at most
 * `REACTION_LIMIT` achievements and then truncated the whole card again after
 * the headline had already taken a slot, while the ack marked *every earned
 * achievement* seen. Anything squeezed out by that second truncation was burned
 * without ever being rendered — and on a new account that is the common case,
 * not an edge one: finishing onboarding, logging a meal, weighing in and
 * completing a workout earns four at once and levels the user to 2, so the
 * headline takes a slot and two achievements are silently marked delivered.
 *
 * Deriving the emitted set from the same function the builder uses is what
 * makes that class of bug unrepresentable, rather than fixed once.
 */
export function emittedAchievements(
  state: CoachState,
  experience: ExperienceStatus,
  summary: ProgressSummary,
): ProgressSummary['achievements'] {
  const room = REACTION_LIMIT - (hasHeadline(state, experience) ? 1 : 0);
  if (room <= 0) return [];
  const seen = new Set(state.seenAchievementIds);
  const fresh = summary.achievements.filter(
    (a) => a.earnedAt !== null && !seen.has(a.definition.id),
  );
  // Newest first, so a backfill that awards several at once leads with the one
  // the user most likely just earned.
  return fresh.slice(-room).reverse();
}

/**
 * Did the user log a day off after training? Read from consistency rather than
 * recomputed: a rest day is only meaningful *inside* an active run, and
 * `currentDays` is already the authority on whether a run is open.
 */
function isRestDay(consistency: ConsistencyStatus, workedOutToday: boolean): boolean {
  return !workedOutToday && consistency.currentDays > 0 && consistency.state !== 'resting';
}

export function buildReactions(
  coach: CoachPersona,
  state: CoachState,
  experience: ExperienceStatus,
  summary: ProgressSummary,
  workedOutToday: boolean,
): CoachReaction[] {
  const out: CoachReaction[] = [];

  // Rank first: it subsumes the level-up that produced it, so a user who
  // crosses both boundaries at once hears the bigger news, not both.
  if (experience.rank.id !== state.seenRankId && experience.level > state.seenLevel) {
    out.push(reaction(coach, 'rankUp', { name: experience.rank.name }));
  } else if (experience.level > state.seenLevel) {
    out.push(reaction(coach, 'levelUp', { n: experience.level }));
  }

  for (const item of emittedAchievements(state, experience, summary)) {
    out.push(reaction(coach, 'achievement', { name: item.definition.name }));
  }

  // State of the habit, when there is room left to say something about it.
  const consistency = summary.consistency;
  if (out.length < REACTION_LIMIT) {
    if (consistency.state === 'resting') out.push(reaction(coach, 'resting'));
    else if (consistency.state === 'recovering') out.push(reaction(coach, 'returning'));
    else if (isRestDay(consistency, workedOutToday)) out.push(reaction(coach, 'restDay'));
    else if (consistency.state === 'steady') out.push(reaction(coach, 'steady'));
  }

  // Never return an empty card: a coach with nothing to say still says hello.
  if (out.length === 0) out.push(reaction(coach, 'greeting'));

  return out.slice(0, REACTION_LIMIT);
}

/**
 * Record what this card put on screen, so the acknowledgement can mark exactly
 * that and nothing else. Called by the read; mutates and returns the state for
 * the caller to persist.
 *
 * Writing on a read looks wrong and is not: the read still consumes nothing,
 * a retry overwrites this with the same value, and no reaction becomes "seen"
 * until the client acknowledges. What it removes is the ack's need to guess.
 */
export function recordDelivery(
  state: CoachState,
  experience: ExperienceStatus,
  summary: ProgressSummary,
): CoachState {
  const headline = hasHeadline(state, experience);
  state.pendingDelivery = {
    level: headline ? experience.level : null,
    rankId: headline && experience.rank.id !== state.seenRankId ? experience.rank.id : null,
    achievementIds: emittedAchievements(state, experience, summary).map((a) => a.definition.id),
  };
  return state;
}

/**
 * Mark what was actually delivered as seen. Mutates and returns the state for
 * the caller to persist; separated from [buildReactions] so that reading the
 * dashboard consumes nothing and only an explicit acknowledgement writes.
 * An unacknowledged reaction is one the user did not see, and should reappear.
 *
 * This reads [CoachState.pendingDelivery] rather than re-deriving from live
 * activity. Re-deriving was the bug: the ack runs after the user has looked at
 * the card, and by then the set of earned achievements has moved — an outbox
 * draining behind the celebration overlay is the ordinary case, not a race
 * nobody hits. The ack then marked the *new* achievements seen and left the
 * displayed one unseen, burning several at once.
 *
 * No pending record means nothing was displayed to acknowledge, so nothing is
 * marked. That is the safe direction: a reaction that reappears is recoverable,
 * one that was burned is gone for good.
 */
export function acknowledgeReactions(state: CoachState): CoachState {
  const delivered = state.pendingDelivery;
  if (!delivered) return state;

  // Union, never replace. Achievements are derived rather than stored, so
  // deleting a meal log un-earns `ach-first-meal`; a replace dropped it from
  // the seen set and let it celebrate a second time when it was re-earned.
  // Once seen, always seen, which is what "seen" has to mean. The set is
  // bounded by the achievement catalogue, so it cannot grow without limit.
  state.seenAchievementIds = [
    ...new Set([...state.seenAchievementIds, ...delivered.achievementIds]),
  ];
  // Both only when a headline was actually rendered. `seenRankId` used to be
  // assigned unconditionally, which rewound as well as advanced: XP is folded
  // from live activity so the level can fall, while `seenLevel` is a high-water
  // mark that never does. An ack taken in that state wrote the lower rank back,
  // and the rank-up was then permanently burned.
  if (delivered.rankId !== null) state.seenRankId = delivered.rankId;
  if (delivered.level !== null) {
    state.seenLevel = Math.max(state.seenLevel, delivered.level);
  }
  state.pendingDelivery = undefined;
  return state;
}
