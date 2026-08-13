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

/** Achievement ids earned as of now, in definition order. */
export function earnedAchievementIds(summary: ProgressSummary): string[] {
  return summary.achievements
    .filter((a) => a.earnedAt !== null)
    .map((a) => a.definition.id);
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

  const seen = new Set(state.seenAchievementIds);
  const fresh = summary.achievements.filter(
    (a) => a.earnedAt !== null && !seen.has(a.definition.id),
  );
  // Newest first, so a backfill that awards several at once leads with the one
  // the user most likely just earned.
  for (const item of fresh.slice(-REACTION_LIMIT).reverse()) {
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
 * Mark everything in `reactions` as delivered. Mutates and returns the state
 * for the caller to persist; separated from `buildReactions` so that reading
 * the dashboard is a pure read and only an explicit acknowledgement writes.
 * An unacknowledged reaction is one the user did not see, and should reappear.
 */
export function acknowledgeReactions(
  state: CoachState,
  experience: ExperienceStatus,
  summary: ProgressSummary,
): CoachState {
  state.seenLevel = Math.max(state.seenLevel, experience.level);
  state.seenRankId = experience.rank.id;
  state.seenAchievementIds = earnedAchievementIds(summary);
  return state;
}
