import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ensureTelegram, getTelegramStartParam, looksLikeTelegramLaunch } from './lib/telegram';
import { decodePayload } from './lib/telegramLink';
import { adoptAttribution, captureAttributionFromUrl, getAttribution } from './lib/attribution';
import { trackGrowth } from './lib/growth';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function captureWebAttribution(): void {
  const attr = captureAttributionFromUrl();
  if (attr.ref || attr.utmSource || attr.challengeCode) {
    void trackGrowth('invite_captured', {
      hasRef: Boolean(attr.ref),
      hasUtm: Boolean(attr.utmSource),
      hasChallenge: Boolean(attr.challengeCode),
    });
  }
  // Touch getAttribution so tree-shakers keep the module live for share flows.
  void getAttribution();
}

/**
 * Adopt the attribution the landing page encoded into the Telegram deep link.
 *
 * This is the entire point of the `startapp` payload: localStorage does not
 * cross the web → Telegram boundary, so without this every visitor who
 * converts through the landing page arrives in the Mini App as untracked
 * direct traffic, and the marketing site appears to convert nobody.
 */
function captureTelegramAttribution(): void {
  const decoded = decodePayload(getTelegramStartParam());
  const attr = Object.keys(decoded).length ? adoptAttribution(decoded) : getAttribution();
  void trackGrowth('telegram_launch', {
    hasRef: Boolean(attr.ref),
    hasUtm: Boolean(attr.utmSource),
    hasChallenge: Boolean(attr.challengeCode),
    /* Distinguishes "arrived from our own landing page" from "found the bot
       some other way" — the numerator of the web → Telegram conversion rate. */
    fromDeepLink: Object.keys(decoded).length > 0,
  });
}

function mount(): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

/**
 * Two bootstraps, because the two surfaces have opposite priorities.
 *
 * On the web, nothing may delay first paint and telegram.org must not be
 * contacted at all — so the app mounts synchronously, exactly as before.
 *
 * Inside Telegram the SDK has to be present before the first render, because
 * `isTMA()` decides which front door the router opens and a Mini App user who
 * renders one frame of the marketing page has already had a bad launch. So
 * that path waits — bounded by the SDK's own timeout, after which it mounts
 * regardless and degrades to the ordinary web sign-in rather than to a
 * permanent spinner.
 */
if (looksLikeTelegramLaunch()) {
  void ensureTelegram()
    .then((inTelegram) => {
      if (inTelegram) captureTelegramAttribution();
      else captureWebAttribution();
    })
    .catch(() => captureWebAttribution())
    .finally(mount);
} else {
  captureWebAttribution();
  mount();
}
