/**
 * Minimal Telegram Bot API client.
 *
 * Deliberately hand-rolled rather than pulling in a bot framework: everything
 * this product needs from Telegram is three methods, and a framework would add
 * a long-polling loop, a middleware stack and a dispatcher to a stateless API
 * that wants none of them. Three fetches is the whole dependency.
 *
 * Nothing here throws on a Telegram-side failure - every method returns a
 * discriminated result. A payment path that throws on a transport hiccup turns
 * "the invoice did not open" into a 500, and a webhook that throws makes
 * Telegram retry forever.
 */
import { config } from '../../platform/config';

const API_ROOT = 'https://api.telegram.org';

/** Telegram's own currency code for Stars. Not a fiat currency; no decimals. */
export const STARS_CURRENCY = 'XTR';

export type BotResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: string };

async function callBot<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<BotResult<T>> {
  const token = config.telegramBotToken;
  if (!isRealBotToken(token)) {
    return { ok: false, error: 'Telegram bot token is not configured.' };
  }

  try {
    const res = await fetch(`${API_ROOT}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      // A hung Telegram call must not hold an Express handler open until the
      // platform's own timeout kills the request.
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) return { ok: false, error: json.description ?? `Telegram rejected ${method}` };
    return { ok: true, result: json.result as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Telegram call failed' };
  }
}

/**
 * The dev fallback in `config.telegramBotToken` exists so offline HMAC test
 * vectors work; it is not a credential. Calling Telegram with it would 401 on
 * every request, so payment surfaces check this instead of assuming a token
 * string means a usable bot.
 */
export function isRealBotToken(token: string): boolean {
  return token.length > 0 && token !== 'dev-bot-token';
}

export function botConfigured(): boolean {
  return isRealBotToken(config.telegramBotToken);
}

export interface InvoiceRequest {
  title: string;
  description: string;
  /** Opaque correlation string returned to us on every payment update. */
  payload: string;
  /** Whole Stars. XTR has no minor unit, so this is not cents. */
  stars: number;
  photoUrl?: string;
}

/**
 * Create a Stars invoice link the Mini App opens with `openInvoice`.
 *
 * `provider_token` is deliberately absent: Stars payments have no payment
 * provider behind them, and sending an empty string is how the call fails with
 * a confusing PAYMENT_PROVIDER_INVALID.
 */
export async function createStarsInvoiceLink(req: InvoiceRequest): Promise<BotResult<string>> {
  return callBot<string>('createInvoiceLink', {
    title: req.title.slice(0, 32),
    description: req.description.slice(0, 255),
    payload: req.payload,
    currency: STARS_CURRENCY,
    prices: [{ label: req.title.slice(0, 32), amount: req.stars }],
    ...(req.photoUrl ? { photo_url: req.photoUrl } : {}),
  });
}

/**
 * Approve or decline a checkout. Telegram gives us ten seconds to answer and
 * cancels the payment if we miss the window, so callers must not do slow work
 * before this.
 */
export async function answerPreCheckoutQuery(
  preCheckoutQueryId: string,
  ok: boolean,
  errorMessage?: string,
): Promise<BotResult<boolean>> {
  return callBot<boolean>('answerPreCheckoutQuery', {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(ok ? {} : { error_message: errorMessage ?? 'This purchase is unavailable.' }),
  });
}

/** One inline button. `webAppUrl` opens the Mini App; `url` opens a browser. */
export interface OutboundButton {
  text: string;
  webAppUrl?: string;
  url?: string;
}

function inlineKeyboard(buttons: OutboundButton[] | undefined): Record<string, unknown> | undefined {
  if (!buttons || buttons.length === 0) return undefined;
  const rows = buttons
    .map((button) => {
      if (button.webAppUrl) return [{ text: button.text, web_app: { url: button.webAppUrl } }];
      if (button.url) return [{ text: button.text, url: button.url }];
      return [];
    })
    .filter((row) => row.length > 0);
  if (rows.length === 0) return undefined;
  return { inline_keyboard: rows };
}

/**
 * Send a message to a linked Telegram user. Used for receipts, nudges, and
 * the four bot commands. HTML stays the default so existing receipts keep
 * their formatting; command copy passes `plain` because the text is built
 * from configured URLs and must not be parsed as markup.
 */
export async function sendBotMessage(
  chatId: number,
  text: string,
  options?: { buttons?: OutboundButton[]; parseMode?: 'HTML' | 'plain' },
): Promise<BotResult<unknown>> {
  const markup = inlineKeyboard(options?.buttons);
  return callBot<unknown>('sendMessage', {
    chat_id: chatId,
    text,
    ...(options?.parseMode === 'plain' ? {} : { parse_mode: 'HTML' }),
    link_preview_options: { is_disabled: true },
    ...(markup ? { reply_markup: markup } : {}),
  });
}

/**
 * Refund a Telegram Stars payment.
 *
 * `user_id` is the Telegram user who paid, not our account id.
 * Returns Telegram's boolean result, or a failure the caller can classify.
 * A repeated call for an already-refunded charge fails with
 * CHARGE_ALREADY_REFUNDED; the caller treats that as success and still
 * revokes the local entitlement.
 */
export async function refundStarPayment(
  telegramUserId: number,
  telegramPaymentChargeId: string,
): Promise<BotResult<boolean>> {
  return callBot<boolean>('refundStarPayment', {
    user_id: telegramUserId,
    telegram_payment_charge_id: telegramPaymentChargeId,
  });
}
