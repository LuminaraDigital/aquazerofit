/**
 * Chat module (AQF-07 §3.4): sessions CRUD + SSE streaming turn.
 *
 * Full AI admission sequence on the streaming endpoint (brief rule 4):
 *   authenticate → (global rate limit) → tier/credit check → input guardrail
 *   → gateway chatFast lane with tools → output guardrail/numeric rules
 *   → stream + persist + telemetry.
 *
 * SSE frame contract (exact):
 *   data: {"type":"token","token":"..."}\n\n           (incremental)
 *   data: {"type":"done","message":{...ChatMessage}}\n\n (terminal, success)
 *   data: {"type":"error","code":"SAFETY_INPUT","message":"..."}\n\n
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../platform/auth';
import { localeOf } from '../../platform/locale';
import { AppError } from '../../platform/errors';
import { chatMessageSchema, WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import type { Allergen, ChatMessage, ChatSession, Food, MealLogItem, MealType, User } from '@aquazerofit/shared';
import { complete, stream, type GatewayResult } from '../ai/gateway';
import {
  preAsync,
  post as postGuardrail,
  refusalMessageFor,
  type GuardrailDecision,
} from '../ai/guardrails';
import { warnOnStyle } from '../ai/styleLint';
import { creditLedger } from '../ai/creditLedger';
import { assertLaneAllowed } from '../ai/tierPolicy';
import { systemMessagesFor } from '../ai/persona';
import { activeCoachFor } from '../coaches/service';
import { asyncHandler, deleteDoc, getUser, localToday, newId, nowIso, readProfile, sleep, upsertDoc, whereDocs, byIdDoc } from '../ai/util';
import { hasConsent } from '../me/service';
// Deliberate team-boundary exception, and the point of the feature: chat-native
// logging must produce the SAME meal-log row as the food tab, written by the
// same function. A second write path here would be a second place for totals,
// idempotency and the source field to drift.
import { createMealLog } from '../logs/service';
import { extractMemoryFromTurn } from '../memory/extraction';
import { buildHistoryMessages } from './history';
import {
  buildDraftItems,
  CHAT_MEAL_DRAFT_TYPE,
  draftNotes,
  MAX_DRAFT_ITEMS,
  MAX_ITEM_GRAMS,
  MAX_SOURCE_TEXT_LENGTH,
  MIN_ITEM_GRAMS,
  nutritionFor,
  parseExtraction,
  segmentMealText,
  type ChatMealDraft,
  type ChatMealItem,
} from './mealDraft';
import { gatherChatContext, gatherChatContextDenied } from './tools';

export const chatRouter = Router();
chatRouter.use(requireAuth);

const SUGGESTED_PROMPTS = [
  'How am I tracking today?',
  'What should I eat for dinner?',
  'What’s my workout today?',
  'How is my weight trending?',
];

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function openStream(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  flush(res);
}

function flush(res: Response): void {
  const flushable = res as Response & { flush?: () => void };
  if (typeof flushable.flush === 'function') flushable.flush();
}

function sendFrame(res: Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  flush(res);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

chatRouter.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const session: ChatSession = {
      id: newId('cs'),
      userId: user.id,
      type: 'chatSession',
      title: 'New conversation',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await upsertDoc('ai', session);
    res.status(201).json({
      session,
      suggestedPrompts: SUGGESTED_PROMPTS,
      disclaimer: WELLNESS_DISCLAIMER,
    });
  }),
);

chatRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions = await whereDocs<ChatSession>('ai', (d: any) => {
      return d?.userId === user.id && d?.type === 'chatSession';
    });
    sessions.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    res.json({ sessions: sessions.slice(0, 30), suggestedPrompts: SUGGESTED_PROMPTS });
  }),
);

chatRouter.get(
  '/sessions/:id/messages',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const sessionId = req.params.id as string;
    const session = await byIdDoc<ChatSession>('ai', sessionId);
    if (!session || session.type !== 'chatSession' || session.userId !== user.id) {
      throw new AppError('NOT_FOUND', 'Chat session not found.');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = await whereDocs<ChatMessage>('ai', (d: any) => {
      return d?.sessionId === sessionId && d?.type === 'chatMessage' && d?.userId === user.id;
    });
    messages.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    res.json({ session, messages });
  }),
);

// Owner-scoped session deletion: removes the session and every message in it.
chatRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const sessionId = req.params.id as string;
    const session = await byIdDoc<ChatSession>('ai', sessionId);
    if (!session || session.type !== 'chatSession' || session.userId !== user.id) {
      throw new AppError('NOT_FOUND', 'Chat session not found.');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = await whereDocs<ChatMessage>('ai', (d: any) => {
      return d?.sessionId === sessionId && d?.type === 'chatMessage' && d?.userId === user.id;
    });
    for (const message of messages) {
      await deleteDoc('ai', message.id);
    }
    await deleteDoc('ai', sessionId);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Streaming turn
// ---------------------------------------------------------------------------

chatRouter.post(
  '/sessions/:id/messages',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const sessionId = req.params.id as string;

    const session = await byIdDoc<ChatSession>('ai', sessionId);
    if (!session || session.type !== 'chatSession' || session.userId !== user.id) {
      throw new AppError('NOT_FOUND', 'Chat session not found.');
    }

    const parsed = chatMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'Message content is required (1–4000 characters).', {
        issues: parsed.error.issues,
      });
    }
    const content = parsed.data.content;

    // --- Admission: tier lane + credits (before headers → JSON error envelope)
    assertLaneAllowed(user.tier, 'chatFast');
    const reservationId = await creditLedger.reserve(user.id, 'chatTurn', user.tier);

    // Everything from here to the model call is fallible, and the
    // reservation is already held. A throw from preAsync, either upsertDoc
    // or the refusal write used to escape with the credits still reserved —
    // and once openStream() has run the headers are SSE, so the JSON error
    // handler could not answer either and the connection simply hung. The
    // catch below returns the credits either way, and answers in whichever
    // protocol this request is already speaking.
    // Declared out here, assigned inside the guard: the streaming half below
    // still needs them, and the catch either rethrows or returns, so they are
    // always assigned by the time anything reads them.
    const locale = localeOf(req);
    let decision!: GuardrailDecision;
    let userMessage!: ChatMessage;
    let clientGone = false;

    try {

      // Persist the user message regardless of guardrail outcome (audit trail).
      // The locale rides along so a crisis refusal names a line the user can
      // actually ring (Accept-Language; see platform/locale.ts).
      decision = await preAsync(content, { userId: user.id, locale });
      userMessage = {
        id: newId('cm'),
        sessionId,
        userId: user.id,
        type: 'chatMessage',
        role: 'user',
        content,
        guardrail: { blocked: decision.blocked, category: decision.blocked ? decision.category : null },
        createdAt: nowIso(),
      };
      await upsertDoc('ai', userMessage);

      // Session title from the first user message.
      if (session.title === 'New conversation') {
        session.title = content.length > 42 ? `${content.slice(0, 42).trimEnd()}…` : content;
      }
      session.updatedAt = nowIso();
      await upsertDoc('ai', session);

      // --- From here on we speak SSE.
      openStream(res);
      req.on('close', () => {
        clientGone = true;
      });

      if (decision.blocked) {
        // Supportive refusal: no model call, credits returned, audit already logged.
        await creditLedger.release(reservationId);
        const refusal: ChatMessage = {
          id: newId('cm'),
          sessionId,
          userId: user.id,
          type: 'chatMessage',
          role: 'assistant',
          content: decision.message ?? refusalMessageFor(decision.category, locale),
          guardrail: { blocked: true, category: decision.category },
          createdAt: nowIso(),
        };
        await upsertDoc('ai', refusal);
        sendFrame(res, { type: 'error', code: 'SAFETY_INPUT', message: refusal.content });
        res.end();
        return;
      }
    } catch (err) {
      await creditLedger.release(reservationId);
      if (!res.headersSent) throw err;
      // Already streaming: the error envelope is a frame, not a body.
      sendFrame(res, { type: 'error', code: 'INTERNAL', message: 'The turn could not be completed.' });
      res.end();
      return;
    }

    try {
      // --- Ground the model in real user data via tools — but ONLY with the
      // user's explicit aiPersonalisation consent. Without it, no profile or
      // log data enters model context and the coach answers generically.
      const localDate = typeof req.body?.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.localDate)
        ? (req.body.localDate as string)
        : localToday();
      const consented = hasConsent(user.id, 'aiPersonalisation');
      // Display name is identity, not wellness data — but greeting by name is
      // still personalisation, so it flows only with the same consent.
      const account = consented ? await byIdDoc<User>('users', user.id) : null;
      const { context, toolCalls } = consented
        ? await gatherChatContext(user.id, localDate, account?.displayName)
        : gatherChatContextDenied();

      // Replay prior turns so the coach has conversational memory. The current
      // user message is already persisted above — exclude it here and append
      // it explicitly as the final message. Guardrail-blocked messages are
      // filtered inside buildHistoryMessages.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const priorMessages = await whereDocs<ChatMessage>('ai', (d: any) => {
        return d?.sessionId === sessionId && d?.type === 'chatMessage' && d?.userId === user.id && d?.id !== userMessage.id;
      });
      const history = buildHistoryMessages(priorMessages);

      // The user's selected coach supplies a voice block ahead of P-07; the
      // rules still come last and still win. See `ai/persona.ts` for why that
      // ordering is the safety-relevant part rather than a stylistic one.
      const coach = activeCoachFor(user.id);
      // --- Stream the reply using real SSE from provider (AI-02)
      let fullText = '';
      const streamResult = await stream(
        'chatFast',
        [...systemMessagesFor(coach), ...history, { role: 'user', content }],
        {
          context: context as unknown as Record<string, unknown>,
          promptId: 'P-07',
          coachId: coach.id,
          onToken: (token) => {
            if (clientGone) return;
            fullText += token;
            sendFrame(res, { type: 'token', token });
          },
        },
      );

      // Drive the iterator by hand. `for await...of` DISCARDS an async
      // generator's return value, and here the return value is the whole
      // point: `stream()` is declared `AsyncGenerator<string, GatewayResult>`
      // and that GatewayResult carries `meta.degraded` — which decides whether
      // this turn is billed — plus the provider/model provenance recorded on
      // the persisted message.
      //
      // What this replaces: a for-await loop that threw the result away,
      // followed by a read of `iterator._finalResult`, a property nothing in
      // gateway.ts ever sets. It therefore always fell through to a synthesised
      // meta with `degraded: false` and `provider: 'unknown'`. Two consequences,
      // both live: every turn answered by the offline fallback after real
      // providers failed was billed anyway — against the invariant in
      // CONTRIBUTING.md that degraded output is never charged for — and every
      // stored ChatMessage.ai recorded 'unknown' provenance on the app's
      // highest-volume AI lane.
      //
      // There is deliberately no try/catch around this loop. The old one was
      // empty — commented "Generator exhausted", which is not what a throw
      // means — so an AI_UNAVAILABLE raised with every provider down was
      // swallowed, an empty assistant message was persisted, and the turn was
      // charged for. Letting it propagate reaches the handler that releases the
      // reservation and sends a real error frame.
      const iterator = streamResult[Symbol.asyncIterator]();
      let finalResult: GatewayResult;
      for (;;) {
        const step = await iterator.next();
        if (step.done) {
          finalResult = step.value;
          break;
        }
        // The token already went out through the onToken callback above.
      }

      // finalResult is guaranteed to be non-null here due to fallback
      const result = {
        text: fullText || finalResult!.text,
        meta: finalResult!.meta,
      };

      // --- Output guardrail + numeric rules (models never bypass CODE).
      const outCheck = postGuardrail(result.text, { userId: user.id });
      if (outCheck.blocked) {
        await creditLedger.release(reservationId);
        const safeText = refusalMessageFor(outCheck.category, locale);
        const blockedMessage: ChatMessage = {
          id: newId('cm'),
          sessionId,
          userId: user.id,
          type: 'chatMessage',
          role: 'assistant',
          content: safeText,
          guardrail: { blocked: true, category: outCheck.category },
          ai: result.meta,
          createdAt: nowIso(),
        };
        await upsertDoc('ai', blockedMessage);
        sendFrame(res, { type: 'error', code: 'SAFETY_OUTPUT', message: safeText });
        res.end();
        return;
      }

      // Style lint (P-07 §Style rules): measurement only, never a block. The
      // reply has already passed the safety filter; this logs banned-style
      // drift (em dashes, filler vocabulary) so prompt compliance is watchable
      // per provider without ever costing the user an answer.
      warnOnStyle(result.text, { promptId: 'P-07', provider: result.meta.provider });

      const assistantMessage: ChatMessage = {
        id: newId('cm'),
        sessionId,
        userId: user.id,
        type: 'chatMessage',
        role: 'assistant',
        content: result.text,
        toolCalls,
        guardrail: { blocked: false, category: null },
        ai: result.meta,
        createdAt: nowIso(),
      };
      await upsertDoc('ai', assistantMessage);
      // Real providers failed and the gateway fell back to offline templates —
      // do not charge. Keyless mock (no providers configured) keeps degraded
      // false and bills normally per product rules.
      if (result.meta.degraded) {
        await creditLedger.release(reservationId);
      } else {
        await creditLedger.commit(reservationId);
      }

      // Memory write-back (Phase 2): stage suggested facts from this turn.
      // Fire-and-forget with the same consent gate — never delays the stream,
      // never runs on guardrail-blocked turns (both paths returned above), and
      // extractMemoryFromTurn swallows its own failures (best-effort, like the
      // guardrails audit write).
      if (consented) {
        void extractMemoryFromTurn(user.id, {
          userMessageId: userMessage.id,
          userMessage: content,
          assistantReply: result.text,
        }).catch((err) => {
          console.warn('[chat] memory extraction failed', err instanceof Error ? err.message : err);
        });
      }

      if (!clientGone) {
        sendFrame(res, { type: 'done', message: assistantMessage });
      }
      res.end();
    } catch (err) {
      await creditLedger.release(reservationId);
      // Headers are already SSE — degrade gracefully in-band (AQF-09 §5).
      sendFrame(res, {
        type: 'error',
        code: 'AI_UNAVAILABLE',
        message:
          'The coach is temporarily unavailable. Your logs, dashboard and plans all still work — please try again in a moment.',
      });
      res.end();
      if (!(err instanceof AppError)) {
        // Surface unexpected faults to the platform logger without crashing the stream.
        console.error('[chat] stream failure', err);
      }
    }
  }),
);

// ---------------------------------------------------------------------------
// Chat-native meal logging (FR-013 human in the loop)
//
// Why endpoints rather than a tool in the chat tool executor: the executor's
// tools are read-only grounding reads that ALL run, unconditionally, before a
// single completion — there is no tool-calling loop for a model to invoke a
// write with, and a write-capable entry in gatherChatContext would fire on
// every turn. More decisively, FR-013 needs a round trip (propose → the user
// reads it → the user confirms), and the turn endpoint is a one-way SSE stream
// that has already ended by the time the user could answer. So this mirrors the
// vision lane's shape exactly — a proposal resource, then an explicit confirm —
// which is also the shape the confirmation UI already knows how to render.
//
// Consent: this lane follows the vision lane rather than the chat lane. The only
// thing sent to a model is the sentence the user just typed; no stored profile
// or log data enters model context, so aiPersonalisation has nothing to gate.
// wellnessDataProcessing DOES gate the profile read, exactly as it does in the
// recommendation lane, because that is where declared allergies come from.
//
// Billing: chatTurn. It is a chat turn's worth of model work on the chat
// surface, and CREDIT_COSTS lives in packages/shared, which this lane does not
// own. The reservation settles at draft time, not at confirm time, so that
// rejecting a wrong proposal never costs less than accepting a right one —
// billing must not put a thumb on the scale of the safety gate.
// ---------------------------------------------------------------------------

const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'localDate must be YYYY-MM-DD');

const createMealDraftSchema = z.object({
  text: z.string().trim().min(1).max(MAX_SOURCE_TEXT_LENGTH),
  sessionId: z.string().min(1).max(64).optional(),
  mealType: mealTypeSchema.optional(),
  localDate: localDateSchema.optional(),
});

const confirmMealDraftSchema = z.object({
  mealType: mealTypeSchema.optional(),
  localDate: localDateSchema.optional(),
  /** Set by the user tapping through the allergen warning, never by default. */
  acknowledgeAllergens: z.boolean().optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1).max(32),
        foodId: z.string().min(1).max(128),
        grams: z.number().finite().min(MIN_ITEM_GRAMS).max(MAX_ITEM_GRAMS).optional(),
      }),
    )
    .min(1)
    .max(MAX_DRAFT_ITEMS),
});

