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
import { requireAuth } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import { chatMessageSchema, WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import type { ChatMessage, ChatSession, User } from '@aquazerofit/shared';
import { complete } from '../ai/gateway';
import { preAsync, post as postGuardrail, refusalMessageFor } from '../ai/guardrails';
import { creditLedger } from '../ai/creditLedger';
import { assertLaneAllowed } from '../ai/tierPolicy';
import { loadPrompt } from '../ai/prompts';
import { asyncHandler, deleteDoc, getUser, localToday, newId, nowIso, sleep, upsertDoc, whereDocs, byIdDoc } from '../ai/util';
import { hasConsent } from '../me/service';
import { extractMemoryFromTurn } from '../memory/extraction';
import { buildHistoryMessages } from './history';
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
    const reservationId = await creditLedger.reserve(user.id, 'chatTurn');

    // Persist the user message regardless of guardrail outcome (audit trail).
    const decision = await preAsync(content, { userId: user.id });
    const userMessage: ChatMessage = {
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
    let clientGone = false;
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
        content: decision.message ?? refusalMessageFor(decision.category),
        guardrail: { blocked: true, category: decision.category },
        createdAt: nowIso(),
      };
      await upsertDoc('ai', refusal);
      sendFrame(res, { type: 'error', code: 'SAFETY_INPUT', message: refusal.content });
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

      const systemPrompt = loadPrompt('P-07');
      const result = await complete(
        'chatFast',
        [
          { role: 'system', content: systemPrompt.content || 'You are Aqua Coach, a supportive wellness assistant.' },
          ...history,
          { role: 'user', content },
        ],
        { context: context as unknown as Record<string, unknown>, promptId: 'P-07' },
      );

      // --- Output guardrail + numeric rules (models never bypass CODE).
      const outCheck = postGuardrail(result.text, { userId: user.id });
      if (outCheck.blocked) {
        await creditLedger.release(reservationId);
        const safeText = refusalMessageFor(outCheck.category);
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

      // --- Stream the reply word-by-word (~20 ms cadence).
      const words = result.text.split(/(\s+)/).filter((w) => w.length > 0);
      for (const word of words) {
        if (clientGone) break;
        sendFrame(res, { type: 'token', token: word });
        await sleep(20);
      }

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
