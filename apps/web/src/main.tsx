import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initTelegram } from './lib/telegram';
import { captureAttributionFromUrl, getAttribution } from './lib/attribution';
import { trackGrowth } from './lib/growth';
import './styles/index.css';

initTelegram();

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
