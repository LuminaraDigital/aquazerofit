/**
 * /telegram/webhook: the only unauthenticated route in this product that can
 * grant an entitlement.
 *
 * Everything about its shape follows from that sentence:
 *
 *  - It authenticates by shared secret, and fails closed. Telegram echoes
 *    `secret_token` from setWebhook in a header on every delivery. If the
 *    secret is unset, the route rejects everything rather than trusting
 *    everything. An unconfigured webhook that accepts updates is a free
 *    coach roster for anyone who finds the URL.
 *  - It always answers 200 once the secret matches. Telegram redelivers any
 *    non-2xx, so returning 500 on a malformed update creates an infinite
 *    retry loop against a payload that will never parse. Failures are logged,
 *    acknowledged, dropped.
 *  - It answers pre-checkout before doing anything slow. Telegram cancels
 *    the payment if `answerPreCheckoutQuery` does not arrive within ten
 *    seconds, and a cancelled payment mid-flow is the worst outcome available.
 *    The call is awaited so a transport failure is logged. The invoice
 *    payload is not part of that log.
 *
 * Bot commands (/start, /paysupport, /stop, /terms) are answered here. This
 * process does not call setWebhook or setMyCommands. Both are operator steps.
 * The setMyCommands body is TELEGRAM_BOT_COMMANDS in ./commands.ts.
 *
 * Registering the webhook (once, per deployment):
 *
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d url="https://<host>/api/v1/telegram/webhook" \
 *     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>" \
 *     -d allowed_updates='["message","pre_checkout_query"]'
 */
import { Router } from 'express';
import { z } from 'zod';
import { GIFT_PAYLOAD_PREFIX, coachById, starsPriceOf } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { secureEquals } from '../../platform/auth';
import { asyncHandler } from '../../platform/errors';
import { logEvent } from '../../platform/telemetry';
import { commandName, replyForCommand } from './commands';
import { answerPreCheckoutQuery, sendBotMessage } from './telegramBot';
import { completePayment, findPendingInvoice } from './stars';
import {
  PREMIUM_PAYLOAD_PREFIX,
  completeSubscriptionPayment,
  premiumCheckoutAccepts,
} from './starsSubscription';
import { completeGiftPayment, giftCheckoutAccepts } from '../fightCamp/gifts';

export const telegramWebhookRouter = Router();

/**
 * The slice of an Update this route reads. Unknown fields are stripped, not
 * rejected: Telegram adds fields and a strict schema would drop a real
 * payment. Length caps are loose on purpose. A payment that fails validation
 * is acknowledged and never granted, which is worse than accepting a long
 * charge id.
 */
const telegramUserSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean().optional(),
  username: z.string().max(64).optional(),
});