/** Meal type when neither the client nor the model committed to one. */
const DEFAULT_MEAL_TYPE: MealType = 'snack';

async function loadFoodCorpus(): Promise<Food[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return whereDocs<Food>('content', (d: any) => d?.type === 'food');
}

async function loadOwnedDraft(userId: string, draftId: string): Promise<ChatMealDraft> {
  const draft = await byIdDoc<ChatMealDraft>('ai', draftId);
  if (!draft || draft.type !== CHAT_MEAL_DRAFT_TYPE || draft.userId !== userId) {
    throw new AppError('NOT_FOUND', 'Meal draft not found.');
  }
  return draft;
}

/** Declared allergies, or none when the user has not consented to us reading them. */
async function allergiesFor(userId: string): Promise<{ allergies: Allergen[]; consented: boolean }> {
  if (!hasConsent(userId, 'wellnessDataProcessing')) return { allergies: [], consented: false };
  const profile = await readProfile(userId);
  return { allergies: profile?.allergies ?? [], consented: true };
}

chatRouter.post(
  '/meal-drafts',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const parsed = createMealDraftSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', `Describe what you ate (1–${MAX_SOURCE_TEXT_LENGTH} characters).`, {
        issues: parsed.error.issues,
      });
    }
    const { text, mealType: requestedMealType, localDate: requestedDate } = parsed.data;
    const localDate = requestedDate ?? localToday();

    // The session is a display association only — a draft is valid without one.
    let sessionId: string | null = null;
    if (parsed.data.sessionId) {
      const session = await byIdDoc<ChatSession>('ai', parsed.data.sessionId);
      if (session && session.type === 'chatSession' && session.userId === user.id) sessionId = session.id;
    }

    // --- Admission: lane, then credits.
    assertLaneAllowed(user.tier, 'planStructured');
    const reservationId = await creditLedger.reserve(user.id, 'chatTurn', user.tier);

    try {
      // --- Input guardrail. A meal description is user text like any other.
      const locale = localeOf(req);
      const decision = await preAsync(text, { userId: user.id, locale });
      if (decision.blocked) {
        throw new AppError('SAFETY_INPUT', decision.message ?? refusalMessageFor(decision.category, locale), {
          category: decision.category,
        });
      }

      const result = await complete(
        'planStructured',
        [{ role: 'user', content: `Extract the foods eaten from this message: ${text}` }],
        { json: true, promptId: 'P-12', context: { text } },
      );

      let { items: candidates, mealType: modelMealType } = parseExtraction(result.json);

      // A provider that returns 200 with unusable JSON is not a gateway
      // failure, so nothing upstream catches it — and with no keys at all the
      // offline engine has no P-12 branch and answers `{}`. Either way the user
      // typed a readable sentence and would get an empty card. Fall back to the
      // deterministic segmenter, which emits no nutrition figure of its own:
      // grams, calories and allergens still come from the corpus below.
      if (candidates.length === 0) {
        candidates = segmentMealText(text);
      }

      // --- Output guardrail over the model's own words before they are echoed
      // back to the user. Structured data still passes through a person's eyes.
      if (candidates.length > 0) {
        const spoken = candidates.map((c) => `${c.phrase} (${c.foodName})`).join('; ');
        if (postGuardrail(spoken, { userId: user.id }).blocked) {
          candidates = [];
          modelMealType = null;
        }
      }

      const { allergies, consented } = await allergiesFor(user.id);
      const foods = await loadFoodCorpus();
      const items = buildDraftItems(candidates, foods, allergies);
      const allergyCheck: ChatMealDraft['allergyCheck'] = consented ? 'applied' : 'skippedNoConsent';

      const draft: ChatMealDraft = {
        id: newId('cmd'),
        userId: user.id,
        type: CHAT_MEAL_DRAFT_TYPE,
        sessionId,
        sourceText: text,
        mealType: requestedMealType ?? modelMealType ?? DEFAULT_MEAL_TYPE,
        localDate,
        // An empty draft is still persisted: it is the evaluation signal that
        // tells us which sentences P-12 cannot read, and it is what the client
        // renders instead of silently doing nothing.
        status: items.length > 0 ? 'proposed' : 'empty',
        items,
        notes: draftNotes(items, allergyCheck),
        allergyCheck,
        ai: result.meta,
        loggedMealId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await upsertDoc('ai', draft);

      // Offline-template output after real providers failed is not a model
      // answer the user should pay for; neither is a proposal with nothing in
      // it. Same stance as the chat, recommendation and vision lanes.
      if (result.meta.degraded || items.length === 0) {
        await creditLedger.release(reservationId);
      } else {
        await creditLedger.commit(reservationId);
      }

      res.status(201).json({ draft });
    } catch (err) {
      await creditLedger.release(reservationId);
      if (err instanceof AppError) throw err;
      // Error hygiene: internals to the server log only — the client envelope
      // never carries err.message/cause.
      console.error('[chat] meal extraction failed', err);
      throw new AppError(
        'AI_UNAVAILABLE',
        'Reading meals from text is temporarily unavailable — you can still log this meal manually.',
      );
    }
  }),
);

