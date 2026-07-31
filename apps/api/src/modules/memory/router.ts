/**
 * /me/memory — per-user AI memory CRUD (memory feature Phase 1). Mounted
 * inside me/router so the URL lives naturally under /me while the module
 * stays its own lane (service consumed by the Phase-2 chat pipeline).
 *
 * Every route — reads included — sits behind the aiPersonalisation consent
 * gate: memory exists solely to personalise AI output, so without that
 * consent the feature is denied outright (403 CONSENT_REQUIRED) rather than
 * degraded (AQF-07 §3.4 opt-in stance).
 */
import { Router } from 'express';
import { addMemoryFactSchema, updateMemoryFactSchema } from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import { hasConsent } from '../me/service';
import {
  addFact,
  clearMemory,
  deleteFact,
  getMemory,
  updateFactStatus,
  updateFactText,
} from './service';

export const memoryRouter = Router();

// requireAuth is already applied by me/router; kept here too so the module
// stays safe if it is ever mounted elsewhere (defence in depth, no extra cost).
memoryRouter.use(requireAuth);

memoryRouter.use((req, _res, next) => {
  if (!hasConsent(userIdOf(req), 'aiPersonalisation')) {
    next(
      new AppError(
        'CONSENT_REQUIRED',
        'AI personalisation consent is required to use memory. Enable it in your privacy settings.',
      ),
    );
    return;
  }
  next();
});

// Lazy-creates the default doc on first read (stable version baseline).
memoryRouter.get('/', (req, res) => {
  res.json({ memory: getMemory(userIdOf(req)) });
});

// A fact asserted directly by the user needs no confirmation step:
// status 'confirmed', source 'user' (suggestions come from the Phase-2 extractor).
memoryRouter.post('/facts', (req, res) => {
  const input = addMemoryFactSchema.parse(req.body);
  const memory = addFact(userIdOf(req), {
    ...input,
    status: 'confirmed',
    source: { kind: 'user' },
  });
  res.status(201).json({ memory });
});

// Confirm/reject and/or reword a fact. A fact belonging to another user is
// simply not found in the caller's own doc — 404, indistinguishable from missing.
memoryRouter.patch('/facts/:factId', (req, res) => {
  const input = updateMemoryFactSchema.parse(req.body);
  const userId = userIdOf(req);
  const factId = req.params.factId!;
  let memory = input.text !== undefined ? updateFactText(userId, factId, input.text) : undefined;
  if (input.status !== undefined) memory = updateFactStatus(userId, factId, input.status);
  // The schema refine guarantees at least one field, so memory is set.
  res.json({ memory: memory! });
});

memoryRouter.delete('/facts/:factId', (req, res) => {
  res.json({ memory: deleteFact(userIdOf(req), req.params.factId!) });
});

// Wipe: reset to the default doc (version keeps climbing — see service).
memoryRouter.delete('/', (req, res) => {
  clearMemory(userIdOf(req));
  res.status(204).end();
});
