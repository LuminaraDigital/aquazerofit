/**
 * /challenges - buddy huddles for private accountability (growth P0).
 */
import { Router } from 'express';
import {
  createBuddyChallengeSchema,
  joinBuddyChallengeSchema,
} from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import {
  createChallenge,
  getChallenge,
  joinChallenge,
  listChallengesForUser,
  peekChallenge,
  toPublicMemberNames,
} from './service';

export const challengesRouter = Router();

/** Public peek for invite links before sign-in. */
challengesRouter.get('/peek/:code', (req, res) => {
  const code = String(req.params.code ?? '');
  res.json({ challenge: peekChallenge(code) });
});

challengesRouter.use(requireAuth);

challengesRouter.get('/', (req, res) => {
  const list = listChallengesForUser(userIdOf(req)).map(toPublicMemberNames);
  res.json({ challenges: list });
});

challengesRouter.get('/:id', (req, res) => {
  const challenge = toPublicMemberNames(getChallenge(String(req.params.id), userIdOf(req)));
  res.json({ challenge });
});

challengesRouter.post('/', (req, res) => {
  const input = createBuddyChallengeSchema.parse(req.body);
  const challenge = toPublicMemberNames(createChallenge(userIdOf(req), input));
  res.status(201).json({ challenge });
});

challengesRouter.post('/join', (req, res) => {
  const { code } = joinBuddyChallengeSchema.parse(req.body);
  const challenge = toPublicMemberNames(joinChallenge(userIdOf(req), code));
  res.status(200).json({ challenge });
});