/** Rehydration for the coach surface: a refresh must not lose a pending proposal. */
chatRouter.get(
  '/meal-drafts',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drafts = await whereDocs<ChatMealDraft>('ai', (d: any) => {
      return d?.userId === user.id && d?.type === CHAT_MEAL_DRAFT_TYPE && d?.status === 'proposed';
    });
    drafts.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    res.json({ drafts: drafts.slice(0, 5) });
  }),
);

chatRouter.get(
  '/meal-drafts/:id',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    res.json({ draft: await loadOwnedDraft(user.id, req.params.id as string) });
  }),
);

chatRouter.post(
  '/meal-drafts/:id/dismiss',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const draft = await loadOwnedDraft(user.id, req.params.id as string);
    if (draft.status === 'confirmed') {
      throw new AppError('CONFLICT', 'This meal has already been logged.', { loggedMealId: draft.loggedMealId });
    }
    draft.status = 'dismissed';
    draft.updatedAt = nowIso();
    await upsertDoc('ai', draft);
    res.json({ draft });
  }),
);

chatRouter.post(
  '/meal-drafts/:id/confirm',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const draft = await loadOwnedDraft(user.id, req.params.id as string);
    if (draft.status !== 'proposed') {
      throw new AppError('CONFLICT', `This proposal cannot be confirmed (status: ${draft.status}).`, {
        status: draft.status,
        loggedMealId: draft.loggedMealId,
      });
    }

    const parsed = confirmMealDraftSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'Confirmation payload is invalid.', {
        issues: parsed.error.issues,
      });
    }
    const { items: selections, acknowledgeAllergens } = parsed.data;

    const byItemId = new Map<string, ChatMealItem>(draft.items.map((item) => [item.id, item]));
    const foods = await loadFoodCorpus();
    const foodById = new Map(foods.map((f) => [f.id, f]));

    const logItems: MealLogItem[] = [];
    const conflicts: { itemId: string; foodId: string; name: string; allergens: Allergen[] }[] = [];
    const seen = new Set<string>();

    for (const selection of selections) {
      if (seen.has(selection.itemId)) {
        throw new AppError('VALIDATION_FAILED', 'Each proposed item may be confirmed once.', {
          itemId: selection.itemId,
        });
      }
      seen.add(selection.itemId);

      const item = byItemId.get(selection.itemId);
      if (!item) {
        throw new AppError('VALIDATION_FAILED', 'Unknown proposal item.', { itemId: selection.itemId });
      }
      // The choke point. A confirmed food must be one this proposal actually
      // offered for this line, so neither the model nor the client can widen
      // the set of things a "confirmation" can silently log.
      const match = item.matches.find((m) => m.foodId === selection.foodId);
      if (!match) {
        throw new AppError('VALIDATION_FAILED', 'That food was not one of the options for this item.', {
          itemId: selection.itemId,
          foodId: selection.foodId,
        });
      }
      const food = foodById.get(selection.foodId);
      if (!food) {
        throw new AppError('VALIDATION_FAILED', `Unknown foodId: ${selection.foodId}.`, {
          foodId: selection.foodId,
        });
      }

      // Nutrition is recomputed from the corpus record here, at write time —
      // never read back from the draft and never taken from the client.
      const grams = Math.round(selection.grams ?? match.grams);
      const nutrition = nutritionFor(food, grams);
      logItems.push({ foodId: food.id, name: food.name, grams, ...nutrition });

      if (match.allergenConflicts.length > 0) {
        conflicts.push({
          itemId: item.id,
          foodId: food.id,
          name: food.name,
          allergens: match.allergenConflicts,
        });
      }
    }

    // A declared allergy must be seen and acknowledged, not merely displayed.
    // The user is logging what they already ate, so this never refuses outright
    // — it refuses to let the tap that logs it also be the tap that dismisses
    // the warning.
    if (conflicts.length > 0 && acknowledgeAllergens !== true) {
      throw new AppError(
        'CONFLICT',
        'Some of these foods match an allergy on your profile. Confirm you still want them logged.',
        { conflicts },
      );
    }

    const mealLog = createMealLog(
      user.id,
      {
        mealType: parsed.data.mealType ?? draft.mealType,
        items: logItems,
        localDate: parsed.data.localDate ?? draft.localDate,
      },
      // Distinct from 'manual': a person confirmed every line either way, but
      // this one had a model read the sentence first, and the difference is
      // what makes the extraction lane's accuracy measurable after the fact.
      'chat',
    );

    draft.status = 'confirmed';
    draft.mealType = mealLog.mealType;
    draft.localDate = mealLog.localDate;
    draft.loggedMealId = mealLog.id;
    draft.updatedAt = nowIso();
    await upsertDoc('ai', draft);

    res.status(201).json({ mealLog, draft, acknowledgedAllergens: conflicts });
  }),
);

// ---------------------------------------------------------------------------
// Report control (AQF-10 §4: every report enters the triage queue)
// ---------------------------------------------------------------------------

chatRouter.post(
  '/messages/:id/report',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const messageId = req.params.id as string;
    const message = await byIdDoc<ChatMessage>('ai', messageId);
    if (!message || message.type !== 'chatMessage' || message.userId !== user.id) {
      throw new AppError('NOT_FOUND', 'Message not found.');
    }
    message.reported = true;
    await upsertDoc('ai', message);
    await upsertDoc('audit', {
      id: newId('audit'),
      userId: user.id,
      type: 'guardrailTrigger',
      action: 'messageReported',
      detail: { messageId, sessionId: message.sessionId, role: message.role },
      createdAt: nowIso(),
    });
    res.json({ ok: true, messageId });
  }),
);