const telegramUpdateSchema = z.object({
  update_id: z.number().int().optional(),
  pre_checkout_query: z
    .object({
      id: z.string().min(1).max(256),
      from: telegramUserSchema.optional(),
      currency: z.string().min(1).max(16),
      total_amount: z.number().int(),
      invoice_payload: z.string().max(1024),
    })
    .optional(),
  message: z
    .object({
      message_id: z.number().int().optional(),
      text: z.string().max(4096).optional(),
      from: telegramUserSchema.optional(),
      chat: z
        .object({
          id: z.number().int(),
          type: z.string().max(32).optional(),
        })
        .optional(),
      successful_payment: z
        .object({
          currency: z.string().min(1).max(16),
          total_amount: z.number().int(),
          invoice_payload: z.string().max(1024),
          telegram_payment_charge_id: z.string().min(1).max(256),
          provider_payment_charge_id: z.string().max(256).optional(),
          // Present on Stars subscription charges. Absent on coach purchases.
          // A missing expiration is handled in completeSubscriptionPayment:
          // the schema stays optional so a coach payment still parses.
          subscription_expiration_date: z.number().int().optional(),
          is_recurring: z.boolean().optional(),
          is_first_recurring: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

function secretMatches(header: unknown): boolean {
  const expected = config.telegramWebhookSecret;
  // Fail closed: an unset secret means the route trusts nobody rather than
  // everybody. Checked before the compare so an empty header can never match
  // an empty expectation.
  if (!expected) return false;
  return secureEquals(header, expected);
}

function commandContext(chatType: string | undefined) {
  return {
    miniAppUrl: config.telegramMiniAppUrl,
    supportEmail: config.supportEmail,
    termsUrl: config.termsUrl,
    privacyUrl: config.privacyUrl,
    refundUrl: config.refundUrl,
    deletionUrl: config.accountDeletionUrl,
    chatType,
  };
}

function answerFailureReason(error: string): string {
  if (/not configured/i.test(error)) return 'bot_not_configured';
  if (/timeout|aborted/i.test(error)) return 'timeout';
  return 'rejected';
}

async function handleGiftPreCheckout(query: NonNullable<TelegramUpdate['pre_checkout_query']>): Promise<void> {
  let accepted = false;
  try {
    accepted = await giftCheckoutAccepts({ ...query, payerTelegramId: query.from?.id });
  } catch {
    // Unable to re-validate is a decline: nothing is charged.
    logEvent('gift_precheckout_failed', { reason: 'storage' });
  }
  const answered = await answerPreCheckoutQuery(
    query.id,
    accepted,
    accepted ? undefined : 'This gift is no longer available.',
  );
  if (!answered.ok) {
    logEvent('stars_precheckout_answer_failed', { accepted, reason: answerFailureReason(answered.error) });
  }
  if (!accepted) logEvent('stars_precheckout_declined', { reason: 'gift_unavailable' });
}

async function handlePreCheckout(query: NonNullable<TelegramUpdate['pre_checkout_query']>): Promise<void> {
  if (query.invoice_payload.startsWith(GIFT_PAYLOAD_PREFIX)) {
    await handleGiftPreCheckout(query);
    return;
  }
  if (query.invoice_payload.startsWith(PREMIUM_PAYLOAD_PREFIX)) {
    const priceOk = premiumCheckoutAccepts(query);
    const answered = await answerPreCheckoutQuery(
      query.id,
      priceOk,
      priceOk ? undefined : 'This subscription is no longer available.',
    );
    if (!answered.ok) {
      logEvent('stars_precheckout_answer_failed', {
        accepted: priceOk,
        reason: answerFailureReason(answered.error),
      });
    }
    if (!priceOk) logEvent('stars_precheckout_declined', { reason: 'unavailable' });
    return;
  }

  const pending = findPendingInvoice(query.invoice_payload);
  const coach = pending ? coachById(pending.coachId) : undefined;
  const priceOk =
    pending !== undefined &&
    coach !== undefined &&
    query.currency === 'XTR' &&
    query.total_amount >= starsPriceOf(coach);

  const answered = await answerPreCheckoutQuery(
    query.id,
    priceOk,
    priceOk ? undefined : 'This purchase is no longer available.',
  );
  if (!answered.ok) {
    // Failure only. The invoice payload is a correlation secret and stays out.
    logEvent('stars_precheckout_answer_failed', {
      accepted: priceOk,
      reason: answerFailureReason(answered.error),
    });
  }
  if (!priceOk) {
    logEvent('stars_precheckout_declined', { reason: 'unavailable' });
  }
}

async function handleCommand(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const name = commandName(message?.text);
  const chatId = message?.chat?.id;
  if (!name || typeof chatId !== 'number') return;
  const reply = replyForCommand(name, commandContext(message?.chat?.type));
  const sent = await sendBotMessage(chatId, reply.text, {
    buttons: reply.buttons,
    parseMode: 'plain',
  });
  if (!sent.ok) {
    logEvent('telegram_command_failed', {
      command: name,
      reason: answerFailureReason(sent.error),
    });
  }
}

telegramWebhookRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    if (!secretMatches(req.get('x-telegram-bot-api-secret-token'))) {
      // 401 rather than a silent 200: a real Telegram delivery always carries
      // the header, so anything reaching here is either a misconfiguration
      // worth surfacing loudly or a probe worth refusing plainly.
      logEvent('telegram_webhook_rejected', { reason: 'secret_mismatch' });
      res.status(401).json({ code: 'AUTH_INVALID', message: 'Invalid webhook secret.' });
      return;
    }

    const parsed = telegramUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      logEvent('telegram_webhook_invalid', { reason: 'schema' });
      res.status(200).json({ ok: true });
      return;
    }

    try {
      const update = parsed.data;
      const query = update.pre_checkout_query;
      if (query) {
        await handlePreCheckout(query);
        res.status(200).json({ ok: true });
        return;
      }

      const payment = update.message?.successful_payment;
      if (payment?.invoice_payload.startsWith(GIFT_PAYLOAD_PREFIX)) {
        // Gifts settle in Postgres, which can fail for a moment. Unlike a
        // malformed update, that is worth Telegram's retry, so a storage
        // fault answers 503 and a redelivery finishes the grant once.
        try {
          const outcome = await completeGiftPayment({
            invoicePayload: payment.invoice_payload,
            totalAmount: payment.total_amount,
            currency: payment.currency,
            telegramPaymentChargeId: payment.telegram_payment_charge_id,
          });
          if (outcome.status === 'rejected' || outcome.status === 'failed') {
            logEvent('gift_payment_not_granted', { status: outcome.status });
          }
          res.status(200).json({ ok: true });
        } catch {
          logEvent('gift_payment_deferred', { reason: 'storage' });
          res.status(503).json({ ok: false });
        }
        return;
      }
      if (payment) {
        if (payment.invoice_payload.startsWith(PREMIUM_PAYLOAD_PREFIX)) {
          const outcome = completeSubscriptionPayment({
            invoicePayload: payment.invoice_payload,
            totalAmount: payment.total_amount,
            currency: payment.currency,
            telegramPaymentChargeId: payment.telegram_payment_charge_id,
            providerPaymentChargeId: payment.provider_payment_charge_id,
            telegramUserId: update.message?.from?.id,
            subscriptionExpirationDate: payment.subscription_expiration_date,
            isRecurring: payment.is_recurring,
            isFirstRecurring: payment.is_first_recurring,
          });
          if (outcome.status === 'rejected') {
            logEvent('stars_subscription_payment_rejected', { reason: outcome.reason });
          }
        } else {
          const outcome = completePayment({
            invoicePayload: payment.invoice_payload,
            totalAmount: payment.total_amount,
            currency: payment.currency,
            telegramPaymentChargeId: payment.telegram_payment_charge_id,
            providerPaymentChargeId: payment.provider_payment_charge_id,
            telegramUserId: update.message?.from?.id,
          });
          if (outcome.status === 'rejected') {
            logEvent('stars_payment_rejected', { reason: outcome.reason });
          }
        }
        res.status(200).json({ ok: true });
        return;
      }

      await handleCommand(update);
      res.status(200).json({ ok: true });
    } catch {
      // A throw here would be a non-2xx, and Telegram would redeliver the
      // same update forever. The secret already matched, so acknowledge.
      logEvent('telegram_webhook_failed', { reason: 'handler' });
      if (!res.headersSent) res.status(200).json({ ok: true });
    }
  }),
);
