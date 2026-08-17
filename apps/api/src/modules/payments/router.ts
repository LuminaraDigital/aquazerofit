/**
 * /telegram/webhook — the only unauthenticated route in this product that can
 * grant an entitlement.
 *
 * Everything about its shape follows from that sentence:
 *
 *  - **It authenticates by shared secret, and fails closed.** Telegram echoes
 *    `secret_token` from setWebhook in a header on every delivery. If the
 *    secret is unset, the route rejects everything rather than trusting
 *    everything — an unconfigured webhook that accepts updates is a free
 *    coach roster for anyone who finds the URL.
 *  - **It always answers 200.** Telegram redelivers any non-2xx, so returning
 *    500 on a malformed update creates an infinite retry loop against a
 *    payload that will never parse. Failures are logged, acknowledged, dropped.
 *  - **It answers pre-checkout before doing anything slow.** Telegram cancels
 *    the payment if `answerPreCheckoutQuery` does not arrive within ten
 *    seconds, and a cancelled payment mid-flow is the worst outcome available.
 *
 * Registering the webhook (once, per deployment):
 *
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d url="https://<host>/api/v1/telegram/webhook" \
 *     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>" \
 *     -d allowed_updates='["message","pre_checkout_query"]'
 */
import { Router } from 'express';
import { coachById, starsPriceOf } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { secureEquals } from '../../platform/auth';
import { logEvent } from '../../platform/telemetry';
import { answerPreCheckoutQuery } from './telegramBot';
import { completePayment, findPendingInvoice } from './stars';

export const telegramWebhookRouter = Router();

/** Shape of the slice of Telegram's Update we actually read. */
interface TelegramUpdate {
  pre_checkout_query?: {
    id: string;
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
  message?: {
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      provider_payment_charge_id?: string;
    };
  };
}

function secretMatches(header: unknown): boolean {
  const expected = config.telegramWebhookSecret;
  // Fail closed: an unset secret means the route trusts nobody rather than
  // everybody. Checked before the compare so an empty header can never match
  // an empty expectation.
  if (!expected) return false;
  return secureEquals(header, expected);
}

telegramWebhookRouter.post('/webhook', (req, res) => {
  if (!secretMatches(req.get('x-telegram-bot-api-secret-token'))) {
    // 401 rather than a silent 200: a real Telegram delivery always carries the
    // header, so anything reaching here is either a misconfiguration worth
    // surfacing loudly or a probe worth refusing plainly.
    logEvent('telegram_webhook_rejected', { reason: 'secret_mismatch' });
    res.status(401).json({ code: 'AUTH_INVALID', message: 'Invalid webhook secret.' });
    return;
  }

  const update = req.body as TelegramUpdate;

  // --- Pre-checkout: last chance to decline, on a ten-second clock.
  const query = update.pre_checkout_query;
  if (query) {
    const pending = findPendingInvoice(query.invoice_payload);
    const coach = pending ? coachById(pending.coachId) : undefined;
    const priceOk =
      pending !== undefined &&
      coach !== undefined &&
      query.currency === 'XTR' &&
      query.total_amount >= starsPriceOf(coach);

    void answerPreCheckoutQuery(
      query.id,
      priceOk,
      priceOk ? undefined : 'This purchase is no longer available.',
    );
    if (!priceOk) {
      logEvent('stars_precheckout_declined', { payload: query.invoice_payload });
    }
    res.status(200).json({ ok: true });
    return;
  }

  // --- Payment cleared: grant, idempotently.
  const payment = update.message?.successful_payment;
  if (payment) {
    const outcome = completePayment({
      invoicePayload: payment.invoice_payload,
      totalAmount: payment.total_amount,
      currency: payment.currency,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      providerPaymentChargeId: payment.provider_payment_charge_id,
    });
    if (outcome.status === 'rejected') {
      logEvent('stars_payment_rejected', { reason: outcome.reason });
    }
    res.status(200).json({ ok: true });
    return;
  }

  // Anything else (plain messages, edits) is acknowledged and ignored — the
  // bot is a payment and notification channel, not a conversational surface.
  res.status(200).json({ ok: true });
});
