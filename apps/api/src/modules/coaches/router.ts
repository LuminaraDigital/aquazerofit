/**
 * /coaches — the character-select surface and its progression state.
 *
 * Read routes return the *whole* roster including locked coaches, on purpose:
 * a locked character with a visible requirement is the thing that makes the
 * ladder legible, and hiding it until it unlocks means a user never learns
 * there is anything to climb toward. The lock is enforced in `selectCoach`,
 * not by omission from this payload.
 */
import { Router } from 'express';
import {
  COACHES,
  bondLevelForXp,
  selectCoachSchema,
  type CoachRosterResponse,
  type ProgressionStatus,
  type WorkoutSession,
} from '@aquazerofit/shared';
import { asyncHandler } from '../ai/util';
import { requireAuth, userIdOf } from '../../platform/auth';
import { timezoneOf, todayFor } from '../../platform/dates';
import { getStore } from '../../platform/store';
import { getProgressSummary } from '../progress/service';
import { createCoachInvoice, starsAvailable } from '../payments/stars';
import { acknowledgeReactions, buildReactions } from './reactions';
import {
  activeCoachFor,
  bondXpFor,
  entitlementsFor,
  experienceOf,
  getCoachState,
  saveCoachState,
  selectCoach,
} from './service';

export const coachesRouter = Router();

coachesRouter.use(requireAuth);

function completedWorkoutOn(userId: string, localDate: string): boolean {
  return (
    getStore().where<WorkoutSession>(
      'plans',
      (d) =>
        d.type === 'workoutSession' &&
        d.userId === userId &&
        d.localDate === localDate &&
        d.status === 'completed',
    ).length > 0
  );
}

/**
 * The roster plus this user's position in it.
 *
 * Voice blocks are deliberately absent from the response. They are prompt
 * material, and shipping them to the browser hands anyone who opens devtools
 * the exact text used to steer the model — which is both an invitation to
 * craft a bypass and a needless give-away of the writing.
 */
coachesRouter.get('/', (req, res) => {
  const { state, experience, entitlements } = entitlementsFor(userIdOf(req), timezoneOf(req));

  const body: CoachRosterResponse & { roster: unknown[] } = {
    activeCoachId: state.activeCoachId,
    experience,
    entitlements,
    starsAvailable: starsAvailable(),
    roster: COACHES.map((coach) => ({
      id: coach.id,
      name: coach.name,
      ringName: coach.ringName,
      tagline: coach.tagline,
      discipline: coach.discipline,
      domain: coach.domain,
      colour: coach.colour,
      art: coach.art,
      voiceWord: coach.voice.word,
      unlock: coach.unlock,
    })),
  };
  res.json(body);
});

coachesRouter.post('/select', (req, res) => {
  const { coachId } = selectCoachSchema.parse(req.body);
  const state = selectCoach(userIdOf(req), coachId, timezoneOf(req));
  res.json({ activeCoachId: state.activeCoachId });
});

/**
 * Current progression plus whatever the coach has to say about it — the
 * dashboard's coach card reads from here.
 */
coachesRouter.get('/progression', (req, res) => {
  const userId = userIdOf(req);
  const today = todayFor(req);
  const state = getCoachState(userId);
  const experience = experienceOf(userId, timezoneOf(req));
  const summary = getProgressSummary(userId, today);
  const bondXp = bondXpFor(state, state.activeCoachId, experience.totalXp);

  const body: ProgressionStatus = {
    experience,
    activeCoachId: state.activeCoachId,
    bondXp,
    bondLevel: bondLevelForXp(bondXp),
    reactions: buildReactions(
      activeCoachFor(userId),
      state,
      experience,
      summary,
      completedWorkoutOn(userId, today),
    ),
  };
  res.json(body);
});

/**
 * Mark the current reactions as delivered. Separate from the read so that
 * fetching the dashboard stays idempotent and a retried request cannot consume
 * a celebration the user never actually saw.
 */
coachesRouter.post('/reactions/ack', (req, res) => {
  const userId = userIdOf(req);
  const state = getCoachState(userId);
  const experience = experienceOf(userId, timezoneOf(req));
  const summary = getProgressSummary(userId, todayFor(req));
  saveCoachState(acknowledgeReactions(state, experience, summary));
  res.status(204).end();
});

/**
 * Begin a Stars purchase. Returns a Telegram invoice link for the Mini App to
 * open; nothing is unlocked here. The grant happens only when Telegram reports
 * the payment cleared, through the webhook.
 */
coachesRouter.post(
  '/:coachId/purchase',
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const experience = experienceOf(userId, timezoneOf(req));
    res.json(await createCoachInvoice(userId, req.params.coachId!, experience.level));
  }),
);
